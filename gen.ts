/**
 * @module
 * Project each wire-contract VerbSpec (the source of truth in specs/*.ts) to a
 * dependency-free JSON manifest the offline Nix checks consume. No drift: the
 * manifests are regenerated from the specs, never hand-edited.
 *
 *   deno run --allow-read --allow-write gen.ts
 */

import type { VerbSpec } from "verbspec";
import { KEEPER_WIRE } from "./specs/keeperd.ts";
import { SCOUT_WIRE } from "./specs/scoutd.ts";

/** The projected manifest shape — the interchange IR for the offline checks. */
export interface WireManifest {
  readonly type: string;
  readonly methods: readonly string[];
  /** Per-method declared input field names. */
  readonly params: Readonly<Record<string, readonly string[]>>;
}

/** Build a manifest from a wire VerbSpec registry. */
export function project(
  type: string,
  registry: Record<string, VerbSpec>,
): WireManifest {
  const methods = Object.keys(registry);
  const params: Record<string, string[]> = {};
  for (const [id, verb] of Object.entries(registry)) {
    const shape = (verb.input as { shape?: Record<string, unknown> }).shape;
    params[id] = shape ? Object.keys(shape) : [];
  }
  return { type, methods, params };
}

const MANIFESTS: ReadonlyArray<[string, Record<string, VerbSpec>]> = [
  ["keeper-wire", KEEPER_WIRE],
  ["scout-wire", SCOUT_WIRE],
];

if (import.meta.main) {
  for (const [type, registry] of MANIFESTS) {
    const out = new URL(`./specs/${type}.json`, import.meta.url).pathname;
    await Deno.writeTextFile(
      out,
      JSON.stringify(project(type, registry), null, 2) + "\n",
    );
    console.log(`wrote ${out}`);
  }
}
