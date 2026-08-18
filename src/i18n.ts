// VS Code language resolver for the central string table (Appendix A).
import * as vscode from "vscode";
import { STRINGS, interpolate, type I18nKey, type I18nLang } from "./i18nStrings.js";

/** Column order for language matching (first prefix wins). */
const PREFIX_TO_LANG: [string, I18nLang][] = [
  ["zh", "zh"],
  ["ja", "ja"],
  ["ko", "ko"],
  ["ru", "ru"],
  ["es", "es"],
  ["pt", "pt"],
  ["fr", "fr"],
  ["de", "de"],
];

/** Resolve the VS Code display language to a string-table column. */
function column(): I18nLang {
  const lang = vscode.env.language.toLowerCase();
  for (const [prefix, col] of PREFIX_TO_LANG) {
    if (lang.startsWith(prefix)) return col;
  }
  return "en";
}

/** Resolve one key to the current VS Code language; default English. */
export function t(key: I18nKey, vars?: Record<string, string>): string {
  const text = STRINGS[key][column()];
  return vars ? interpolate(text, vars) : text;
}

/** Current document language code for <html lang=...>. */
export function langCode(): string {
  switch (column()) {
    case "zh":
      return "zh-CN";
    case "pt":
      return "pt-BR";
    default:
      return column();
  }
}
