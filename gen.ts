/**
 * @module
 * Project the `keeper-wire` VerbSpec (specs/keeperd.ts — the source of truth)
 * to a dependency-free JSON manifest (specs/keeper-wire.json) that the offline
 * Nix conformance check consumes. No drift: the manifest is regenerated from the
 * spec, never hand-edited.
 *
 *   deno run --allow-read --allow-write gen.ts
 */

import { KEEPER_WIRE } from "./specs/keeperd.ts";

/** The projected manifest shape — the interchange IR for the offline check. */
export interface WireManifest {
  readonly type: string;
  readonly methods: readonly string[];
  /** Per-method declared input field names. */
  readonly params: Readonly<Record<string, readonly string[]>>;
}

/** Build the manifest from the VerbSpec registry. */
export function project(): WireManifest {
  const methods = Object.keys(KEEPER_WIRE);
  const params: Record<string, string[]> = {};
  for (const [id, verb] of Object.entries(KEEPER_WIRE)) {
    const shape = (verb.input as { shape?: Record<string, unknown> }).shape;
    params[id] = shape ? Object.keys(shape) : [];
  }
  return { type: "keeper-wire", methods, params };
}

if (import.meta.main) {
  const out = new URL("./specs/keeper-wire.json", import.meta.url).pathname;
  await Deno.writeTextFile(out, JSON.stringify(project(), null, 2) + "\n");
  console.log(`wrote ${out}`);
}
