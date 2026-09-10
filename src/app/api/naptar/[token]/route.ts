import { after } from "next/server";
import { isCalendarToken } from "@/lib/calendar-shared";
import {
  FEED_REFRESH_MINUTES,
  refreshWindow,
  renderFeed,
  servableWindow,
} from "@/lib/calendar-source";
import {
  type CalendarFeedRow,
  readFeed,
  touchFeed,
} from "@/lib/calendar-store";
import { sanitizePrefs } from "@/lib/prefs-shared";
import prisma from "@/lib/prisma";
import { subjectStoreKey } from "@/lib/timetable";

//! ═══════════════════════════════════════════════════════════════════════════
//! A NAPTÁR-FEED — AMIT A NAPTÁRALKALMAZÁS KÉR LE
//! ═══════════════════════════════════════════════════════════════════════════
//! EZ AZ APP EGYETLEN VÉGPONTJA, AMIT NEM EMBER ÉS NEM A SAJÁT LAPUNK HÍV.
//! A telefon naptára kérdezi, a maga ütemében, SÜTI NÉLKÜL — se munkamenet, se
//! `localStorage`, se fejléc nincs nála. Ezért a címben álló jegy MAGA a
//! jogosultság: nincs más, amiből kiderülhetne, kinek az órarendjét kell
//! kiszolgálni.
//!
//! EBBŐL KÖVETKEZIK, ÉS KI IS VAN ÍRVA A FELÜLETEN: a linket ismerő bárki látja
//! ezt az órarendet. A védelem a KITALÁLHATATLANSÁG (16 bájt véletlen) és a
//! visszavonhatóság, nem egy fejléc — egy naptáralkalmazásnak nem lehet
//! jelszót adni.
//!
//! ISMERETLEN JEGYRE 404, NEM 403. Ugyanaz a döntés, mint a háttérfeladat
//! kulcsánál: aki nem tudja a jegyet, az azt se tudja meg, hogy van itt
//! egyáltalán valami, amit érdemes próbálgatni. A visszavont link ugyanezt a
//! választ kapja, tehát abból sem derül ki, hogy LÉTEZETT.
//!
//! ─── AMI MIATT EZ A VÉGPONT ÁTMEGY AZ AI-ROBOT KAPUN ───────────────────────
//! A `proxy.ts` minden `/api` kérést megszűr (lásd `lib/ai-bots.ts`), de a
//! naptár-lekérők egyetlen tiltott névre sem illeszkednek: a Google
//! `Google-Calendar-Importer`-ként, az Apple `CalendarAgent`-ként, az Outlook a
//! saját nevén jön, és a `User-Agent` nélküli kérést a szűrő szándékosan
//! átengedi. Ha valaha egy általános szó („bot") kerülne a névsorba, EZ az a
//! funkció, ami némán elhalna tőle.
//! ═══════════════════════════════════════════════════════════════════════════

//* A frissítés a válasz UTÁN fut (`after`), de ugyanebben a meghívásban: a felső
//* korlát csak azt akadályozza meg, hogy egy beragadt külső kérés a platform
//* alapértelmezett határáig üljön.
export const maxDuration = 60;

function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}

//! ─── A FIÓKHOZ KÖTÖTT FEED A SZINKRONIZÁLT DÖNTÉSBŐL OLVAS ─────────────────
//! A vendég-feliratkozás döntés-listáját az a készülék tartja frissen, amelyik
//! a linket létrehozta (lásd `calendar-local.ts`) — egy BEJELENTKEZETT diáknál
//! viszont a döntés bármelyik készülékéről megváltozhat, és a
//! beállítás-szinkron már át is vitte a fiókjába. Ilyenkor a fiók sora az
//! igazság: a naptár attól függetlenül követi a változást, hogy a link
//! létrehozója kinyitotta-e azóta a lapot.
//*
//! AMI NEM VÁLTOZIK: a sorban tárolt pillanatkép. Ha a fiókban nincs bejegyzés
//! ERRE az alanyra (még sosem szinkronizált, vagy másik osztályt szűr), a
//! tárolt lista marad — egy szűrés nélküli naptár rosszabb a kicsit réginél.
async function withAccountPrefs(
  row: CalendarFeedRow,
): Promise<CalendarFeedRow> {
  if (!row.userId) return row;
  try {
    const stored = await prisma.preference.findUnique({
      where: { userId: row.userId },
    });
    if (!stored) return row;
    const prefs = sanitizePrefs(stored.data);
    const key = subjectStoreKey(row.kind, row.short);
    const merge = prefs.merge[key];
    if (!merge || merge.length === 0) return row;
    return { ...row, prefs: merge, dual: prefs.dual[key] ?? row.dual };
  } catch {
    //* Az adatbázis kimaradása nem vehet el egy működő naptárt: a tárolt
    //* pillanatkép ilyenkor is kiszolgálható.
    return row;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const raw = (await params).token;
  //* A `.ics` végződés a kliensek kedvéért van a címben (lásd
  //* `calendar-shared.ts`); a jegy maga az előtte álló rész.
  const token = raw.endsWith(".ics") ? raw.slice(0, -4) : raw;
  if (!isCalendarToken(token)) return notFound();

  const stored = await readFeed(token);
  if (!stored) return notFound();
  const row = await withAccountPrefs(stored);

  let window = await servableWindow(row.kind, row.short);

  //! AZ ELSŐ LEKÉRÉST MEG KELL VÁRNI. Üres ablakkal nem szabad válaszolni: a
  //! feliratkozásos naptár az üres listát TÖRLÉSNEK érti. Ezért amikor még
  //! egyetlen példány sincs (frissen készült link, vagy lejárt az ablak), a
  //! lekérés itt, a válasz előtt fut le — ez az EGYETLEN ág, ami várakoztat.
  if (window.weeks.length === 0) {
    window = await refreshWindow(row.kind, row.short);
  } else if (!window.fresh) {
    //* Van mit kiszolgálni, csak megöregedett: a naptár azonnal megkapja a
    //* mentett példányt, a friss adat pedig a válasz után kerül a tárolóba — a
    //* KÖVETKEZŐ lekérés már azt kapja.
    after(async () => {
      await refreshWindow(row.kind, row.short);
    });
  }

  const body = renderFeed({ row, window });

  //* A határidő megújítása a válasz után: naponta legfeljebb egyszer ír, de még
  //* annyival sem érdemes várakoztatni a naptárt.
  after(async () => {
    await touchFeed(token, stored);
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      //* A végződés itt is szerepel: van kliens, ami a fejlécből veszi a nevet.
      "Content-Disposition": `inline; filename="orarend-${row.short}.ics"`,
      //! `private`, ÉS EZ NEM ÓVATOSKODÁS. A válasz személyre szabott (a diák
      //! csoportválasztásai szerint szűrt), a cím viszont egyetlen karakterben
      //! sem utal rá — egy köztes gyorsítótár, ami csak a címet nézi, nem is
      //! tudná, hogy nem szabad megosztania. A `max-age` a naptárnak szól:
      //! ennél sűrűbben nincs értelme kérdezni, mert mi se frissítünk.
      "Cache-Control": `private, max-age=${FEED_REFRESH_MINUTES * 60}`,
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
