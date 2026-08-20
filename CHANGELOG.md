# Changelog

**English** | [中文](CHANGELOG.zh.md)

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-08-20

### Fixed
- Browser still auto-opened on installs where the dsh **CLI** version is older than the resolved **web-app** (e.g. CLI `0.1.0-rc.7` + web-app `0.1.0-rc.8`): the `--no-open` gate used the CLI version string, which cannot tell which web-app rc an npm/npx cache resolved. The gate now probes the live `dsh web --help` output for `--no-open` (authoritative across any CLI/web-app pairing), falling back to the CLI-version gate only when the probe itself fails.

## [0.3.0] - 2026-08-20

### Added
- **Dual-channel upgrade hints** — the sidebar now tracks both npm channels: a **latest** button and a **next** (prerelease) button appear independently when a newer version exists on that channel (e.g. `latest 0.1.0-rc.7` + `next 0.1.0-rc.8`); each opens a QuickPick with the matching `@latest` / `@next` command (prefilled into a terminal, never auto-run).
- **`--no-open` browser suppression** — dsh 0.1.0-rc.8+ opens the default browser on `dsh web` by default; the extension now passes `--no-open` (version-gated, so older CLIs that reject the flag are unaffected) to keep the embedded UI browser-free.

### Fixed
- Session list stayed empty when the launcher sidebar was opened while dsh was **already running** (polling only started on a state transition). It now polls immediately at view open.

## [0.2.0] - 2026-08-19

### Added
- **Session manager** in the sidebar — lists all active sessions with title, relative activity time (`5m`/`3h`/`2d`), inline rename (`✎`), and archive (`✕`); an expandable **Archived** section shows archived sessions with titles; blank sessions appear as "New Session" rows. Refreshes every 5s (server-state aware, re-entry guarded).
- **Multi-panel sessions** — `＋New session` opens a fresh editor panel bound to a new session; clicking a listed session opens/focuses its panel; panels **stack over the current tab group** (no more tiled narrow views).
- **Archive closes the panel** — archiving a session also closes its open panel; the default panel is bound to the IDE workspace session so it can be closed too.
- **Reload restores every open panel** — the dist-tree cache download is guarded against concurrent access, so restoring several panels at once never produces blank panels.
- UI strings for the new features across all 9 languages.

### Fixed
- Blank sessions no longer accumulate on every start — existing ones are reused.
- macOS realpath mismatch (`/var/folders` vs `/private/var/folders`) no longer breaks workspace matching.

### Changed
- Removed the redundant "Open View" button from the sidebar launcher (the command and status-bar entry remain).

## [0.1.0] - 2026-08-18

### Added
- **Workspace alignment** — the DSH workspace anchor now follows the IDE workspace (feature M1):
  - Switching folders closes stale panels and starts cold; reloading the *same* workspace auto-restarts dsh and restores the panel.
  - The embedded UI shows the **current IDE workspace** (not the most recently active one) via a session preset injected before the DSH frontend boots.
  - Clicking the activity-bar icon auto-starts dsh when it is not running.
- **dsh version soft-check + upgrade helper** — the sidebar shows "Update available: x.y.z →" when a newer dsh exists; clicking offers an upgrade command matched to your install method (npx cache / npm global / nvm) in a QuickPick, prefilled into an integrated terminal (never auto-run). Checks are gated to once per 24h and offline-safe.
- **Sidebar refinements** — full-width buttons (Stop above Open View), two-line status (version + URL), removed the subtitle.
- UI strings for the new features across all 9 languages.

## [0.0.10] - 2026-08-17

### Added
- Extension UI translations: Japanese, Korean, Russian, Spanish, Portuguese, French and German (9 languages total; follows the VS Code display language).

## [0.0.9] - 2026-08-17

### Fixed
- Cross-platform dsh process termination: on Windows, kill the full process tree (`taskkill /T /F`) so the `cmd.exe` wrapper no longer orphans the `node` child.
- Unit-test portability: platform-agnostic path assertions and a Windows-compatible fake `dsh` shim.

### Changed
- CI smoke step now has a 15-minute timeout.

## [0.0.8] - 2026-08-17

### Added
- Cross-platform CI matrix (macOS, Ubuntu, Windows) with a real `dsh` spawn smoke test.
- README badges (CI, Open VSX version/downloads, Marketplace link).

### Fixed
- Windows binary resolution (`dsh.cmd`, `%LocalAppData%\npm-cache` layout) and `shell: true` spawn.

## [0.0.7] - 2026-08-17

### Changed
- Pointed `repository` at the renamed GitHub repo.

## [0.0.6] - 2026-08-17

### Changed
- Renamed the display name to "DeepSeek Harness Web for VS Code" (VS Code Marketplace display names are globally unique).

## [0.0.5] - 2026-08-17

### Changed
- Renamed the extension id to `deepseek-harness-web-for-vscode` (VS Code Marketplace extension names are globally unique).

## [0.0.4] - 2026-08-17

### Added
- DeepSeek tab icon on the editor-tab webview.

## [0.0.3] - 2026-08-17

### Added
- Central bilingual (en/zh) string table; the UI follows the VS Code language.
- English-only marketplace description.

## [0.0.2] - 2026-08-17

### Fixed
- Bundled the runtime `ws` dependency into the vsix (activation crashed without it on a fresh install).

## [0.0.1] - 2026-08-17

### Added
- Initial MVP: spawn `dsh web`, transport bridge (fetch/WebSocket/clipboard), editor-tab webview, sidebar launcher, status bar, theme sync, and packaging.
