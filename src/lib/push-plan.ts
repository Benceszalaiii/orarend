//* ---------------------------------------------------------------------------
//* MIT KÜLDJÜNK KI, ÉS MIKOR — TISZTA SZÁMÍTÁS
//* ---------------------------------------------------------------------------
//! ITT NINCS SE HÁLÓZAT, SE TÁROLÓ, SE `Date.now()` REJTVE. Minden bemenet
//! paraméter: az órarend, a mostani idő és a beállítások. Ez nem stílus
//! kérdése — az értesítés az a funkció, amit a legnehezebb kipróbálni (a
//! hibája egy elmaradt vagy éjjel megszólaló telefon, két nappal később).
//! Ha az „mikor" és a „mit" egy tiszta függvényben áll, akkor bármelyik
//! időpontra végigjátszható anélkül, hogy meg kellene várni.

import { minLabel } from "@/components/timetable/shared";
import { LEAD_MINUTES, LEAD_WINDOW_MINUTES } from "./push-shared";
import type { TimetableLesson } from "./timetable";

const TIME_ZONE = "Europe/Budapest";

//! A SZERVER UTC-BEN FUT, A CSENGŐ NEM. Az órarend percei helyi (budapesti)
//! idők éjféltől számolva; ha a szerver a saját óráját használná, a nyári
//! időszámításban egy, télen két órával mellé küldene minden emlékeztetőt.
//* Ugyanaz a megfontolás, mint a `usage-day.ts`-ben — csak ott a naphatár, itt
//* a napon belüli perc a tét.
const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type BudapestNow = {
  /** `YYYY-MM-DD` budapesti nap. */
  dayKey: string;
  /** Percek budapesti éjfél óta. */
  minutes: number;
};

export function budapestNow(now = new Date()): BudapestNow {
  const [hour, minute] = clockFormatter.format(now).split(":").map(Number);
  return { dayKey: dayFormatter.format(now), minutes: hour * 60 + minute };
}

//! MEDDIG „UGYANAZ A BLOKK". A rendes szünet a Jedliken 10–15 perc; 20 percig
//! még nyugodtan mondható, hogy a diák bent maradt az épületben és a következő
//! óra ugyanannak a menetnek a folytatása. Ennél hosszabb rés viszont már
//! lyukasóra vagy ebéd — onnan VISSZA kell érni valahonnan, és ott van értelme
//! szólni.
const SAME_BLOCK_GAP = 20;

//* Egy kiküldendő emlékeztető: egy IDŐPONT, nem egy óra. A bontott órák
//* ugyanabban a percben kezdődnek, és a szerver nem tudja (és nem is akarja
//* tudni), melyik csoport a diáké — ezért egy jelzésben soroljuk fel őket.
export type Reminder = {
  dayKey: string;
  startMin: number;
  /** A percben kezdődő órák tantárgyai, duplikátum nélkül. */
  subjects: string[];
  /** Ugyanazok a tantárgyak a forrás rövid nevén (`mat`, `Szang`). */
  subjectsShort: string[];
  /** A hozzájuk tartozó termek, duplikátum nélkül. */
  rooms: string[];
};

function uniq(values: readonly string[]): string[] {
  return [...new Set(values.filter((v) => v.trim().length > 0))];
}

//! CSAK A TANÓRA. A forrás vizsgát és rendezvényt is küldhet (`kind`); azokra
//! nem szólunk, mert nem az van a csengetési rendben, és nem is mindenkinek
//! szól.
function lessonsOfDay(
  lessons: readonly TimetableLesson[],
  dayKey: string,
): TimetableLesson[] {
  return lessons
    .filter((l) => l.dateKey === dayKey && l.kind === "class")
    .sort((a, b) => a.startMin - b.startMin);
}

//* Mely kezdési időpontok érdemelnek jelzést: a nap első órája, és minden
//* olyan, ami `SAME_BLOCK_GAP`-nál hosszabb rés után jön. `everyLesson`
//* esetén mindegyik.
export function reminderStarts(
  lessons: readonly TimetableLesson[],
  dayKey: string,
  everyLesson: boolean,
): number[] {
  const day = lessonsOfDay(lessons, dayKey);
  if (day.length === 0) return [];

  const starts = [...new Set(day.map((l) => l.startMin))].sort((a, b) => a - b);
  if (everyLesson) return starts;

  //* Egy kezdés akkor blokk-kezdet, ha ELŐTTE nem ért véget óra a szüneten
  //* belül. A vizsgálat minden órát néz, nem csak az előző kezdést: a bontott
  //* órák eltérő hosszúak lehetnek, és a leghosszabbik zárja a szünetet.
  return starts.filter((start) => {
    const closedBefore = day.some(
      (l) => l.endMin <= start && start - l.endMin <= SAME_BLOCK_GAP,
    );
    return !closedBefore;
  });
}

//! AZ ABLAK, NEM A PILLANAT. `now` ritkán esik pont a `start - 10` percre — az
//! ütemező késik, a hidegindítás is idő. Ezért a `[notifyAt, notifyAt + ablak)`
//! félig nyílt tartomány dönt, és a KÉTSZERES kiküldést nem ez zárja ki, hanem
//! a tárolóban lefoglalt kulcs (lásd `push-store.ts`). Két külön védelem, mert
//! az egyik a késést tűri el, a másik az ismétlést.
export function dueReminders(input: {
  lessons: readonly TimetableLesson[];
  now: BudapestNow;
  everyLesson: boolean;
}): Reminder[] {
  const { lessons, now, everyLesson } = input;
  const starts = reminderStarts(lessons, now.dayKey, everyLesson);
  const day = lessonsOfDay(lessons, now.dayKey);

  return starts
    .filter((start) => {
      const notifyAt = start - LEAD_MINUTES;
      return (
        now.minutes >= notifyAt && now.minutes < notifyAt + LEAD_WINDOW_MINUTES
      );
    })
    .map((start) => {
      const here = day.filter((l) => l.startMin === start);
      return {
        dayKey: now.dayKey,
        startMin: start,
        subjects: uniq(here.map((l) => l.subject || l.subjectShort)),
        subjectsShort: uniq(here.map((l) => l.subjectShort || l.subject)),
        rooms: uniq(here.map((l) => l.room)),
      };
    });
}

//! MEDDIG FÉR EL A CÍM. A rendszersáv egy sorban vágja el az értesítés címét
//! (Androidon ~40, iOS-en még kevesebb karakter) — és a vágás pont a VÉGÉT
//! nyeli el, vagyis a „10 perc múlva" részt. Egy „Hálózat programozása és IoT
//! elmélet altantár…" cím tehát nem hosszú, hanem HASZNÁLHATATLAN: nem derül
//! ki belőle, mi a jelzés.
const SUBJECT_BUDGET = 34;

//* Az emlékeztető szövege. A cím a LÉNYEG (mi jön), a törzs a részlet (mikor,
//* hol) — a rendszersávban gyakran csak a cím látszik.
export function reminderText(
  reminder: Reminder,
  classShort: string,
): { title: string; body: string } {
  //! HA TÖBB TANTÁRGY KEZDŐDIK EGYSZERRE, MIND KIÍRJUK. A szerver az OSZTÁLYT
  //! ismeri, a csoportot nem (a csoportbontás döntése a böngészőben marad,
  //! lásd `/adatvedelem`) — így nem tudjuk, melyik a diáké. Egy találgatott
  //! tantárgynév rosszabb a felsorolásnál: az utóbbiból a diák egy pillanat
  //! alatt kiválasztja a sajátját, az előbbiről viszont nem derül ki, hogy
  //! tipp volt.
  const full = reminder.subjects.join(" / ");
  //! A RÖVIDÍTÉS NEM CSONKÍTÁS. Ha a teljes név nem fér el, NEM vágjuk el a
  //! közepén — a forrás saját rövid nevét vesszük elő (`mat`, `Szang`, `wins`),
  //! ugyanazt, ami a rácson is ott áll. A diák azt látja nap mint nap, tehát
  //! felismeri; egy három ponttal levágott mondatot viszont nem.
  const subject =
    full.length <= SUBJECT_BUDGET
      ? full
      : reminder.subjectsShort.join(" / ") || full;
  const where =
    reminder.rooms.length > 0 ? ` — ${reminder.rooms.join(" / ")}` : "";
  return {
    title: `${subject || "Óra"} ${LEAD_MINUTES} perc múlva`,
    //* A teljes név a törzsben marad meg, ha a címből kiszorult: ott van hely,
    //* és kinyitva a diák így is elolvashatja, miről van szó.
    body:
      subject === full
        ? `${classShort} · ${minLabel(reminder.startMin)}${where}`
        : `${full}\n${classShort} · ${minLabel(reminder.startMin)}${where}`,
  };
}

//* ---------------------------------------------------------------------------
//* VÁLTOZÁSFIGYELÉS
//* ---------------------------------------------------------------------------
//! A JEDLIKINFO NEM MONDJA MEG, MI VÁLTOZOTT. Nincs helyettesítés-végpont, a
//! „áthelyezve" jelölés pedig ritkán van bekapcsolva (lásd `timetable.ts`).
//! Az EGYETLEN megbízható út: eltesszük, mit láttunk legutóbb, és
//! összehasonlítjuk azzal, amit most kaptunk. A lenyomat ezért nem
//! optimalizálás, hanem maga a funkció.

/** Egy hét lenyomata: órahely → az óra tartalma. */
export type WeekSnapshot = Record<string, string>;

//* A KULCS a HELY (nap, kezdés, hányadik csoport), az ÉRTÉK a TARTALOM. Így a
//* teremcsere „változás" lesz, nem pedig egy törlés és egy új óra — a diák a
//* kettőt nem ugyanúgy olvassa.
function slotKey(l: TimetableLesson): string {
  return `${l.dateKey}|${l.startMin}|${l.groupColumn}`;
}

function slotValue(l: TimetableLesson): string {
  return [
    l.subjectShort || l.subject,
    l.teacherShort || l.teacher,
    l.room,
    String(l.endMin),
    l.moved ? "moved" : "",
  ].join("|");
}

export function snapshotWeek(
  lessons: readonly TimetableLesson[],
): WeekSnapshot {
  const snap: WeekSnapshot = {};
  for (const l of lessons) {
    if (l.kind !== "class") continue;
    snap[slotKey(l)] = slotValue(l);
  }
  return snap;
}

export type ChangeKind = "added" | "removed" | "moved" | "changed";

export type Change = {
  kind: ChangeKind;
  dayKey: string;
  startMin: number;
  /** Egy soros, kész mondat a felhasználónak. */
  text: string;
};

function parseSlot(key: string): { dayKey: string; startMin: number } {
  const [dayKey, startMin] = key.split("|");
  return { dayKey, startMin: Number(startMin) };
}

function parseValue(value: string) {
  const [subject, teacher, room, endMin, moved] = value.split("|");
  return { subject, teacher, room, endMin, moved: moved === "moved" };
}

const weekdayFormatter = new Intl.DateTimeFormat("hu-HU", {
  weekday: "long",
});

function dayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  //* Dél, hogy se az időzóna, se a nyári időszámítás ne tolja át másik napra.
  return weekdayFormatter.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function describeFieldChange(
  before: ReturnType<typeof parseValue>,
  after: ReturnType<typeof parseValue>,
): string | null {
  if (before.subject !== after.subject) {
    return `${before.subject} helyett ${after.subject}`;
  }
  if (before.room !== after.room) {
    return `${after.subject} terem: ${before.room || "—"} → ${after.room || "—"}`;
  }
  if (before.teacher !== after.teacher) {
    return `${after.subject} tanár: ${before.teacher || "—"} → ${after.teacher || "—"}`;
  }
  if (before.endMin !== after.endMin) {
    return `${after.subject} vége: ${minLabel(Number(before.endMin))} → ${minLabel(Number(after.endMin))}`;
  }
  //! AZ „ÁTHELYEZVE" JELÖLÉS MEGJELENÉSE ÖNMAGÁBAN IS HÍR. Ilyenkor a tartalom
  //! változatlan, csak a forrás mondja meg, hogy az óra nem a rendes helyén
  //! van — ezt továbbadjuk, mert pont ez az, amit a rácson is kiemelünk.
  if (!before.moved && after.moved) {
    return `${after.subject} áthelyezve`;
  }
  return null;
}

//! CSAK A JÖVŐ SZÁMÍT. A tegnapi óra teremcseréjéről szólni bosszantó és
//! haszontalan; a `fromDayKey` (a mai nap) alatti minden eltérést eldobunk.
//! Ez egyben a forrás visszamenőleges rendezgetése ellen is véd — a Jedlikinfo
//! a lezárt heteket is szokta pontosítani.
export function diffWeeks(input: {
  before: WeekSnapshot;
  after: WeekSnapshot;
  fromDayKey: string;
}): Change[] {
  const { before, after, fromDayKey } = input;
  const changes: Change[] = [];
  const addedKeys: string[] = [];
  const removedKeys: string[] = [];

  for (const [key, value] of Object.entries(after)) {
    const slot = parseSlot(key);
    if (slot.dayKey < fromDayKey) continue;
    const old = before[key];
    if (old === undefined) {
      addedKeys.push(key);
      continue;
    }
    if (old === value) continue;
    const text = describeFieldChange(parseValue(old), parseValue(value));
    if (text) {
      changes.push({
        kind: "changed",
        ...slot,
        text: `${dayLabel(slot.dayKey)} ${minLabel(slot.startMin)} — ${text}`,
      });
    }
  }

  for (const key of Object.keys(before)) {
    if (key in after) continue;
    const slot = parseSlot(key);
    if (slot.dayKey < fromDayKey) continue;
    removedKeys.push(key);
  }

  //! AZ ELTOLT ÓRA NEM KÉT ESEMÉNY. Ha ugyanaz a tantárgy ugyanazon a napon
  //! eltűnt az egyik időpontból és megjelent egy másikban, akkor ÁTKERÜLT —
  //! „elmarad" + „új óra" párként kiírva a diák azt hinné, két dolog történt,
  //! és az elsőre hiába számít.
  const usedAdded = new Set<string>();
  for (const removedKey of removedKeys) {
    const slot = parseSlot(removedKey);
    const gone = parseValue(before[removedKey]);
    const pair = addedKeys.find((k) => {
      if (usedAdded.has(k)) return false;
      const there = parseSlot(k);
      return (
        there.dayKey === slot.dayKey &&
        parseValue(after[k]).subject === gone.subject
      );
    });
    if (pair) {
      usedAdded.add(pair);
      const to = parseSlot(pair);
      changes.push({
        kind: "moved",
        dayKey: slot.dayKey,
        startMin: to.startMin,
        text: `${dayLabel(slot.dayKey)} — ${gone.subject} ${minLabel(slot.startMin)} → ${minLabel(to.startMin)}`,
      });
      continue;
    }
    changes.push({
      kind: "removed",
      ...slot,
      text: `${dayLabel(slot.dayKey)} ${minLabel(slot.startMin)} — ${gone.subject} elmarad`,
    });
  }

  for (const key of addedKeys) {
    if (usedAdded.has(key)) continue;
    const slot = parseSlot(key);
    const fresh = parseValue(after[key]);
    changes.push({
      kind: "added",
      ...slot,
      text: `${dayLabel(slot.dayKey)} ${minLabel(slot.startMin)} — ${fresh.subject} (új óra)`,
    });
  }

  return changes.sort((a, b) =>
    a.dayKey === b.dayKey
      ? a.startMin - b.startMin
      : a.dayKey.localeCompare(b.dayKey),
  );
}

//* Hány tétel fér a törzsbe. A rendszersáv ennél többet úgysem mutat
//* kinyitás nélkül, és a lényeg — hogy VAN változás — az első sorból kiderül.
const CHANGE_LINES = 3;

export function changeText(
  changes: readonly Change[],
  classShort: string,
): { title: string; body: string } {
  const shown = changes.slice(0, CHANGE_LINES).map((c) => c.text);
  const rest = changes.length - shown.length;
  if (rest > 0) shown.push(`+${rest} további változás`);
  return {
    title:
      changes.length === 1
        ? `Változott a ${classShort} órarendje`
        : `${changes.length} változás a ${classShort} órarendjében`,
    body: shown.join("\n"),
  };
}

//! A KIKÜLDÉS FOGLALÁSÁNAK KULCSA. Ugyanaz a változáshalmaz kétszer ne menjen
//! ki: ha a következő lekérés ugyanazt a különbséget látja (mert a lenyomat
//! mentése elbukott, vagy a feladat újraindult), a kulcs már foglalt lesz.
export function changeFingerprint(changes: readonly Change[]): string {
  let hash = 5381;
  const joined = changes
    .map((c) => `${c.kind}:${c.dayKey}:${c.startMin}`)
    .join(";");
  for (let i = 0; i < joined.length; i++) {
    hash = ((hash << 5) + hash + joined.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}
