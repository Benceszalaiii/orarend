import { clubsLaunched } from "./club-access";
import { loadFollowedClubs } from "./club-follow";
import type { ClubSession } from "./club-schedule";
import { loadClubSuggest } from "./club-suggest-pref";
import type { CalendarEvent, TimetableSubjectKind } from "./timetable";

//! ═══════════════════════════════════════════════════════════════════════════
//! SZAKKÖR-ALKALMAK A RÁCSON — A BÖNGÉSZŐ OLDALA
//! ═══════════════════════════════════════════════════════════════════════════
//! A rács már tud „eseményt" rajzolni (`EventCard`, `EventBody`) — ez a modul
//! csak a `/api/szakkorok/orarend` válaszát fordítja arra az alakra.
//!
//! SOHA NEM DOB, ÉS NEM VÁRAKOZTAT. Az órarend a lényeg; ha a szakkörök
//! lekérése elhasal vagy lassú, a rács nélkülük rajzol ki (üres lista), nem
//! hibával és nem később.
//! ═══════════════════════════════════════════════════════════════════════════

//! A BEVEZETÉS ELŐTTI ELŐNÉZET JELÖLŐJE. A kapcsoló (`clubsLaunched`) előtt a
//! rács csak annál kéri le a szakköröket, aki már megnyitotta a szakkörlistát
//! tanárként vagy adminként — különben minden diák minden hét-lapozása egy
//! biztosan üres kérés volna. A jelölő csak kényelmi: a szerver a választ így
//! is a belépett felhasználó joga szerint adja.
export const CLUBS_PREVIEW_KEY = "orarend:clubs-preview:v1";

export function markClubsPreview(): void {
  try {
    localStorage.setItem(CLUBS_PREVIEW_KEY, "1");
  } catch {
    //* Privát mód, tele tárhely — az előnézet ilyenkor elmarad, semmi más.
  }
}

export function clubsVisibleHere(): boolean {
  if (clubsLaunched()) return true;
  try {
    return localStorage.getItem(CLUBS_PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
}

export function sessionToEvent(session: ClubSession): CalendarEvent {
  return {
    id: session.id,
    title: session.clubName,
    dayOfWeek: session.dayOfWeek,
    startMin: session.startMin,
    endMin: session.endMin,
    room: session.room,
    szakkorName: session.clubName,
    szakkorSlug: session.clubSlug,
    kozossegi: false,
    //! A KÉT „NINCS" ÁLLAPOT ÁTHÚZVA. Ha a tanév rendje szerint nincs tanítás,
    //! vagy a terem órarendjében nincs ott, a diák ne induljon el — de a kártya
    //! ott marad, és a részletlap megmondja, miért van áthúzva.
    cancelled: session.status === "missing" || session.status === "no-school",
    status: session.status,
    ...(session.suggested ? { suggested: true } : {}),
  };
}

const CLUB_FETCH_TIMEOUT_MS = 3_000;

export async function fetchClubEvents(
  kind: TimetableSubjectKind,
  short: string,
  weekStart: string,
): Promise<{ short: string; events: CalendarEvent[] }> {
  const empty = { short, events: [] };
  if (!short || typeof window === "undefined" || !clubsVisibleHere()) {
    return empty;
  }
  const param = kind === "teacher" ? "tanar" : "osztaly";
  //* A követett szakkörök is a rácsra kerülnek (lásd a végpont fejlécét). A
  //* lista rendezett, így ugyanaz a követés mindig ugyanazt a címet adja — a
  //* CDN-gyorsítótár ezen múlik.
  const followed = loadFollowedClubs() ?? [];
  const extra =
    followed.length > 0
      ? `&klubok=${followed.map(encodeURIComponent).join(",")}`
      : "";
  const suggest = kind === "class" && loadClubSuggest() ? "&javaslat=1" : "";
  try {
    const res = await fetch(
      `/api/szakkorok/orarend?${param}=${encodeURIComponent(short)}&het=${weekStart}${extra}${suggest}`,
      { signal: AbortSignal.timeout(CLUB_FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return empty;
    const body = (await res.json()) as { sessions?: ClubSession[] };
    return {
      short,
      events: Array.isArray(body.sessions)
        ? body.sessions.map(sessionToEvent)
        : [],
    };
  } catch {
    return empty;
  }
}
