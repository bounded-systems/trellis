/**
 * @module
 * keeper-wire conformance check — the one live edge.
 *
 * Proves both sides of the `keeper-wire` contract type conform to the canonical
 * spec (../specs/keeperd.ts):
 *   - the DAEMON (keeperd.ts) — its METHODS dispatch table must expose exactly
 *     the spec's wire methods;
 *   - the CLIENT (keeper.ts)  — it must call exactly the spec's wire methods;
 *   - and for `import-and-push`, the client's param names must match the spec
 *     (catches the `ledgerRef` vs `manifestDigest` drift).
 *
 * No external imports and no AST dependency — a targeted regex parse over the
 * pinned source, plus a read of the committed `specs/keeper-wire.json` manifest
 * (projected from the VerbSpec by gen.ts). That keeps it runnable offline under
 * a sealed Nix derivation (`deno run --no-remote --allow-read`). Paths come from
 * argv (the flake passes the pinned source trees):
 *
 *   deno run --no-remote --allow-read check/keeper-wire.ts <keeperd.ts> <keeper-client.ts>
 *
 * Exits 0 on conformance, 1 on any drift (printing every discrepancy). The
 * non-zero exit is what a `nix flake check` / CI turns red on.
 */

import {
  conformMethods,
  type Discrepancy,
  parseClientMethods,
  parseClientParams,
} from "./parse.ts";

// Re-exported so existing importers (trellis_test.ts) keep resolving them here.
export { parseClientMethods, parseDaemonMethods } from "./parse.ts";
export type { Discrepancy };

interface WireManifest {
  type: string;
  methods: string[];
  params: Record<string, string[]>;
}

const MANIFEST: WireManifest = JSON.parse(
  Deno.readTextFileSync(
    new URL("../specs/keeper-wire.json", import.meta.url).pathname,
  ),
);

/** The spec's canonical wire method set (from the projected manifest). */
export function specMethods(): string[] {
  return MANIFEST.methods;
}

/** The spec's declared input field names for a given verb. */
export function specParams(method: string): string[] {
  return MANIFEST.params[method] ?? [];
}

/** Compare daemon + client sources against the spec; return every discrepancy. */
export function conform(daemonSrc: string, clientSrc: string): Discrepancy[] {
  const out = conformMethods(specMethods(), daemonSrc, clientSrc);

  // Param-name conformance for import-and-push (the surveyed drift point).
  const client = new Set(parseClientMethods(clientSrc));
  if (
    specMethods().includes("import-and-push") && client.has("import-and-push")
  ) {
    const declared = new Set(specParams("import-and-push"));
    for (const k of parseClientParams(clientSrc, "import-and-push")) {
      if (!declared.has(k)) {
        out.push({
          side: "client",
          kind: "param-drift",
          detail:
            `import-and-push sends "${k}" — not a declared param (expected one of: ${
              [...declared].join(", ")
            })`,
        });
      }
    }
  }

  return out;
}

if (import.meta.main) {
  const [daemonPath, clientPath] = Deno.args;
  if (!daemonPath || !clientPath) {
    console.error(
      "usage: keeper-wire.ts <keeperd.ts> <keeper-client.ts>",
    );
    Deno.exit(2);
  }
  const daemonSrc = await Deno.readTextFile(daemonPath);
  const clientSrc = await Deno.readTextFile(clientPath);
  const discrepancies = conform(daemonSrc, clientSrc);

  if (discrepancies.length === 0) {
    console.log("keeper-wire: CONFORMS — daemon + client match the spec.");
    Deno.exit(0);
  }
  console.error(`keeper-wire: ${discrepancies.length} discrepancy(ies):`);
  for (const d of discrepancies) {
    console.error(`  [${d.side}] ${d.kind}: ${d.detail}`);
  }
  Deno.exit(1);
}
