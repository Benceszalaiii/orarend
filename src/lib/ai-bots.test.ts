import { describe, expect, test } from "bun:test";
import {
  BLOCKED_AI_USER_AGENTS,
  DISALLOWED_AI_ROBOTS_TOKENS,
  isAiBotUserAgent,
} from "./ai-bots";

//! ═══════════════════════════════════════════════════════════════════════════
//! REGRESSZIÓS TESZT — MIÉRT ÉPP EZ
//! ═══════════════════════════════════════════════════════════════════════════
//! Egy `User-Agent`-re épülő szűrő kétféleképpen romlik el, és a kettő nem
//! egyforma súlyú:
//*
//! - ÁTENGED valakit. Kellemetlen, de csendes: legfeljebb annyi történik, hogy
//!   az órarend bekerül egy adathalomba.
//! - TÚL SOKAT ZÁR. Ez a súlyos eset. Ha a részsztringes egyezés véletlenül
//!   elkapja a Googlebotot vagy egy böngészőt, a lap kiesik a keresőből, vagy
//!   egy diák 403-at kap az órarendjére — és mindkettő némán történik, mert a
//!   403-at nem mi látjuk, hanem ő.
//*
//! Ezért van a lenti névsor mellett egy legalább ilyen fontos második lista is:
//! akiket TILOS elkapni. Az ide írt sztringek valódi, terepen látott
//! `User-Agent`-ek, nem a robotok puszta neve — a szűrőnek pont a mondat
//! közepéből kell kihalásznia a nevet.
//! ═══════════════════════════════════════════════════════════════════════════

//* Valódi `User-Agent`-ek. A tördelés kiadásonként változik, a név viszont
//* nem — a teszt pont ezt a feltevést őrzi.
const AI_BOT_USER_AGENTS = [
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36; compatible; ChatGPT-User/1.0; +https://openai.com/bot",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  "CCBot/2.0 (https://commoncrawl.org/faq/)",
  "Mozilla/5.0 (Linux; Android 8.0; Pixel 2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.75 Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
  "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
  "Mozilla/5.0 (Linux; like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)",
  "Mozilla/5.0 (compatible; ImagesiftBot; +imagesift.com)",
  "Mozilla/5.0 (compatible) AI2Bot (+https://www.allenai.org/crawler)",
];

//! ─── AKIKET TILOS ELKAPNI ──────────────────────────────────────────────────
//! A rendes keresőrobotok TALÁLATOT adnak, az pedig embert hoz ide. Ha ezek
//! bármelyike 403-at kapna, a lap eltűnne a keresőből — és nem derülne ki
//! azonnal, csak hetekkel később, a látogatószámon.
//*
//! AZ APPLEBOT ÉS A GOOGLEBOT KÜLÖN FIGYELMET ÉRDEMEL: az AI-oldalukat
//! (Applebot-Extended, Google-Extended) KIZÁRÓLAG a robots.txt címzi meg,
//! magukat a robotokat nem szabad kizárni. Ez a két sor őrzi, hogy a két lista
//! ne keveredjen össze.
const ALLOWED_USER_AGENTS = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.76 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/600.8.9 (KHTML, like Gecko) Version/8.0.7 Safari/600.8.9 (Applebot/0.1; +http://www.apple.com/go/applebot)",
  //* Böngészők — az iskolában ezek a leggyakoribbak.
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
];

describe("isAiBotUserAgent", () => {
  test.each(AI_BOT_USER_AGENTS)("kizárja: %s", (userAgent) => {
    expect(isAiBotUserAgent(userAgent)).toBe(true);
  });

  test.each(ALLOWED_USER_AGENTS)("beengedi: %s", (userAgent) => {
    expect(isAiBotUserAgent(userAgent)).toBe(false);
  });

  //! A NÉV KIS/NAGYBETŰJE NEM SZÁMÍTHAT. Ugyanaz a robot kiadásonként másképp
  //! írja le magát (`Bytespider`, `bytespider`); ha az egyezés betűérzékeny
  //! lenne, egy verzióváltás némán kinyitná a kaput.
  test("a kis/nagybetű nem kerüli meg a tiltást", () => {
    expect(isAiBotUserAgent("gptbot/1.2")).toBe(true);
    expect(isAiBotUserAgent("CLAUDEBOT/1.0")).toBe(true);
    expect(isAiBotUserAgent("ccbot/2.0")).toBe(true);
  });

  //! ÜRES FEJLÉC NEM ROBOT. `User-Agent` nélkül érkezik a service worker
  //! néhány kérése és jó pár health check is; ezeket nem zárjuk ki. Aki
  //! szándékosan rejtőzik, azt úgysem a nevéről ismernénk fel.
  test("üres bemenetre nem omlik össze, és nem is zár", () => {
    expect(isAiBotUserAgent(undefined)).toBe(false);
    expect(isAiBotUserAgent(null)).toBe(false);
    expect(isAiBotUserAgent("")).toBe(false);
  });

  //! A NÉVSOR NEM SZŰKÜLHET ÉSZREVÉTLENÜL. Ha valaki kiszed egy sort, ez a
  //! teszt bukik — nem azért, mert a lista szent, hanem mert a törlésnek
  //! tudatos döntésnek kell lennie, nem mellékhatásnak.
  test("minden felsorolt robot saját magára is illeszkedik", () => {
    for (const agent of BLOCKED_AI_USER_AGENTS) {
      expect(isAiBotUserAgent(agent)).toBe(true);
    }
  });
});

describe("robots.txt névsor", () => {
  //! AMIT A KAPUBAN ELZAVARUNK, AZT KI IS KELL ÍRNI. Ha a `proxy.ts` szigorúbb
  //! lenne a `robots.txt`-nél, olyan robotot kapnánk el 403-mal, akinek soha
  //! nem szóltunk — ez a teszt garantálja, hogy a kiírt szabály sosem marad el
  //! a betartatás mögött.
  test("mindenki benne van, akit a kapuban is elzavarunk", () => {
    for (const agent of BLOCKED_AI_USER_AGENTS) {
      expect(DISALLOWED_AI_ROBOTS_TOKENS).toContain(agent);
    }
  });

  //! A JELÖLŐK CSAK ITT LÉTEZNEK. A Google-Extended és az Applebot-Extended
  //! mögött nincs kérés, amit el lehetne kapni — ha valaha átkerülnének a
  //! `proxy.ts` listájába, a részsztringes egyezés a RENDES Googlebotot és
  //! Applebotot zárná ki. Ez a teszt pont ezt a lépést akadályozza meg.
  test("a jelölők a robots.txt-ben vannak, a kapuban nem", () => {
    for (const token of ["Google-Extended", "Applebot-Extended"]) {
      expect(DISALLOWED_AI_ROBOTS_TOKENS).toContain(token);
      expect(BLOCKED_AI_USER_AGENTS).not.toContain(token);
    }
  });

  //! NINCS KÉTSZER FELVETT NÉV. Egy duplikátum a robots.txt-ben két azonos
  //! `User-Agent` blokkot jelentene — a legtöbb robot ilyenkor csak az egyiket
  //! olvassa el.
  test("nincs ismétlődés a névsorban", () => {
    expect(new Set(DISALLOWED_AI_ROBOTS_TOKENS).size).toBe(
      DISALLOWED_AI_ROBOTS_TOKENS.length,
    );
  });
});
