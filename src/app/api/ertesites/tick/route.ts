import {
  budapestNow,
  changeFingerprint,
  changeText,
  diffWeeks,
  dueReminders,
  reminderStarts,
  reminderText,
  snapshotWeek,
} from "@/lib/push-plan";
import { pushSendReady, sendPush } from "@/lib/push-send";
import {
  leaseChange,
  leaseReminder,
  type PushSubscription,
  pushStoreReady,
  readSnapshot,
  readWeekCache,
  subscribedClasses,
  subscribersOf,
  writeSnapshot,
  writeWeekCache,
} from "@/lib/push-store";
import {
  addDays,
  getTimetableWeek,
  mondayOf,
  type TimetableLesson,
} from "@/lib/timetable";

//! ─── A HÁTTÉRFELADAT ───────────────────────────────────────────────────────
//!
//! Ez a végpont az EGYETLEN hely, ahonnan értesítés kimegy. Percenként fut
//! (kívülről hívja egy ütemező — lásd a READMÉ-t), és két kérdést tesz fel
//! minden olyan osztályra, amire van feliratkozó:
//!
//!   1. Kezdődik-e valamelyik óra 10 perc múlva? → emlékeztető.
//!   2. Változott-e a hét azóta, hogy utoljára megnéztük? → változás-jelzés.
//!
//! MINDKÉT VÁLASZ IDEMPOTENS. A feladat bármikor újraindulhat vagy kétszer is
//! lefuthat ugyanarra a percre (az ütemező újrapróbálkozik, az ablak több
//! tickre is igaz); a kiküldést ezért nem az ütemezés pontossága, a tárolóban
//! LEFOGLALT kulcs zárja ki (lásd `push-store.ts`). Ugyanaz a minta, mint a
//! jedlik-szakkor levélküldésének foglalásánál.

//* Egy perc bőven elég; a felső korlát csak azt akadályozza meg, hogy egy
//* beragadt külső kérés a platform alapértelmezett határáig üljön.
export const maxDuration = 60;

//! MILYEN SŰRŰN KÉRDEZZÜK MEG A SULI SZERVERÉT. NEM percenként: a feladat
//! percenként FUT (az emlékeztető perc-pontos), de az órarendet a
//! gyorsítótárból veszi, és csak ennyi idő után kér újat. A változásfigyelés
//! késése emiatt legfeljebb ennyi — cserébe a Jedlikinfo nem kap tőlünk
//! percenként annyi kérést, ahány osztályra feliratkoztak. Az órarend
//! forrásának megőrzése fontosabb, mint tíz perc előny egy teremcserénél.
const SOURCE_REFRESH_MS = 10 * 60 * 1000;

type Tally = { reminders: number; changes: number; dropped: number };

//* A hét óráinak beszerzése: gyorsítótárból, vagy friss lekéréssel — és a
//* friss lekérés az EGYETLEN pillanat, amikor változást lehet észrevenni.
async function loadWeek(input: {
  short: string;
  weekStart: string;
  todayKey: string;
  subscribers: readonly PushSubscription[];
  tally: Tally;
  /** A jövő hetet csak változásfigyelésre kérjük le, emlékeztetőre nem. */
  detectOnly: boolean;
}): Promise<TimetableLesson[]> {
  const { short, weekStart, todayKey, subscribers, tally, detectOnly } = input;

  const cached = await readWeekCache(short, weekStart);
  if (cached && Date.now() - cached.fetchedAt < SOURCE_REFRESH_MS) {
    return cached.lessons;
  }

  const week = await getTimetableWeek({ class: short, weekStart });
  if (!week.ok) {
    //! A FORRÁS KIMARADÁSA NEM VÁLTOZÁS. Ha a Jedlikinfo nem válaszol, az
    //! ELŐZŐ lenyomat marad érvényben — enélkül egy percnyi üzemzavarból
    //! „minden óra elmarad" jelzés lenne, aztán egy „minden óra új". A régi
    //! példányt viszont visszaadjuk, hogy az emlékeztetők menjenek tovább.
    return cached?.lessons ?? [];
  }

  await writeWeekCache(short, weekStart, week.lessons);

  const after = snapshotWeek(week.lessons);
  const before = await readSnapshot(short, weekStart);
  await writeSnapshot(short, weekStart, after);

  //! AZ ELSŐ LÁTÁS NEM HÍR. Ha még nincs mihez hasonlítani (új osztály, lejárt
  //! lenyomat), csak eltesszük — különben a legelső feliratkozó azzal kezdené,
  //! hogy megkapja az egész heti órarendjét „új óra" sorokként.
  if (before && subscribers.length > 0) {
    const changes = diffWeeks({ before, after, fromDayKey: todayKey });
    if (changes.length > 0) {
      const fingerprint = changeFingerprint(changes);
      if (await leaseChange(short, fingerprint)) {
        const { title, body } = changeText(changes, short);
        const result = await sendPush(subscribers, {
          kind: "change",
          title,
          body,
          //* A változást a heti rácson lehet a helyén megnézni, nem a napi
          //* nézetben: a jelzés több napról is szólhat.
          url: "/orarend",
          tag: `orarend-change-${short}`,
        });
        tally.changes += result.sent;
        tally.dropped += result.dropped;
      }
    }
  }

  return detectOnly ? [] : week.lessons;
}

async function runClass(short: string, tally: Tally): Promise<void> {
  const subscribers = await subscribersOf(short);
  if (subscribers.length === 0) return;

  const now = budapestNow();
  const weekStart = mondayOf(now.dayKey);

  const lessons = await loadWeek({
    short,
    weekStart,
    todayKey: now.dayKey,
    subscribers,
    tally,
    detectOnly: false,
  });

  //! A JÖVŐ HETET IS FIGYELJÜK. A péntek délutáni átszervezés a HÉTFŐI órát
  //! mozdítja el — ha csak a nézett hetet néznénk, arról a diák hétfő reggel
  //! értesülne, az iskola kapujában. Emlékeztetőre nem kell: mire a hét
  //! elkezdődik, az már a „nézett hét" lesz.
  await loadWeek({
    short,
    weekStart: addDays(weekStart, 7),
    todayKey: now.dayKey,
    subscribers,
    tally,
    detectOnly: true,
  });

  if (lessons.length === 0) return;

  //! A SŰRŰSÉG FELIRATKOZÓNKÉNT MÁS, AZ IDŐPONT NEM. Ezért a BŐVEBB halmazt
  //! számoljuk ki (minden óra), és soronként döntjük el, kinek szól: aki csak
  //! a blokk-kezdeteket kérte, annak csak azokat adjuk oda. Így egy időpontra
  //! egyetlen foglalás és egyetlen kiküldés jut, nem kettő.
  const blockStarts = new Set(reminderStarts(lessons, now.dayKey, false));
  const due = dueReminders({ lessons, now, everyLesson: true });

  for (const reminder of due) {
    const recipients = subscribers.filter(
      (s) => s.everyLesson || blockStarts.has(reminder.startMin),
    );
    //* Foglalni csak akkor foglalunk, ha van kinek küldeni — különben egy
    //* címzett nélküli időpont elhasználná a kulcsot, és egy percen belül
    //* érkező új feliratkozó már nem kapná meg.
    if (recipients.length === 0) continue;
    if (!(await leaseReminder(short, reminder.dayKey, reminder.startMin))) {
      continue;
    }
    const { title, body } = reminderText(reminder, short);
    const result = await sendPush(recipients, {
      kind: "lesson",
      title,
      body,
      url: "/ma",
      //* Napon és időponton belül egyedi: a mai emlékeztetők nem nyomják el
      //* egymást, a tegnapi viszont már nem áll ott.
      tag: `orarend-lesson-${short}-${reminder.dayKey}-${reminder.startMin}`,
    });
    tally.reminders += result.sent;
    tally.dropped += result.dropped;
  }
}

export async function GET(request: Request) {
  //! AZ ÜTEMEZŐ TITKA NÉLKÜL EZ A VÉGPONT NEM LÉTEZIK. 404, nem 401 — ugyanaz
  //! a döntés, mint a statisztika kiolvasásánál: aki nem tudja a kulcsot, az
  //! azt se tudja meg, hogy van itt valami, amit érdemes próbálgatni. A
  //! `CRON_SECRET`-et a külső ütemezőnek `Authorization: Bearer …`
  //! fejlécben kell küldenie.
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization");
  if (!expected || provided !== `Bearer ${expected}`) {
    return new Response(null, { status: 404 });
  }

  if (!pushStoreReady() || !pushSendReady()) {
    return Response.json(
      { error: "nincs beállítva a tároló vagy a VAPID kulcspár" },
      { status: 503 },
    );
  }

  const tally: Tally = { reminders: 0, changes: 0, dropped: 0 };
  const classes = await subscribedClasses();

  //! OSZTÁLYONKÉNT SORBAN, NEM EGYSZERRE. A párhuzamos futás egyetlen tickben
  //! annyi kérést zúdítana a Jedlikinfóra, ahány osztály van — pont azt a
  //! szervert terhelnénk meg, amiről az egész lap él. Egy osztály feldolgozása
  //! néhány tized másodperc; a sorban futás így is bőven belefér a percbe.
  for (const short of classes) {
    try {
      await runClass(short, tally);
    } catch {
      //* Egy osztály hibája ne vigye el a többiét: a következő tick úgyis
      //* újrapróbálja, és a foglalások miatt nem lesz belőle dupla küldés.
    }
  }

  return Response.json({ classes: classes.length, ...tally });
}

//! UGYANAZ A FELADAT POST-ra IS. Nem kényelmi másolat: a QStash (és a legtöbb
//! üzenetsoros ütemező) alapértelmezésben POST-tal hív, a metódust külön
//! fejlécben kell átállítani. Egy elfelejtett `Upstash-Method: GET` így nem
//! néma 405-öt hoz, hanem lefuttatja a tickt. A törzset nem olvassuk: a
//! bemenet az idő, nem a kérés.
export const POST = GET;
