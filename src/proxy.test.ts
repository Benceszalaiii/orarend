import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { LAST_VIEW_COOKIE } from "@/lib/last-view";
import { config, proxy } from "./proxy";

function request(path: string, init: { ua?: string; cookie?: string } = {}) {
  const headers = new Headers();
  if (init.ua) headers.set("user-agent", init.ua);
  if (init.cookie) headers.set("cookie", init.cookie);
  return new NextRequest(new URL(path, "https://orarend.test"), { headers });
}

const BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

describe("proxy", () => {
  test("AI-robot: 403, bármely úton", async () => {
    for (const path of ["/", "/orarend", "/api/naptar/abc.ics"]) {
      const res = proxy(
        request(path, {
          ua: "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)",
        }),
      );
      expect(res.status).toBe(403);
      expect(res.headers.get("vary")).toBe("User-Agent");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(await res.text()).toContain("robots.txt");
    }
  });

  //! AZ `/api` MINDEN AI-ROBOTNAK NYITVA — a tanító-, a kereső- és az ember
  //! indította robotnak is. A naptár-feed mindenkinek 403.
  test("bármely AI-robot eléri az API-t, a naptár-feedet nem", () => {
    for (const ua of [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
      "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
      "Mozilla/5.0 (compatible; PerplexityBot/1.0)",
    ]) {
      expect(proxy(request("/api/orarend?osztaly=13C", { ua })).status).toBe(
        200,
      );
      expect(proxy(request("/api/termek", { ua })).status).toBe(200);
      expect(proxy(request("/api/kozlemenyek", { ua })).status).toBe(200);
      expect(proxy(request("/api/naptar/abc.ics", { ua })).status).toBe(403);
      expect(proxy(request("/api/naptar", { ua })).status).toBe(403);
    }
  });

  //! A GYŰJTŐ ROBOT A LAPON 403-AT KAP — de a szöveg a JSON-hoz irányítja.
  test("gyűjtő robot a lapon: 403, a JSON címével", async () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)",
      "Mozilla/5.0 (compatible; PerplexityBot/1.0)",
    ]) {
      const res = proxy(request("/orarend?class=13A", { ua }));
      expect(res.status).toBe(403);
      expect(await res.text()).toContain("/api/orarend");
    }
  });

  //! AZ EMBER INDÍTOTTA ASSZISZTENS A LAP HELYETT A GÉPI PÁRJÁT KAPJA. Ez a
  //! javítás lényege: korábban 403 (és robots.txt-tiltás) állt itt, és az
  //! asszisztens azt felelte, hogy az órarend elérhetetlen.
  test("asszisztens a lapon: 307 a lap gépi párjára", () => {
    for (const ua of [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
    ]) {
      const page = proxy(request("/orarend?class=13A", { ua }));
      expect(page.status).toBe(307);
      expect(page.headers.get("location")).toBe(
        "https://orarend.test/api/orarend?osztaly=13A",
      );
      expect(page.headers.get("vary")).toBe("User-Agent");
      expect(page.headers.get("cache-control")).toBe("private, no-store");

      const home = proxy(request("/", { ua }));
      expect(home.status).toBe(307);
      expect(home.headers.get("location")).toBe(
        "https://orarend.test/llms.txt",
      );
    }
  });

  test("a nyitólap a legutóbbi nézetre visz, gyorsítótár nélkül", () => {
    const res = proxy(
      request("/", { ua: BROWSER, cookie: `${LAST_VIEW_COOKIE}=/ma` }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://orarend.test/ma");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  test("süti nélkül vagy ismeretlen nézettel a nyitólap marad", () => {
    for (const cookie of [
      undefined,
      `${LAST_VIEW_COOKIE}=/admin`,
      `${LAST_VIEW_COOKIE}=https://evil.test`,
    ]) {
      const res = proxy(request("/", { ua: BROWSER, cookie }));
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
  });

  test("más úton a süti nem irányít át", () => {
    const res = proxy(
      request("/orarend", { ua: BROWSER, cookie: `${LAST_VIEW_COOKIE}=/ma` }),
    );
    expect(res.headers.get("location")).toBeNull();
  });

  test("felhasználói azonosító nélkül is átmegy", () => {
    expect(proxy(request("/orarend")).status).toBe(200);
  });
});

describe("matcher", () => {
  const pattern = new RegExp(`^${config.matcher[0]}$`);
  test.each([
    ["/", true],
    ["/orarend", true],
    ["/api/naptar/abc.ics", true],
    ["/_next/static/chunk.js", false],
    ["/robots.txt", false],
    ["/llms.txt", false],
    ["/api/orarend", true],
    ["/sw.js", false],
    ["/icon.png", false],
    ["/manifest.webmanifest", false],
  ])("%s → %p", (path, matched) => {
    expect(pattern.test(path)).toBe(matched);
  });
});
