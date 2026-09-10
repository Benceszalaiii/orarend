import { type NextRequest, NextResponse } from "next/server";
import { isAiBotUserAgent } from "@/lib/ai-bots";
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
function blockAiBot(): NextResponse {
  return new NextResponse(
    "403 — Ez a lap egy iskola órarendje, nem tanítóanyag. Az AI-robotokat a /robots.txt is kizárja.\n",
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
  if (isAiBotUserAgent(request.headers.get("user-agent"))) return blockAiBot();

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
//!   listában.
//! - `_next/static`, `_next/image` — a váz, a kép, a betűkészlet. Nincs bennük
//!   tartalom, amit érdemes lenne félteni, viszont belőlük van a legtöbb.
//! - `sw.js`, `offline.html`, `manifest` és a `public/` ikonjai — a telepített
//!   alkalmazás darabjai. Ezeket a böngésző kéri le, néha `User-Agent` nélkül.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|robots\\.txt|sitemap\\.xml|sw\\.js|offline\\.html|manifest\\.webmanifest|.*\\.(?:png|ico|ttf|svg)$).*)",
  ],
};
