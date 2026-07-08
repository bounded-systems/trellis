/**
 * @module
 * descriptor-honesty conformance check — the provenance edge.
 *
 * WRAPS `@bounded-systems/drift-gate` (pinned as a flake input): its pure
 * `src/descriptor.ts` is imported directly by store path — `crypto.subtle` +
 * `node:fs`-free Deno reads only, NO ts-morph — so it runs offline, the same way
 * `sanctioned-reader-seam` wraps seam-check. trellis does not reimplement the
 * check; it runs drift-gate's own `checkDescriptor` against a pinned repo and
 * surfaces the report. (drift-gate's *surface* check needs ts-morph/npm and
 * cannot run in this offline sandbox — it lives in per-repo CI, not here.)
 *
 * A UNARY contract: a repo upholding its OWN descriptor claim — every
 * `trellis.json` `descriptor.proof.claims[].provenBy` file exists and its git
 * blob hash matches the pin in the generated README claims table. No counterparty.
 *
 *   deno run --no-remote --allow-read descriptor-drift.ts \
 *     <drift-gate-src-dir> <target-repo-root> <repo-name>
 *
 * Exits 0 when the repo upholds its descriptor (or has none — skipped), 1 on any
 * drift (printing each).
 */

interface CheckResult {
  name: string;
  ok: boolean;
  failures: string[];
  notes: string[];
  skipped?: boolean;
}
interface CheckDescriptor {
  (
    opts: { root: string; trellis?: string; readme?: string },
  ): Promise<CheckResult>;
}

const [driftGateSrc, targetRoot, repoName] = Deno.args;
if (!driftGateSrc || !targetRoot || !repoName) {
  console.error(
    "usage: descriptor-drift.ts <drift-gate-src-dir> <target-repo-root> <repo-name>",
  );
  Deno.exit(2);
}

// Import drift-gate's pure descriptor check directly from its pinned source
// (offline). src/descriptor.ts pulls only ./blob-hash.ts + ./types.ts — no npm.
const mod = await import(`${driftGateSrc}/src/descriptor.ts`);
const checkDescriptor = mod.checkDescriptor as CheckDescriptor;

const result = await checkDescriptor({ root: targetRoot });

if (result.skipped) {
  console.log(
    `descriptor-honesty: ${repoName} declares no descriptor.proof.claims — nothing to verify (skipped).`,
  );
  Deno.exit(0);
}
if (result.ok) {
  console.log(
    `descriptor-honesty: ${repoName} UPHOLDS its descriptor — ${
      result.notes.join("; ")
    }.`,
  );
  Deno.exit(0);
}

console.error(
  `descriptor-honesty: ${repoName} — ${result.failures.length} drift(s):`,
);
for (const f of result.failures) console.error(`  ${f}`);
Deno.exit(1);
