import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  createCalendarToken,
  feedLinks,
  isCalendarToken,
  MAX_CALENDAR_BYTES,
  sanitizeFeedRequest,
} from "@/lib/calendar-shared";
import {
  calendarStoreReady,
  readFeed,
  removeFeed,
  writeFeed,
} from "@/lib/calendar-store";
import { isKnownClass, isKnownTeacher } from "@/lib/known-class";

//! ═══════════════════════════════════════════════════════════════════════════
//! A NAPTÁR-LINK LÉTREHOZÁSA, FRISSÍTÉSE ÉS VISSZAVONÁSA
//! ═══════════════════════════════════════════════════════════════════════════
//! A KÉRÉST MINDIG A DIÁK INDÍTJA. Nincs automatikus feliratkozás: a link
//! akkor és csak akkor születik meg, amikor valaki megnyomja a gombot. Ez nem
//! forma kérdése — EZ AZ A PILLANAT, amikor a csoportbontás-döntései a
//! szerverre kerülnek (lásd `calendar-shared.ts` fejléce), tehát nem történhet
//! meg anélkül, hogy kérte volna.
//!
//! A FRISSÍTÉS UGYANEZ A VÉGPONT. A döntés a link létrehozása után is
//! megváltozhat; a lap ilyenkor ugyanazt a jegyet küldi vissza új listával
//! (lásd `calendar-local.ts`). Ezért nincs külön PATCH: egy feliratkozás
//! állapota egyetlen sor, és azt egészben írjuk.
//!
//! AKI A JEGYET ISMERI, AZ A FELIRATKOZÁS TULAJDONOSA. Nincs is más, ami
//! alapján dönthetnénk: a vendég-feliratkozásnak nincs fiókja. Ebből következik,
//! hogy a linket továbbadva nem csak az órarend NÉZÉSÉT adjuk tovább, hanem a
//! szűrés átírását is — a felületen ezért áll ott, hogy a link magánügy.
//! ═══════════════════════════════════════════════════════════════════════════

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

//! A CÍM ELŐSZÖR A BEÁLLÍTÁSBÓL. Ugyanaz a környezeti változó, amire a belépés
//! is épül (`BETTER_AUTH_URL`): élesben ez az EGYETLEN megbízható eredet. A
//! kérés saját `Host` fejléce csak tartalék — fejlesztéskor ér vele valamit, aki
//! a telefonjáról nyitja meg a gépén futó kiszolgálót.
function originOf(request: Request): string {
  const configured = process.env.BETTER_AUTH_URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = request.headers.get("host");
  if (!host) return "";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

//! ─── A TANÁRI FEED IGAZOLÁST KÉR, AZ OSZTÁLYOS NEM ─────────────────────────
//! Szó szerint ugyanaz a határ, mint az értesítéseknél (`/api/ertesites`), és
//! ugyanaz az érv: az OSZTÁLY órarendje nyilvános — bárki megnyithatja a lapon,
//! tehát a naptár-feed sem ad hozzá semmit. A TANÁRI más: ez EGY EMBER
//! munkanapját teszi be egy idegen naptárba, folyamatosan frissülve.
//!
//! ÉS ITT EGY FOKKAL SÚLYOSABB A TÉT, MINT A PUSH-NÁL. Az értesítés egy
//! készülékre megy, amit a tanár maga kapcsolt be; ez viszont egy LINK, amit
//! tovább lehet adni, és a kapó onnantól folyamatosan látja, hol van.
//! Tanári feedet ezért kizárólag iskolai belépéssel, tanárként igazolt fiók
//! hozhat létre — a mezőt az iskola rendszere mondja meg, a kliens nem tudja
//! átírni (lásd `jedlik-ad.ts`, `auth.ts`).
async function sessionUser(): Promise<{
  id: string;
  isTeacher: boolean;
} | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return null;
    return {
      id: session.user.id,
      isTeacher: session.user.isTeacher === true,
    };
  } catch {
    //* A munkamenet-lekérés bukása NEM jogosultság — és nem is hiba: a vendég
    //* feliratkozás ugyanezt az ágat járja.
    return null;
  }
}

export async function POST(request: Request) {
  if (!calendarStoreReady()) {
    //* Tároló nélkül a feliratkozásnak nincs hova kerülnie. Ezt nem hallgatjuk
    //* el: a diák épp most kért egy linket, és egy olyan cím, ami sosem ad
    //* órarendet, rosszabb, mint egy tiszta hibaüzenet.
    return json({ error: "A naptár-feed most nem érhető el." }, 503);
  }

  //* Előbb a méret, aztán az elemzés — ugyanaz a sorrend, mint a
  //* beállítás-szinkronnál: egy óriási törzs JSON-elemzése önmagában is munka.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_CALENDAR_BYTES) return json({ error: "too-large" }, 413);

  const raw = await request.text();
  if (new Blob([raw]).size > MAX_CALENDAR_BYTES) {
    return json({ error: "too-large" }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid-json" }, 400);
  }

  const wanted = sanitizeFeedRequest(body);
  if (!wanted) return json({ error: "invalid-request" }, 400);

  const user = await sessionUser();
  if (wanted.kind === "teacher" && !user?.isTeacher) {
    return json({ error: "teacher-session-required" }, 403);
  }

  //! A LÉTEZÉST A JEDLIKINFO LISTÁJA MONDJA MEG, NEM AZ ALAK. Egy kitalált
  //! osztálynév nem csak egy szemét sor: a feed MINDEN lekérésénél öt kérést
  //! indítana a suli szerverére egy nem létező alanyra. Ugyanaz a kétlépcsős
  //! szabály, mint az értesítés-feliratkozásnál (`known-class.ts`), és ugyanaz a
  //! tartalék: ha a lista épp nem érhető el, az ALAK dönt — egy külső kimaradás
  //! ne tegye lehetetlenné a feliratkozást.
  const exists =
    wanted.kind === "teacher"
      ? await isKnownTeacher(wanted.short)
      : await isKnownClass(wanted.short);
  if (!exists) return json({ error: "unknown-subject" }, 400);

  //! A MEGLÉVŐ JEGY FRISSÍTÉSE, VAGY EGY ÚJ. A kliens a saját jegyét küldi
  //! vissza, ha van; ismeretlen (visszavont, lejárt) jegyre NEM írunk a kliens
  //! által megadott címre — új jegyet adunk. Enélkül egy tetszőleges,
  //! kitalált jegy alatt lehetne sort létrehozni, és azzal a „kitalálhatatlan
  //! cím" védelme szűnne meg.
  const given = (body as { token?: unknown } | null)?.token;
  const existing =
    isCalendarToken(given) && (await readFeed(given)) ? given : null;
  const token = existing ?? createCalendarToken();

  await writeFeed(token, { ...wanted, userId: user?.id ?? null });

  const origin = originOf(request);
  return json({
    ...feedLinks(origin, token),
    //* A kliens ebből tudja, hogy a fiókhoz kötött ágon fut — a felület ilyenkor
    //* nem ígér többet, mint amit tud (lásd `calendar-feed-menu.tsx`).
    bound: user !== null,
  });
}

//! A VISSZAVONÁS AZONNALI. Nem „letiltás", nem „lejáratás": a sor eltűnik, és a
//! következő lekérés 404-et kap. Ez az egyetlen ellenszere annak, hogy egy
//! kiadott link később rossz helyre kerül.
export async function DELETE(request: Request) {
  if (!calendarStoreReady()) return json({ error: "unavailable" }, 503);

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!isCalendarToken(token)) return json({ error: "invalid-token" }, 400);

  await removeFeed(token);
  //* Ismeretlen jegyre is ugyanez a válasz: a törlés IDEMPOTENS, és abból sem
  //* derülhet ki, hogy a jegy létezett-e.
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
