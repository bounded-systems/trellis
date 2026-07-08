/**
 * @module
 * Cross-repo structural overlap as a LATTICE INVARIANT.
 *
 * Where lattice.ts checks the shape of the declared contract graph (one
 * agreement per pair, no cycles), this checks the *undeclared* graph: is the
 * same source structure copy-pasted across two repos that the lattice does NOT
 * join by a shared-code contract? Such a clone is undeclared coupling — either
 * it should become an import (an `import-boundary` / `shared-schema` contract)
 * or, if it's a deliberate vendored copy, it should be *declared* as a
 * `vendored-pin` (like `door-kit-mirror` or `trellis-kit-lattice`) and guarded
 * by an equivalence check. Either way the fix is to make the lattice honest.
 *
 * So there is NO separate allowlist: a cross-repo clone is sanctioned iff the
 * two repos are joined by a contract whose kind is a shared-code kind
 * (vendored-pin / shared-schema / import-boundary). The registry + catalog ARE
 * the allowlist. This is the conformance overlap axis, re-homed here where the
 * cross-repo relationship model already lives.
 *
 * Two tools, over the catalog repos checked out side by side under --repos-dir:
 *   jscpd    — Type-1/2/3 clone discovery (renamed vars still match). FAILS if a
 *              cross-repo clone's repo-pair is not joined by a shared-code
 *              contract, or the duplication ratio exceeds the budget.
 *   ast-grep — structural rules (check/overlap-rules/) seeded from real
 *              consolidations. FAILS on any error-severity match.
 *
 * Runtime note: unlike the flake checks, this is NOT hermetic — jscpd/ast-grep
 * are npm tools that read many full checkouts, so it runs as an ordinary CI job
 * (see .github/workflows/ci.yml `overlap`), not a sealed `--no-remote`
 * derivation. The pure part (which pairs are sanctioned) is `sanctionedPairs`
 * below, unit-tested in check/overlap_test.ts.
 *
 *   deno run -A check/overlap.ts                 # repos are siblings (../<name>)
 *   deno run -A check/overlap.ts --repos-dir=_repos
 *   deno run -A check/overlap.ts --only=jscpd    # or --only=astgrep
 */
import { parseArgs } from "@std/cli/parse-args";
import { exists } from "@std/fs/exists";

/** Contract kinds that legitimately imply shared/duplicated SOURCE across repos. */
const SHARED_CODE_KINDS = new Set([
  "vendored-pin",
  "shared-schema",
  "import-boundary",
]);

const DEFAULT_BUDGET_PCT = 3.0;

interface Provision {
  type: string;
  kind?: string;
}
interface Node {
  node: string;
  provides?: Provision[];
  consumes?: Array<{ type: string }>;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(" ");
}

/**
 * The set of repo-pairs the lattice sanctions for shared source: for each
 * provider P of a contract type whose kind is a shared-code kind, every consumer
 * C of that type yields the pair {P, C}. Pure — no I/O — so it's unit-testable.
 */
export function sanctionedPairs(nodes: Node[]): Set<string> {
  const out = new Set<string>();
  for (const provider of nodes) {
    for (const p of provider.provides ?? []) {
      if (!p.kind || !SHARED_CODE_KINDS.has(p.kind)) continue;
      for (const consumer of nodes) {
        if (consumer.node === provider.node) continue;
        if ((consumer.consumes ?? []).some((c) => c.type === p.type)) {
          out.add(pairKey(provider.node, consumer.node));
        }
      }
    }
  }
  return out;
}

/** Read the catalog (catalog.json array + *.trellis.json overrides), like lattice.ts. */
export function readNodes(bootstrapDir: string): Node[] {
  const byNode = new Map<string, Node>();
  try {
    const cat = JSON.parse(
      Deno.readTextFileSync(`${bootstrapDir}/catalog.json`),
    );
    if (Array.isArray(cat)) {
      for (const d of cat as Node[]) byNode.set(d.node, d);
    }
  } catch { /* no catalog */ }
  for (const e of Deno.readDirSync(bootstrapDir)) {
    if (!e.isFile || !e.name.endsWith(".trellis.json")) continue;
    const d = JSON.parse(
      Deno.readTextFileSync(`${bootstrapDir}/${e.name}`),
    ) as Node;
    byNode.set(d.node, d);
  }
  return [...byNode.values()];
}

// ---- helpers -------------------------------------------------------------
const repoOf = (p: string) => p.replaceAll("\\", "/").split("/")[0];

interface CheckResult {
  name: string;
  ok: boolean;
  failures: string[];
  notes: string[];
}

// ---- jscpd ---------------------------------------------------------------
async function runJscpd(
  reposDir: string,
  repos: string[],
  sanctioned: Set<string>,
  budget: number,
): Promise<CheckResult & { pct: number; crossRepo: unknown[] }> {
  const out = Deno.makeTempDirSync({ prefix: "jscpd-" });
  const cmd = new Deno.Command("npx", {
    args: [
      "--yes",
      "jscpd@4",
      ...repos,
      "--pattern",
      "**/*.ts",
      "--ignore",
      "**/node_modules/**,**/_*/**,**/.git/**,**/dist/**,**/*.d.ts,**/*_test.ts,**/*.test.ts",
      "--min-tokens",
      "40",
      "--min-lines",
      "5",
      "--reporters",
      "json",
      "--output",
      out,
      "--mode",
      "mild",
      "--silent",
    ],
    cwd: reposDir,
    stdout: "null",
    stderr: "inherit",
  });
  await cmd.output(); // jscpd exits non-zero when clones found; we read the report either way

  const report = JSON.parse(Deno.readTextFileSync(`${out}/jscpd-report.json`));
  const pct = report.statistics?.total?.percentage ?? 0;

  const failures: string[] = [];
  const crossRepo: Array<
    {
      a: string;
      b: string;
      lines: number;
      fileA: string;
      fileB: string;
      ok: boolean;
    }
  > = [];
  for (const c of report.duplicates ?? []) {
    const a = repoOf(c.firstFile.name), b = repoOf(c.secondFile.name);
    if (a === b) continue;
    const ok = sanctioned.has(pairKey(a, b));
    crossRepo.push({
      a,
      b,
      lines: c.lines,
      fileA: c.firstFile.name,
      fileB: c.secondFile.name,
      ok,
    });
    if (!ok) {
      failures.push(
        `undeclared cross-repo clone: ${a} ↔ ${b} (${c.lines}L) — ${c.firstFile.name} / ${c.secondFile.name}. Declare it in the lattice (a shared-code contract: import-boundary / shared-schema / vendored-pin) or remove the duplication.`,
      );
    }
  }
  if (pct > budget) {
    failures.push(
      `duplication ratio ${pct.toFixed(2)}% exceeds budget ${budget}%`,
    );
  }
  return {
    name: "jscpd",
    ok: failures.length === 0,
    failures,
    notes: [
      `${
        pct.toFixed(2)
      }% dup (budget ${budget}%), ${crossRepo.length} cross-repo clone(s)`,
    ],
    pct,
    crossRepo,
  };
}

// ---- ast-grep ------------------------------------------------------------
async function runAstGrep(reposDir: string): Promise<CheckResult> {
  const sgconfig =
    new URL("./overlap-rules/sgconfig.yml", import.meta.url).pathname;
  const cmd = new Deno.Command("npx", {
    args: [
      "--yes",
      "--package",
      "@ast-grep/cli",
      "ast-grep",
      "scan",
      "-c",
      sgconfig,
      "--json=compact",
      reposDir,
    ],
    stdout: "piped",
    stderr: "null",
  });
  const { stdout } = await cmd.output();
  let matches: Array<
    {
      ruleId: string;
      file: string;
      range: { start: { line: number } };
      message: string;
      severity?: string;
    }
  > = [];
  try {
    matches = JSON.parse(new TextDecoder().decode(stdout));
  } catch { /* no matches / non-JSON */ }
  const errors = matches.filter((m) => (m.severity ?? "error") === "error");
  const failures = errors.map((m) =>
    `[${m.ruleId}] ${m.file.replaceAll("\\", "/")}:${
      (m.range?.start?.line ?? 0) + 1
    } — ${m.message}`
  );
  return {
    name: "ast-grep",
    ok: failures.length === 0,
    failures,
    notes: [`${matches.length} rule match(es)`],
  };
}

// ---- main ----------------------------------------------------------------
if (import.meta.main) {
  const args = parseArgs(Deno.args);
  const only = typeof args.only === "string" ? args.only : null;
  const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
  const reposDir = typeof args["repos-dir"] === "string"
    ? args["repos-dir"] as string
    : `${root}/..`;

  const nodes = readNodes(`${root}/bootstrap`);
  const sanctioned = sanctionedPairs(nodes);
  const budget = DEFAULT_BUDGET_PCT;

  // Scan the catalog nodes that are actually checked out under reposDir.
  const repos: string[] = [];
  for (const n of nodes.map((x) => x.node)) {
    if (await exists(`${reposDir}/${n}`)) repos.push(n);
  }
  repos.sort();

  const results: CheckResult[] = [];
  let jscpd: (CheckResult & { pct: number; crossRepo: unknown[] }) | undefined;
  if (!only || only === "jscpd") {
    jscpd = await runJscpd(reposDir, repos, sanctioned, budget);
    results.push(jscpd);
  }
  if (!only || only === "astgrep") results.push(await runAstGrep(reposDir));

  const lines: string[] = [
    "# trellis — cross-repo overlap (lattice invariant)",
    "",
    `Scanned: ${
      repos.map((r) => `\`${r}\``).join(", ") || "(none checked out)"
    }`,
    `Sanctioned shared-code pairs (from the lattice): ${sanctioned.size}`,
    "",
    "| check | status | detail |",
    "| --- | :-: | --- |",
  ];
  for (const r of results) {
    lines.push(`| ${r.name} | ${r.ok ? "✅" : "❌"} | ${r.notes.join("; ")} |`);
  }
  lines.push("");
  for (const r of results) {
    if (r.ok) continue;
    lines.push(`## ❌ ${r.name}`);
    for (const f of r.failures) lines.push(`- ${f}`);
    lines.push("");
  }
  const report = lines.join("\n");
  console.log(report);

  const summary = Deno.env.get("GITHUB_STEP_SUMMARY");
  if (summary) {
    try {
      Deno.writeTextFileSync(summary, report + "\n", { append: true });
    } catch { /* best-effort */ }
  }

  const ok = results.every((r) => r.ok);
  console.log(ok ? "\n✓ overlap invariant holds" : "\n✗ overlap FAILED");
  Deno.exit(ok ? 0 : 1);
}
