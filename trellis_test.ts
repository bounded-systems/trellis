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
} from "./check/keeper-wire.ts";

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

Deno.test("keeper-wire is verified and forms provider→consumer edges", async () => {
  const decls = await loadDecls(BOOTSTRAP);
  const t = assemble(decls);
  const kw = t.edges.filter((e) => e.type === "keeper-wire");
  assertEquals(kw.length > 0, true, "at least one keeper-wire edge");
  for (const e of kw) {
    assertEquals(e.from, "door-keeper", "provider is door-keeper");
    assertEquals(e.status, "verified", "keeper-wire edges are verified");
  }
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
  const d = conform(daemon, client);
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

Deno.test("conform() catches ledgerRef param drift", () => {
  const daemon = `const METHODS: Record<string, MethodHandler> = {
    status: h, commit: h, push: h, "import-and-push": h, "attest-launch": h,
    sign: h, verify: h, getPublicKey: h,
  };`;
  const client = `
    export async function commit(){ return request<C>("commit", { repo: r }); }
    export async function push(){ return request<P>("push", { repo: r }); }
    export async function importAndPush(){ return request<I>("import-and-push", { repo: r, bundleBase64: b, commitSha: c, branch: br, remote: rm, ledgerRef: lr }); }
    export async function attestLaunch(){ return request<A>("attest-launch", { subject: s, manifest: m }); }
    export async function signData(){ return request<S>("sign", { data: d }); }
    export async function verifySignature(){ return request<V>("verify", { data: d, signature: s }); }
    export async function status(){ return request<St>("status"); }
    export async function getPublicKey(){ return request<K>("getPublicKey"); }
  `;
  const d = conform(daemon, client);
  assertEquals(
    d.some((x) => x.kind === "param-drift" && x.detail.includes("ledgerRef")),
    true,
  );
  assertEquals(
    d.some((x) => x.kind === "missing-method"),
    false,
    "no missing methods when all present",
  );
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
