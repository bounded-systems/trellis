/**
 * @module
 * The canonical spec for the `scout-wire` contract type — scoutd's external-read
 * RPC surface, authored once as VerbSpec verbs. Both scoutd (door-scout, the
 * provider) and its in-box client (door-kit's scout.ts, the consumer) check
 * against this. Shapes transcribed from the surveyed scoutd handlers + client.
 *
 * Verb `id` == the wire method string scoutd dispatches on (its METHODS keys)
 * and the first argument the client passes to `request(...)`.
 */

import { z } from "zod";
import { defineVerb, type VerbSpec } from "verbspec";

const RepoInput = z.object({ url: z.string(), ref: z.string().optional() });
const RepoOutput = z.object({
  owner: z.string(),
  repo: z.string(),
  ref: z.string(),
  defaultBranch: z.string(),
  description: z.string().nullable(),
  tarballUrl: z.string(),
});
export const repo: VerbSpec<typeof RepoInput, typeof RepoOutput> = defineVerb({
  id: "repo",
  summary: "Resolve a repo's metadata via scoutd (external read).",
  actor: "scout",
  input: RepoInput,
  output: RepoOutput,
  run: () => ({
    owner: "",
    repo: "",
    ref: "",
    defaultBranch: "",
    description: null,
    tarballUrl: "",
  }),
});

const PrInput = z.object({
  repo: z.string(),
  number: z.number(),
  diff: z.boolean().default(false),
  comments: z.boolean().default(false),
});
const PrOutput = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.string(),
  diff: z.string().optional(),
});
export const pr: VerbSpec<typeof PrInput, typeof PrOutput> = defineVerb({
  id: "pr",
  summary: "Fetch a pull request (optionally diff/comments) via scoutd.",
  actor: "scout",
  input: PrInput,
  output: PrOutput,
  run: () => ({ number: 0, title: "", body: null, state: "" }),
});

const IssueInput = z.object({
  repo: z.string(),
  number: z.number(),
  comments: z.boolean().default(false),
});
const IssueOutput = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.string(),
  labels: z.array(z.string()),
});
export const issue: VerbSpec<typeof IssueInput, typeof IssueOutput> =
  defineVerb(
    {
      id: "issue",
      summary: "Fetch an issue (optionally comments) via scoutd.",
      actor: "scout",
      input: IssueInput,
      output: IssueOutput,
      run: () => ({ number: 0, title: "", body: null, state: "", labels: [] }),
    },
  );

const FetchInput = z.object({
  url: z.string(),
  binary: z.boolean().default(false),
  maxSize: z.number().optional(),
});
const FetchOutput = z.object({
  url: z.string(),
  status: z.number(),
  contentType: z.string().nullable(),
  size: z.number(),
  body: z.string(),
});
export const fetchUrl: VerbSpec<typeof FetchInput, typeof FetchOutput> =
  defineVerb({
    id: "fetch",
    summary: "Fetch an allowlisted URL's content via scoutd.",
    actor: "scout",
    input: FetchInput,
    output: FetchOutput,
    run: () => ({ url: "", status: 0, contentType: null, size: 0, body: "" }),
  });

const DownloadInput = z.object({
  url: z.string(),
  maxSize: z.number().optional(),
});
const DownloadOutput = z.object({
  url: z.string(),
  size: z.number(),
  contentType: z.string().nullable(),
  sha256: z.string(),
  data: z.string(),
});
export const download: VerbSpec<typeof DownloadInput, typeof DownloadOutput> =
  defineVerb({
    id: "download",
    summary: "Download an allowlisted URL to base64 + sha256 via scoutd.",
    actor: "scout",
    input: DownloadInput,
    output: DownloadOutput,
    run: () => ({ url: "", size: 0, contentType: null, sha256: "", data: "" }),
  });

const StatusInput = z.object({});
const StatusOutput = z.object({
  version: z.string(),
  uptime: z.number(),
  hasToken: z.boolean(),
  allowlist: z.array(z.string()),
});
export const status: VerbSpec<typeof StatusInput, typeof StatusOutput> =
  defineVerb({
    id: "status",
    summary: "scoutd health/status.",
    actor: "scout",
    input: StatusInput,
    output: StatusOutput,
    run: () => ({ version: "", uptime: 0, hasToken: false, allowlist: [] }),
  });

/** The `scout-wire` method surface (keys are the canonical wire method strings). */
export const SCOUT_WIRE: Record<string, VerbSpec> = {
  "status": status,
  "repo": repo,
  "pr": pr,
  "issue": issue,
  "fetch": fetchUrl,
  "download": download,
};
