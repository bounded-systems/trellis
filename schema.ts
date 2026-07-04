/**
 * @module
 * trellis's schema is now the canonical kit — @bounded-systems/trellis-kit —
 * re-exported here so trellis's own modules keep importing from `./schema.ts`
 * while the DEFINITION lives in the shared spec/SDK that trellis-private and
 * every repo's own trellis.json also import. A contract is the pinned agreement
 * between two services; the kit is where that agreement is pinned.
 */

export * from "@bounded-systems/trellis-kit";
