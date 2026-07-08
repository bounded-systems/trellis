/**
 * Guards the DELIBERATE mirror in check/lattice.ts. That file re-implements the
 * kit's cycle/pair detection dependency-free so it can run sealed in a Nix
 * derivation (`--no-remote`, no JSR fetch). This test — which runs in ordinary
 * CI, where the network IS allowed — imports BOTH the local mirror and the kit's
 * canonical functions and asserts they agree over a battery of edge sets. If the
 * mirror ever drifts from @bounded-systems/trellis-kit, CI fails here.
 *
 * (This is the equivalence guard the conformance overlap audit's allowlist entry
 * for the trellis↔trellis-kit clone points at: the clone is intentional, and
 * this keeps it faithful.)
 */
import { assertEquals } from "@std/assert";
import {
  findCycles,
  findMultiContractPairs,
} from "@bounded-systems/trellis-kit";
import { findCyclesLocal, findMultiContractPairsLocal } from "./lattice.ts";

/** Cycles are sets of nodes; compare as sorted-node signatures, order-independent. */
function normCycles(cs: string[][]): string[] {
  return cs.map((c) => [...c].sort().join(">")).sort();
}

/** Pairs compared as `a::b|contracts` signatures, order-independent. */
function normPairs(
  ps: Array<{ pair: [string, string]; contracts: string[] }>,
): string[] {
  return ps
    .map((p) =>
      `${[...p.pair].sort().join("::")}|${[...p.contracts].sort().join("+")}`
    )
    .sort();
}

const cycleCases: Array<
  { name: string; edges: Array<{ from: string; to: string }> }
> = [
  { name: "empty", edges: [] },
  {
    name: "acyclic chain",
    edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
  },
  { name: "self-edge only", edges: [{ from: "a", to: "a" }] },
  {
    name: "2-cycle",
    edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }],
  },
  {
    name: "3-cycle + tail",
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "a" },
      { from: "c", to: "d" },
    ],
  },
  {
    name: "two disjoint cycles",
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "a" },
      { from: "x", to: "y" },
      { from: "y", to: "x" },
    ],
  },
  {
    name: "diamond (acyclic)",
    edges: [
      { from: "a", to: "b" },
      { from: "a", to: "c" },
      { from: "b", to: "d" },
      { from: "c", to: "d" },
    ],
  },
];

for (const c of cycleCases) {
  Deno.test(`findCycles mirror agrees — ${c.name}`, () => {
    assertEquals(
      normCycles(findCyclesLocal(c.edges)),
      normCycles(findCycles(c.edges)),
    );
  });
}

const pairCases: Array<
  { name: string; edges: Array<{ from: string; to: string; type: string }> }
> = [
  { name: "empty", edges: [] },
  {
    name: "single contract per pair",
    edges: [
      { from: "a", to: "b", type: "wire" },
      { from: "b", to: "c", type: "schema" },
    ],
  },
  {
    name: "two contracts, same direction",
    edges: [
      { from: "a", to: "b", type: "wire" },
      { from: "a", to: "b", type: "schema" },
    ],
  },
  {
    name: "two contracts, opposite directions (same pair)",
    edges: [
      { from: "a", to: "b", type: "wire" },
      { from: "b", to: "a", type: "schema" },
    ],
  },
  {
    name: "self-edge ignored",
    edges: [
      { from: "a", to: "a", type: "wire" },
      { from: "a", to: "a", type: "schema" },
    ],
  },
  {
    name: "duplicate type is not a violation",
    edges: [
      { from: "a", to: "b", type: "wire" },
      { from: "a", to: "b", type: "wire" },
    ],
  },
];

for (const c of pairCases) {
  Deno.test(`findMultiContractPairs mirror agrees — ${c.name}`, () => {
    assertEquals(
      normPairs(findMultiContractPairsLocal(c.edges)),
      normPairs(findMultiContractPairs(c.edges)),
    );
  });
}
