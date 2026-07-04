/**
 * @module
 * keeper-wire conformance check — the one live edge.
 *
 * Proves both sides of the `keeper-wire` contract type conform to the canonical
 * spec (../specs/keeperd.ts):
 *   - the DAEMON (keeperd.ts) — its METHODS dispatch table must expose exactly
 *     the spec's wire methods;
 *   - the CLIENT (keeper.ts)  — it must call exactly the spec's wire methods;
 *   - and for `import-and-push`, the client's param names must match the spec
 *     (catches the `ledgerRef` vs `manifestDigest` drift).
 *
 * No external imports and no AST dependency — a targeted regex parse over the
 * pinned source, plus a read of the committed `specs/keeper-wire.json` manifest
 * (projected from the VerbSpec by gen.ts). That keeps it runnable offline under
 * a sealed Nix derivation (`deno run --no-remote --allow-read`). Paths come from
 * argv (the flake passes the pinned source trees):
 *
 *   deno run --no-remote --allow-read check/keeper-wire.ts <keeperd.ts> <keeper-client.ts>
 *
 * Exits 0 on conformance, 1 on any drift (printing every discrepancy). The
 * non-zero exit is what a `nix flake check` / CI turns red on.
 */

interface WireManifest {
  type: string;
  methods: string[];
  params: Record<string, string[]>;
}

const MANIFEST: WireManifest = JSON.parse(
  Deno.readTextFileSync(
    new URL("../specs/keeper-wire.json", import.meta.url).pathname,
  ),
);

/** Extract the keys of the `const METHODS ... = { ... }` object in keeperd source. */
export function parseDaemonMethods(src: string): string[] {
  const m = src.match(/const\s+METHODS[^=]*=\s*\{([\s\S]*?)\}/);
  if (!m) return [];
  const body = m[1];
  const keys: string[] = [];
  const re = /(?:^|,)\s*(?:"([^"]+)"|([A-Za-z_][\w-]*))\s*:/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(body)) !== null) keys.push(hit[1] ?? hit[2]);
  return keys;
}

/** Extract the wire method strings the client passes as the first arg to `request(...)`. */
export function parseClientMethods(src: string): string[] {
  const re = /request(?:<[^>]*>)?\(\s*"([^"]+)"/g;
  const out = new Set<string>();
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(src)) !== null) out.add(hit[1]);
  return [...out];
}

/**
 * Extract the param keys the client sends for a given wire method — the object
 * literal in `request<...>("<method>", { k: v, ... })`. Best-effort: reads the
 * top-level keys of that object literal.
 */
export function parseClientParams(src: string, method: string): string[] {
  const start = src.search(
    new RegExp(
      `request(?:<[^>]*>)?\\(\\s*"${
        method.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")
      }"\\s*,\\s*\\{`,
    ),
  );
  if (start < 0) return [];
  const braceStart = src.indexOf("{", start);
  let depth = 0;
  let end = braceStart;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = src.slice(braceStart + 1, end);
  const keys: string[] = [];
  const re = /(?:^|,|\{)\s*([A-Za-z_][\w]*)\s*:/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(body)) !== null) keys.push(hit[1]);
  return keys;
}

/** The spec's canonical wire method set (from the projected manifest). */
export function specMethods(): string[] {
  return MANIFEST.methods;
}

/** The spec's declared input field names for a given verb. */
export function specParams(method: string): string[] {
  return MANIFEST.params[method] ?? [];
}

export interface Discrepancy {
  readonly side: "daemon" | "client";
  readonly kind: "missing-method" | "extra-method" | "param-drift";
  readonly detail: string;
}

/** Compare daemon + client sources against the spec; return every discrepancy. */
export function conform(daemonSrc: string, clientSrc: string): Discrepancy[] {
  const want = new Set(specMethods());
  const daemon = new Set(parseDaemonMethods(daemonSrc));
  const client = new Set(parseClientMethods(clientSrc));
  const out: Discrepancy[] = [];

  for (const m of want) {
    if (!daemon.has(m)) {
      out.push({ side: "daemon", kind: "missing-method", detail: m });
    }
    if (!client.has(m)) {
      out.push({ side: "client", kind: "missing-method", detail: m });
    }
  }
  for (const m of daemon) {
    if (!want.has(m)) {
      out.push({ side: "daemon", kind: "extra-method", detail: m });
    }
  }
  for (const m of client) {
    if (!want.has(m)) {
      out.push({ side: "client", kind: "extra-method", detail: m });
    }
  }

  // Param-name conformance for import-and-push (the surveyed drift point).
  if (want.has("import-and-push") && client.has("import-and-push")) {
    const declared = new Set(specParams("import-and-push"));
    for (const k of parseClientParams(clientSrc, "import-and-push")) {
      if (!declared.has(k)) {
        out.push({
          side: "client",
          kind: "param-drift",
          detail:
            `import-and-push sends "${k}" — not a declared param (expected one of: ${
              [...declared].join(", ")
            })`,
        });
      }
    }
  }

  return out;
}

if (import.meta.main) {
  const [daemonPath, clientPath] = Deno.args;
  if (!daemonPath || !clientPath) {
    console.error(
      "usage: keeper-wire.ts <keeperd.ts> <keeper-client.ts>",
    );
    Deno.exit(2);
  }
  const daemonSrc = await Deno.readTextFile(daemonPath);
  const clientSrc = await Deno.readTextFile(clientPath);
  const discrepancies = conform(daemonSrc, clientSrc);

  if (discrepancies.length === 0) {
    console.log("keeper-wire: CONFORMS — daemon + client match the spec.");
    Deno.exit(0);
  }
  console.error(`keeper-wire: ${discrepancies.length} discrepancy(ies):`);
  for (const d of discrepancies) {
    console.error(`  [${d.side}] ${d.kind}: ${d.detail}`);
  }
  Deno.exit(1);
}
