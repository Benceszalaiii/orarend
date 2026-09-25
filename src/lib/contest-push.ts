import "server-only";

import { loadLiveCompetitions } from "./competition-store";
import {
  budapestDayKey,
  contestReminderText,
  dueContestReminders,
} from "./competitions";
import { budapestNow } from "./push-plan";
import { sendPush } from "./push-send";
import { contestSubscribersOf, leaseContestReminder } from "./push-store";

//! ═══════════════════════════════════════════════════════════════════════════
//! A KÖVETETT VERSENYEK — A HÁTTÉRFELADAT ÁGA
//! ═══════════════════════════════════════════════════════════════════════════
//! Az `/api/ertesites/tick` hívja, a szakkörök után. Naponta legfeljebb egy
//! jelzés fajtánként (három nappal / egy nappal a határidő előtt, a kezdés
//! előtti napon), délután négykor — lásd `dueContestReminders`. A Jedlikinfót
//! nem kérdezi: a verseny adata a mi adatbázisunkban él.
//! ═══════════════════════════════════════════════════════════════════════════

export type ContestTally = { reminders: number; dropped: number };

export async function runContest(
  slug: string,
  tally: ContestTally,
  now = new Date(),
): Promise<void> {
  const subscribers = await contestSubscribersOf(slug);
  if (subscribers.length === 0) return;
  const contest = (await loadLiveCompetitions()).find((c) => c.slug === slug);
  if (!contest) return;

  const dayKey = budapestDayKey(now);
  for (const kind of dueContestReminders(
    contest,
    now,
    budapestNow(now).minutes,
  )) {
    if (!(await leaseContestReminder(slug, kind, dayKey))) continue;
    const { title, body } = contestReminderText(kind, contest);
    const result = await sendPush(subscribers, {
      kind: "change",
      title,
      body,
      url: `/versenyek/${slug}`,
      tag: `orarend-contest-${slug}-${kind}`,
    });
    tally.reminders += result.sent;
    tally.dropped += result.dropped;
  }
}
