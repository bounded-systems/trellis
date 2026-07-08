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
    spec: { flakeInput: "keeper-wire" },
    verified: true,
    summary:
      "keeperd's git-signing RPC surface (commit/push/import-and-push/attest-launch/sign/verify/status/getPublicKey).",
  },
  {
    type: "scout-wire",
    kind: "wire",
    spec: { flakeInput: "scout-wire" },
    verified: true,
    summary:
      "scoutd's external-read RPC surface (repo/pr/issue/fetch/download/status).",
  },
  {
    type: "concierge-wire",
    kind: "wire",
    spec: { flakeInput: "concierge-wire" },
    verified: true,
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
    type: "descriptor-honesty",
    kind: "provenance",
    spec: { jsrSchema: "@bounded-systems/drift-gate" },
    verified: true,
    summary:
      "A repo upholding its OWN descriptor claim — every trellis.json proof claim's provenBy file exists and its git blob hash matches the pin in the generated README. A UNARY contract, verified by @bounded-systems/drift-gate's pure descriptor check (offline; the surface check needs npm and stays in per-repo CI). Wired for guest-room; other descriptor repos next.",
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
  {
    type: "contract-lattice-projection",
    kind: "provenance",
    spec: {
      external: "https://github.com/bounded-systems/trellis#status-branch",
    },
    verified: false,
    summary:
      "trellis's cosign-signed status.json (the lattice projection) — consumed by the Trust Center + the bounded.tools /contracts page.",
  },
  {
    type: "seam-check-lib",
    kind: "import-boundary",
    spec: { jsrSchema: "@bounded-systems/seam-check" },
    verified: false,
    summary:
      "seam-check's published seam-assertion library — repos devDep it to enforce their own import boundary in tests (door-kit, fs).",
  },
  {
    type: "oidc-app-token-broker",
    kind: "external-platform",
    spec: {
      external:
        "https://github.com/bounded-systems/cf-oidc-token-broker#readme",
    },
    verified: false,
    summary:
      "cf-oidc-token-broker mints GitHub App installation tokens over Actions OIDC (the App key lives only in the broker) — consumed by gh-project-room's front-desk-sync.",
  },
  {
    type: "dev-contract-schema",
    kind: "shared-schema",
    spec: { jsrSchema: "@bounded-systems/dev-contracts" },
    verified: false,
    summary:
      "The DevContracts Zod schemas (dev_contract/lock/token) for declarative project-config contracts — consolidated into @bounded-systems/dev-contracts.",
  },
  {
    type: "verbspec-lib",
    kind: "shared-schema",
    spec: { jsrSchema: "@bounded-systems/verbspec" },
    verified: false,
    summary:
      "verbspec (defineVerb/dispatch + one Zod I/O per verb, projected to CLI/MCP/OpenAPI) — the framework the wire agreements, installer, string-audit et al. import.",
  },
  {
    type: "node-uniqueness-check",
    kind: "repo-config",
    spec: {
      external:
        "https://github.com/bounded-systems/gh-action-node-uniqueness#readme",
    },
    verified: false,
    summary:
      "gh-action-node-uniqueness — CI gate asserting node/dep uniqueness; run by fleet.",
  },
  {
    type: "brand-check",
    kind: "repo-config",
    spec: {
      external:
        "https://github.com/bounded-systems/gh-action-brand-checks#readme",
    },
    verified: false,
    summary:
      "gh-action-brand-checks — CI gate for brand-token compliance; run by fleet.",
  },
  {
    type: "contracts-check",
    kind: "repo-config",
    spec: {
      external: "https://github.com/bounded-systems/gh-action-contracts#readme",
    },
    verified: false,
    summary:
      "gh-action-contracts — CI gate for contract conformance; run by fleet.",
  },
  {
    type: "deterministic-release",
    kind: "repo-config",
    spec: { jsrSchema: "@bounded-systems/mint" },
    verified: false,
    summary:
      "mint — deterministic, signed releases from .release/ intent files (bumps deno.json/jsr.json/package.json). Adopted by dev-contracts.",
  },
  {
    type: "org-defaults",
    kind: "repo-config",
    spec: {
      external:
        "https://github.com/bounded-systems/.github/blob/main/org-defaults.mjs",
    },
    verified: false,
    summary:
      "Org-level defaults + the public profile README every bounded-systems repo inherits.",
  },
  {
    type: "token-audit-toolkit",
    kind: "shared-schema",
    spec: { jsrSchema: "@bounded-systems/claude-token-tools" },
    verified: false,
    summary: "Claude Code token-usage auditor + home-manager module.",
  },
  {
    type: "dns-as-code",
    kind: "external-platform",
    spec: {
      external:
        "https://github.com/bounded-systems/deploy/blob/main/dns-schema.mjs",
    },
    verified: false,
    summary:
      "bounded.tools DNS-as-code — reviewer-gated Cloudflare zone records, now schema-defined (deploy/dns-schema.mjs validates every state/*.dns.json).",
  },
  {
    type: "oci-dev-registry",
    kind: "external-platform",
    spec: {
      external: "https://github.com/bounded-systems/dev-registry#readme",
    },
    verified: false,
    summary:
      "Local-first OCI registry + devcontainer build system with build traceability.",
  },
  {
    type: "peercred-helper",
    kind: "shared-schema",
    spec: { jsrSchema: "@bounded-systems/door-peercred" },
    verified: false,
    summary:
      "SO_PEERCRED helper for launcherd (Rust) — peer-identity extraction on unix sockets.",
  },
  {
    type: "nix-facilities",
    kind: "repo-config",
    spec: { external: "https://github.com/bounded-systems/facilities#readme" },
    verified: false,
    summary: "Shared Nix flakes, devshells, and build substrate for the org.",
  },
  {
    type: "linked-data-structure",
    kind: "shared-schema",
    spec: { jsrSchema: "@bounded-systems/fold-engine" },
    verified: false,
    summary:
      "JSON-LD / schema.org linked-data structure over an Obsidian vault.",
  },
  {
    type: "roundtrip-validation",
    kind: "shared-schema",
    spec: { jsrSchema: "@bounded-systems/frond" },
    verified: false,
    summary:
      "Parse-to-AST + regenerate-source fidelity validation (Deno + SWC).",
  },
  {
    type: "ast-git-spec",
    kind: "shared-schema",
    spec: { jsrSchema: "@bounded-systems/git-ast" },
    verified: false,
    summary: "AST-based git clean/smudge diff+merge spec (design stage).",
  },
  {
    type: "wasm-hook-builder",
    kind: "repo-config",
    spec: { external: "https://github.com/bounded-systems/hooksmith#readme" },
    verified: false,
    summary: "Build Rust binaries into Lefthook hooks as WASM components.",
  },
  {
    type: "lima-devshell-config",
    kind: "repo-config",
    spec: {
      external: "https://github.com/bounded-systems/lima-devshell#readme",
    },
    verified: false,
    summary:
      "Bootstrap devshell for Lima VMs + macOS home-manager (Nix flake).",
  },
  {
    type: "vault-content",
    kind: "repo-config",
    spec: { external: "https://github.com/bounded-systems/lobby#readme" },
    verified: false,
    summary:
      "Offline Obsidian vault whose drafts become robertdelanghe.dev posts.",
  },
  {
    type: "schema-transform",
    kind: "shared-schema",
    spec: { jsrSchema: "@bounded-systems/schema-bridge" },
    verified: false,
    summary: "Schema transformation/bridging between formats.",
  },
  {
    type: "org-quality-standard",
    kind: "repo-config",
    spec: {
      external:
        "https://github.com/bounded-systems/.github/blob/main/.github/workflows/repo-standard.yml",
    },
    verified: false,
    summary:
      "The reusable repo-standard workflow .github provides (security + the prose-proxy quality gates + test) — every repo that calls it runs the same org quality bar. CI-enforced via GitHub Actions; declared here (no trellis flake check yet).",
  },
] as const;

/** Look up a contract type by name. */
export function contractType(type: string): ContractType | undefined {
  return CONTRACT_TYPES.find((c) => c.type === type);
}
