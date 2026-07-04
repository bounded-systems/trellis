/**
 * @module
 * trellis schema — the typed shape of the org contract tree.
 *
 * The tree is decentralized: each repo declares its OWN node (a `NodeDecl`,
 * materialized as a `trellis.json` in the repo root) in terms of the contract
 * *types* it provides and consumes — never specific repo names. trellis
 * assembles the tree by matching a provider of type T to every consumer of type
 * T (see assemble.ts), so renaming or swapping a repo never breaks the map.
 *
 * Zod is canonical (runtime validation + static types), mirroring
 * gh-project-room/verbspec. Explicit `z.ZodType<T>` annotations keep JSR
 * "no slow types" happy so this lifts cleanly into a published package.
 */

import { z } from "zod";

/**
 * The kinds of contract an edge can be. Established by surveying the org
 * (see README): capability wire surfaces, vendored flake-input pins, shared
 * schemas, external-platform APIs, import/ambient-authority seams, repo-config
 * conformance, and provenance/signing.
 */
export type ContractKind =
  | "wire"
  | "vendored-pin"
  | "shared-schema"
  | "external-platform"
  | "import-boundary"
  | "repo-config"
  | "provenance";

export const ContractKindSchema: z.ZodType<ContractKind> = z.enum([
  "wire",
  "vendored-pin",
  "shared-schema",
  "external-platform",
  "import-boundary",
  "repo-config",
  "provenance",
]);

/** Whether a node belongs to the public tree or the private sidecar. */
export type Visibility = "public" | "private";

export const VisibilitySchema: z.ZodType<Visibility> = z.enum([
  "public",
  "private",
]);

/**
 * A typed pointer to the artifact that actually governs a contract type — the
 * "link is a real spec" requirement. Exactly one locator is set:
 *   - `verbspec`  → a module path exporting VerbSpec verbs (wire contracts).
 *   - `jsrSchema` → a JSR package + exported Zod/JSON schema (shared-schema).
 *   - `flakeInput`→ a flake input name pinned to a rev (vendored-pin).
 *   - `seamClaim` → a seam-check claim path (import-boundary).
 *   - `jsonSchema`→ a JSON-schema `$id` URL (shared-schema/provenance).
 *   - `external`  → an external API/doc URL (external-platform).
 */
export interface SpecPointer {
  readonly verbspec?: string;
  readonly jsrSchema?: string;
  readonly flakeInput?: string;
  readonly seamClaim?: string;
  readonly jsonSchema?: string;
  readonly external?: string;
}

export const SpecPointerSchema: z.ZodType<SpecPointer> = z.object({
  verbspec: z.string().optional(),
  jsrSchema: z.string().optional(),
  flakeInput: z.string().optional(),
  seamClaim: z.string().optional(),
  jsonSchema: z.string().optional(),
  external: z.string().optional(),
});

/**
 * What a node PROVIDES: it implements contract `type` (of `kind`), governed by
 * `spec`. Consumers reference the same `type` by name; the spec lives with the
 * provider (or the registry) so both sides check against one artifact.
 */
export interface ProvideRef {
  readonly type: string;
  readonly kind: ContractKind;
  readonly spec: SpecPointer;
}

export const ProvideRefSchema: z.ZodType<ProvideRef> = z.object({
  type: z.string().min(1),
  kind: ContractKindSchema,
  spec: SpecPointerSchema,
});

/** What a node CONSUMES: it depends on contract `type` (resolved to whoever provides it). */
export interface ConsumeRef {
  readonly type: string;
}

export const ConsumeRefSchema: z.ZodType<ConsumeRef> = z.object({
  type: z.string().min(1),
});

/**
 * A repo's own declaration — the per-repo `trellis.json`. Links are by contract
 * TYPE, not repo name: a node never mentions another repo, only the types it
 * speaks. `role`/`domain` mirror the `bounded` package.json metadata block.
 */
export interface NodeDecl {
  readonly node: string;
  readonly visibility: Visibility;
  readonly role?: string;
  readonly domain?: string;
  readonly provides: readonly ProvideRef[];
  readonly consumes: readonly ConsumeRef[];
}

export const NodeDeclSchema: z.ZodType<NodeDecl> = z.object({
  node: z.string().min(1),
  visibility: VisibilitySchema,
  role: z.string().optional(),
  domain: z.string().optional(),
  provides: z.array(ProvideRefSchema).default([]),
  consumes: z.array(ConsumeRefSchema).default([]),
});

/** Whether an assembled edge has a live check wired, or is only declared. */
export type EdgeStatus = "declared" | "verified" | "failing";

export const EdgeStatusSchema: z.ZodType<EdgeStatus> = z.enum([
  "declared",
  "verified",
  "failing",
]);

/**
 * An ASSEMBLED edge — emergent, never authored. Produced by matching a
 * provider of `type` to a consumer of `type` in assemble.ts.
 */
export interface Edge {
  readonly from: string;
  readonly to: string;
  readonly type: string;
  readonly kind: ContractKind;
  readonly spec: SpecPointer;
  readonly status: EdgeStatus;
}

export const EdgeSchema: z.ZodType<Edge> = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.string().min(1),
  kind: ContractKindSchema,
  spec: SpecPointerSchema,
  status: EdgeStatusSchema,
});

/** The assembled tree: the declarations that went in, and the edges that emerged. */
export interface Tree {
  readonly nodes: readonly NodeDecl[];
  readonly edges: readonly Edge[];
}

export const TreeSchema: z.ZodType<Tree> = z.object({
  nodes: z.array(NodeDeclSchema),
  edges: z.array(EdgeSchema),
});

// ---------------------------------------------------------------------------
// The build-derivation model — the canonical definition (the "kit") of what a
// repo IS in the lattice, so trellis, trellis-private, the consumers, and every
// repo's own trellis.json share ONE definition rather than re-deriving it.
// ---------------------------------------------------------------------------

/** The non-negotiable output every repo produces — its build artifact. */
export const BUILD = "build" as const;
/** The baseline input every repo consumes — its own source. */
export const SELF = "self" as const;

/**
 * A repo as a build derivation: OUTPUTS (the non-negotiable `build`, then the
 * contract types it provides) are produced from INPUTS (`self`, then the
 * contract types it consumes). `mapped` is true once it's wired to another repo
 * by a contract. (Planned inputs/outputs: deploy artifacts + external deps.)
 */
export interface Derivation {
  readonly node: string;
  readonly outputs: readonly string[];
  readonly inputs: readonly string[];
  readonly mapped: boolean;
}

/** Project a node's declaration to its build derivation — the canonical model. */
export function toDerivation(n: NodeDecl): Derivation {
  const provides = n.provides.map((p) => p.type);
  const consumes = n.consumes.map((c) => c.type);
  return {
    node: n.node,
    outputs: [BUILD, ...provides],
    inputs: [SELF, ...consumes],
    mapped: provides.length + consumes.length > 0,
  };
}

/**
 * Find dependency cycles. A contract edge is provider→consumer, so the build
 * dependency runs consumer→provider (a repo depends on the repos whose outputs
 * it consumes). A cycle means two repos build-depend on each other — a defect
 * broken by extracting the shared contract into its own (contract-only) repo.
 * Returns each cycle as the repos on it (deduped by rotation).
 */
export function findCycles(
  edges: ReadonlyArray<{ from: string; to: string }>,
): string[][] {
  const deps = new Map<string, string[]>(); // consumer → providers it depends on
  for (const e of edges) {
    if (e.from === e.to) continue;
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
  const canon = (c: string[]) => [...c].sort().join(">");
  const uniq = new Map<string, string[]>();
  for (const c of cycles) uniq.set(canon(c), c);
  return [...uniq.values()];
}
