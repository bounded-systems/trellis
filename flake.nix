{
  description =
    "trellis — the bounded-systems contract map + the aggregating flake check that CI runs";

  # Every mapped repo whose edge has a live check is pinned here as a plain
  # source input (flake = false), the same way each door daemon pins door-kit.
  # This is the "large flake derivation": the meta-flake pins the repos it maps
  # and its `checks` prove the edges between them. Inputs grow one-per-edge as
  # more contract types move from `declared` to `verified`.
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    door-keeper = {
      url = "github:bounded-systems/door-keeper";
      flake = false;
    };
    door-kit = {
      url = "github:bounded-systems/door-kit";
      flake = false;
    };
    door-scout = {
      url = "github:bounded-systems/door-scout";
      flake = false;
    };
    # seam-check is pinned as source (not consumed as a flake) and its pure
    # `seam.ts` is imported directly — trellis WRAPS the published tool, it does
    # not reimplement it.
    seam-check = {
      url = "github:bounded-systems/seam-check";
      flake = false;
    };
    # a sanctioned-reader repo to check the seam claim against.
    fs = {
      url = "github:bounded-systems/fs";
      flake = false;
    };
  };

  outputs =
    { self, nixpkgs, door-keeper, door-kit, door-scout, seam-check, fs }:
    let
      # Linux for real CI runners AND darwin so a maintainer can `nix flake
      # check` locally — the previous per-repo *-mirror checks were
      # aarch64-darwin-only, which is exactly why CI never ran them.
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAll = f:
        nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in {
      checks = forAll (pkgs: {
        # keeper-wire: prove keeperd's METHODS table AND door-kit's in-box client
        # both conform to the canonical VerbSpec surface (via the projected
        # specs/keeper-wire.json manifest). Runs offline (`--no-remote`); a
        # non-zero exit turns the check — and CI — red on any drift.
        keeper-wire = pkgs.runCommand "trellis-keeper-wire" {
          nativeBuildInputs = [ pkgs.deno ];
          # deno wants a writable, network-free home in the sandbox.
          DENO_DIR = "/tmp/deno";
        } ''
          export HOME=$TMPDIR
          cd ${self}
          deno run --no-remote --allow-read check/keeper-wire.ts \
            ${door-keeper}/keeperd.ts \
            ${door-kit}/lib/keeper.ts
          touch $out
        '';

        # scout-wire: same wire-kind check for scoutd (door-scout) + its client
        # (door-kit's scout.ts). Expected to PASS — scout's daemon + client
        # agree — a second green edge alongside the red keeper-wire.
        scout-wire = pkgs.runCommand "trellis-scout-wire" {
          nativeBuildInputs = [ pkgs.deno ];
          DENO_DIR = "/tmp/deno";
        } ''
          export HOME=$TMPDIR
          cd ${self}
          deno run --no-remote --allow-read check/scout-wire.ts \
            ${door-scout}/scoutd.ts \
            ${door-kit}/lib/scout.ts
          touch $out
        '';

        # door-kit-mirror (vendored-pin kind): a different check MECHANISM than
        # the deno wire check — a pure byte-diff. door-keeper vendors door-kit's
        # client + runtime; those copies must stay byte-identical to door-kit
        # HEAD. Generalizes the per-repo `*-mirror` checks that existed but never
        # ran in CI (aarch64-darwin-only). Fails while the vendored copy is stale.
        door-kit-mirror = pkgs.runCommand "trellis-door-kit-mirror" { } ''
          fail=0
          for f in lib/keeper.ts lib/runtime.ts; do
            if ! diff -q ${door-keeper}/$f ${door-kit}/$f >/dev/null 2>&1; then
              echo "door-kit-mirror: door-keeper's vendored $f differs from door-kit HEAD (stale pin — re-sync via 'nix run .#sync-door-kit')"
              fail=1
            fi
          done
          if [ $fail -ne 0 ]; then exit 1; fi
          echo "door-kit-mirror: vendored copies are byte-identical to door-kit HEAD."
          touch $out
        '';

        # sanctioned-reader-seam (import-boundary kind): a UNARY contract — a
        # sanctioned-reader repo upholding its OWN seam claim (allowed imports +
        # no ambient authority). Wraps the published @bounded-systems/seam-check
        # (pinned; its pure seam.ts imported directly, offline). fs's claim is
        # `node:fs`/`node:path` only — expected to PASS, giving a green edge
        # alongside the two red drift edges.
        sanctioned-reader-seam =
          pkgs.runCommand "trellis-sanctioned-reader-seam" {
            nativeBuildInputs = [ pkgs.deno ];
            DENO_DIR = "/tmp/deno";
          } ''
            export HOME=$TMPDIR
            cd ${self}
            deno run --no-remote --allow-read check/sanctioned-reader-seam.ts \
              ${seam-check}/src \
              ${fs} \
              fs
            touch $out
          '';
      });

      # `nix run .#sync-manifest` — regenerate specs/keeper-wire.json from the
      # VerbSpec source (specs/keeperd.ts). Kept as an app, not a build step, so
      # the projection stays explicit; a stale manifest is caught by the mirror
      # check below.
      apps = forAll (pkgs: {
        sync-manifest = {
          type = "app";
          meta.description =
            "Regenerate specs/keeper-wire.json from the VerbSpec source.";
          program = "${pkgs.writeShellScript "sync-manifest" ''
            cd "$PWD"
            ${pkgs.deno}/bin/deno run --allow-read --allow-write gen.ts
          ''}";
        };
      });

      formatter = forAll (pkgs: pkgs.nixpkgs-fmt);
    };
}
