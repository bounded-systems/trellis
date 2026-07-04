/**
 * @module
 * The status projection — trellis's honest, machine-readable snapshot of the
 * contract lattice, meant to be emitted (and signed) by CI on every run and
 * consumed by BOTH the Trust Center (as grep-verifiable claims) and the
 * bounded.tools site (rendered). It reflects the REAL check results, so the
 * public projection can't drift from what actually passed.
 *
 *   # list the verified types CI must build (one flake check each):
 *   deno run --allow-read status.ts --checks
 *   # emit the projection from a results file ({ "<type>": "pass"|"fail" }):
 *   deno run --allow-read status.ts --results results.json > status.json
 *
 * The core `projectStatus` is pure (results in → report out) — the CLI only
 * reads the bootstrap declarations + the results file.
 */

import type { ContractKind } from "./schema.ts";
import { assemble, loadDecls, unmatchedConsumes } from "./assemble.ts";
import { CONTRACT_TYPES, contractType } from "./registry.ts";

/** Live result of a contract type's check. `declared` = no live check wired. */
export type Result = "pass" | "fail" | "declared";

export interface StatusEdge {
  readonly from: string;
  readonly to: string;
  readonly type: string;
  readonly kind: ContractKind;
  readonly result: Result;
}

export interface StatusType {
  readonly type: string;
  readonly kind: ContractKind;
  readonly verified: boolean;
  readonly result: Result;
  readonly edges: number;
  readonly providers: number;
  readonly summary: string;
}

/**
 * Every repo, as a build-derivation node. Its OUTPUT is non-negotiable — the
 * `build` (every repo produces its build artifact) — plus any contracts it
 * provides. Its INPUT is at least `self` (the repo's own source) plus any
 * contracts it consumes. `mapped` is true once it has a cross-repo contract;
 * an unmapped repo still has its build + self, it just isn't wired to others
 * yet. (Deploy outputs + external deps are a planned extension.)
 */
export interface StatusNode {
  readonly node: string;
  /** Non-negotiable `build`, then any contract types this repo provides. */
  readonly outputs: readonly string[];
  /** `self`, then any contract types this repo consumes. */
  readonly inputs: readonly string[];
  readonly mapped: boolean;
}

export interface StatusReport {
  readonly summary: {
    readonly nodes: number;
    readonly edges: number;
    readonly types: number;
    readonly verified: number;
    readonly passing: number;
    readonly failing: number;
    /** Repos wired to at least one other repo by a contract. */
    readonly mapped: number;
    /** Repos with only their build + self — on the map, not yet wired to others. */
    readonly unmapped: number;
    /** The build DAG is acyclic (a cycle is a defect — break it with a contract-only repo). */
    readonly acyclic: boolean;
  };
  readonly types: readonly StatusType[];
  readonly edges: readonly StatusEdge[];
  /** EVERY repo on the map, not just the ones with edges. */
  readonly nodes: readonly StatusNode[];
  /** Dependency cycles (consumer → provider). Empty when the lattice is a DAG. */
  readonly cycles: readonly (readonly string[])[];
  readonly unmatched: ReadonlyArray<{ node: string; type: string }>;
}

/**
 * Find dependency cycles. A contract edge is provider→consumer, so the *build*
 * dependency runs consumer→provider (a repo depends on the repos whose outputs
 * it consumes). A cycle there means two repos build-depend on each other — a
 * defect, broken by extracting the shared contract into its own repo. Returns
 * each cycle as the repos on it (deduped by rotation).
 */
export function findCycles(
  edges: ReadonlyArray<{ from: string; to: string }>,
): string[][] {
  const deps = new Map<string, string[]>(); // consumer → [providers it depends on]
  for (const e of edges) {
    if (e.from === e.to) continue; // self-edges never cycle
    (deps.get(e.to) ?? deps.set(e.to, []).get(e.to)!).push(e.from);
  }
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const visit = (n: string): void => {
    if (onStack.has(n)) {
      cycles.push(stack.slice(stack.indexOf(n)));
      return;
    }
    if (seen.has(n)) return;
    seen.add(n);
    stack.push(n);
    onStack.add(n);
    for (const d of deps.get(n) ?? []) visit(d);
    stack.pop();
    onStack.delete(n);
  };
  for (const n of deps.keys()) visit(n);
  // dedupe cycles that are rotations of each other
  const canon = (c: string[]) => [...c].sort().join(">");
  const uniq = new Map<string, string[]>();
  for (const c of cycles) uniq.set(canon(c), c);
  return [...uniq.values()];
}

/** The contract types that have a live check (CI must build one flake check each). */
export function verifiedTypes(): string[] {
  return CONTRACT_TYPES.filter((c) => c.verified).map((c) => c.type);
}

/**
 * Resolve a type's live result. `declared` when not verified; otherwise the
 * result from CI — and FAIL-CLOSED: a verified type with no recorded result is
 * `fail`, so a missing check can never read as passing.
 */
function resultFor(
  type: string,
  results: Readonly<Record<string, "pass" | "fail">>,
): Result {
  const reg = contractType(type);
  if (!reg?.verified) return "declared";
  return results[type] ?? "fail";
}

/**
 * Project the assembled tree + the CI check results into the status report.
 * Pure — same declarations + results in → same report out (stamp `generatedAt`
 * outside, so the projection stays deterministic).
 */
export function projectStatus(
  decls: Awaited<ReturnType<typeof loadDecls>>,
  results: Readonly<Record<string, "pass" | "fail">>,
): StatusReport {
  const tree = assemble(decls);

  const edges: StatusEdge[] = tree.edges.map((e) => ({
    from: e.from,
    to: e.to,
    type: e.type,
    kind: e.kind,
    result: resultFor(e.type, results),
  }));

  const types: StatusType[] = CONTRACT_TYPES.map((c) => ({
    type: c.type,
    kind: c.kind,
    verified: c.verified,
    result: resultFor(c.type, results),
    edges: tree.edges.filter((e) => e.type === c.type).length,
    providers:
      tree.nodes.filter((n) => n.provides.some((p) => p.type === c.type))
        .length,
    summary: c.summary,
  }));

  // EVERY repo as a build-derivation node: output is the non-negotiable `build`
  // plus its provides; input is `self` plus its consumes.
  const nodes: StatusNode[] = tree.nodes.map((n) => {
    const provides = n.provides.map((p) => p.type);
    const consumes = n.consumes.map((c) => c.type);
    return {
      node: n.node,
      outputs: ["build", ...provides],
      inputs: ["self", ...consumes],
      mapped: provides.length + consumes.length > 0,
    };
  });

  const cycles = findCycles(tree.edges);
  const verified = types.filter((t) => t.verified);
  return {
    summary: {
      nodes: nodes.length,
      edges: tree.edges.length,
      types: types.length,
      verified: verified.length,
      passing: verified.filter((t) => t.result === "pass").length,
      failing: verified.filter((t) => t.result === "fail").length,
      mapped: nodes.filter((n) => n.mapped).length,
      unmapped: nodes.filter((n) => !n.mapped).length,
      acyclic: cycles.length === 0,
    },
    types,
    edges,
    nodes,
    cycles,
    unmatched: unmatchedConsumes(decls),
  };
}

const BOOTSTRAP_DIR = new URL("./bootstrap", import.meta.url).pathname;

if (import.meta.main) {
  if (Deno.args.includes("--checks")) {
    // Emit the verified type names, one per line — CI loops `nix build` over them.
    console.log(verifiedTypes().join("\n"));
    Deno.exit(0);
  }

  const ri = Deno.args.indexOf("--results");
  const results: Record<string, "pass" | "fail"> = ri >= 0 && Deno.args[ri + 1]
    ? JSON.parse(Deno.readTextFileSync(Deno.args[ri + 1]))
    : {};

  const decls = await loadDecls(BOOTSTRAP_DIR);
  const report = projectStatus(decls, results);
  console.log(JSON.stringify(report, null, 2));
}
