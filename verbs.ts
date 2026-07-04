/**
 * @module
 * VerbSpec surface over the assembled contract tree — dogfooding phase 1.
 *
 *   deno run --allow-read verbs.ts nodes
 *   deno run --allow-read verbs.ts edges --kind wire
 *   deno run --allow-read verbs.ts edges --type keeper-wire
 *   deno run --allow-read verbs.ts types
 *   deno run --allow-read verbs.ts verify --type keeper-wire
 *
 * Verbs are pure projections of the same `VerbSpec` (CLI now; MCP/OpenAPI for
 * free). They read the bootstrap declarations to assemble the tree on demand.
 */

import { z } from "zod";
import {
  defineVerb,
  dispatch,
  type Registry,
  render,
  type VerbSpec,
} from "verbspec";
import {
  type ContractKind,
  ContractKindSchema,
  type Edge,
  type NodeDecl,
} from "./schema.ts";
import { assemble, loadDecls, unmatchedConsumes } from "./assemble.ts";
import { CONTRACT_TYPES, type ContractType } from "./registry.ts";

const BOOTSTRAP_DIR = new URL("./bootstrap", import.meta.url).pathname;

async function tree(): Promise<{ nodes: NodeDecl[]; edges: Edge[] }> {
  const decls = await loadDecls(BOOTSTRAP_DIR);
  const t = assemble(decls);
  return { nodes: [...t.nodes], edges: [...t.edges] };
}

// ── nodes ──────────────────────────────────────────────────────────────────────

const NodesInput: z.ZodType<Record<never, never>> = z.object({});
const NodesOutput = z.object({
  count: z.number(),
  nodes: z.array(z.object({
    node: z.string(),
    role: z.string().optional(),
    provides: z.array(z.string()),
    consumes: z.array(z.string()),
  })),
});
const nodesVerb: VerbSpec<typeof NodesInput, typeof NodesOutput> = defineVerb({
  id: "nodes",
  summary: "List every repo node and the contract types it provides/consumes.",
  actor: "trellis",
  input: NodesInput,
  output: NodesOutput,
  run: async () => {
    const { nodes } = await tree();
    return {
      count: nodes.length,
      nodes: nodes.map((n) => ({
        node: n.node,
        ...(n.role ? { role: n.role } : {}),
        provides: n.provides.map((p) => p.type),
        consumes: n.consumes.map((c) => c.type),
      })),
    };
  },
});

// ── types ──────────────────────────────────────────────────────────────────────

const TypesInput: z.ZodType<Record<never, never>> = z.object({});
const TypesOutput = z.object({
  count: z.number(),
  types: z.array(z.object({
    type: z.string(),
    kind: ContractKindSchema,
    verified: z.boolean(),
    summary: z.string(),
  })),
});
const typesVerb: VerbSpec<typeof TypesInput, typeof TypesOutput> = defineVerb({
  id: "types",
  summary:
    "List the registered contract types and whether each has a live check.",
  actor: "trellis",
  input: TypesInput,
  output: TypesOutput,
  run: () => ({
    count: CONTRACT_TYPES.length,
    types: CONTRACT_TYPES.map((c: ContractType) => ({
      type: c.type,
      kind: c.kind,
      verified: c.verified,
      summary: c.summary,
    })),
  }),
});

// ── edges ──────────────────────────────────────────────────────────────────────

const EdgesInput = z.object({
  kind: ContractKindSchema.optional(),
  type: z.string().optional(),
  repo: z.string().optional(),
});
const EdgesOutput = z.object({
  count: z.number(),
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    type: z.string(),
    kind: ContractKindSchema,
    status: z.string(),
  })),
  unmatched: z.array(z.object({ node: z.string(), type: z.string() })),
});
const edgesVerb: VerbSpec<typeof EdgesInput, typeof EdgesOutput> = defineVerb({
  id: "edges",
  summary:
    "List assembled contract edges (provider→consumer), filterable by kind/type/repo.",
  actor: "trellis",
  input: EdgesInput,
  output: EdgesOutput,
  run: async (
    { kind, type, repo }: {
      kind?: ContractKind;
      type?: string;
      repo?: string;
    },
  ) => {
    const decls = await loadDecls(BOOTSTRAP_DIR);
    const t = assemble(decls);
    let edges: readonly Edge[] = t.edges;
    if (kind) edges = edges.filter((e) => e.kind === kind);
    if (type) edges = edges.filter((e) => e.type === type);
    if (repo) edges = edges.filter((e) => e.from === repo || e.to === repo);
    return {
      count: edges.length,
      edges: edges.map((e) => ({
        from: e.from,
        to: e.to,
        type: e.type,
        kind: e.kind,
        status: e.status,
      })),
      unmatched: unmatchedConsumes(decls),
    };
  },
});

// ── verify ─────────────────────────────────────────────────────────────────────

const VerifyInput = z.object({ type: z.string() });
const VerifyOutput = z.object({
  type: z.string(),
  known: z.boolean(),
  verified: z.boolean(),
  edges: z.number(),
  providers: z.number(),
  note: z.string(),
});
const verifyVerb: VerbSpec<typeof VerifyInput, typeof VerifyOutput> =
  defineVerb({
    id: "verify",
    summary:
      "Report whether a contract type has a live check, its edges, and its providers.",
    actor: "trellis",
    input: VerifyInput,
    output: VerifyOutput,
    run: async ({ type }: { type: string }) => {
      const reg = CONTRACT_TYPES.find((c) => c.type === type);
      const { nodes, edges } = await tree();
      const n = edges.filter((e) => e.type === type).length;
      // Providers matter for UNARY contracts (import-boundary): a package
      // upholding its own claim has providers but no provider→consumer edge.
      const providers = nodes.filter((nd) =>
        nd.provides.some((p) => p.type === type)
      ).length;
      return {
        type,
        known: Boolean(reg),
        verified: reg?.verified ?? false,
        edges: n,
        providers,
        note: !reg
          ? "unknown type"
          : reg.verified
          ? "live flake check wired (see check/) — run `nix flake check`"
          : "declared only — no live check yet",
      };
    },
  });

/** The trellis verb registry. */
export const VERBS: Registry = {
  "nodes": nodesVerb,
  "types": typesVerb,
  "edges": edgesVerb,
  "verify": verifyVerb,
};

if (import.meta.main) {
  const result = await dispatch(VERBS, Deno.args, "deno run verbs.ts");
  if (result.kind === "help") {
    console.log(result.text);
  } else {
    console.log(render(result.output));
  }
}
