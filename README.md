# trellis

The bounded-systems **contract map** — a semantic tree whose nodes are repos and
whose links are *actual specs* — plus the one aggregating **flake check that CI
runs** to prove those links hold.

A trellis is the lattice a tree is trained onto; here each crossbar is a
contract between two repos.

## Why

The org's inter-repo contracts are real but scattered and unenforced. Three
things were true when trellis started:

- **Contracts aren't one kind.** Edges between repos fall into distinct kinds —
  capability wire surfaces, vendored flake-input pins, shared schemas,
  external-platform APIs, import/ambient-authority seams, repo-config
  conformance, provenance/signing. A single "does the daemon match its client?"
  frame missed most of them.
- **No repo owned the whole picture.** `seam-check` proves import boundaries;
  `dev-contracts` proves repo config; `ocap-provenance` is a shared schema — but
  nothing mapped the edges or checked them together.
- **The enforcement mechanism existed but never ran.** Each door daemon already
  had `checks.<sys>.*-mirror` derivations that `diff` vendored copies against
  pinned inputs — but no CI ran `nix flake check`, they were `aarch64-darwin`-
  scoped while CI is Linux, and they had **already drifted** (door-keeper's
  vendored client lagged door-kit by ~30 commits, missing whole methods its own
  daemon implements; `import-and-push` sends `ledgerRef` where keeperd reads
  `manifestDigest`, silently dropping data).

trellis maps every edge and makes the check actually run.

## The tree is decentralized and type-based

Each repo declares its **own** node — a `trellis.json` — in terms of the
contract **types** it provides and consumes, **never** by naming other repos:

```json
{
  "node": "door-keeper",
  "visibility": "public",
  "provides": [
    { "type": "keeper-wire", "kind": "wire", "spec": { "verbspec": "./specs/keeperd.ts" } }
  ],
  "consumes": [{ "type": "guest-room-protocol" }, { "type": "ocap-provenance-predicate" }]
}
```

trellis **assembles** the tree by matching a provider of type `T` to every
consumer of type `T`. Rename or swap a repo and the type-links still resolve —
the map never hardcodes an edge. Repos that haven't adopted a `trellis.json` yet
are declared on their behalf under `bootstrap/` (to be upstreamed as PRs).

Until adopters materialize, the public tree assembles the public + bootstrap
declarations; a private sidecar (**`trellis-private`**, mirroring `.github` /
`.github-private`) reuses the same schema + flake to assemble private repos.
Nodes carry a `visibility` field and assembly is visibility-aware.

## Contract kinds

| kind | governs | leaf check |
|---|---|---|
| `wire` | daemon RPC / MCP tool / CLI surfaces | VerbSpec schema conformance |
| `vendored-pin` | flake-input mirrors (door-kit, guest-room, …) | `*-mirror` diff derivation |
| `shared-schema` | ocap-provenance, machine-schema, … | schema equivalence |
| `external-platform` | GitHub / Slack / Notion APIs | (external) |
| `import-boundary` | the "one sanctioned reader" seams | `@bounded-systems/seam-check` |
| `repo-config` | conformance, brand/token gates | dev-contracts / actions |
| `provenance` | signing, attestation, lineage | verify / ocap-provenance |

The flake check **wraps** these leaf mechanisms — it doesn't replace them. A
type moves from `declared` to `verified` when its leaf check is wired into the
flake.

## Usage

```sh
# what types exist, and which have a live check
deno run --allow-read verbs.ts types

# the assembled edges (provider→consumer), filterable
deno run --allow-read verbs.ts edges --kind wire
deno run --allow-read verbs.ts edges --type keeper-wire

# is a type actually checked?
deno run --allow-read verbs.ts verify --type keeper-wire
```

The verbs are VerbSpec projections (CLI now; MCP / OpenAPI for free), dogfooding
the same pattern trellis checks.

## The live edge: `keeper-wire`

One edge is wired end-to-end as proof: the `keeper-wire` contract between
**keeperd** (door-keeper, the provider) and its **in-box client** (door-kit, the
consumer).

- `specs/keeperd.ts` — the canonical surface, 8 VerbSpec verbs.
- `specs/keeper-wire.json` — projected from that spec by `deno task gen`; the
  dependency-free manifest the offline check reads (never hand-edited).
- `check/keeper-wire.ts` — parses keeperd's `METHODS` table and the client's
  `request(...)` calls and asserts both conform to the manifest (method set +
  `import-and-push` param names).
- `flake.nix` — pins `door-keeper` + `door-kit` as source inputs and exposes
  `checks.<system>.keeper-wire`, runnable offline (`--no-remote`) on Linux **and**
  darwin (so CI hits it *and* a maintainer can run it locally).

```sh
nix flake check   # runs keeper-wire against the pinned source
```

Today this **fails on purpose** — it catches the real upstream drift
(`import-and-push` sends `ledgerRef`, not `manifestDigest`). That red is the
finding, not a trellis bug. CI runs it **report-only** (`continue-on-error`)
until the upstream fix lands; flip it to a blocking gate once door-kit/door-keeper
are corrected and the inputs are re-pinned.

## Status

`keeper-wire` is `verified` (live check). Every other type is `declared` —
mapped and honest that no check enforces it yet. Each new leaf check is one
flake input + one `checks.*` entry.

Source-available under **PolyForm Noncommercial 1.0.0**.
