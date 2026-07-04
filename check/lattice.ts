/**
 * @module
 * The lattice invariants, checked offline (dependency-free — no kit/zod import,
 * so it runs sealed in a Nix derivation like the wire checks). It mirrors the
 * kit's findCycles + findMultiContractPairs over the bootstrap declarations read
 * as plain JSON. The canonical logic is @bounded-systems/trellis-kit; this is
 * its hermetic executor.
 *
 *   deno run --no-remote --allow-read check/lattice.ts
 *
 * Two invariants (the kit's model):
 *   1. ONE agreement per node pair.
 *   2. The lattice is a build DAG (no cycles).
 * Both violations are broken the same way — extract the shared agreement into
 * its own contract-only repo. Exits 1 (listing them) on any violation.
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
  byNode.set(d.node, d);
}
const decls = [...byNode.values()];

// provides↔consumes → edges (from = provider, to = consumer)
const providers = new Map<string, string>();
for (const d of decls) {
  for (const p of d.provides ?? []) providers.set(p.type, d.node);
}
const edges: Array<{ from: string; to: string; type: string }> = [];
for (const d of decls) {
  for (const c of d.consumes ?? []) {
    const from = providers.get(c.type);
    if (from && from !== d.node) edges.push({ from, to: d.node, type: c.type });
  }
}

// (1) one agreement per pair
const byPair = new Map<string, Set<string>>();
for (const e of edges) {
  const key = [e.from, e.to].sort().join("::");
  (byPair.get(key) ?? byPair.set(key, new Set()).get(key)!).add(e.type);
}
const multi: Array<{ pair: string; contracts: string[] }> = [];
for (const [key, types] of byPair) {
  if (types.size > 1) {
    multi.push({
      pair: key.replace("::", " ↔ "),
      contracts: [...types].sort(),
    });
  }
}

// (2) acyclic (build dep = consumer → provider)
const deps = new Map<string, string[]>();
for (const e of edges) {
  (deps.get(e.to) ?? deps.set(e.to, []).get(e.to)!).push(e.from);
}
const cycles: string[][] = [];
const seen = new Set<string>();
const stack: string[] = [];
const onStack = new Set<string>();
function visit(n: string): void {
  if (onStack.has(n)) return void cycles.push(stack.slice(stack.indexOf(n)));
  if (seen.has(n)) return;
  seen.add(n), stack.push(n), onStack.add(n);
  for (const d of deps.get(n) ?? []) visit(d);
  stack.pop(), onStack.delete(n);
}
for (const n of deps.keys()) visit(n);
const uniqCycles = new Map<string, string[]>();
for (const c of cycles) uniqCycles.set([...c].sort().join(">"), c);

let ok = true;
if (multi.length) {
  ok = false;
  console.error(
    `lattice: ${multi.length} node-pair(s) with more than one agreement:`,
  );
  for (const m of multi) {
    console.error(`  ${m.pair}: ${m.contracts.join(" + ")}`);
  }
}
if (uniqCycles.size) {
  ok = false;
  console.error(`lattice: ${uniqCycles.size} dependency cycle(s):`);
  for (const c of uniqCycles.values()) {
    console.error(`  ${[...c, c[0]].join(" → ")}`);
  }
}
if (ok) {
  console.log("lattice: one agreement per pair, and a build DAG. ✓");
  Deno.exit(0);
}
console.error(
  "break each by extracting the shared agreement into a contract-only repo.",
);
Deno.exit(1);
