/**
 * @module
 * Assemble the tree from per-repo declarations.
 *
 * Reads every `*.trellis.json` `NodeDecl`, then forms an edge wherever one
 * node PROVIDES a contract type another node CONSUMES — matching by type, never
 * by repo name. Each edge's `status` comes from the registry: `verified` if a
 * live check exists for that type, else `declared`. An edge's `kind`/`spec`
 * come from the PROVIDER's declaration (the provider owns the surface).
 *
 * Pure except for `loadDecls` (reads a directory). `assemble` itself is pure.
 */

import {
  type Edge,
  EdgeSchema,
  type NodeDecl,
  NodeDeclSchema,
  type Tree,
  TreeSchema,
  type Visibility,
} from "./schema.ts";
import { contractType } from "./registry.ts";

/** Read and validate every `*.trellis.json` under `dir`. Sorted by node id. */
export async function loadDecls(dir: string): Promise<NodeDecl[]> {
  const decls: NodeDecl[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith(".trellis.json")) continue;
    const raw = JSON.parse(await Deno.readTextFile(`${dir}/${entry.name}`));
    decls.push(NodeDeclSchema.parse(raw));
  }
  return decls.sort((a, b) => a.node.localeCompare(b.node));
}

/**
 * Assemble edges by matching providers to consumers on contract type.
 *
 * `visibility` optionally filters the node set (the public tree vs the private
 * sidecar). An edge is `from` provider → `to` consumer. A consume with no
 * matching provider among the given nodes is dropped silently here and surfaced
 * by `unmatchedConsumes` for reporting (e.g. external-platform types whose
 * provider is GitHub, not an org repo).
 */
export function assemble(
  decls: readonly NodeDecl[],
  visibility?: Visibility,
): Tree {
  const nodes = visibility
    ? decls.filter((d) => d.visibility === visibility)
    : [...decls];

  // provider index: contract type → { node, provideRef }
  const providers = new Map<
    string,
    {
      node: string;
      kind: NodeDecl["provides"][number]["kind"];
      spec: NodeDecl["provides"][number]["spec"];
    }
  >();
  for (const d of nodes) {
    for (const p of d.provides) {
      providers.set(p.type, { node: d.node, kind: p.kind, spec: p.spec });
    }
  }

  const edges: Edge[] = [];
  for (const d of nodes) {
    for (const c of d.consumes) {
      const prov = providers.get(c.type);
      if (!prov) continue; // unmatched — see unmatchedConsumes()
      const reg = contractType(c.type);
      edges.push(EdgeSchema.parse({
        from: prov.node,
        to: d.node,
        type: c.type,
        kind: prov.kind,
        spec: prov.spec,
        status: reg?.verified ? "verified" : "declared",
      }));
    }
  }
  edges.sort((a, b) =>
    a.type.localeCompare(b.type) || a.from.localeCompare(b.from) ||
    a.to.localeCompare(b.to)
  );
  return TreeSchema.parse({ nodes, edges });
}

/** Consumes with no provider among the nodes — dangling links worth reporting. */
export function unmatchedConsumes(
  decls: readonly NodeDecl[],
  visibility?: Visibility,
): Array<{ node: string; type: string }> {
  const nodes = visibility
    ? decls.filter((d) => d.visibility === visibility)
    : [...decls];
  const provided = new Set(nodes.flatMap((d) => d.provides.map((p) => p.type)));
  const out: Array<{ node: string; type: string }> = [];
  for (const d of nodes) {
    for (const c of d.consumes) {
      if (!provided.has(c.type)) out.push({ node: d.node, type: c.type });
    }
  }
  return out;
}
