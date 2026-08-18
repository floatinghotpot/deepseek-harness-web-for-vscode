// VS Code language resolver for the central string table (Appendix A).
import * as vscode from "vscode";
import { STRINGS, interpolate, type I18nKey } from "./i18nStrings.js";

/** Resolve one key to the current VS Code language; zh-* → Chinese, else English. */
export function t(key: I18nKey, vars?: Record<string, string>): string {
  const lang = vscode.env.language.toLowerCase();
  const row = STRINGS[key];
  const text = lang.startsWith("zh") ? row.zh : row.en;
  return vars ? interpolate(text, vars) : text;
}

/** Current document language code for <html lang=...>. */
export function langCode(): "zh-CN" | "en" {
  return vscode.env.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}
