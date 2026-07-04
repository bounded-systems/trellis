/**
 * @module
 * scout-wire conformance check — the second wire edge (a green one).
 *
 * Proves scoutd (door-scout) and its in-box client (door-kit's scout.ts) both
 * present exactly the `scout-wire` method surface (../specs/scout-wire.json,
 * projected from the VerbSpec by gen.ts). Shares the offline regex parsers with
 * keeper-wire via ./parse.ts — no external imports, runs sealed in Nix.
 *
 *   deno run --no-remote --allow-read scout-wire.ts <scoutd.ts> <scout-client.ts>
 */

import { conformMethods } from "./parse.ts";

interface WireManifest {
  type: string;
  methods: string[];
}

const MANIFEST: WireManifest = JSON.parse(
  Deno.readTextFileSync(
    new URL("../specs/scout-wire.json", import.meta.url).pathname,
  ),
);

if (import.meta.main) {
  const [daemonPath, clientPath] = Deno.args;
  if (!daemonPath || !clientPath) {
    console.error("usage: scout-wire.ts <scoutd.ts> <scout-client.ts>");
    Deno.exit(2);
  }
  const daemonSrc = await Deno.readTextFile(daemonPath);
  const clientSrc = await Deno.readTextFile(clientPath);
  const discrepancies = conformMethods(MANIFEST.methods, daemonSrc, clientSrc);

  if (discrepancies.length === 0) {
    console.log("scout-wire: CONFORMS — daemon + client match the spec.");
    Deno.exit(0);
  }
  console.error(`scout-wire: ${discrepancies.length} discrepancy(ies):`);
  for (const d of discrepancies) {
    console.error(`  [${d.side}] ${d.kind}: ${d.detail}`);
  }
  Deno.exit(1);
}
