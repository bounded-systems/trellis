/**
 * @module
 * The ContractType registry — the one place contract types are defined, so
 * per-repo declarations can reference them by name (`provides`/`consumes`).
 *
 * A type is `verified` when trellis has a live check wired for it (a flake
 * derivation that proves conformance); otherwise it's `declared` — mapped and
 * honest that nothing enforces it yet. This phase wires exactly one: the
 * `keeper-wire` capability contract between keeperd (provider) and its in-box
 * client (consumer). Every other type below is declared, awaiting its check.
 */

import type { ContractKind, SpecPointer } from "./schema.ts";

/** A registered contract type: its kind, governing spec, and whether a live check exists. */
export interface ContractType {
  readonly type: string;
  readonly kind: ContractKind;
  readonly spec: SpecPointer;
  /** True when a flake check verifies conformance to `spec` (see check/). */
  readonly verified: boolean;
  /** One-line description of the surface this type governs. */
  readonly summary: string;
}

/**
 * The registered contract types. Seeded from the org survey; grows one entry
 * per contract surface as edges are mapped. Only `keeper-wire` is `verified`
 * this phase.
 */
export const CONTRACT_TYPES: readonly ContractType[] = [
  {
    type: "keeper-wire",
    kind: "wire",
    spec: { verbspec: "./specs/keeperd.ts" },
    verified: true,
    summary:
      "keeperd's git-signing RPC surface (commit/push/import-and-push/attest-launch/sign/verify/status/getPublicKey).",
  },
  {
    type: "scout-wire",
    kind: "wire",
    spec: { verbspec: "./specs/scoutd.ts" },
    verified: true,
    summary:
      "scoutd's external-read RPC surface (repo/pr/issue/fetch/download/status).",
  },
  {
    type: "concierge-wire",
    kind: "wire",
    spec: { verbspec: "./specs/concierged.ts" },
    verified: false,
    summary:
      "concierged's capability-resolution RPC surface (register/resolve/keys/list/status).",
  },
  {
    type: "net-egress",
    kind: "wire",
    spec: { external: "https://github.com/bounded-systems/door-net#readme" },
    verified: false,
    summary:
      "netd's allowlist-egress surface — a CONNECT proxy, not a JSON-RPC verb (Proxy-Authorization grant).",
  },
  {
    type: "door-kit-mirror",
    kind: "vendored-pin",
    spec: { flakeInput: "door-kit" },
    verified: true,
    summary:
      "The door-kit client + runtime vendored into each door daemon — must stay byte-identical to door-kit HEAD.",
  },
  {
    type: "guest-room-protocol",
    kind: "vendored-pin",
    spec: { flakeInput: "guest-room" },
    verified: false,
    summary:
      "The guest-room room+door wire protocol vendored into door-kit and each daemon.",
  },
  {
    type: "ocap-provenance-predicate",
    kind: "shared-schema",
    spec: { jsrSchema: "@bounded-systems/ocap-provenance" },
    verified: false,
    summary:
      "The in-toto SLSA predicate claude-box (producer) and keeperd (signer) both pin byte-for-byte.",
  },
  {
    type: "front-desk-projects",
    kind: "external-platform",
    spec: { external: "https://docs.github.com/graphql" },
    verified: false,
    summary:
      "gh-project-room ↔ GitHub Projects v2 GraphQL (fields/views/workflows).",
  },
  {
    type: "sanctioned-reader-seam",
    kind: "import-boundary",
    spec: { jsrSchema: "@bounded-systems/seam-check" },
    verified: true,
    summary:
      "A 'one sanctioned reader' package upholding its own seam claim (allowed imports + no ambient authority) — a UNARY contract. Wired for fs; env/host/proc/repo-root next.",
  },
  {
    type: "jsr-library",
    kind: "shared-schema",
    spec: { jsrSchema: "@bounded-systems/*" },
    verified: false,
    summary:
      "An extracted @bounded-systems/* library's published JSR surface — the typed contract prx consumes.",
  },
  {
    type: "design-system-structure",
    kind: "shared-schema",
    spec: { jsrSchema: "@bounded-systems/baobab" },
    verified: false,
    summary:
      "baobab's configurable design-system structure — the shape brand pins (no defaults).",
  },
  {
    type: "brand-tokens",
    kind: "shared-schema",
    spec: { jsrSchema: "@bounded-systems/brand" },
    verified: false,
    summary:
      "brand's W3C design tokens + self-hosted fonts — consumed by the sites, gated by gh-action-brand-checks.",
  },
  {
    type: "component-a11y-spec",
    kind: "shared-schema",
    spec: { jsrSchema: "@bounded-systems/lone" },
    verified: false,
    summary:
      "lone's semantic/a11y blessing for DOM subtrees — the component spec baobab points at.",
  },
  {
    type: "mcp-tool-surface",
    kind: "wire",
    spec: { jsrSchema: "@bounded-systems/static-mcp" },
    verified: false,
    summary:
      "static-mcp's Sigstore-verified static-response MCP surface — the base site-mcp/bounded-tools-mcp implement.",
  },
  {
    type: "content-token-catalog",
    kind: "repo-config",
    spec: {
      external: "https://github.com/bounded-systems/content-catalog#readme",
    },
    verified: false,
    summary:
      "The org-wide content-token catalog aggregated from opted-in repos' content/strings.json.",
  },
  {
    type: "conformance-standard",
    kind: "repo-config",
    spec: { external: "https://github.com/bounded-systems/conformance#readme" },
    verified: false,
    summary:
      "The org/repo conformance standard (rules + gates) repos are measured against.",
  },
  {
    type: "signed-static-api",
    kind: "provenance",
    spec: { jsrSchema: "@bounded-systems/verify" },
    verified: false,
    summary:
      "A site's signed, content-addressed static API — produced by the sites, verified by verify / the MCP servers.",
  },
] as const;

/** Look up a contract type by name. */
export function contractType(type: string): ContractType | undefined {
  return CONTRACT_TYPES.find((c) => c.type === type);
}
