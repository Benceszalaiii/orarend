import { readUsage, recordClassUse, usageStoreReady } from "@/lib/usage-store";

//! MI KERÜL A TÁROLÓBA, ÉS MI NEM
//!
//! Egyetlen adat: MELYIK OSZTÁLY órarendjét nyitották meg, napi bontásban.
//! Se eszközazonosító, se IP, se időbélyeg percre pontosan, se felhasználói
//! ügynök — semmi, amivel egy diák visszakereshető lenne. Egy osztály ~30 fős
//! csoport; a szám róluk együtt szól, nem bárki külön. Ez a megkötés nem
//! optimalizálás kérdése: ha bármi továbbit felvennénk ide, a mérés megszűnne
//! anonim lenni.
const JEDLIK_CLASSES = "https://jedlikinfo.jedlik.eu/api/api/timetable/classes";

//* A tényleges osztálynevek (`09A`, `09KNY`, `13C`) alakja. Ez a tartalék, ha a
//* Jedlikinfo listája épp nem érhető el — így egy külső kimaradás nem nyeli el
//* egy egész nap adatát.
const CLASS_SHAPE = /^\d{2}[A-ZÁÉÍÓÖŐÚÜŰ]{1,4}$/;

//! AZ OSZTÁLYLISTA A KULCSTÉR HATÁRA. Szabad szöveget sosem írunk a tárolóba:
//! amit elfogadunk, az vagy szerepel a suli saját listájában, vagy legalább úgy
//! néz ki, mint egy osztálynév. Enélkül bárki tetszőleges kulcsot hozhatna létre.
async function isKnownClass(short: string): Promise<boolean> {
  try {
    const res = await fetch(JEDLIK_CLASSES, {
      signal: AbortSignal.timeout(5_000),
      //* Óránként egyszer kérdezzük meg; az osztálylista tanév közben állandó.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return CLASS_SHAPE.test(short);
    const list = (await res.json()) as { short?: unknown }[];
    if (!Array.isArray(list) || list.length === 0)
      return CLASS_SHAPE.test(short);
    return list.some((c) => c?.short === short);
  } catch {
    return CLASS_SHAPE.test(short);
  }
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const short = (payload as { class?: unknown } | null)?.class;
  //! A hosszkorlát a JSON-parse utáni ELSŐ szűrő: egy megabájtos „osztálynévvel"
  //! se a regexet, se a listát ne kelljen megfuttatni.
  if (typeof short !== "string" || short.length > 8) {
    return new Response(null, { status: 400 });
  }
  if (!(await isKnownClass(short))) {
    return new Response(null, { status: 400 });
  }

  try {
    await recordClassUse(short);
  } catch {
    //! A SZÁMLÁLÓ HIBÁJA NEM A FELHASZNÁLÓ HIBÁJA. Ha a Redis nem elérhető, a
    //! kliens ne kapjon hibát és ne próbálkozzon újra — a statisztikából
    //! hiányzik egy sor, ennyi a kár.
    return new Response(null, { status: 204 });
  }

  //* 204: nincs mit visszaadni, és nem is akarjuk, hogy a kliens bármit
  //* megtudjon a számokból.
  return new Response(null, { status: 204 });
}

//! A KIOLVASÁS NEM NYILVÁNOS. Az összesített szám sem tartozik a látogatóra:
//! kulcs nélkül a végpont úgy viselkedik, mintha nem is lenne (404, nem 401) —
//! így a létezése sem derül ki. A kulcsot a `STATS_KEY` env-változó adja; ha
//! nincs beállítva, a GET egyáltalán nem működik.
export async function GET(request: Request) {
  const expected = process.env.STATS_KEY;
  const provided = request.headers.get("x-stats-key");
  if (!expected || provided !== expected) {
    return new Response(null, { status: 404 });
  }
  if (!usageStoreReady()) {
    return Response.json(
      { error: "nincs beállítva a tároló" },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const days = Math.min(
    Math.max(Number(url.searchParams.get("days") ?? 30) || 30, 1),
    400,
  );
  const usage = await readUsage(days);

  //* Összesítés a kért időszakra: osztályonként az eszköz-napok száma.
  const total: Record<string, number> = {};
  for (const day of usage) {
    for (const [short, count] of Object.entries(day.classes)) {
      total[short] = (total[short] ?? 0) + Number(count);
    }
  }
  const ranked = Object.entries(total)
    .map(([short, count]) => ({ class: short, count }))
    .sort((a, b) => b.count - a.count);

  return Response.json({ days, ranked, daily: usage });
}
