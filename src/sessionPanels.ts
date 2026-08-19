// Multi-panel session orchestration (02-session-management T4). One
// DshPanel per bound session: the sidebar list opens/creates/reveals panels,
// closing a tab never kills the session, and reload restores every open
// panel via a persisted sessionId list.
//
// vscode-free by design: the panel is created through an injected factory
// (the real one wires DshPanel + vscode in extension.ts), and view columns
// are plain numbers matching vscode.ViewColumn (Active = -1, Beside = -2),
// so the mapping/ordering core stays unit-testable without a vscode runtime.
import type { DshPanel } from "./dshPanel.js";

/** vscode.ViewColumn.Active = -1 (stack panels as a tab group on restore). */
export const VIEW_COLUMN_ACTIVE = -1;
/** vscode.ViewColumn.Beside = -2 (default open position, matches pre-M2). */
export const VIEW_COLUMN_BESIDE = -2;

/** Panel factory for testability: (sessionId | undefined) => panel. */
export type PanelFactory = (sessionId?: string) => DshPanel;

export class SessionPanelManager {
  private readonly panels = new Map<string, DshPanel>();
  /** Open order, newest last (drives "focus most recent" and restore order). */
  private order: string[] = [];

  constructor(
    /** Called with the ordered sessionId list whenever it changes. */
    private readonly persist: (sessionIds: string[]) => void,
    private readonly panelFactory: PanelFactory
  ) {}

  /** Session ids of open panels, in open order (newest last). */
  getOpenSessionIds(): string[] {
    return [...this.order];
  }

  /**
   * Open (or reveal) a panel. Without a sessionId this focuses the most
   * recently opened panel, or creates an unbound panel when none exists
   * (keeps the pre-M2 openPanel semantics). With a sessionId the panel is
   * revealed when already open, otherwise created and bound to the session.
   */
  open(
    sessionId?: string,
    preset?: string,
    viewColumn: number = VIEW_COLUMN_BESIDE
  ): void {
    if (!sessionId) {
      const last = this.order[this.order.length - 1];
      if (last !== undefined) {
        this.panels.get(last)?.reveal(viewColumn);
        return;
      }
      const unbound = this.panelFactory(undefined);
      unbound.open(preset, viewColumn);
      return;
    }
    const existing = this.panels.get(sessionId);
    if (existing) {
      existing.reveal(viewColumn);
      return;
    }
    const panel = this.panelFactory(sessionId);
    this.panels.set(sessionId, panel);
    this.order.push(sessionId);
    panel.onDisposed(() => {
      // User closed the tab (or close()/closeAll() was called): drop the
      // binding — the SESSION persists in DSH (R5 semantics, never stop()).
      if (this.panels.get(sessionId) === panel) {
        this.panels.delete(sessionId);
        this.order = this.order.filter((id) => id !== sessionId);
        this.persist(this.getOpenSessionIds());
      }
    });
    panel.open(preset, viewColumn);
    this.persist(this.getOpenSessionIds());
  }

  /** Close the panel bound to `sessionId` (the session itself is kept). */
  close(sessionId: string): void {
    this.panels.get(sessionId)?.close();
  }

  /** Close every open panel (multi-root primary change; server untouched). */
  closeAll(): void {
    for (const id of [...this.order]) this.close(id);
  }

  /**
   * Restore a set of panels on reload (wasRunning auto-restart path). All
   * panels share one Active column so they stack as a tab group instead of
   * splitting the editor horizontally (review suggestion 6).
   */
  restore(sessionIds: string[], presetFor: (sessionId: string) => string | undefined): void {
    for (const id of sessionIds) {
      this.open(id, presetFor(id), VIEW_COLUMN_ACTIVE);
    }
  }

  /** Sync the editor-tab title with the session title (review suggestion 3). */
  updateTitle(sessionId: string, title: string): void {
    this.panels.get(sessionId)?.updateTitle(title);
  }
}
