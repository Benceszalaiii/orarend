import type { HLJSApi, LanguageFn } from "highlight.js";

//! ═══════════════════════════════════════════════════════════════════════════
//! KÓDSZÍNEZÉS — CSAK AKKOR, HA VAN MIT SZÍNEZNI
//! ═══════════════════════════════════════════════════════════════════════════
//! A `highlight.js` teljes csomagja ~1 MB, és a csevegés 99%-ban soha nem lát
//! kódot. Ezért a MAG és a NYELVEK is csak akkor töltődnek, amikor egy
//! kódcsatolmány először megjelenik — és egy nyelv csak egyszer.
//!
//! A KIMENET HTML, DE NEM A MIÉNK, HANEM A `highlight.js`-É: a bemenetet
//! karakterenként kódolja (`&lt;`, `&amp;`…), és csak a saját `<span>`-jait
//! teszi köré. Ezért adható `dangerouslySetInnerHTML`-lel a DOM-nak — egy
//! idegen fájl tartalma így sem válhat jelöléssé.
//! ═══════════════════════════════════════════════════════════════════════════

type Loader = () => Promise<{ default: LanguageFn }>;

const LANGUAGES: Record<string, Loader> = {
  sql: () => import("highlight.js/lib/languages/sql"),
  javascript: () => import("highlight.js/lib/languages/javascript"),
  typescript: () => import("highlight.js/lib/languages/typescript"),
  json: () => import("highlight.js/lib/languages/json"),
  python: () => import("highlight.js/lib/languages/python"),
  java: () => import("highlight.js/lib/languages/java"),
  csharp: () => import("highlight.js/lib/languages/csharp"),
  c: () => import("highlight.js/lib/languages/c"),
  cpp: () => import("highlight.js/lib/languages/cpp"),
  php: () => import("highlight.js/lib/languages/php"),
  ruby: () => import("highlight.js/lib/languages/ruby"),
  go: () => import("highlight.js/lib/languages/go"),
  rust: () => import("highlight.js/lib/languages/rust"),
  kotlin: () => import("highlight.js/lib/languages/kotlin"),
  swift: () => import("highlight.js/lib/languages/swift"),
  bash: () => import("highlight.js/lib/languages/bash"),
  powershell: () => import("highlight.js/lib/languages/powershell"),
  xml: () => import("highlight.js/lib/languages/xml"),
  css: () => import("highlight.js/lib/languages/css"),
  scss: () => import("highlight.js/lib/languages/scss"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
  ini: () => import("highlight.js/lib/languages/ini"),
  markdown: () => import("highlight.js/lib/languages/markdown"),
};

//* Kiterjesztés → nyelv. Ami nincs itt (`txt`, `log`, `csv`, `env`), az
//* színezés nélkül, de ugyanúgy kódként jelenik meg.
const BY_EXTENSION: Record<string, string> = {
  sql: "sql",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  py: "python",
  java: "java",
  cs: "csharp",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  php: "php",
  rb: "ruby",
  go: "go",
  rs: "rust",
  kt: "kotlin",
  swift: "swift",
  sh: "bash",
  bash: "bash",
  ps1: "powershell",
  html: "xml",
  htm: "xml",
  xml: "xml",
  css: "css",
  scss: "scss",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
  md: "markdown",
};

export function languageFor(extension: string): string | null {
  return BY_EXTENSION[extension] ?? null;
}

let core: Promise<HLJSApi> | null = null;
const registered = new Map<string, Promise<void>>();

function loadCore(): Promise<HLJSApi> {
  core ??= import("highlight.js/lib/core").then((m) => m.default);
  return core;
}

function register(hljs: HLJSApi, language: string): Promise<void> {
  let pending = registered.get(language);
  if (!pending) {
    const loader = LANGUAGES[language];
    pending = loader
      ? loader().then((m) => hljs.registerLanguage(language, m.default))
      : Promise.resolve();
    //* Egy elbukott betöltés ne ragadjon be: a következő kódblokk újrapróbálja.
    pending.catch(() => registered.delete(language));
    registered.set(language, pending);
  }
  return pending;
}

/** Színezett HTML, vagy `null`, ha a nyelvet nem ismerjük / nem töltődött be. */
export async function highlightCode(
  code: string,
  language: string,
): Promise<string | null> {
  try {
    const hljs = await loadCore();
    await register(hljs, language);
    if (!hljs.getLanguage(language)) return null;
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch {
    return null;
  }
}
