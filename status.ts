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

import {
  type ContractKind,
  type Derivation,
  findCycles,
  findMultiContractPairs,
  toDerivation,
} from "./schema.ts";
import { assemble, loadDecls, unmatchedConsumes } from "./assemble.ts";
import { CONTRACT_TYPES, contractType } from "./registry.ts";

// The build-derivation model + invariants live in the kit
// (@bounded-systems/trellis-kit, re-exported by ./schema.ts). Re-exported here
// for convenience.
export { findCycles, findMultiContractPairs, toDerivation };
/** A repo as a build derivation (see the kit). */
export type StatusNode = Derivation;

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
    /** At most one agreement per node pair (a violation is broken the same way). */
    readonly oneAgreementPerPair: boolean;
  };
  readonly types: readonly StatusType[];
  readonly edges: readonly StatusEdge[];
  /** EVERY repo on the map, not just the ones with edges. */
  readonly nodes: readonly StatusNode[];
  /** Dependency cycles (consumer → provider). Empty when the lattice is a DAG. */
  readonly cycles: readonly (readonly string[])[];
  /** Node-pairs holding more than one agreement — must be empty. */
  readonly multiContractPairs: ReadonlyArray<
    { pair: [string, string]; contracts: string[] }
  >;
  readonly unmatched: ReadonlyArray<{ node: string; type: string }>;
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

  // EVERY repo as a build derivation (the kit's canonical model).
  const nodes: StatusNode[] = tree.nodes.map(toDerivation);

  const cycles = findCycles(tree.edges);
  const multiContractPairs = findMultiContractPairs(tree.edges);
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
      oneAgreementPerPair: multiContractPairs.length === 0,
    },
    types,
    edges,
    nodes,
    cycles,
    multiContractPairs,
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
