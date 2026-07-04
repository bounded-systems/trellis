/**
 * @module
 * Project the remaining in-repo wire VerbSpecs to dependency-free manifests the
 * offline checks consume. keeper-wire's spec moved to its own contract-only repo
 * (@bounded-systems/keeper-wire), which generates its own manifest; trellis pins
 * that repo and reads its manifest.json in the check.
 *
 *   deno run --allow-read --allow-write gen.ts
 */

import type { VerbSpec } from "verbspec";
import { SCOUT_WIRE } from "./specs/scoutd.ts";

export interface WireManifest {
  readonly type: string;
  readonly methods: readonly string[];
  readonly params: Readonly<Record<string, readonly string[]>>;
}

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
