import { describe, expect, test } from "bun:test";
import { highlightCode, languageFor } from "./code-highlight";

describe("languageFor", () => {
  test.each([
    ["ts", "typescript"],
    ["tsx", "typescript"],
    ["mjs", "javascript"],
    ["py", "python"],
    ["h", "c"],
    ["html", "xml"],
    ["toml", "ini"],
    ["yml", "yaml"],
    ["md", "markdown"],
  ])("%s → %s", (ext, lang) => {
    expect(languageFor(ext)).toBe(lang);
  });

  test("ismeretlen kiterjesztés: null", () => {
    expect(languageFor("exe")).toBeNull();
    expect(languageFor("")).toBeNull();
    expect(languageFor("TS")).toBeNull();
  });
});

describe("highlightCode", () => {
  test("színezett HTML a kulcsszavakkal", async () => {
    const html = await highlightCode("const x = 1;", "javascript");
    expect(html).toContain('<span class="hljs-keyword">const</span>');
  });

  test("a HTML-t escape-eli", async () => {
    const html = await highlightCode("<script>alert(1)</script>", "python");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("minden felsorolt nyelv betölthető", async () => {
    for (const ext of [
      "sql",
      "ts",
      "json",
      "java",
      "cs",
      "cpp",
      "php",
      "rb",
      "go",
      "rs",
      "kt",
      "swift",
      "sh",
      "ps1",
      "css",
      "scss",
      "ini",
    ]) {
      const language = languageFor(ext) as string;
      expect(await highlightCode("x", language)).not.toBeNull();
    }
  });

  test("ismeretlen nyelv: null", async () => {
    expect(await highlightCode("x", "brainfuck")).toBeNull();
  });
});
