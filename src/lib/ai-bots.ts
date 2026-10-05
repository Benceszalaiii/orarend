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
//! ember, csak nem böngészőn keresztül néz — és most, ebben a percben akarja
//! tudni, mi lesz holnap a harmadik óra.
//*
//! EZÉRT NEM ZÁRJUK KI, HANEM ÁTTERELJÜK. Amíg a robots.txt a `/`-t tiltotta
//! nekik, az asszisztens a nyitólapnál megállt, és azt felelte, hogy „a
//! jedlik.info blokkol" — az élő JSON-ig, ami pont nekik készült, el sem jutott.
//! Most a lapokra is beengedi őket a robots.txt, a `proxy.ts` pedig a lap
//! helyett a lap gépi párjára küldi tovább (`machineUrlFor`): az `/orarend?
//! class=13A` az `/api/orarend?osztaly=13A`-ra, minden más a `/llms.txt`-re.
//*
//! A LAP HTML-JÉT TOVÁBBRA SEM KAPJÁK MEG, és ennek két oka van. Egy: amit a
//! lap tud, az bejelentkezés után személyre szabott — a nyilvános vázból az
//! asszisztens magabiztos, de üres választ építene. Kettő: a JSON a kérés
//! pillanatának adata, nem a lap elavuló másolata.
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

//! A `proxy.ts` ebből dolgozik: akit a kapuban felismerünk. Az ember indította
//! asszisztenseket is felismeri — őket nem elzavarja, hanem átirányítja.
export const BLOCKED_AI_USER_AGENTS: readonly string[] = [
  ...TRAINING_CRAWLERS,
  ...AI_SEARCH_CRAWLERS,
  ...USER_TRIGGERED_AGENTS,
];

//! Az `app/robots.ts` ebből dolgozik: akinek a lapok zárva. Bővebb a kapu
//! tiltólistájánál — benne vannak a jelölők is, amiket csak itt lehet
//! megcímezni —, az ember indította asszisztensek viszont NINCSENEK benne:
//! nekik saját blokk jár (`USER_TRIGGERED_ROBOTS_TOKENS`).
export const DISALLOWED_AI_ROBOTS_TOKENS: readonly string[] = [
  ...TRAINING_CRAWLERS,
  ...AI_SEARCH_CRAWLERS,
  ...ROBOTS_TXT_ONLY_TOKENS,
];

//! Az `app/robots.ts` saját blokkja: a lapok nyitva (a kapu úgyis a gépi
//! párjukra küld tovább), csak a naptár-feed zárva.
export const USER_TRIGGERED_ROBOTS_TOKENS: readonly string[] = [
  ...USER_TRIGGERED_AGENTS,
];

//! ─── AMI A GÉPNEK SZÓL ─────────────────────────────────────────────────────
//! A `/llms.txt` MINDENKINEK nyitva, mint a `robots.txt`: csak leírás, és aki
//! nem olvashatja el, sosem tudja meg, hogy van mit kérnie. Nem is megy át a
//! `proxy.ts`-en (lásd a matcher-t).
export const LLM_DOC_PATH = "/llms.txt";

//! AZ EGÉSZ `/api` MINDEN AI-ROBOTNAK NYITVA. Ezt kifejezetten gépnek írtuk: a
//! válasz élő, a kérés pillanatában kért adat — nem a lap elavuló másolata,
//! és nem a bejelentkezés utáni lap üres váza. Ami a lapokra szóló tiltást
//! indokolja, itt egyik sem áll; ami személyes, azt a bejelentkezés védi, nem
//! a `User-Agent`. A lapok továbbra is zárva.
export const LLM_OPEN_PREFIX = "/api/";

//! KIVÉTEL A NAPTÁR-FEED. A címében ott a személyes jegy; egy robot kezében
//! nincs keresnivalója (lásd `app/robots.ts`).
export const LLM_CLOSED_PREFIX = "/api/naptar";

export function isOpenForAi(pathname: string): boolean {
  if (!pathname.startsWith(LLM_OPEN_PREFIX)) return false;
  return (
    pathname !== LLM_CLOSED_PREFIX &&
    !pathname.startsWith(`${LLM_CLOSED_PREFIX}/`)
  );
}

//! Egyszer számoljuk ki, ne kérésenként.
const NEEDLES = BLOCKED_AI_USER_AGENTS.map((agent) => agent.toLowerCase());
const USER_TRIGGERED_NEEDLES = USER_TRIGGERED_AGENTS.map((agent) =>
  agent.toLowerCase(),
);

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

export function isUserTriggeredAgent(
  userAgent: string | undefined | null,
): boolean {
  if (!userAgent) return false;
  const haystack = userAgent.toLowerCase();
  return USER_TRIGGERED_NEEDLES.some((needle) => haystack.includes(needle));
}

//! ─── A LAP GÉPI PÁRJA ──────────────────────────────────────────────────────
//! Ugyanazt kérdezi, amit a lap mutatna, csak JSON-ban. Az alany a lap saját
//! paraméteréből jön (`?class=` / `?teacher=` / `?tantargy=`), mert az
//! asszisztens jellemzően a felhasználótól kapott, megosztott linket nyitja
//! meg. Amit nem tudunk párosítani, az a `/llms.txt`-re megy: onnan minden
//! végpont kész linkként elérhető.
export function machineUrlFor(
  pathname: string,
  searchParams: URLSearchParams,
): string {
  const className = searchParams.get("class")?.trim();
  if (className) return `/api/orarend?osztaly=${encodeURIComponent(className)}`;
  const teacher = searchParams.get("teacher")?.trim();
  if (teacher) return `/api/orarend?tanar=${encodeURIComponent(teacher)}`;

  if (pathname === "/orarend" || pathname === "/tanari") return "/api/orarend";
  if (pathname === "/teremkereso") return "/api/termek";
  if (pathname === "/tantargyak") {
    const subject = searchParams.get("tantargy")?.trim();
    return subject
      ? `/api/tantargyak?tantargy=${encodeURIComponent(subject)}`
      : "/api/tantargyak";
  }
  return LLM_DOC_PATH;
}

//! ─── A KAPU DÖNTÉSE ────────────────────────────────────────────────────────
//! A KÉRDÉS NEM AZ, HOGY ROBOT-E, HANEM HOGY IDE JÖHET-E.
//! - `pass`: nem AI-robot, vagy az `/api`-ra jön (a naptár-feed kivételével).
//! - `redirect`: ember indította asszisztens egy lapon — a gépi párjára megy.
//! - `block`: minden más AI-robot a lapokon, és bárki a naptár-feeden.
export type AiGate = "pass" | "redirect" | "block";

export function aiGate(
  userAgent: string | undefined | null,
  pathname: string,
): AiGate {
  if (!userAgent || !isAiBotUserAgent(userAgent)) return "pass";
  if (isOpenForAi(pathname)) return "pass";
  if (pathname.startsWith(LLM_OPEN_PREFIX)) return "block";
  return isUserTriggeredAgent(userAgent) ? "redirect" : "block";
}
