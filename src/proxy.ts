import { type NextRequest, NextResponse } from "next/server";
import { isViewRoute, LAST_VIEW_COOKIE } from "@/lib/last-view";

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
  const lastView = request.cookies.get(LAST_VIEW_COOKIE)?.value;
  if (!isViewRoute(lastView)) return NextResponse.next();

  const response = NextResponse.redirect(new URL(lastView, request.url));
  //! EZT A VÁLASZT SENKI NE TEGYE EL. Süti nélkül ugyanez a cím a nyitólapot
  //! adja; egy eltárolt átirányítás a köztes gyorsítótárban minden látogatót
  //! az `/orarend`-re küldene.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

//! CSAK A GYÖKÉRRE. A proxy minden találata egy futtatás a kérés útjában —
//! itt egyetlen cím kapuját őrzi, a többi útvonal hozzá se ér.
export const config = { matcher: "/" };
