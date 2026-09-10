//! ═══════════════════════════════════════════════════════════════════════════
//! AI-ROBOTOK: A NÉVSOR ÉS A FELISMERÉS
//! ═══════════════════════════════════════════════════════════════════════════
//! Ami ezen a lapon van, az egy iskoláé: órarend, teremrend, ügyeleti beosztás,
//! tanárok neve, változások. Ez nem tanítóanyag, és nem is olyasmi, aminek egy
//! chatbot válaszában kellene felbukkannia — pláne nem elavultan, fél évvel a
//! begyűjtés után. Ez a modul mondja meg, KI az, akit nem engedünk be.
//!
//! KÉT HELYEN HASZNÁLJUK, ÉS EZ SZÁNDÉKOS — a kettő nem ugyanaz a réteg:
//!
//! - `app/robots.ts` — a KIÍRT SZABÁLY. Aki betartja a robots.txt-t, el se jut
//!   idáig. A Google-Extended és az Applebot-Extended esetében ez az EGYETLEN
//!   létező fogantyú: azok mögött nincs külön robot, amit el lehetne kapni.
//!   Csak jelölők, amiket kizárólag a robots.txt-ben lehet megcímezni — a
//!   Google és az Apple a rendes keresőrobotjával jár, és abból olvassa ki,
//!   hogy a tartalom mehet-e a modellbe. Ezért van két lista.
//!
//! - `proxy.ts` — a BETARTATÁS. Aki a kiírt szabályt figyelmen kívül hagyja,
//!   403-at kap, még a lap kirajzolása előtt.
//!
//! MIÉRT KÜLÖN FÁJLBAN, ÉS NEM A `proxy.ts`-BEN: hogy tesztelhető legyen. Ez
//! tiszta függvény, se hálózat, se kérés, se `server-only` import — a
//! regressziós teszt megfuttathatja anélkül, hogy fel kellene húznia bármit.
//! Egy ilyen szűrő kétféleképpen romlik el: átenged valakit, vagy — sokkal
//! rosszabb — kizárja a Googlebotot, és a lap kiesik a keresőből. Mindkettőt a
//! `ai-bots.test.ts` őrzi.
//!
//! A NÉVSOR AVUL. Új robot havonta születik; ez a lista annyit ér, amennyit
//! karbantartanak rajta. A hivatkozási alap a `ai.robots.txt` gyűjtemény és az
//! üzemeltetők saját dokumentációja.
//! ═══════════════════════════════════════════════════════════════════════════

//! ─── AKI TANÍTÓANYAGOT GYŰJT ───────────────────────────────────────────────
//! Ezek azért járják a webet, hogy a begyűjtött szöveg egy modell tanításába
//! kerüljön. Nem hoznak látogatót, nem hivatkoznak vissza, és amit elvisznek,
//! azt nem lehet visszakérni. Nincs egyetlen érv sem amellett, hogy egy iskolai
//! órarend ebbe belekerüljön.
const TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
  "Bytespider",
  "meta-externalagent",
  "meta-externalfetcher",
  "FacebookBot",
  "Amazonbot",
  "cohere-ai",
  "cohere-training-data-crawler",
  "Diffbot",
  "omgili",
  "Timpibot",
  "Webzio-Extended",
  "AI2Bot",
  "ImagesiftBot",
  "PanguBot",
  "Kangaroo Bot",
  "VelenPublicWebCrawler",
  "Google-CloudVertexBot",
  "TikTokSpider",
] as const;

//! ─── AKI AI-VÁLASZOKHOZ INDEXEL ────────────────────────────────────────────
//! Ezek nem tanítanak, hanem feleletet építenek: a lap tartalmát beemelik egy
//! chat-válaszba. Ez rosszabb, mint a semmi. Az órarend NAPONTA változik (lásd
//! `sitemap.ts`), a `/valtozasok` óránként; egy hetes másolat magabiztosan
//! mondott téves információ. Aki tudni akarja, mi lesz a harmadik óra, annak a
//! lapot kell megnéznie, nem egy tavalyi pillanatképet róla.
//!
//! A RENDES KERESŐROBOTOK NINCSENEK ITT. A Googlebot, a Bingbot és a
//! DuckDuckBot találatot ad, ami IDEHOZ egy embert — az a lap érdeke. Amelyik
//! robot csak elvisz, az megy; amelyik hoz, az marad.
const AI_SEARCH_CRAWLERS = [
  "OAI-SearchBot",
  "PerplexityBot",
  "Claude-SearchBot",
  "YouBot",
  "DuckAssistBot",
] as const;

//! ─── AKIT EGY EMBER INDÍT EL ───────────────────────────────────────────────
//! FIGYELEM, EZ A LISTA MÁS: ezek nem maguktól járnak: akkor kérik le a lapot,
//! amikor valaki a chatben megkéri rá az asszisztensét. Mögötte tehát VAN egy
//! ember, csak nem böngészőn keresztül néz.
//!
//! Mégis zárva vannak, két okból. Egy: amit ez a lap tud, az bejelentkezés után
//! személyre szabott — az asszisztens úgyis csak a nyilvános vázat látná, és
//! abból építene magabiztos, de üres választ. Kettő: ezek a lekérések ugyanúgy
//! visszatáplálhatók, mint a többi.
//!
//! HA EZ VALAHA TÚL SZIGORÚNAK BIZONYUL, EZ AZ EGY TÖMB TÖRLENDŐ — a másik
//! kettő nem. Ezért van külön, és nem beleolvasztva a fentiekbe.
const USER_TRIGGERED_AGENTS = [
  "ChatGPT-User",
  "Claude-User",
  "Perplexity-User",
  "MistralAI-User",
] as const;

//! ─── AMI CSAK A ROBOTS.TXT-BEN LÉTEZIK ─────────────────────────────────────
//! Ezek NEM robotok, hanem jelölők. Nincs olyan kérés, aminek a fejlécében a
//! „Google-Extended" állna — a Google a szokásos Googlebottal jön, és utólag a
//! robots.txt-ből dönti el, mehet-e a begyűjtött szöveg a Gemini tanításába.
//! Ugyanez az Applebot-Extended és az Apple Intelligence viszonya.
//!
//! EZEKET TEHÁT TILOS A `proxy.ts` LISTÁJÁBA TENNI. Aki a „Googlebot" vagy az
//! „Applebot" nevet kezdi el szűrni a kérésekben, az a KERESŐT zárja ki, nem az
//! AI-t — pont a fordítottját annak, amit akar.
const ROBOTS_TXT_ONLY_TOKENS = [
  "Google-Extended",
  "Applebot-Extended",
] as const;

//! A `proxy.ts` ebből dolgozik: akit ténylegesen elzavarunk a kapuban.
export const BLOCKED_AI_USER_AGENTS: readonly string[] = [
  ...TRAINING_CRAWLERS,
  ...AI_SEARCH_CRAWLERS,
  ...USER_TRIGGERED_AGENTS,
];

//! Az `app/robots.ts` ebből dolgozik: a kiírt szabály. Bővebb, mint a fenti —
//! benne vannak a jelölők is, amiket csak itt lehet megcímezni.
export const DISALLOWED_AI_ROBOTS_TOKENS: readonly string[] = [
  ...BLOCKED_AI_USER_AGENTS,
  ...ROBOTS_TXT_ONLY_TOKENS,
];

//! Egyszer számoljuk ki, ne kérésenként.
const NEEDLES = BLOCKED_AI_USER_AGENTS.map((agent) => agent.toLowerCase());

//! RÉSZSZTRING ÉS KISBETŰ — MERT A `User-Agent` NEM NÉVJEGY, HANEM MONDAT.
//! A GPTBot úgy mutatkozik be, hogy `Mozilla/5.0 AppleWebKit/537.36 (KHTML,
//! like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)`. A név
//! valahol a közepén van, verziószámmal a végén, és a tördelés kiadásonként
//! változik — az egyenlő összehasonlítás itt semmit nem fogna meg.
//!
//! A részsztring ára az, hogy TÚL is kaphat: ha valaha egy hétköznapi böngésző
//! neve tartalmazna egy itteni tokent, azt a látogatót ártatlanul kizárnánk.
//! Ezért nincs a listán egyetlen általános szó sem („bot", „crawler", „AI"),
//! csak teljes, egyedi robotnevek — és ezért ellenőrzi a teszt kifejezetten a
//! rendes keresőrobotokat meg a böngészőket is.
export function isAiBotUserAgent(
  userAgent: string | undefined | null,
): boolean {
  if (!userAgent) return false;
  const haystack = userAgent.toLowerCase();
  return NEEDLES.some((needle) => haystack.includes(needle));
}
