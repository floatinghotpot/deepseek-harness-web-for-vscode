// dsh version soft-check helpers (G-03, 01-workspace-alignment). vscode-free
// pure functions: semver-with-prerelease comparison, upgrade-command inference
// from the resolved binary path, and the 24h check-frequency gate.

/**
 * Compare two dsh version strings like "0.1.0-rc.6". Supports optional
 * `-rc.N` / `-beta.N` prerelease suffixes: rc.6 < rc.7 < 0.1.0 (a release
 * beats any prerelease of the same core). Returns negative/0/positive.
 * Unparseable strings sort as older than any parseable one.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): { core: number[]; pre: Array<number | string> | null } | null => {
    const m = v.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
    if (!m) return null;
    const core = [Number(m[1]), Number(m[2]), Number(m[3])];
    const pre = m[4]
      ? m[4].split(".").map((s) => (/^\d+$/.test(s) ? Number(s) : s))
      : null;
    return { core, pre };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] - pb.core[i];
  }
  // Same core: release (null) beats prerelease.
  if (pa.pre === null && pb.pre === null) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  const len = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < len; i++) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (typeof x === "number" && typeof y === "number") {
      if (x !== y) return x - y;
    } else if (typeof x === "string" && typeof y === "string") {
      if (x !== y) return x < y ? -1 : 1;
    } else {
      // Numeric identifiers sort before alphanumeric ones (semver).
      return typeof x === "number" ? -1 : 1;
    }
  }
  return 0;
}

/** Is `current` strictly older than `latest`? Unparseable → false (don't nag). */
export function isUpdateAvailable(current: string | undefined, latest: string | undefined): boolean {
  if (!current || !latest) return false;
  // Only consider updates when BOTH versions parse — an unparseable current
  // (dev build, unknown scheme) must never trigger an upgrade prompt.
  const re = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
  if (!re.test(current.trim()) || !re.test(latest.trim())) return false;
  return compareVersions(current, latest) < 0;
}

/**
 * Infer the upgrade command from the resolved dsh binary path, for the given
 * npm dist-tag channel ("latest" stable or "next" prerelease). The path
 * feature tells us how dsh was installed (see resolveDshPath candidates):
 *   - npx cache (~/.npm/_npx/<hash>/...) → npx re-fetches the channel
 *   - npm global prefix bin            → npm i -g @channel
 *   - nvm-scoped npm global            → npm i -g @channel (under the active node)
 *   - npm-global custom prefix         → npm i -g @channel
 *   - Homebrew /usr/local              → npm i -g @channel (or brew)
 *   - $DSH_BIN custom path             → can't know; user manages it
 * Returns the recommended command, or null when the install method is
 * unknown/custom (user manages it themselves).
 */
export function upgradeCommandFor(
  dshPath: string | undefined,
  channel: "latest" | "next" = "latest"
): string | null {
  if (!dshPath) return null;
  // Normalize separators to forward slashes so the same feature checks work
  // on every platform (Windows D:\...\_npx\... -> D:/.../_npx/...).
  const p = dshPath.replace(/\\/g, "/");
  const spec = `@deepseek-ai/dsh@${channel}`;
  if (p.includes("/_npx/")) return `npx -y ${spec} --version`;
  if (p.includes("/.nvm/versions/node/")) return `npm i -g ${spec}`;
  if (p.includes("/.npm-global/")) return `npm i -g ${spec}`;
  if (p.includes("/homebrew/") || p.includes("/opt/homebrew/")) return `npm i -g ${spec}`;
  if (p.includes("/usr/local/bin/")) return `npm i -g ${spec}`;
  // npm prefix bin (e.g. /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js).
  if (p.includes("node_modules/@deepseek-ai/dsh/")) return `npm i -g ${spec}`;
  return null;
}

/**
 * Whether the installed dsh accepts the `--no-open` flag. Added in the web
 * app at 0.1.0-rc.8 (browser auto-open became the default; `--no-open`
 * disables it). Older CLIs reject unknown options and would fail to start,
 * so the flag must never be passed below this threshold. Unparseable or
 * unknown versions → false (conservative: never break startup).
 */
export function shouldPassNoOpen(version: string | undefined): boolean {
  if (!version) return false;
  const re = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
  if (!re.test(version.trim())) return false;
  return compareVersions(version, "0.1.0-rc.8") >= 0;
}

/** 24h gate: should we re-check the registry now? (update-notifier pattern) */
export function shouldCheckVersion(lastCheckTs: number | undefined, now: number, intervalMs = 24 * 60 * 60 * 1000): boolean {
  if (lastCheckTs === undefined) return true;
  return now - lastCheckTs >= intervalMs;
}
