import "server-only";

//! A STATISZTIKA-OLDAL BELÉPTETÉSE
//!
//! Egyetlen titok véd mindent: a `STATS_KEY`. Ugyanaz a kulcs nyitja a
//! `/api/hasznalat` GET-jét (fejlécben) és ezt az oldalt (jelszóként) — nem két
//! külön titok, mert ugyanahhoz az egy dologhoz adnak hozzáférést, és két
//! kulcsot kétszer lehet elrontani.
//!
//! A SÜTIBE SOHA NEM A JELSZÓ KERÜL. Egy lejárati időbélyeg megy bele, a
//! titokkal aláírva (HMAC-SHA256). Így a süti önmagában nem árulja el a
//! jelszót, és lejárat után magától érvénytelen.

export const STATS_COOKIE = "orarend_stats";

//* Egy hét: elég ahhoz, hogy ne kelljen minden megnyitáskor beírni, és elég
//* rövid ahhoz, hogy egy elfelejtett munkamenet ne éljen örökké.
export const SESSION_SECONDS = 60 * 60 * 24 * 7;

function secret(): string | null {
  const value = process.env.STATS_KEY;
  //! ÜRES TITOK NEM TITOK. Ha nincs beállítva, az oldal NE engedjen be senkit —
  //! a hiányzó env-változó nem jelentheti azt, hogy bárki bejut.
  return value && value.length > 0 ? value : null;
}

export function statsAuthConfigured(): boolean {
  return secret() !== null;
}

const encoder = new TextEncoder();

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

//! IDŐFÜGGETLEN ÖSSZEHASONLÍTÁS. Két azonos hosszú hexet hasonlítunk, végig —
//! a ciklus nem áll meg az első eltérésnél, tehát a válaszidőből nem derül ki,
//! hányadik karakterig volt jó a tipp.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

//* A jelszót és a titkot ELŐBB hasheljük, és a fix hosszú lenyomatokat vetjük
//* össze — így a hosszkülönbség sem szivárog ki.
export async function passwordMatches(input: string): Promise<boolean> {
  const key = secret();
  if (!key) return false;
  const [givenHash, keyHash] = await Promise.all([sha256(input), sha256(key)]);
  return constantTimeEqual(givenHash, keyHash);
}

async function sign(payload: string): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(payload),
  );
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSessionToken(): Promise<string | null> {
  const expiresAt = Date.now() + SESSION_SECONDS * 1000;
  const payload = String(expiresAt);
  const signature = await sign(payload);
  return signature ? `${payload}.${signature}` : null;
}

export async function sessionIsValid(
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt)) return false;

  //! ELŐSZÖR AZ ALÁÍRÁST ELLENŐRIZZÜK, csak utána a lejáratot: a lejárat a
  //! payload része, tehát addig nem hihetünk neki, amíg nem tudjuk, hogy nem
  //! írták át.
  const expected = await sign(payload);
  if (!expected || !constantTimeEqual(signature, expected)) return false;

  return expiresAt > Date.now();
}
