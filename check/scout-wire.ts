/**
 * @module
 * scout-wire conformance check — proves scoutd (door-scout) and its in-box
 * client (door-kit's scout.ts) both present exactly the agreement's method
 * surface. The agreement lives in its own contract-only repo
 * (@bounded-systems/scout-wire); the flake pins it and passes its manifest.json
 * first, then the daemon + client trees:
 *
 *   deno run --no-remote --allow-read scout-wire.ts \
 *     <scout-wire/manifest.json> <scoutd.ts> <scout-client.ts>
 *
 * Offline (no imports beyond ./parse.ts). Exit 1 on any drift.
 */

import { conformMethods } from "./parse.ts";

interface WireManifest {
  type: string;
  methods: string[];
}

if (import.meta.main) {
  const [manifestPath, daemonPath, clientPath] = Deno.args;
  if (!manifestPath || !daemonPath || !clientPath) {
    console.error(
      "usage: scout-wire.ts <manifest.json> <scoutd.ts> <scout-client.ts>",
    );
    Deno.exit(2);
  }
  const manifest: WireManifest = JSON.parse(
    await Deno.readTextFile(manifestPath),
  );
  const daemonSrc = await Deno.readTextFile(daemonPath);
  const clientSrc = await Deno.readTextFile(clientPath);
  const discrepancies = conformMethods(manifest.methods, daemonSrc, clientSrc);

  if (discrepancies.length === 0) {
    console.log("scout-wire: CONFORMS — daemon + client match the agreement.");
    Deno.exit(0);
  }
  console.error(`scout-wire: ${discrepancies.length} discrepancy(ies):`);
  for (const d of discrepancies) {
    console.error(`  [${d.side}] ${d.kind}: ${d.detail}`);
  }
  Deno.exit(1);
}
