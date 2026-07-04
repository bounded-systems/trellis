# The public/private contract

A recurring pattern in `bounded-systems`: **every org concern has a public face
and a private sidecar, built from one schema, separated by a one-way visibility
boundary.** The boundary itself is a contract — and, like every contract in
[trellis](../README.md), it can be declared and checked.

## The pattern

```
         one schema / one build
       ┌───────────┴───────────┐
  PUBLIC face            PRIVATE sidecar
(the world sees)       (members only see)
       └─────── one-way ───────┘
          private ⇒ public OK
          public ⇏ private  (never)
```

Two faces, not two systems: the private sidecar reuses the public one's schema
and tooling; only the _data_ and its visibility differ.

## Instances

| Concern                | Public face                                             | Private sidecar                  | What crosses the boundary                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Org profile / defaults | [`.github`](https://github.com/bounded-systems/.github) | `.github-private`                | Public profile README to the world; the member README + `docs/org-map.md` (which **names** private repos) stay inside.                                                                                                 |
| Contract map           | `trellis`                                               | `trellis-private` _(planned)_    | `bootstrap/catalog.json` lists only the **73 public** repos; the 2 private repos (`infra`, `.github-private`) are declared in the private sidecar. `NodeDecl.visibility` + visibility-aware `assemble()` are the seam. |
| Work board             | Front Desk (org project #2)                             | private board _(planned)_        | Public repos' issues/PRs bubble to the public board; private repos' work items to the private board.                                                                                                                   |
| Bubble-up mechanism    | public receiver + daily sweep                           | private receiver + private sweep | The central sweep reads **public repos only** — it skips `infra` and `.github-private` (the App can't read them) rather than surfacing them publicly.                                                                  |

## The invariant (the contract itself)

**One-way visibility.** A private artifact may reference or depend on a public
one; a public artifact must never name or leak a private one.

- `org-map.md` is private _because_ it names private repos — the content forces
  the file's visibility.
- trellis's public `catalog.json` omits the private repos; a public node may
  `consume` a public type provided by another public node, but no public
  declaration names a private repo.
- The Front Desk sweep **skips** private repos (logs "could not read …") instead
  of putting them on the public board.

This is object-capability least-authority applied to _visibility_ — a one-way
mirror. Private can see public; public cannot see private. The same shape as the
door model (a room sees only the capabilities handed to it), turned toward what
a reader is allowed to know.

## How bubble-up maps onto it

Work items reach a board two ways, and both respect the boundary:

1. **Instant — the GitHub App webhook.** The `bounded-systems-front-desk` App is
   already installed on **all** repos, so once its App-settings _Webhook URL_ is
   set and it subscribes to `Issues` + `Pull requests`, GitHub delivers every
   repo's open/reopen events to one endpoint — no per-repo workflow, and new
   repos are covered automatically. The receiver adds the item to a board
   **routed by the source repo's visibility**: a public repo's event → public
   board #2; a private repo's event → the private board, never the public one.
   _(A GitHub App is not itself a webhook — it **has** a webhook: one URL +
   event subscription + secret in its settings, delivering org-wide because the
   App is installed org-wide.)_
2. **Backstop — the daily sweep** (`front-desk-sync`, cron `0 6 * * *`), which
   reconciles anything the webhook missed (field edits, cross-repo drift) and
   reads public repos only. A private sweep does the private side.

The per-repo `front-desk-add.yml` Actions workflow is a third, weaker form of
the same idea (an event hook, but one file per repo); the App webhook supersedes
it — one config instead of 75.

## Why this is more than hygiene

It turns "what is shareable" into a **checkable property**, not a convention.
Because trellis already models `visibility`, the invariant above is a candidate
contract type: a check that **no public artifact names a private repo** (scan
public `catalog.json` / public docs for private repo names → fail on a leak).
That would make the public/private contract self-enforcing, the same way
`keeper-wire` and `sanctioned-reader-seam` are.

> This document is itself an instance of the contract: it states the pattern and
> the _public_ instances; the enumeration of private specifics lives in the
> private sidecar, not here.
