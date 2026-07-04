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

/**
 * Load and validate all node declarations under `dir`, sorted by node id.
 *
 * Two sources merge, by node id:
 *   1. `catalog.json` — a bulk array of minimal nodes giving org-wide coverage
 *      (every public repo appears, most with no edges yet). Low priority.
 *   2. `*.trellis.json` — a richly-mapped adopter declaration per file. Wins
 *      over the catalog entry for the same node.
 *
 * So the tree covers every repo, while the mapped ones carry real edges. A
 * private sidecar (`trellis-private`) supplies its own catalog of private nodes.
 */
export async function loadDecls(dir: string): Promise<NodeDecl[]> {
  const byNode = new Map<string, NodeDecl>();

  try {
    const catalog = JSON.parse(await Deno.readTextFile(`${dir}/catalog.json`));
    if (Array.isArray(catalog)) {
      for (const raw of catalog) {
        const d = NodeDeclSchema.parse(raw);
        byNode.set(d.node, d);
      }
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }

  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith(".trellis.json")) continue;
    const raw = JSON.parse(await Deno.readTextFile(`${dir}/${entry.name}`));
    const d = NodeDeclSchema.parse(raw);
    byNode.set(d.node, d); // adopter file overrides the catalog entry
  }

  return [...byNode.values()].sort((a, b) => a.node.localeCompare(b.node));
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
