// Sidebar launcher view (2026-08-17): a slim status + start button. The DSH
// UI itself lives in the editor tab (DshPanel); this view never hosts it.
// UI follows VS Code webview best practice: theme tokens, semantic status
// dot, primary/secondary button hierarchy, focus-visible, workspace context.
import * as vscode from "vscode";
import { DshServerManager, type ServerInfo, type ServerState } from "./serverManager.js";
import { workspaceRoot } from "./commands.js";
import { t, langCode } from "./i18n.js";
import { sessionTitleOf } from "./workspaceTracker.js";
import { upgradeInfo } from "./versionCheckService.js";

/** Session-list polling interval while the launcher is visible and ready. */
const SESSIONS_POLL_MS = 5_000;

/** Callbacks wired by extension.ts to the session panel manager. */
export interface SessionHandlers {
  newSession: () => void;
  openSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  archiveSession: (sessionId: string) => void;
}

interface LauncherInit {
  state: ServerState;
  url?: string;
  message?: string;
  version?: string;
  workspaceName?: string;
  /** Latest dsh version known from the registry (upgrade hint, G-03). */
  latestVersion?: string;
}

function launcherHtml(init: LauncherInit): string {
  const dotClass = { stopped: "stopped", starting: "starting", ready: "ready", error: "error", stopping: "starting" }[init.state] ?? "stopped";
  const statusText =
    init.state === "ready"
      ? init.version
        ? t("launcher.readyVersion", { version: init.version })
        : t("launcher.ready")
      : init.state === "starting"
        ? t("launcher.starting")
        : init.state === "stopping"
          ? t("launcher.stopping")
          : init.state === "error"
            ? t("launcher.error", { message: init.message ?? "unknown" })
            : t("launcher.stopped");
  const showStart = init.state === "stopped" || init.state === "error";
  const showReady = init.state === "ready";
  const showUrl = init.state === "ready" && !!init.url;
  const upgradeText =
    init.state === "ready" && init.latestVersion && init.version
      ? t("upgrade.available", { latest: init.latestVersion })
      : "";
  const workspaceText = init.workspaceName
    ? t("launcher.workspace", { name: init.workspaceName })
    : t("launcher.noWorkspace");

  return `<!DOCTYPE html>
<html lang="${langCode()}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 16px;
  display: flex; flex-direction: column; gap: 16px;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size, 13px);
  color: var(--vscode-foreground);
}
.header { display: flex; align-items: center; gap: 10px; }
.logo {
  width: 28px; height: 28px; border-radius: 7px; flex: none;
  background: #4D6BFE;
  display: flex; align-items: center; justify-content: center;
}
.title { font-size: 14px; font-weight: 600; line-height: 1.3; }
.subtitle { font-size: 12px; color: var(--vscode-descriptionForeground); }
.status {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 12px; border-radius: 6px;
  border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
  background: var(--vscode-sideBar-background, transparent);
  font-size: 12.5px; word-break: break-all;
}
.statusText { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.statusUrl { font-size: 11px; color: var(--vscode-descriptionForeground); word-break: break-all; }
.dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.dot.stopped { background: var(--vscode-descriptionForeground, #8b949e); opacity: .55; }
.dot.starting { background: var(--vscode-charts-yellow, #d29922); animation: pulse 1.1s ease-in-out infinite; }
.dot.ready { background: var(--vscode-charts-green, #3fb950); }
.dot.error { background: var(--vscode-charts-red, #f85149); }
@keyframes pulse { 50% { opacity: .35; } }
.actions { display: flex; flex-direction: column; gap: 8px; }
.actions .row { display: flex; flex-direction: column; gap: 8px; }
button {
  display: block;
  width: 100%;
  font-family: inherit; font-size: 13px; cursor: pointer;
  border: none; border-radius: 4px; padding: 7px 16px;
  text-align: center;
}
button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
button.primary:hover { background: var(--vscode-button-hoverBackground); }
button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
button.upgrade {
  background: transparent;
  color: var(--vscode-notificationsInfoIcon-foreground, var(--vscode-charts-blue, #3794ff));
  border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
  font-size: 12px;
}
button.upgrade:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,.1)); }
.footer { margin-top: auto; padding-top: 8px; border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border)); font-size: 11.5px; color: var(--vscode-descriptionForeground); word-break: break-all; }
.sessions { display: flex; flex-direction: column; gap: 8px; }
.sessions-title { font-size: 11px; font-weight: 600; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: .5px; }
.sessions-new { font-size: 12px; }
.sessions-list { display: flex; flex-direction: column; gap: 2px; width: 100%; box-sizing: border-box; min-width: 0; }
.session-item { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 4px; font-size: 12.5px; cursor: pointer; width: 100%; box-sizing: border-box; min-width: 0; }
.session-item:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,.1)); }
.s-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--vscode-charts-green, #3fb950); }
.s-name { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s-time { font-size: 11px; color: var(--vscode-descriptionForeground); flex: 0 0 auto; white-space: nowrap; }
.s-actions { margin-left: auto; display: flex; gap: 6px; flex: 0 0 auto; align-items: center; padding-left: 12px; padding-right: 34px; }
.session-item .icon-btn { background: none; border: none; padding: 3px 5px; border-radius: 3px; color: var(--vscode-descriptionForeground); font-size: 13px; cursor: pointer; flex: 0 0 auto; line-height: 1.2; }
.session-item .icon-btn:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,.15)); color: var(--vscode-foreground); }
.session-item .icon-btn.hidden { display: none; }
.session-rename-input { flex: 1; min-width: 0; font: inherit; font-size: 12.5px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-focusBorder)); border-radius: 3px; padding: 2px 6px; }
.sessions-empty, .sessions-error, .sessions-archived { font-size: 11.5px; color: var(--vscode-descriptionForeground); padding: 2px 6px; }
.sessions-archived { border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border)); margin-top: 4px; padding-top: 6px; }
</style>
</head>
<body>
  <div class="header">
    <div class="logo"><svg viewBox="0 0 50 50" width="18" height="18" aria-hidden="true"><path d="M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z" fill="#fff"/></svg></div>
    <div>
      <div class="title">DeepSeek Harness</div>
    </div>
  </div>

  <div class="status">
    <span class="dot ${dotClass}" id="dot"></span>
    <div class="statusText">
      <span id="status">${statusText}</span>
      <span id="statusUrl" class="statusUrl" style="display:${showUrl ? "block" : "none"}">${init.url ?? ""}</span>
    </div>
  </div>

  <button class="upgrade" id="upgrade" style="display:${upgradeText ? "block" : "none"}">${upgradeText} →</button>

  <div class="actions">
    <button class="primary" id="start" style="display:${showStart ? "block" : "none"}">${t("button.start")}</button>
    <div class="row" id="readyActions" style="display:${showReady ? "flex" : "none"}">
      <button class="secondary" id="stop">${t("button.stop")}</button>
    </div>
  </div>

  <div class="sessions">
    <button class="secondary sessions-new" id="newSession" style="display:none">${t("sessions.new")}</button>
    <span class="sessions-title">${t("sessions.title")}</span>
    <div id="sessionsList" class="sessions-list"></div>
  </div>

  <div class="footer" id="footer">${workspaceText}</div>
<script>
(function(){
  var vscode = acquireVsCodeApi();
  var dot = document.getElementById("dot");
  var status = document.getElementById("status");
  var start = document.getElementById("start");
  var ready = document.getElementById("readyActions");
  var stop = document.getElementById("stop");
  var footer = document.getElementById("footer");
  var statusUrl = document.getElementById("statusUrl");
  var upgrade = document.getElementById("upgrade");
  var newSession = document.getElementById("newSession");
  var sessionsList = document.getElementById("sessionsList");
  var archExpanded = false; // survives the 5s poll re-render (archive section)
  start.onclick = function(){ vscode.postMessage({ type: "start" }); };
  stop.onclick = function(){ vscode.postMessage({ type: "stop" }); };
  upgrade.onclick = function(){ vscode.postMessage({ type: "upgrade" }); };
  newSession.onclick = function(){ vscode.postMessage({ type: "new-session" }); };
  function renderSessions(items, archivedItems) {
    sessionsList.textContent = "";
    if (!items || items.length === 0) {
      var empty = document.createElement("div");
      empty.className = "sessions-empty";
      empty.textContent = ${JSON.stringify(t("sessions.empty"))};
      sessionsList.appendChild(empty);
    } else {
      items.forEach(function (it) {
        // Gemini analysis (doc/fix/20260819-session-x-offset): the global
        // "button { width:100%; padding:7px 16px }" rule polluted BOTH session
        // buttons (only padding was overridden by .icon-btn, never width), so
        // each button was 100% wide — the flex row overflowed and the last
        // button (✕) was pushed outside the visible area. Fix: buttons get
        // EXPLICIT inline 20x20 + padding:0 (immune to the global rule), the
        // actions group is absolutely anchored inside the row's right edge,
        // and the row reserves padding-right so the title never overlaps.
        var row = document.createElement("div");
        row.className = "session-item";
        row.style.cssText =
          "position:relative;display:flex;align-items:center;gap:6px;width:100%;height:28px;" +
          "padding:0 86px 0 6px;box-sizing:border-box;cursor:pointer;border-radius:4px;overflow:hidden;";
        var dot = document.createElement("span");
        dot.style.cssText = "width:7px;height:7px;border-radius:50%;flex:0 0 auto;background:var(--vscode-charts-green,#3fb950);display:inline-block;";
        var name = document.createElement("span");
        name.style.cssText =
          "flex:1 1 0%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;line-height:28px;";
        name.textContent = it.title;
        var tm = document.createElement("span");
        tm.style.cssText = "font-size:11px;color:var(--vscode-descriptionForeground);flex:0 0 auto;white-space:nowrap;margin-right:2px;";
        tm.textContent = relativeTime(it.updatedAt);
        tm.title = it.updatedAt ? new Date(it.updatedAt).toLocaleString() : "";
        // Explicit button style: width/height/min/max all pinned to 20px so
        // the global "button { width:100%; padding:7px 16px }" rule cannot apply.
        var btnStyle =
          "display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;" +
          "min-width:20px;max-width:20px;padding:0;margin:0;border:none;background:transparent;" +
          "color:var(--vscode-descriptionForeground);cursor:pointer;border-radius:3px;box-sizing:border-box;flex:0 0 auto;";
        var rn = document.createElement("button");
        rn.className = "icon-btn";
        rn.style.cssText = btnStyle;
        // Inline SVG (codicon edit) — font-independent.
        rn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.23 7.63 8.37 2.77a.75.75 0 0 0-1.06 0L2.77 7.31a.75.75 0 0 0-.22.53v2.66a.75.75 0 0 0 .75.75h2.66a.75.75 0 0 0 .53-.22l4.54-4.54a.75.75 0 0 0 0-1.06zM8 8.44 6.56 7l2.66-2.66L11 5.78 8 8.44zM2 13.75h7a.75.75 0 0 1 0 1.5H2a.75.75 0 0 1 0-1.5z"/></svg>';
        rn.setAttribute("aria-label", ${JSON.stringify(t("sessions.rename"))});
        rn.onclick = function (ev) { ev.stopPropagation(); startRename(row, rn, name, it); };
        var ar = document.createElement("button");
        ar.className = "icon-btn";
        ar.style.cssText = btnStyle + "font-size:13px;line-height:1;";
        ar.textContent = "✕";
        ar.setAttribute("aria-label", ${JSON.stringify(t("sessions.archive"))});
        ar.onclick = function (ev) { ev.stopPropagation(); vscode.postMessage({ type: "archive-session", sessionId: it.sessionId }); };
        var acts = document.createElement("div");
        acts.style.cssText =
          "position:absolute;right:4px;top:0;bottom:0;display:flex;align-items:center;gap:8px;background:inherit;";
        acts.appendChild(tm);
        acts.appendChild(rn);
        acts.appendChild(ar);
        row.appendChild(dot);
        row.appendChild(name);
        row.appendChild(acts);
        row.onclick = function () { vscode.postMessage({ type: "open-session", sessionId: it.sessionId }); };
        sessionsList.appendChild(row);
      });
    }
    if (archivedItems && archivedItems.length > 0) {
      var archTitle = ${JSON.stringify(t("sessions.archived"))};
      var archHeader = document.createElement("div");
      archHeader.style.cssText = "border-top:1px solid var(--vscode-panel-border,var(--vscode-widget-border));margin-top:4px;padding:6px 6px 2px;font-size:11.5px;color:var(--vscode-descriptionForeground);cursor:pointer;display:flex;align-items:center;gap:4px;";
      var archArrow = document.createElement("span");
      archArrow.style.cssText = "font-size:9px;flex:none;";
      archArrow.textContent = archExpanded ? "▾" : "▸";
      var archLabel = document.createElement("span");
      archLabel.style.cssText = "flex:1;";
      archLabel.textContent = archTitle + " (" + archivedItems.length + ")";
      archHeader.appendChild(archArrow);
      archHeader.appendChild(archLabel);
      archHeader.onclick = function () {
        archExpanded = !archExpanded;
        archList.style.display = archExpanded ? "block" : "none";
        archArrow.textContent = archExpanded ? "▾" : "▸";
      };
      var archList = document.createElement("div");
      archList.style.cssText = "flex-direction:column;gap:2px;margin-top:2px;display:" + (archExpanded ? "block" : "none") + ";";
      archivedItems.forEach(function (a) {
        var arow = document.createElement("div");
        arow.style.cssText = "display:flex;align-items:center;gap:6px;padding:2px 6px;border-radius:4px;font-size:12px;color:var(--vscode-descriptionForeground);";
        var adot = document.createElement("span");
        adot.style.cssText = "width:7px;height:7px;border-radius:50%;flex:none;background:var(--vscode-descriptionForeground,#8b949e);";
        var aname = document.createElement("span");
        aname.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        aname.textContent = a.title;
        var atime = document.createElement("span");
        atime.style.cssText = "font-size:11px;flex:none;white-space:nowrap;";
        atime.textContent = relativeTime(a.updatedAt);
        arow.appendChild(adot);
        arow.appendChild(aname);
        arow.appendChild(atime);
        archList.appendChild(arow);
      });
      sessionsList.appendChild(archHeader);
      sessionsList.appendChild(archList);
    }
  }
  function relativeTime(ts) {
    if (!ts) return "";
    var MIN = 60000, HOUR = 3600000, DAY = 86400000;
    var diff = Math.max(0, Date.now() - ts);
    if (diff < MIN) return ${JSON.stringify(t("sessions.timeNow"))};
    if (diff < HOUR) return Math.floor(diff / MIN) + "m";
    if (diff < DAY) return Math.floor(diff / HOUR) + "h";
    if (diff < 30 * DAY) return Math.floor(diff / DAY) + "d";
    if (diff < 365 * DAY) return Math.floor(diff / (30 * DAY)) + "mo";
    return Math.floor(diff / (365 * DAY)) + "y";
  }
  function startRename(row, rn, name, it) {
    var input = document.createElement("input");
    input.className = "session-rename-input";
    input.value = it.title;
    input.setAttribute("placeholder", ${JSON.stringify(t("sessions.renamePlaceholder"))});
    row.replaceChild(input, name);
    input.focus();
    input.select();
    var done = false;
    function commit() {
      if (done) return;
      done = true;
      var v = input.value.trim();
      if (v && v !== it.title) {
        vscode.postMessage({ type: "rename-session", sessionId: it.sessionId, title: v });
      }
      row.replaceChild(name, input);
    }
    function cancel() {
      if (done) return;
      done = true;
      row.replaceChild(name, input);
    }
    input.onkeydown = function (ev) {
      if (ev.key === "Enter") commit();
      else if (ev.key === "Escape") cancel();
    };
    input.onblur = cancel;
  }
  function set(state, text, url) {
    dot.className = "dot " + state;
    status.textContent = text;
    statusUrl.textContent = url || "";
    statusUrl.style.display = url ? "block" : "none";
    start.style.display = state === "stopped" || state === "error" ? "block" : "none";
    ready.style.display = state === "ready" ? "flex" : "none";
    newSession.style.display = state === "ready" ? "block" : "none";
  }
  function setUpgrade(latest, version) {
    var show = latest && version;
    upgrade.style.display = show ? "block" : "none";
    if (show) upgrade.textContent = ${JSON.stringify(t("upgrade.available", { latest: "{latest}" }))}.replace("{latest}", latest) + " →";
  }
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "workspace") {
      footer.textContent = m.name
        ? ${JSON.stringify(t("launcher.workspace", { name: "{name}" }))}.replace("{name}", m.name)
        : ${JSON.stringify(t("launcher.noWorkspace"))};
      return;
    }
    if (m.type === "upgrade-info") {
      setUpgrade(m.latest, m.version);
      return;
    }
    if (m.type === "sessions") {
      renderSessions(m.items, m.archivedItems);
      return;
    }
    if (m.type === "sessions-error") {
      sessionsList.textContent = "";
      var err = document.createElement("div");
      err.className = "sessions-error";
      err.textContent = ${JSON.stringify(t("sessions.error"))};
      sessionsList.appendChild(err);
      return;
    }
    if (m.type !== "server-status") return;
    if (m.state === "stopped") set("stopped", ${JSON.stringify(t("launcher.stopped"))});
    else if (m.state === "starting") set("starting", ${JSON.stringify(t("launcher.starting"))});
    else if (m.state === "stopping") set("starting", ${JSON.stringify(t("launcher.stopping"))});
    else if (m.state === "ready") {
      var readyText = m.version
        ? ${JSON.stringify(t("launcher.readyVersion", { version: "{version}" }))}.replace("{version}", m.version)
        : ${JSON.stringify(t("launcher.ready"))};
      set("ready", readyText, m.url || "");
      setUpgrade(m.latestVersion, m.version);
    }
    else if (m.state === "error") set("error", ${JSON.stringify(t("launcher.error", { message: "{message}" }))}.replace("{message}", m.message || "unknown"));
  });
})();
</script>
</body>
</html>`;
}

export class DshLauncherView implements vscode.WebviewViewProvider {
  public static readonly viewType = "deepseek-harness.view";

  private view?: vscode.WebviewView;
  private pollTimer?: NodeJS.Timeout;
  private isPolling = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly manager: DshServerManager,
    private readonly onUpgrade: () => void,
    private readonly sessionHandlers: SessionHandlers
  ) {
    manager.on("state", (info: ServerInfo) => {
      this.postStatus(info);
      this.syncPolling();
    });
    // Keep the workspace footer live: opening/closing a folder updates it.
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.postWorkspace())
    );
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage((msg) => {
      const m = msg as { type?: string; sessionId?: string; title?: string };
      if (m.type === "start") {
        void this.manager.start({ cwd: workspaceRoot() }).catch(() => {
          /* state machine drives the launcher */
        });
      } else if (m.type === "stop") {
        this.manager.stop();
      } else if (m.type === "upgrade") {
        this.onUpgrade();
      } else if (m.type === "new-session") {
        this.sessionHandlers.newSession();
      } else if (m.type === "open-session" && m.sessionId) {
        this.sessionHandlers.openSession(m.sessionId);
      } else if (m.type === "rename-session" && m.sessionId && m.title !== undefined) {
        void this.sessionHandlers
          .renameSession(m.sessionId, m.title)
          .catch(() => this.refreshSessions());
      } else if (m.type === "archive-session" && m.sessionId) {
        this.sessionHandlers.archiveSession(m.sessionId);
      } else if (m.type === "refresh-sessions") {
        this.refreshSessions();
      }
    });
    webviewView.onDidDispose(() => {
      this.view = undefined;
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = undefined;
      }
    });
    webviewView.webview.html = launcherHtml({
      state: this.manager.state,
      url: this.manager.serverUrl,
      version: this.manager.dshVersion,
      latestVersion: upgradeInfo(this.context, this.manager.dshVersion, this.manager.dshBinPath)?.latest,
      workspaceName: vscode.workspace.workspaceFolders?.[0]?.name,
    });
    this.postStatus({
      state: this.manager.state,
      url: this.manager.serverUrl,
      version: this.manager.dshVersion,
    });
    this.postWorkspace();

    // UX optimization (2026-08-18): opening the launcher icon means "I want to
    // use DSH" — auto-start the server when it is not running. start() is
    // idempotent (already-running returns the URL), so this is safe on repeat
    // clicks; failures surface through the state machine into the launcher.
    if (!this.manager.isRunning && this.manager.state !== "starting") {
      void this.manager.start({ cwd: workspaceRoot() }).catch(() => {
        /* state machine drives the launcher */
      });
    }
  }

  /** Re-push the current status so late-arriving data (e.g. version check
   *  result) reaches the webview without a reload. */
  refresh(): void {
    this.postStatus({
      state: this.manager.state,
      url: this.manager.serverUrl,
      version: this.manager.dshVersion,
    });
  }

  /** Start/stop the session-list poller with the view + server lifecycle. */
  private syncPolling(): void {
    const should = this.view !== undefined && this.manager.state === "ready";
    if (should && !this.pollTimer) {
      this.pollTimer = setInterval(() => void this.pollSessions(), SESSIONS_POLL_MS);
      this.pollTimer.unref?.();
      void this.pollSessions();
    } else if (!should && this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  /** Fetch the current workspace's sessions and push them to the webview. */
  private async pollSessions(): Promise<void> {
    if (this.isPolling) return; // re-entry guard: slow network skips a tick
    this.isPolling = true;
    try {
      if (this.manager.state !== "ready" || !this.view) return;
      const { items, archivedItems } = await this.manager.listWorkspaceSessions(workspaceRoot());
      const titleOf = (s: { title: string | null; cwd?: string; sessionId: string; blank: boolean }): string =>
        s.blank ? t("sessions.newSession") : sessionTitleOf(s.title, s.cwd, s.sessionId);
      this.view.webview.postMessage({
        type: "sessions",
        items: items.map((s) => ({
          sessionId: s.sessionId,
          title: titleOf(s),
          running: s.running,
          updatedAt: s.updatedAt,
        })),
        archivedItems: archivedItems.map((s) => ({
          sessionId: s.sessionId,
          title: titleOf(s),
          updatedAt: s.updatedAt,
        })),
      });
    } catch (err) {
      this.view?.webview.postMessage({
        type: "sessions-error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.isPolling = false;
    }
  }

  /** Force an immediate refresh (after rename/new/close, not the next tick). */
  refreshSessions(): void {
    void this.pollSessions();
  }

  private postWorkspace(): void {
    const name = vscode.workspace.workspaceFolders?.[0]?.name;
    this.view?.webview.postMessage({ type: "workspace", name: name ?? null });
  }

  private postStatus(info: ServerInfo): void {
    // Only surface the upgrade hint when there is a REAL update (current is
    // strictly older than the cached latest). Equal/absent → no hint.
    const upd = upgradeInfo(this.context, info.version ?? this.manager.dshVersion, this.manager.dshBinPath);
    this.view?.webview.postMessage({
      type: "server-status",
      ...info,
      latestVersion: upd?.latest,
    });
  }
}
