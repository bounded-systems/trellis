/**
 * Unit-tests the pure heart of check/overlap.ts: which repo-pairs the lattice
 * sanctions for shared source. (The jscpd/ast-grep halves need npm + real
 * checkouts and run as a CI job, not here.) Also asserts the live catalog
 * actually sanctions the one real cross-repo clone — trellis ↔ trellis-kit — so
 * the overlap check stays green without any allowlist.
 */
import { assertEquals } from "@std/assert";
import { readNodes, sanctionedPairs } from "./overlap.ts";

Deno.test("shared-code kinds sanction the provider↔consumer pair", () => {
  const pairs = sanctionedPairs([
    { node: "kit", provides: [{ type: "t", kind: "vendored-pin" }] },
    { node: "app", consumes: [{ type: "t" }] },
  ]);
  assertEquals([...pairs], ["app kit"]);
});

Deno.test("non-shared-code kinds do NOT sanction (a wire contract isn't shared source)", () => {
  const pairs = sanctionedPairs([
    { node: "server", provides: [{ type: "rpc", kind: "wire" }] },
    { node: "client", consumes: [{ type: "rpc" }] },
  ]);
  assertEquals([...pairs], []);
});

Deno.test("shared-schema and import-boundary also sanction", () => {
  const pairs = sanctionedPairs([
    { node: "lib", provides: [{ type: "s", kind: "shared-schema" }] },
    { node: "b", provides: [{ type: "i", kind: "import-boundary" }] },
    { node: "a", consumes: [{ type: "s" }, { type: "i" }] },
  ]);
  assertEquals([...pairs].sort(), ["a b", "a lib"]);
});

Deno.test("no edge when nobody consumes the provided type", () => {
  const pairs = sanctionedPairs([
    { node: "kit", provides: [{ type: "t", kind: "vendored-pin" }] },
    { node: "other", consumes: [{ type: "different" }] },
  ]);
  assertEquals([...pairs], []);
});

Deno.test("live catalog sanctions trellis ↔ trellis-kit (the real clone)", () => {
  const bootstrap = new URL("../bootstrap", import.meta.url).pathname;
  const pairs = sanctionedPairs(readNodes(bootstrap));
  assertEquals(pairs.has("trellis trellis-kit"), true);
});
