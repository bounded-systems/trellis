/**
 * @module
 * sanctioned-reader-seam conformance check — the import-boundary edge.
 *
 * WRAPS the published `@bounded-systems/seam-check` (pinned as a flake input,
 * `seam.ts` imported directly by store path — it's pure, `node:fs`/`node:path`
 * only, `runtimeCompat.deno: true`, so it runs offline). This is the "flake
 * wraps, doesn't replace" thesis at its clearest: trellis doesn't reimplement
 * the seam logic, it runs seam-check's own `collectSeamViolations` against a
 * pinned sanctioned-reader repo and surfaces the report.
 *
 * A UNARY contract: unlike wire / vendored-pin (provider↔consumer), an
 * import-boundary is a package upholding its OWN claim — no counterparty.
 *
 *   deno run --allow-read sanctioned-reader-seam.ts \
 *     <seam-check-src-dir> <target-repo-root> <repo-name>
 *
 * The claim comes from ../specs/seams.json keyed by <repo-name>. Exits 0 when
 * the repo upholds its claim, 1 on any violation (printing each).
 */

interface SeamViolation {
  file: string;
  spec: string;
}
interface AmbientViolation {
  file: string;
  what: string;
}
interface SeamReport {
  imports: SeamViolation[];
  ambient: AmbientViolation[];
}
interface CollectSeamViolations {
  (opts: {
    root: string;
    prod: readonly string[];
    test?: readonly string[];
  }): SeamReport;
}

const [seamSrc, targetRoot, repoName] = Deno.args;
if (!seamSrc || !targetRoot || !repoName) {
  console.error(
    "usage: sanctioned-reader-seam.ts <seam-check-src-dir> <target-repo-root> <repo-name>",
  );
  Deno.exit(2);
}

const claims: Record<string, { prod: string[]; test?: string[] }> = JSON.parse(
  Deno.readTextFileSync(
    new URL("../specs/seams.json", import.meta.url).pathname,
  ),
);
const claim = claims[repoName];
if (!claim) {
  console.error(`no seam claim declared for "${repoName}" in specs/seams.json`);
  Deno.exit(2);
}

// Import seam-check's pure core directly from its pinned source (offline).
const seam = await import(`${seamSrc}/seam.ts`);
const collectSeamViolations = seam
  .collectSeamViolations as CollectSeamViolations;

const report = collectSeamViolations({
  root: targetRoot,
  prod: claim.prod,
  test: claim.test,
});

const total = report.imports.length + report.ambient.length;
if (total === 0) {
  console.log(
    `sanctioned-reader-seam: ${repoName} UPHOLDS its claim (prod ⊆ [${
      claim.prod.join(", ")
    }], no ambient authority).`,
  );
  Deno.exit(0);
}

console.error(`sanctioned-reader-seam: ${repoName} — ${total} violation(s):`);
for (const v of report.imports) {
  console.error(`  [import] ${v.file}: "${v.spec}" not in the seam claim`);
}
for (const v of report.ambient) {
  console.error(`  [ambient] ${v.file}: holds ${v.what}`);
}
Deno.exit(1);
