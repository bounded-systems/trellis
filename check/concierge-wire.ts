/**
 * @module
 * concierge-wire conformance check — proves concierged (door-concierge) and its
 * in-box client (door-kit's concierge.ts) both present exactly the agreement's
 * method surface. The agreement lives in its own contract-only repo
 * (@bounded-systems/concierge-wire); the flake pins it and passes its
 * manifest.json first, then the daemon + client trees:
 *
 *   deno run --no-remote --allow-read concierge-wire.ts \
 *     <concierge-wire/manifest.json> <concierged.ts> <concierge-client.ts>
 *
 * concierged's client dispatches with `call(socket, "<method>", …)` (the method
 * is the 2nd arg), so this uses parseCallMethods — unlike keeper/scout's
 * `request("<method>", …)`. Offline (only ./parse.ts). Exit 1 on any drift.
 */

import { conformMethods, parseCallMethods } from "./parse.ts";

interface WireManifest {
  type: string;
  methods: string[];
}

if (import.meta.main) {
  const [manifestPath, daemonPath, clientPath] = Deno.args;
  if (!manifestPath || !daemonPath || !clientPath) {
    console.error(
      "usage: concierge-wire.ts <manifest.json> <concierged.ts> <concierge-client.ts>",
    );
    Deno.exit(2);
  }
  const manifest: WireManifest = JSON.parse(
    await Deno.readTextFile(manifestPath),
  );
  const daemonSrc = await Deno.readTextFile(daemonPath);
  const clientSrc = await Deno.readTextFile(clientPath);
  const discrepancies = conformMethods(
    manifest.methods,
    daemonSrc,
    clientSrc,
    parseCallMethods, // door-kit's concierge client uses call(sock, "method", …)
  );

  if (discrepancies.length === 0) {
    console.log(
      "concierge-wire: CONFORMS — daemon + client match the agreement.",
    );
    Deno.exit(0);
  }
  console.error(`concierge-wire: ${discrepancies.length} discrepancy(ies):`);
  for (const d of discrepancies) {
    console.error(`  [${d.side}] ${d.kind}: ${d.detail}`);
  }
  Deno.exit(1);
}
