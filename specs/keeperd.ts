/**
 * @module
 * The canonical spec for the `keeper-wire` contract type — keeperd's git-signing
 * RPC surface, authored once as VerbSpec verbs (Zod input/output per method).
 *
 * Both sides of the edge check against THIS: the daemon (door-keeper's keeperd,
 * the `provides` side) must implement exactly these methods with these shapes,
 * and the in-box client (door-kit's keeper.ts, the `consumes` side) must call
 * exactly these wire methods. `check/keeper-wire.ts` enforces both.
 *
 * Verb `id` == the wire method string keeperd dispatches on (its METHODS table
 * keys) and the first argument the client passes to `request(...)`. Shapes are
 * transcribed from the surveyed keeperd handlers and door-kit client.
 */

import { z } from "zod";
import { defineVerb, type VerbSpec } from "verbspec";

const AuthorshipSchema = z.object({
  model: z.string().optional(),
  aiAuthored: z.array(z.string()).optional(),
});

const AttestationSchema = z.object({
  statement: z.unknown().optional(),
  statementDigest: z.string(),
  signature: z.string(),
  keyId: z.string(),
});

// ── commit ───────────────────────────────────────────────────────────────────

const CommitInput = z.object({
  repo: z.string(),
  message: z.string(),
  author: z.string().optional(),
  files: z.array(z.string()).optional(),
  all: z.boolean().default(false),
  amend: z.boolean().default(false),
  authorship: AuthorshipSchema.optional(),
});
const CommitOutput = z.object({
  commit: z.string(),
  attestation: AttestationSchema.optional(),
});
export const commit: VerbSpec<typeof CommitInput, typeof CommitOutput> =
  defineVerb({
    id: "commit",
    summary: "Create a signed commit via keeperd (the box holds no keys).",
    actor: "keeper",
    input: CommitInput,
    output: CommitOutput,
    run: () => ({ commit: "" }),
  });

// ── push ─────────────────────────────────────────────────────────────────────

const PushInput = z.object({
  repo: z.string(),
  remote: z.string().default("origin"),
  branch: z.string().optional(),
  force: z.boolean().default(false),
  setUpstream: z.boolean().default(false),
});
const PushOutput = z.object({
  pushed: z.string(),
  commits: z.array(z.string()),
});
export const push: VerbSpec<typeof PushInput, typeof PushOutput> = defineVerb({
  id: "push",
  summary: "Push to a remote via keeperd (the box holds no SSH keys).",
  actor: "keeper",
  input: PushInput,
  output: PushOutput,
  run: () => ({ pushed: "", commits: [] }),
});

// ── import-and-push ────────────────────────────────────────────────────────────
// NOTE the canonical param name is `manifestDigest` (what keeperd actually
// reads). A client sending `ledgerRef` is drift — check/keeper-wire.ts flags it.

const ImportAndPushInput = z.object({
  repo: z.string(),
  bundleBase64: z.string(),
  commitSha: z.string(),
  branch: z.string(),
  remote: z.string(),
  pushArgs: z.array(z.string()).optional(),
  manifestDigest: z.string().optional(),
  notesRef: z.string().optional(),
  l2LaunchDigest: z.string().optional(),
});
const ImportAndPushOutput = z.union([
  z.object({
    status: z.literal("ok"),
    commitSha: z.string(),
    pushedRef: z.string(),
    signedDerivation: z.unknown().optional(),
    note: z.object({
      ref: z.string(),
      written: z.boolean(),
      pushed: z.boolean(),
    }).optional(),
  }),
  z.object({
    status: z.literal("error"),
    code: z.string(),
    message: z.string(),
    exitCode: z.number().optional(),
  }),
]);
export const importAndPush: VerbSpec<
  typeof ImportAndPushInput,
  typeof ImportAndPushOutput
> = defineVerb({
  id: "import-and-push",
  summary:
    "Import a host-built commit bundle and signed-push it (daemon holds only the push credential + key).",
  actor: "keeper",
  input: ImportAndPushInput,
  output: ImportAndPushOutput,
  run: () => ({ status: "ok" as const, commitSha: "", pushedRef: "" }),
});

// ── attest-launch ──────────────────────────────────────────────────────────────

const AttestLaunchInput = z.object({
  subject: z.string(),
  manifest: z.unknown(),
});
const AttestLaunchOutput = z.union([
  z.object({
    status: z.literal("ok"),
    subject: z.string(),
    manifestDigest: z.string(),
    l2LaunchDigest: z.string(),
    attestation: z.unknown(),
  }),
  z.object({
    status: z.literal("error"),
    code: z.string(),
    message: z.string(),
  }),
]);
export const attestLaunch: VerbSpec<
  typeof AttestLaunchInput,
  typeof AttestLaunchOutput
> = defineVerb({
  id: "attest-launch",
  summary:
    "Produce a signed L2 launch attestation over a room + the doors it holds.",
  actor: "keeper",
  input: AttestLaunchInput,
  output: AttestLaunchOutput,
  run: () => ({
    status: "error" as const,
    code: "UNIMPLEMENTED",
    message: "spec stub",
  }),
});

// ── sign ───────────────────────────────────────────────────────────────────────

const SignInput = z.object({ data: z.string() });
const SignOutput = z.object({ signature: z.string(), keyId: z.string() });
export const sign: VerbSpec<typeof SignInput, typeof SignOutput> = defineVerb({
  id: "sign",
  summary: "Sign arbitrary (base64) data via keeperd.",
  actor: "keeper",
  input: SignInput,
  output: SignOutput,
  run: () => ({ signature: "", keyId: "" }),
});

// ── verify ─────────────────────────────────────────────────────────────────────

const VerifyInput = z.object({
  data: z.string(),
  signature: z.string(),
  publicKey: z.string().optional(),
});
const VerifyOutput = z.object({
  valid: z.boolean(),
  keyId: z.string().optional(),
});
export const verify: VerbSpec<typeof VerifyInput, typeof VerifyOutput> =
  defineVerb({
    id: "verify",
    summary: "Verify a signature via keeperd.",
    actor: "keeper",
    input: VerifyInput,
    output: VerifyOutput,
    run: () => ({ valid: false }),
  });

// ── status ─────────────────────────────────────────────────────────────────────

const StatusInput = z.object({});
const StatusOutput = z.object({
  version: z.string(),
  uptime: z.number(),
  signing: z.object({ enabled: z.boolean(), keyId: z.string().optional() }),
});
export const status: VerbSpec<typeof StatusInput, typeof StatusOutput> =
  defineVerb({
    id: "status",
    summary: "keeperd health/status.",
    actor: "keeper",
    input: StatusInput,
    output: StatusOutput,
    run: () => ({ version: "", uptime: 0, signing: { enabled: false } }),
  });

// ── getPublicKey ────────────────────────────────────────────────────────────────

const GetPublicKeyInput = z.object({});
const GetPublicKeyOutput = z.object({
  publicKey: z.string(),
  keyId: z.string(),
});
export const getPublicKey: VerbSpec<
  typeof GetPublicKeyInput,
  typeof GetPublicKeyOutput
> = defineVerb({
  id: "getPublicKey",
  summary: "Return keeperd's signing public key.",
  actor: "keeper",
  input: GetPublicKeyInput,
  output: GetPublicKeyOutput,
  run: () => ({ publicKey: "", keyId: "" }),
});

/**
 * The `keeper-wire` method surface. The keys are the canonical wire method
 * strings; `check/keeper-wire.ts` asserts both keeperd's METHODS table and the
 * door-kit client present exactly this set, with matching param names.
 */
export const KEEPER_WIRE: Record<string, VerbSpec> = {
  "commit": commit,
  "push": push,
  "import-and-push": importAndPush,
  "attest-launch": attestLaunch,
  "sign": sign,
  "verify": verify,
  "status": status,
  "getPublicKey": getPublicKey,
};
