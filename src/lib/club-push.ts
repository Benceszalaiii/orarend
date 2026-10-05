import "server-only";

import {
  clubChangeText,
  clubReminderText,
  dueClubReminders,
  goneSessionIds,
  newlyGone,
  sessionsOfWeek,
} from "./club-schedule";
import { loadScheduleClubs } from "./club-store";
import { loadRoomsWeek } from "./free-rooms-source";
import { budapestNow } from "./push-plan";
import { sendPush } from "./push-send";
import { LEAD_MINUTES, LEAD_WINDOW_MINUTES } from "./push-shared";
import {
  clubSubscribersOf,
  leaseClubChange,
  leaseClubReminder,
  readClubGone,
  writeClubGone,
} from "./push-store";
import { mondayOf } from "./timetable";

//! ═══════════════════════════════════════════════════════════════════════════
//! A KÖVETETT SZAKKÖRÖK — A HÁTTÉRFELADAT ÁGA
//! ═══════════════════════════════════════════════════════════════════════════
//! Az `/api/ertesites/tick` hívja, az órarend-alanyok után, szakkörönként
//! sorban. Ugyanaz a két jelzés, mint az óráknál: tíz perccel előtte, és ha
//! egy alkalom kiesik az iskola órarendjéből (vagy tanítás nélküli napra
//! esik). A számítás a `club-schedule.ts` tiszta függvényeiben él; itt csak a
//! lekérés, a foglalás és a küldés.
//!
//! A JEDLIKINFÓT UGYANAZ A TEREMENKÉNTI GYORSÍTÓTÁR VÉDI, mint az órarendi
//! rácsét (`loadRoomsWeek`): egy szakkör egy-két terem, óránként egyszer.
//! ═══════════════════════════════════════════════════════════════════════════

export type ClubTally = { reminders: number; changes: number; dropped: number };

export async function runClub(slug: string, tally: ClubTally): Promise<void> {
  const subscribers = await clubSubscribersOf(slug);
  if (subscribers.length === 0) return;

  //* Megszűnt (vagy törölt) szakkörről nincs mit mondani; a feliratkozók a
  //* szakkör lapján látják, hogy megszűnt.
  const club = (await loadScheduleClubs()).find((c) => c.slug === slug);
  if (!club) return;

  const now = budapestNow();
  const weekStart = mondayOf(now.dayKey);
  const rooms = club.slots.flatMap((s) =>
    s.source === "TIMETABLE" && s.room ? [s.room] : [],
  );
  const occupancy = await loadRoomsWeek(rooms, weekStart).catch(() => null);
  const sessions = sessionsOfWeek([club], occupancy, weekStart);

  //* ─── Változás: újonnan kiesett alkalom ────────────────────────────────
  //! CSAK HA VAN MIHEZ HASONLÍTANI. Lekérhetetlen hétnél (`occupancy` null)
  //! minden alkalom `unknown`, azaz egyik sem „esett ki" — a lenyomatot ilyenkor
  //! nem is írjuk felül, különben a következő sikeres lekérés minden hiányzót
  //! újnak látna.
  if (occupancy) {
    const before = await readClubGone(slug, weekStart);
    await writeClubGone(slug, weekStart, goneSessionIds(sessions));
    const gone = newlyGone({ sessions, before, fromDayKey: now.dayKey });
    if (gone.length > 0) {
      const fingerprint = gone.map((s) => s.id).join("|");
      if (await leaseClubChange(slug, fingerprint)) {
        const { title, body } = clubChangeText(gone);
        const result = await sendPush(subscribers, {
          kind: "change",
          title,
          body,
          url: `/szakkorok/${slug}`,
          tag: `orarend-club-change-${slug}`,
        });
        tally.changes += result.sent;
        tally.dropped += result.dropped;
      }
    }
  }

  //* ─── Emlékeztető: tíz perccel előtte ──────────────────────────────────
  for (const session of dueClubReminders(
    sessions,
    now,
    LEAD_MINUTES,
    LEAD_WINDOW_MINUTES,
  )) {
    if (!(await leaseClubReminder(session.id))) continue;
    const { title, body } = clubReminderText(session, LEAD_MINUTES);
    const result = await sendPush(subscribers, {
      kind: "lesson",
      title,
      body,
      url: `/szakkorok/${slug}`,
      tag: `orarend-club-${session.id}`,
    });
    tally.reminders += result.sent;
    tally.dropped += result.dropped;
  }
}
