# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
