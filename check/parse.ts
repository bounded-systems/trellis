/**
 * @module
 * Shared, dependency-free source parsers for the wire-contract checks
 * (keeper-wire, scout-wire, …). Targeted regex over the pinned source — no AST,
 * no imports — so the checks run offline inside a Nix derivation.
 */

/** Extract the keys of the `const METHODS ... = { ... }` object in a daemon's source. */
export function parseDaemonMethods(src: string): string[] {
  const m = src.match(/const\s+METHODS[^=]*=\s*\{([\s\S]*?)\}/);
  if (!m) return [];
  const keys: string[] = [];
  const re = /(?:^|,)\s*(?:"([^"]+)"|([A-Za-z_][\w-]*))\s*:/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(m[1])) !== null) keys.push(hit[1] ?? hit[2]);
  return keys;
}

/** Extract the wire method strings a client passes as the first arg to `request(...)`. */
export function parseClientMethods(src: string): string[] {
  const re = /request(?:<[^>]*>)?\(\s*"([^"]+)"/g;
  const out = new Set<string>();
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(src)) !== null) out.add(hit[1]);
  return [...out];
}

/**
 * Extract the top-level param keys a client sends for a given wire method — the
 * object literal in `request<...>("<method>", { k: v, ... })`. Best-effort.
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

export interface Discrepancy {
  readonly side: "daemon" | "client";
  readonly kind: "missing-method" | "extra-method" | "param-drift";
  readonly detail: string;
}

/**
 * Method-set conformance: assert a daemon's METHODS table and a client's
 * `request(...)` calls both present exactly the spec's `want` methods.
 */
export function conformMethods(
  want: readonly string[],
  daemonSrc: string,
  clientSrc: string,
): Discrepancy[] {
  const wantSet = new Set(want);
  const daemon = new Set(parseDaemonMethods(daemonSrc));
  const client = new Set(parseClientMethods(clientSrc));
  const out: Discrepancy[] = [];
  for (const m of wantSet) {
    if (!daemon.has(m)) {
      out.push({ side: "daemon", kind: "missing-method", detail: m });
    }
    if (!client.has(m)) {
      out.push({ side: "client", kind: "missing-method", detail: m });
    }
  }
  for (const m of daemon) {
    if (!wantSet.has(m)) {
      out.push({ side: "daemon", kind: "extra-method", detail: m });
    }
  }
  for (const m of client) {
    if (!wantSet.has(m)) {
      out.push({ side: "client", kind: "extra-method", detail: m });
    }
  }
  return out;
}
