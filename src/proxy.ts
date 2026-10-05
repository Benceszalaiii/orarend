import { type NextRequest, NextResponse } from "next/server";
import { aiGate, LLM_DOC_PATH, machineUrlFor } from "@/lib/ai-bots";
import { JEDLIK_SITE } from "@/lib/jedlik-api";
import { isViewRoute, LAST_VIEW_COOKIE } from "@/lib/last-view";

//! ─── AZ AI-ROBOTOK KAPUJA ──────────────────────────────────────────────────
//! A `robots.txt` KÉR, ez a néhány sor BETARTAT. A kettő ugyanabból a
//! névsorból dolgozik (`lib/ai-bots.ts`), hogy ne csúszhassanak szét: ami ki
//! van írva, az történik is.
//*
//! MIÉRT NEM ELÉG A ROBOTS.TXT: mert az egy udvarias kérés, aminek nincs
//! foganatja. Aki betartja, ide se jön — ezekre a sorokra pont az a robot fut
//! rá, amelyik nem tartotta be. A 403 még a lap kirajzolása előtt megszületik:
//! nincs adatbázis-lekérdezés, nincs Jedlik-API hívás, nincs kirajzolt HTML.
//*
//! 403 ÉS NEM 404. A 404 azt hazudná, hogy nincs itt semmi — mire a robot
//! holnap újra megkérdezi. A 403 azt mondja, ami igaz: van, de nem a tiéd.
//*
//! EZT A VÁLASZT SENKI NE TEGYE EL. A tiltás a `User-Agent`-en múlik, tehát
//! ugyanannak a címnek KÉT válasza van. Egy köztes gyorsítótár, ami csak a
//! címet nézi, a robotnak szánt 403-at a következő látogatónak is kiadná.
//*
//! A SZÖVEG A GÉPNEK SZÓL, NEM CSAK A TILTÁST MONDJA. Ha csak annyit írna, hogy
//! „ki vagy zárva", az asszisztens azt mondaná a felhasználónak, hogy az
//! órarend elérhetetlen — pedig az `/api` neki is nyitva. Ezért angolul is, és
//! a kész címekkel.
function blockAiBot(): NextResponse {
  return new NextResponse(
    "403 — Ez a lap egy iskola órarendje, nem tanítóanyag. Az AI-robotokat a /robots.txt is kizárja.\n" +
      "The HTML pages are closed to AI crawlers, but the live timetable is open as JSON:\n" +
      "- https://jedlik.info/llms.txt (how to use it)\n" +
      "- https://jedlik.info/api/orarend (every class and teacher, each with a ready link)\n",
    {
      status: 403,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-store",
        Vary: "User-Agent",
      },
    },
  );
}

//! ─── AZ ASSZISZTENS ÁTTERELÉSE ─────────────────────────────────────────────
//! Az ember indította asszisztens (ChatGPT-User, Claude-User, …) a lap helyett
//! annak gépi párját kapja: ugyanazt az alanyt, élő JSON-ban, vagy a
//! `/llms.txt`-t. 307, mert a lap maga megmarad, csak ennek a kérdezőnek nem
//! az való. A `Link` fejléc akkor is a leíráshoz vezet, ha a JSON-ra jutott.
//*
//! EZT A VÁLASZT SEM TEHETI EL SENKI — ugyanaz a cím böngészőnek a lapot adja.
function redirectAiAgent(request: NextRequest): NextResponse {
  const target = machineUrlFor(
    request.nextUrl.pathname,
    request.nextUrl.searchParams,
  );
  const response = NextResponse.redirect(new URL(target, request.url), 307);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "User-Agent");
  response.headers.set("Link", `<${LLM_DOC_PATH}>; rel="describedby"`);
  return response;
}

//! ─── A JEDLIKINFO ÁTJÁRÓJA ─────────────────────────────────────────────────
//! A `/api/jedlik/*` átirányító (`next.config.ts`) a böngésző fejléceit viszi
//! tovább — a Jedlikinfo viszont a `timetable/cards` POST-ot csak akkor adja
//! ki, ha az `Origin` ÉS a `Referer` is egy általa ismert oldalé (a
//! `jedlik.info` az, a `localhost`, a `www.` és az előnézeti címek NEM —
//! ellenőrizve 2026-09-25). Ezért ugyanazt mondjuk neki, amit a szerveroldali
//! hívás is mond (`jedlik-api.ts`): a saját felületéről jövünk. Így a helyi
//! fejlesztés és minden előnézet ugyanúgy működik, mint az éles oldal.
//*
//! A SÜTIT NEM VISSZÜK ÁT. Az átirányító különben a látogató MINDEN sütijét
//! — a belépési munkamenetet is — egy idegen szervernek adná. A Jedlikinfo
//! nyilvános végpontjainak nincs rá szükségük.
//*
//! A proxy a `next.config.ts` átirányítói ELŐTT fut, és a `request.headers`
//! felülírása a továbbküldött kérésre vonatkozik, nem a válaszra.
function jedlikUpstream(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set("origin", JEDLIK_SITE);
  headers.set("referer", `${JEDLIK_SITE}/`);
  headers.delete("cookie");
  return NextResponse.next({ request: { headers } });
}

//! ─── A GYÖKÉR KAPUJA ───────────────────────────────────────────────────────
//! Egyetlen kérdést tesz fel, a lap kirajzolása ELŐTT: járt-e már ez a
//! böngésző valamelyik nézetben?
//*
//! - NEM (nincs süti, robot, első látogatás): nem szólunk bele. A `/` a
//!   nyitólapot szolgálja ki, statikusan, átirányítás nélkül — a kereső
//!   pontosan azt a lapot indexeli, ami a címen áll.
//! - IGEN: 307-tel megy tovább oda, ahol legutóbb járt. Aki az órarendjét
//!   akarja megnézni két óra között, annak a nyitólap ÚTBAN VAN.
//*
//! MIÉRT ITT, ÉS NEM A LAPBAN? Mert a `cookies()` olvasása a `/`-t
//! kérésenként újrarajzolttá tenné — pedig a nyitólapon nincs semmi, ami
//! látogatónként változna. Így a lap statikus marad, és a süti tulajdonosa a
//! HTML letöltése előtt fordul el.
//*
//! MIÉRT 307 ÉS NEM 301? Mert ez az átirányítás SZEMÉLYES: a következő
//! látogató (vagy ugyanő, törölt sütivel) a nyitólapot kapja. Egy állandó
//! átirányítást a böngésző és a kereső is elraktározna, és a nyitólap
//! elérhetetlenné válna.
export function proxy(request: NextRequest) {
  const gate = aiGate(
    request.headers.get("user-agent"),
    request.nextUrl.pathname,
  );
  if (gate === "block") return blockAiBot();
  if (gate === "redirect") return redirectAiAgent(request);
  if (request.nextUrl.pathname.startsWith("/api/jedlik/")) {
    return jedlikUpstream(request);
  }

  //! A TÖBBI ÚTVONALON NINCS MÁS DOLGUNK. A süti-kapu csak a gyökérre szól; a
  //! matcher azért tágabb nála, mert a robotszűrőnek az EGÉSZ lapot kell
  //! őriznie, nem egyetlen címet.
  if (request.nextUrl.pathname !== "/") return NextResponse.next();

  const lastView = request.cookies.get(LAST_VIEW_COOKIE)?.value;
  if (!isViewRoute(lastView)) return NextResponse.next();

  const response = NextResponse.redirect(new URL(lastView, request.url));
  //! EZT A VÁLASZT SENKI NE TEGYE EL. Süti nélkül ugyanez a cím a nyitólapot
  //! adja; egy eltárolt átirányítás a köztes gyorsítótárban minden látogatót
  //! az `/orarend`-re küldene.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

//! ─── MIRE FUSSON, ÉS MIRE NE ──────────────────────────────────────────────
//! A robotszűrő miatt a proxy már nem egyetlen címet őriz, hanem minden lapot
//! és minden `/api` hívást. Ennek ára van: ez a néhány sor most MINDEN kérés
//! útjába beáll — ezért nincs benne se adatbázis, se `await`.
//*
//! AMI KIMARAD, ÉS MIÉRT:
//! - `robots.txt`, `sitemap.xml` — EZEKET A ROBOTNAK EL KELL ÉRNIE. Aki 403-at
//!   kap a robots.txt-re, sosem tudja meg, hogy ki van tiltva; a kiírt szabály
//!   csak akkor ér valamit, ha olvasható. Ez a két sor a legfontosabb az egész
//!   listában. A `llms.txt` ugyanezért van itt: a gépnek szóló leírás, amit
//!   pont az AI-asszisztensnek kell tudnia elolvasni.
//! - `_next/static`, `_next/image` — a váz, a kép, a betűkészlet. Nincs bennük
//!   tartalom, amit érdemes lenne félteni, viszont belőlük van a legtöbb.
//! - `sw.js`, `offline.html`, `manifest` és a `public/` ikonjai — a telepített
//!   alkalmazás darabjai. Ezeket a böngésző kéri le, néha `User-Agent` nélkül.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|robots\\.txt|llms\\.txt|sitemap\\.xml|sw\\.js|offline\\.html|manifest\\.webmanifest|.*\\.(?:png|ico|ttf|svg)$).*)",
  ],
};
