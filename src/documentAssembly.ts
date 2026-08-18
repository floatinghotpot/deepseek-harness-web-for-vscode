// Document assembly (T4): fetch the DSH frontend dist from the running server
// into a local cache, rewrite index.html so every asset is same-origin
// (vscode-resource, verified facts F9–F11), and inject the transport bridge.
// The module is vscode-free: asWebviewUri is injected so it stays unit-testable
// with plain node:test.
//
// Why local copies (spike-notes F10/F11): the shell bundle uses relative module
// imports ("./vendor-*.js", "./langs/*.js") and the CSS references KaTeX fonts —
// cross-origin module/font loading needs CORS, which the DSH server does not
// send. Serving the tree via webview.asWebviewUri makes everything same-origin.

import * as fs from "node:fs";
import * as path from "node:path";

export interface AssembleOptions {
  /** e.g. "http://127.0.0.1:53443" */
  serverBase: string;
  /** Absolute directory where the dist tree is cached (globalStorage). */
  distRootPath: string;
  /** Map an absolute local file path to a webview URI string (webview.asWebviewUri). */
  asWebviewUri: (absPath: string) => string;
  /** Content of media/bridge-client.js, inlined before the shell bundle. */
  bridgeClientJs: string;
  /** Value of webview.cspSource for the CSP meta tag. */
  cspSource: string;
  /** VS Code dark-mode hint, injected into __DSH_BRIDGE__ for the matchMedia shim. */
  themeDark?: boolean;
  /** Optional localStorage preset for `dsh.sessions.current` (req R2/T7d):
   *  written before the DSH module script runs so the frontend selects the
   *  IDE workspace instead of the "most recently active" one. */
  sessionPreset?: string;
  /** Extra markup injected before </body> (e.g. the server-status overlay). */
  chromeHtml?: string;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

export interface Assembled {
  html: string;
  distRev: string;
  downloaded: boolean;
}

const ASSET_REF_RE = /(src|href)="(\/assets\/[^"]+)"/g;
const CSS_URL_RE = /url\(\s*["']?(\/assets\/[^)"']+)["']?\s*\)/g;
const SHELL_IMPORT_RE = /\.\/((?:vendor|langs)\/[A-Za-z0-9_.-]+\.js)/g;
const BOOT_RE = /window\.__DSH_BOOT__ = (\{.*?\})<\/script>/s;
const REV_RE = /"rev"\s*:\s*"([^"]+)"/;
const SERVER_STATIC_RE = /(src|href)="\/(manifest\.webmanifest|favicon\.svg)"/g;

/** Extract the boot manifest rev from index.html ("" when absent). */
export function extractRev(html: string): string {
  const m = html.match(REV_RE);
  return m ? m[1] : "";
}

/** Rewrite the boot graph's plugin URLs to absolute server URLs (F14). */
export function rewriteBootPluginUrls(html: string, serverBase: string): string {
  const m = html.match(BOOT_RE);
  if (!m) return html;
  let graph: { entries?: { url?: string }[] };
  try {
    graph = JSON.parse(m[1]);
  } catch {
    return html;
  }
  for (const entry of graph.entries ?? []) {
    if (entry.url?.startsWith("/")) entry.url = serverBase + entry.url;
  }
  const next = JSON.stringify(graph).replaceAll("<", "\\u003c");
  return html.replace(m[1], next);
}

function buildCsp(cspSource: string): string {
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' ${cspSource} http://127.0.0.1:* http://localhost:*`,
    `style-src 'unsafe-inline' ${cspSource}`,
    `img-src ${cspSource} data: http://127.0.0.1:*`,
    `font-src ${cspSource} data:`,
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
  ].join("; ");
}

/**
 * Fetch + cache the dist tree, then assemble the webview document.
 * Caching key: the boot manifest rev — a DSH upgrade (new rev) triggers a
 * fresh download; an unchanged rev reuses the cached tree.
 */
export async function assembleDocument(opts: AssembleOptions): Promise<Assembled> {
  const { serverBase, distRootPath, asWebviewUri, bridgeClientJs, cspSource, themeDark, chromeHtml, log } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const logf = log ?? (() => {});

  const indexRes = await fetchImpl(serverBase + "/");
  if (!indexRes.ok) throw new Error(`failed to fetch ${serverBase}/ (HTTP ${indexRes.status})`);
  const indexHtml = await indexRes.text();
  const rev = extractRev(indexHtml);

  const revFile = path.join(distRootPath, "rev.txt");
  const cached = fs.existsSync(revFile) ? fs.readFileSync(revFile, "utf8") : "";
  let downloaded = false;

  if (cached !== rev) {
    logf(`dist rev changed (${cached || "none"} -> ${rev}); re-downloading`);
    fs.rmSync(distRootPath, { recursive: true, force: true });
    fs.mkdirSync(distRootPath, { recursive: true });
    await downloadTree(serverBase, distRootPath, indexHtml, asWebviewUri, fetchImpl, logf);
    fs.writeFileSync(revFile, rev);
    downloaded = true;
  }

  const localAsset = (url: string) => asWebviewUri(path.join(distRootPath, url));
  let html = indexHtml;
  html = html.replace(ASSET_REF_RE, (_m, attr: string, url: string) => `${attr}="${localAsset(url)}"`);
  html = html.replace(SERVER_STATIC_RE, (_m, attr: string, name: string) => `${attr}="${serverBase}/${name}"`);
  html = rewriteBootPluginUrls(html, serverBase);

  const bootScript =
    `<script>window.__DSH_BRIDGE__ = ${JSON.stringify({ serverBase, ...(themeDark !== undefined ? { dark: themeDark } : {}) })}<\/script>` +
    (opts.sessionPreset
      ? `<script>try { localStorage.setItem("dsh.sessions.current", ${JSON.stringify(opts.sessionPreset)}); } catch (e) { console.error("[dsh] session preset failed", e); }<\/script>`
      : "") +
    `<script>${bridgeClientJs}<\/script>`;
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${buildCsp(cspSource)}">`;
  // Attribute-tolerant head injection (DSH's <head> may gain attributes later).
  html = html.replace(/<head\b[^>]*>/i, (m) => `${m}${cspMeta}${bootScript}`);
  if (chromeHtml) html = html.replace("</body>", `${chromeHtml}</body>`);

  return { html, distRev: rev, downloaded };
}

/** Download the /assets tree, rewriting CSS font URLs to local webview URIs. */
async function downloadTree(
  serverBase: string,
  distRootPath: string,
  indexHtml: string,
  asWebviewUri: (absPath: string) => string,
  fetchImpl: typeof fetch,
  log: (msg: string) => void
): Promise<void> {
  const queue: string[] = [];
  const seen = new Set<string>();
  for (const m of indexHtml.matchAll(ASSET_REF_RE)) queue.push(m[2]);

  while (queue.length > 0) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    if (!url.startsWith("/assets/") || url.includes("..")) {
      log(`skip suspicious asset url ${url}`);
      continue;
    }
    const fsPath = path.join(distRootPath, url);
    fs.mkdirSync(path.dirname(fsPath), { recursive: true });
    const res = await fetchImpl(serverBase + url);
    if (!res.ok) {
      log(`skip ${url} (HTTP ${res.status})`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(fsPath, buf);

    if (url.endsWith(".css")) {
      let text = buf.toString("utf8");
      let rewritten = false;
      text = text.replace(CSS_URL_RE, (_m, asset: string) => {
        if (!asset.startsWith("/assets/") || asset.includes("..")) return _m; // leave unsafe refs untouched
        rewritten = true;
        queue.push(asset); // ensure the font/image is downloaded too
        return `url(${asWebviewUri(path.join(distRootPath, asset))})`;
      });
      if (rewritten) fs.writeFileSync(fsPath, text);
    } else if (/\/index-[\w-]+\.js$/.test(url)) {
      // Shell bundle: its relative imports must exist in the local tree.
      const text = buf.toString("utf8");
      for (const m of text.matchAll(SHELL_IMPORT_RE)) queue.push("/assets/" + m[1]);
    }
  }
}
