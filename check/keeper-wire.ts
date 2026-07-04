/**
 * @module
 * keeper-wire conformance check — proves both sides conform to the agreement.
 *
 * The agreement (the manifest) now lives in its OWN contract-only repo,
 * @bounded-systems/keeper-wire, so neither door-keeper nor door-kit owns it —
 * that is what breaks the cycle. The flake pins that repo and passes its
 * manifest.json first, then the daemon + client source trees:
 *
 *   deno run --no-remote --allow-read check/keeper-wire.ts \
 *     <keeper-wire/manifest.json> <keeperd.ts> <keeper-client.ts>
 *
 *   - the DAEMON (keeperd.ts) — its METHODS table must expose exactly the
 *     agreement's methods;
 *   - the CLIENT (keeper.ts)  — it must call exactly those methods;
 *   - and for `import-and-push`, the client's param names must match (catches
 *     the `ledgerRef` vs `manifestDigest` drift).
 *
 * No external imports — offline in a sealed Nix derivation. Exit 1 on any drift.
 */

import {
  conformMethods,
  type Discrepancy,
  parseClientMethods,
  parseClientParams,
} from "./parse.ts";

export { parseClientMethods, parseDaemonMethods } from "./parse.ts";
export type { Discrepancy };

export interface WireManifest {
  type: string;
  methods: string[];
  params: Record<string, string[]>;
}

/** Compare daemon + client sources against the agreement manifest. */
export function conform(
  manifest: WireManifest,
  daemonSrc: string,
  clientSrc: string,
): Discrepancy[] {
  const out = conformMethods(manifest.methods, daemonSrc, clientSrc);

  // Param-name conformance for import-and-push (the surveyed drift point).
  const client = new Set(parseClientMethods(clientSrc));
  if (
    manifest.methods.includes("import-and-push") &&
    client.has("import-and-push")
  ) {
    const declared = new Set(manifest.params["import-and-push"] ?? []);
    for (const k of parseClientParams(clientSrc, "import-and-push")) {
      // `kind` is the request-envelope discriminator (the method selector in the
      // payload), not a verb param — every door-kit request carries it.
      if (k === "kind") continue;
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
  const [manifestPath, daemonPath, clientPath] = Deno.args;
  if (!manifestPath || !daemonPath || !clientPath) {
    console.error(
      "usage: keeper-wire.ts <manifest.json> <keeperd.ts> <keeper-client.ts>",
    );
    Deno.exit(2);
  }
  const manifest: WireManifest = JSON.parse(
    await Deno.readTextFile(manifestPath),
  );
  const daemonSrc = await Deno.readTextFile(daemonPath);
  const clientSrc = await Deno.readTextFile(clientPath);
  const discrepancies = conform(manifest, daemonSrc, clientSrc);

  if (discrepancies.length === 0) {
    console.log("keeper-wire: CONFORMS — daemon + client match the agreement.");
    Deno.exit(0);
  }
  console.error(`keeper-wire: ${discrepancies.length} discrepancy(ies):`);
  for (const d of discrepancies) {
    console.error(`  [${d.side}] ${d.kind}: ${d.detail}`);
  }
  Deno.exit(1);
}
