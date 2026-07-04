/**
 * @module
 * Dependency-free acyclic check — the kit's build-DAG invariant, runnable
 * offline inside a sealed Nix derivation (no zod/verbspec import). It mirrors
 * assemble.ts's provides↔consumes matching + schema.ts's findCycles, but reads
 * the bootstrap declarations as plain JSON so it needs no dependencies. The
 * canonical logic lives in the kit; this is its hermetic executor.
 *
 *   deno run --no-remote --allow-read check/acyclic.ts
 *
 * Exits 1 (listing each cycle) when the lattice isn't a DAG.
 */

interface Decl {
  node: string;
  provides?: Array<{ type: string }>;
  consumes?: Array<{ type: string }>;
}

const dir = new URL("../bootstrap", import.meta.url).pathname;
const byNode = new Map<string, Decl>();
try {
  const cat = JSON.parse(Deno.readTextFileSync(`${dir}/catalog.json`));
  if (Array.isArray(cat)) {
    for (const d of cat as Decl[]) byNode.set(d.node, d);
  }
} catch { /* no catalog */ }
for (const e of Deno.readDirSync(dir)) {
  if (!e.isFile || !e.name.endsWith(".trellis.json")) continue;
  const d = JSON.parse(Deno.readTextFileSync(`${dir}/${e.name}`)) as Decl;
  byNode.set(d.node, d); // adopter overrides catalog
}
const decls = [...byNode.values()];

// provides↔consumes → edges (from = provider, to = consumer)
const providers = new Map<string, string>();
for (const d of decls) {
  for (const p of d.provides ?? []) providers.set(p.type, d.node);
}
const edges: Array<{ from: string; to: string }> = [];
for (const d of decls) {
  for (const c of d.consumes ?? []) {
    const from = providers.get(c.type);
    if (from && from !== d.node) edges.push({ from, to: d.node });
  }
}

// findCycles over the build-dependency graph (consumer → provider).
const deps = new Map<string, string[]>();
for (const e of edges) {
  (deps.get(e.to) ?? deps.set(e.to, []).get(e.to)!).push(e.from);
}
const cycles: string[][] = [];
const seen = new Set<string>();
const stack: string[] = [];
const onStack = new Set<string>();
function visit(n: string): void {
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
}
for (const n of deps.keys()) visit(n);
const uniq = new Map<string, string[]>();
for (const c of cycles) uniq.set([...c].sort().join(">"), c);
const found = [...uniq.values()];

if (found.length === 0) {
  console.log("acyclic: the lattice is a build DAG.");
  Deno.exit(0);
}
console.error(
  `acyclic: ${found.length} dependency cycle(s) — break each by extracting a contract-only repo:`,
);
for (const c of found) console.error(`  ${[...c, c[0]].join(" → ")}`);
Deno.exit(1);
