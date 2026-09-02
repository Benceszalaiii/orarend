//! AZ OSZTÁLYLISTA A KULCSTÉR HATÁRA. Szabad szöveget sosem írunk a tárolóba:
//! amit elfogadunk, az vagy szerepel a suli saját listájában, vagy legalább úgy
//! néz ki, mint egy osztálynév. Enélkül bárki tetszőleges kulcsot hozhatna létre
//! — a használati statisztikában és az értesítés-feliratkozásokban egyaránt.
//*
//* Ez a modul azért él külön, mert KÉT végpont hivatkozik rá (`/api/hasznalat`
//* és `/api/ertesites`), és a kettő határa nem csúszhat el egymástól: ha az
//* egyik szigorúbb, a másik lesz a nyitott ajtó.

const JEDLIK_CLASSES = "https://jedlikinfo.jedlik.eu/api/api/timetable/classes";

//* A tényleges osztálynevek (`09A`, `09KNY`, `13C`) alakja. Ez a tartalék, ha a
//* Jedlikinfo listája épp nem érhető el — így egy külső kimaradás nem nyeli el
//* egy egész nap adatát, és nem is teszi lehetetlenné a feliratkozást.
const CLASS_SHAPE = /^\d{2}[A-ZÁÉÍÓÖŐÚÜŰ]{1,4}$/;

//! A HOSSZKORLÁT AZ ELSŐ SZŰRŐ, a regex és a lista csak utána jön: egy
//! megabájtos „osztálynévvel" egyiket se kelljen megfuttatni.
export const CLASS_MAX_LENGTH = 8;

export function looksLikeClass(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= CLASS_MAX_LENGTH &&
    CLASS_SHAPE.test(value)
  );
}

export async function isKnownClass(short: string): Promise<boolean> {
  if (typeof short !== "string" || short.length > CLASS_MAX_LENGTH) {
    return false;
  }
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

//* Több osztály egyszerre (feliratkozás): egyetlen listalekérésből dolgozik,
//* mert a `fetch` `revalidate`-je a kéréseket úgyis összevonja.
export async function filterKnownClasses(
  values: readonly string[],
): Promise<string[]> {
  const checked = await Promise.all(
    values.map(async (v) => ((await isKnownClass(v)) ? v : null)),
  );
  return checked.filter((v): v is string => v !== null);
}
