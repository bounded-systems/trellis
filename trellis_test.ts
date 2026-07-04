/**
 * trellis self-tests: the tree assembles + validates, and the keeper-wire
 * conformance parser behaves. Run: `deno test --allow-read`.
 */

import { assertEquals } from "@std/assert";
import { assemble, loadDecls, unmatchedConsumes } from "./assemble.ts";
import { contractType } from "./registry.ts";
import {
  conform,
  parseClientMethods,
  parseDaemonMethods,
  type WireManifest,
} from "./check/keeper-wire.ts";

// A stand-in for @bounded-systems/keeper-wire's manifest.json (the agreement).
const KEEPER_MANIFEST: WireManifest = {
  type: "keeper-wire",
  methods: [
    "commit",
    "push",
    "import-and-push",
    "attest-launch",
    "sign",
    "verify",
    "status",
    "getPublicKey",
  ],
  params: {
    "import-and-push": [
      "repo",
      "bundleBase64",
      "commitSha",
      "branch",
      "remote",
      "pushArgs",
      "ledgerRef",
      "notesRef",
      "l2LaunchDigest",
    ],
  },
};

const BOOTSTRAP = new URL("./bootstrap", import.meta.url).pathname;

Deno.test("every bootstrap declaration validates against the schema", async () => {
  const decls = await loadDecls(BOOTSTRAP);
  // loadDecls throws (ZodError) on any invalid file; reaching here means all parsed.
  if (decls.length === 0) throw new Error("no declarations loaded");
});

Deno.test("assembled edges reference known nodes and registered types", async () => {
  const decls = await loadDecls(BOOTSTRAP);
  const t = assemble(decls);
  const ids = new Set(decls.map((d) => d.node));
  for (const e of t.edges) {
    assertEquals(ids.has(e.from), true, `edge.from ${e.from} is a known node`);
    assertEquals(ids.has(e.to), true, `edge.to ${e.to} is a known node`);
    assertEquals(
      contractType(e.type) !== undefined || e.type === "front-desk-projects",
      true,
      `edge.type ${e.type} is registered`,
    );
  }
});

Deno.test("keeper-wire is provided by its contract-only repo, not a daemon", async () => {
  const decls = await loadDecls(BOOTSTRAP);
  const t = assemble(decls);
  const kw = t.edges.filter((e) => e.type === "keeper-wire");
  assertEquals(kw.length > 0, true, "at least one keeper-wire edge");
  for (const e of kw) {
    // extracted: the neutral keeper-wire repo provides it, so neither
    // door-keeper nor door-kit owns it — that breaks the cycle.
    assertEquals(e.from, "keeper-wire", "provider is the contract-only repo");
    assertEquals(e.status, "verified", "keeper-wire edges are verified");
  }
});

Deno.test("extracting keeper-wire breaks the door-keeper ↔ door-kit cycle + double agreement", async () => {
  const decls = await loadDecls(BOOTSTRAP);
  const t = assemble(decls);
  const between = t.edges.filter((e) =>
    (e.from === "door-keeper" && e.to === "door-kit") ||
    (e.from === "door-kit" && e.to === "door-keeper")
  );
  const types = new Set(between.map((e) => e.type));
  // only door-kit-mirror remains between them — keeper-wire now routes via the repo
  assertEquals(
    types.has("keeper-wire"),
    false,
    "keeper-wire no longer between the pair",
  );
});

Deno.test("external-platform consume with no org provider is surfaced", async () => {
  const decls = await loadDecls(BOOTSTRAP);
  const unmatched = unmatchedConsumes(decls);
  assertEquals(
    unmatched.some((u) => u.type === "front-desk-projects"),
    true,
    "front-desk-projects has no internal provider",
  );
});

Deno.test("conform() catches a missing method (stale mirror)", () => {
  const daemon = `const METHODS: Record<string, MethodHandler> = {
    status: handleStatus, commit: handleCommit, push: handlePush,
    "import-and-push": handleImportAndPush, "attest-launch": handleAttestLaunch,
    sign: handleSign, verify: handleVerify, getPublicKey: handleGetPublicKey,
  };`;
  // client missing import-and-push + attest-launch
  const client = `
    export async function commit(){ return request<C>("commit", { repo }); }
    export async function push(){ return request<P>("push", { repo }); }
    export async function signData(){ return request<S>("sign", { data }); }
    export async function verifySignature(){ return request<V>("verify", { data, signature }); }
    export async function status(){ return request<St>("status"); }
    export async function getPublicKey(){ return request<K>("getPublicKey"); }
  `;
  const d = conform(KEEPER_MANIFEST, daemon, client);
  assertEquals(
    d.some((x) =>
      x.kind === "missing-method" && x.detail === "import-and-push"
    ),
    true,
  );
  assertEquals(
    d.some((x) => x.kind === "missing-method" && x.detail === "attest-launch"),
    true,
  );
});

Deno.test("conform() accepts declared params (incl. ledgerRef) + the kind discriminator, flags the undeclared", () => {
  const daemon = `const METHODS: Record<string, MethodHandler> = {
    status: h, commit: h, push: h, "import-and-push": h, "attest-launch": h,
    sign: h, verify: h, getPublicKey: h,
  };`;
  const client = `
    export async function commit(){ return request<C>("commit", { repo: r }); }
    export async function push(){ return request<P>("push", { repo: r }); }
    export async function importAndPush(){ return request<I>("import-and-push", { kind: "import-and-push", repo: r, bundleBase64: b, commitSha: c, branch: br, remote: rm, ledgerRef: lr, bogusField: x }); }
    export async function attestLaunch(){ return request<A>("attest-launch", { subject: s, manifest: m }); }
    export async function signData(){ return request<S>("sign", { data: d }); }
    export async function verifySignature(){ return request<V>("verify", { data: d, signature: s }); }
    export async function status(){ return request<St>("status"); }
    export async function getPublicKey(){ return request<K>("getPublicKey"); }
  `;
  const d = conform(KEEPER_MANIFEST, daemon, client);
  // ledgerRef is now a declared param → not drift; `kind` is the envelope
  // discriminator → skipped; only the genuinely-undeclared bogusField is flagged.
  const drift = d.filter((x) => x.kind === "param-drift").map((x) => x.detail);
  assertEquals(drift.some((s) => s.includes('sends "ledgerRef"')), false);
  assertEquals(drift.some((s) => s.includes('sends "kind"')), false);
  assertEquals(drift.some((s) => s.includes('sends "bogusField"')), true);
  assertEquals(d.some((x) => x.kind === "missing-method"), false);
});

Deno.test("parsers extract the expected sets", () => {
  const daemon =
    `const METHODS: Record<string, MethodHandler> = { status: h, "import-and-push": h };`;
  assertEquals(parseDaemonMethods(daemon).sort(), [
    "import-and-push",
    "status",
  ]);
  const client = `request<X>("status"); request<Y>("import-and-push", { a })`;
  assertEquals(parseClientMethods(client).sort(), [
    "import-and-push",
    "status",
  ]);
});
