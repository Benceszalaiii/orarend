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
import { dualStatusFor } from "./dual-schedule";
import { dualBlockLesson } from "./dualis";
import type { DualScheduleEntry } from "./prefs-shared";
import { LEAD_MINUTES, LEAD_WINDOW_MINUTES } from "./push-shared";
import type { TimetableLesson, TimetableSubjectKind } from "./timetable";
import { type MergePreference, resolveDay } from "./timetable-merge";

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
  //! AZ OSZTÁLY CSAK A TANÁRI LEKÉRÉSBEN VAN KITÖLTVE, és pont ott a LEGFŐBB
  //! információ (lásd `TimetableLesson.classShort`). Osztály-nézetben a forrás
  //! üresen hagyja — ilyenkor ez a lista is üres marad, és a szöveg a
  //! tantárgyra épül, ahogy eddig.
  /** A percben kezdődő órák osztályai — a TANÁR nézetében. */
  classes: string[];
};

function uniq(values: readonly string[]): string[] {
  return [...new Set(values.filter((v) => v.trim().length > 0))];
}

//! CSAK A TANÓRA. A forrás vizsgát és rendezvényt is küldhet (`kind`); azokra
//! nem szólunk, mert nem az van a csengetési rendben, és nem is mindenkinek
//! szól.
//* A duális blokkot nem a forrás küldi: a személyes olvasat teszi a nap helyére
//* (lásd `personalLessons`). Azon a napon az az EGYETLEN tétel, tehát rá is
//* ugyanúgy szólunk, mint a nap első órájára.
const REMINDED_KINDS = new Set(["class", "dual"]);

function lessonsOfDay(
  lessons: readonly TimetableLesson[],
  dayKey: string,
): TimetableLesson[] {
  return lessons
    .filter((l) => l.dateKey === dayKey && REMINDED_KINDS.has(l.kind))
    .sort((a, b) => a.startMin - b.startMin);
}

//* ---------------------------------------------------------------------------
//* A SZEMÉLYES OLVASAT
//* ---------------------------------------------------------------------------
//! AZ ÉRTESÍTÉS AZT A NAPOT MONDJA, AMIT A RÁCS MUTAT. Ha a diák aznap
//! duálison van, a rácson egyetlen „Duális képzés" blokk áll; ha a
//! csoportbontásból a másik ágat rejtette el, az a rácson nincs ott. Egy
//! értesítés, ami ennek ellentmond, nem pontatlan, hanem téves riasztás.
//*
//! EZÉRT NEM ÍRJUK ÚJRA A SZŰRÉST — ugyanaz a megfontolás, mint a
//! `calendar-feed.ts`-ben: a rács saját függvényei futnak (`dualStatusFor`,
//! `resolveDay`), ugyanazzal a döntés-listával.
export type PersonalView = {
  //! A HÉT BETŰJE, NEM A NAPÉ. A Jedlikinfo egyes napokra üres jelölést ad (pl.
  //! egy tanítás nélküli hétfőre), a hét egészére viszont mindig ad betűt —
  //! ugyanaz a szabály, mint a rácson (`calendar.tsx`) és a feedben.
  /** A hét A/B jelölése (`weekLetterOf`), vagy `""`, ha nem tudjuk. */
  weekLetter: string;
  /** A feliratkozó duális beosztása erre az osztályra, ha van. */
  dual?: DualScheduleEntry;
  /** A feliratkozó csoportbontás-döntései erre az osztályra, ha vannak. */
  merge?: readonly MergePreference[];
};

export function weekLetterOf(days: readonly { week: string }[]): string {
  return days.find((d) => d.week === "A" || d.week === "B")?.week ?? "";
}

function hasDecisions(view: PersonalView): boolean {
  return Boolean(view.dual) || (view.merge?.length ?? 0) > 0;
}

//* Egy nap órái a feliratkozó szemével. Duális napon a nap helyén egyetlen
//* blokk áll; máskor a csoportbontásból csak a megtartott ág.
function personalDay(
  dayLessons: TimetableLesson[],
  view: PersonalView,
): TimetableLesson[] {
  //! CSAK OTT, AHOL VAN MIT FELVÁLTANI. Adat nélküli napra (szünet,
  //! forráshiba) nem találunk ki duális napot — a nap üressége a hír.
  if (dayLessons.length === 0) return [];
  if (
    dualStatusFor(
      view.dual ?? null,
      dayLessons[0].dayOfWeek,
      view.weekLetter,
    ) === "dual"
  ) {
    return [dualBlockLesson(dayLessons[0])];
  }
  return resolveDay(dayLessons, [...(view.merge ?? [])]).lessons;
}

/** A nap órái úgy, ahogy a feliratkozó rácsa mutatja — az emlékeztető bemenete. */
export function personalLessons(
  lessons: readonly TimetableLesson[],
  dayKey: string,
  view: PersonalView,
): TimetableLesson[] {
  return personalDay(
    lessons.filter((l) => l.dateKey === dayKey && l.kind === "class"),
    view,
  );
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
        classes: uniq(here.map((l) => l.classShort || l.className)),
      };
    });
}

//! MEDDIG FÉR EL A CÍM. A rendszersáv egy sorban vágja el az értesítés címét
//! (Androidon ~40, iOS-en még kevesebb karakter) — és a vágás pont a VÉGÉT
//! nyeli el, vagyis a „10 perc múlva" részt. Egy „Hálózat programozása és IoT
//! elmélet altantár…" cím tehát nem hosszú, hanem HASZNÁLHATATLAN: nem derül
//! ki belőle, mi a jelzés.
const SUBJECT_BUDGET = 34;

//! ─── A TANÁR EMLÉKEZTETŐJE MÁSRÓL SZÓL ─────────────────────────────────────
//! UGYANAZ AZ ESEMÉNY, MÁSIK ELSŐ MONDAT. A diáknak a TANTÁRGY a hír: azt nem
//! tudja fejből, melyik óra jön, a termét pedig hozzá keresi. A tanárnak a
//! tantárgya adott (azt tanítja egész nap) — neki az OSZTÁLY és a TEREM a
//! kérdés, pontosan úgy, ahogy a `/ma` tanári nézete is az osztállyal kezd
//! (lásd `NowBlock variant="teacher"`). A cím ezért nála az osztály; ami a
//! diáknál a címben állt, itt a törzsbe kerül.
//*
//* Ütközésnél (két osztály egy percben) mindkettő kiírásra kerül — a tanári
//* lap sem tünteti el egyiket sem, lásd `clashesOf`.
function teacherReminderText(reminder: Reminder): {
  title: string;
  body: string;
} {
  const where =
    reminder.rooms.length > 0 ? ` — ${reminder.rooms.join(" / ")}` : "";
  const subject = reminder.subjects.join(" / ");
  //* Osztály nélküli kártya (a forrás hibája) esetén a tantárgy lép a helyére:
  //* egy „ — 214" című értesítés semmit nem mondana.
  const who = reminder.classes.join(" / ") || subject || "Óra";
  return {
    title: `${who} ${LEAD_MINUTES} perc múlva`,
    body: `${subject ? `${subject} · ` : ""}${minLabel(reminder.startMin)}${where}`,
  };
}

//* Az emlékeztető szövege. A cím a LÉNYEG (mi jön), a törzs a részlet (mikor,
//* hol) — a rendszersávban gyakran csak a cím látszik.
export function reminderText(
  reminder: Reminder,
  kind: TimetableSubjectKind,
  classShort: string,
): { title: string; body: string } {
  if (kind === "teacher") return teacherReminderText(reminder);

  //! HA TÖBB TANTÁRGY KEZDŐDIK EGYSZERRE, MIND KIÍRJUK. Aki a csoportbontásban
  //! döntött, annál ide már csak a megtartott ág jut el (`personalLessons`);
  //! aki nem, annál a szerver nem tudja, melyik a diáké. Egy találgatott
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

//! AZ OSZTÁLY IS A LENYOMAT RÉSZE — DE CSAK OTT, AHOL VAN. A tanári lekérés
//! kártyáin a tanár mezője üres, és az OSZTÁLY hordozza az információt (lásd
//! `TimetableLesson`): enélkül egy „a 9.B helyett a 11.A jön" csere némán
//! kimaradna a változásfigyelésből. Osztály-nézetben a mező üres marad, tehát
//! ott a lenyomat tartalma nem változik.
//*
//* A MEZŐ HOZZÁVÉTELE NEM ÖNTI KI A RÉGI LENYOMATOKAT: a régi (öt mezős) és az
//* új (hat mezős) sor szövegként ugyan eltér, de mezőnként azonos — a
//* `describeFieldChange` ilyenkor `null`-t ad, és nem lesz belőle értesítés.
//*
//! A CSOPORT A SZEMÉLYES OLVASATHOZ KELL. A csoportbontás-döntés az óra
//! azonosságára szól (tantárgy + csoport + tanár, lásd `lessonIdentity`), és a
//! lenyomatból csak akkor rakható vissza, ha a csoport is benne van. Változást
//! önmagában nem jelez (`describeFieldChange` nem nézi).
function slotValue(l: TimetableLesson): string {
  return [
    l.subjectShort || l.subject,
    l.teacherShort || l.teacher,
    l.room,
    String(l.endMin),
    l.moved ? "moved" : "",
    l.classShort || l.className,
    l.group,
  ].join("|");
}

//* Hány mezős a mai lenyomat-érték — ennél rövidebb a csoport előtti.
const SLOT_FIELDS = 7;

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
  const [subject, teacher, room, endMin, moved, classShort, group] =
    value.split("|");
  return {
    subject,
    teacher,
    room,
    endMin,
    moved: moved === "moved",
    //* A tanári ág előtti lenyomatokban ez a mező nincs meg — `undefined`
    //* helyett üres szöveg, hogy az összehasonlítás ne hazudjon változást.
    classShort: classShort ?? "",
    group: group ?? "",
  };
}

//! AMIN AZ ÓRA NEVE MÚLIK. A diák lapján egy változás-sor a TANTÁRGGYAL
//! azonosítja az órát („matek terem: 214 → 305"); a tanárén ugyanez
//! használhatatlan volna, mert neki minden órája ugyanaz a tantárgy — ott az
//! OSZTÁLY különbözteti meg őket. Egyetlen helyen döntjük el, hogy a két
//! nézet sorai ne csússzanak el egymástól.
function slotLabel(v: ReturnType<typeof parseValue>): string {
  return v.classShort ? `${v.classShort} ${v.subject}` : v.subject;
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
  if (
    before.subject !== after.subject ||
    before.classShort !== after.classShort
  ) {
    return `${slotLabel(before)} helyett ${slotLabel(after)}`;
  }
  if (before.room !== after.room) {
    return `${slotLabel(after)} terem: ${before.room || "—"} → ${after.room || "—"}`;
  }
  if (before.teacher !== after.teacher) {
    return `${slotLabel(after)} tanár: ${before.teacher || "—"} → ${after.teacher || "—"}`;
  }
  if (before.endMin !== after.endMin) {
    return `${slotLabel(after)} vége: ${minLabel(Number(before.endMin))} → ${minLabel(Number(after.endMin))}`;
  }
  //! AZ „ÁTHELYEZVE" JELÖLÉS MEGJELENÉSE ÖNMAGÁBAN IS HÍR. Ilyenkor a tartalom
  //! változatlan, csak a forrás mondja meg, hogy az óra nem a rendes helyén
  //! van — ezt továbbadjuk, mert pont ez az, amit a rácson is kiemelünk.
  if (!before.moved && after.moved) {
    return `${slotLabel(after)} áthelyezve`;
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
      const fresh = parseValue(after[k]);
      //* Az azonosság a nézet szerinti címke: a tanárén az ugyanaz a
      //* tantárgy MÁS osztálynak nem ugyanaz az óra, tehát nem áthelyezés.
      return (
        there.dayKey === slot.dayKey && slotLabel(fresh) === slotLabel(gone)
      );
    });
    if (pair) {
      usedAdded.add(pair);
      const to = parseSlot(pair);
      changes.push({
        kind: "moved",
        dayKey: slot.dayKey,
        startMin: to.startMin,
        text: `${dayLabel(slot.dayKey)} — ${slotLabel(gone)} ${minLabel(slot.startMin)} → ${minLabel(to.startMin)}`,
      });
      continue;
    }
    changes.push({
      kind: "removed",
      ...slot,
      text: `${dayLabel(slot.dayKey)} ${minLabel(slot.startMin)} — ${slotLabel(gone)} elmarad`,
    });
  }

  for (const key of addedKeys) {
    if (usedAdded.has(key)) continue;
    const slot = parseSlot(key);
    const fresh = parseValue(after[key]);
    changes.push({
      kind: "added",
      ...slot,
      text: `${dayLabel(slot.dayKey)} ${minLabel(slot.startMin)} — ${slotLabel(fresh)} (új óra)`,
    });
  }

  return changes.sort((a, b) =>
    a.dayKey === b.dayKey
      ? a.startMin - b.startMin
      : a.dayKey.localeCompare(b.dayKey),
  );
}

//* ---------------------------------------------------------------------------
//* A SZEMÉLYES VÁLTOZÁS
//* ---------------------------------------------------------------------------
//! A LENYOMAT KÖZÖS, A HÍR SZEMÉLYES. A forrást alanyonként egyszer kérjük le,
//! és egyetlen lenyomatot tartunk — de a 13C egyik csoportjának teremcseréje a
//! másik csoportnak nem hír, a munkanapra eső elmaradás pedig annak sem, aki
//! aznap duálison van. Ezért MINDKÉT lenyomatot a feliratkozó szemével olvassuk
//! vissza, és a kettő különbsége a hír: pontosan az, ami az ő rácsán változott.

function isoDayOfWeek(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

//* A lenyomatból visszaépített óra — annyi mezővel, amennyi a `resolveDay`-nek
//* és az azonosságnak kell. A kulcs és az érték változatlanul megy tovább.
function slotLesson(key: string, value: string): TimetableLesson {
  const { dayKey, startMin } = parseSlot(key);
  const v = parseValue(value);
  return {
    key,
    dateKey: dayKey,
    dayOfWeek: isoDayOfWeek(dayKey),
    startMin,
    endMin: Number(v.endMin),
    subject: v.subject,
    subjectShort: v.subject,
    teacher: v.teacher,
    teacherShort: v.teacher,
    classShort: v.classShort,
    className: v.classShort,
    room: v.room,
    group: v.group,
    groupColumn: Number(key.split("|")[2]) || 0,
    groupCount: 1,
    wholeClass: true,
    week: "",
    moved: v.moved,
    kind: "class",
  };
}

function personalSnapshot(
  snapshot: WeekSnapshot,
  view: PersonalView,
): WeekSnapshot {
  const byDay = new Map<string, TimetableLesson[]>();
  for (const [key, value] of Object.entries(snapshot)) {
    const lesson = slotLesson(key, value);
    byDay.set(lesson.dateKey, [...(byDay.get(lesson.dateKey) ?? []), lesson]);
  }
  const out: WeekSnapshot = {};
  for (const lessons of byDay.values()) {
    for (const lesson of personalDay(lessons, view)) {
      //* A duális blokk nem lenyomat-tétel: azon a napon a közös lenyomat
      //* egyetlen változása sem hír, tehát a nap kimarad.
      if (lesson.kind === "class") out[lesson.key] = snapshot[lesson.key];
    }
  }
  return out;
}

export function personalChanges(input: {
  before: WeekSnapshot;
  after: WeekSnapshot;
  fromDayKey: string;
  view: PersonalView;
}): Change[] {
  const { before, after, fromDayKey } = input;
  if (!hasDecisions(input.view))
    return diffWeeks({ before, after, fromDayKey });

  //! A CSOPORT ELŐTTI LENYOMATON A DÖNTÉS NEM TALÁL. A régi értékből hiányzik a
  //! csoport, tehát az órák azonossága más, mint amire a döntés szól — a
  //! „before" oldalon minden ág látszana, az „after" oldalon csak a megtartott,
  //! és a különbségből hamis „elmarad" sorok lennének. Ilyenkor (hetente
  //! egyszer, az átállás után) a csoportbontást kihagyjuk; a duális nap
  //! azonosság nélkül is szűrhető, az marad.
  const legacy = Object.values(before).some(
    (v) => v.split("|").length < SLOT_FIELDS,
  );
  const view = legacy ? { ...input.view, merge: undefined } : input.view;
  return diffWeeks({
    before: personalSnapshot(before, view),
    after: personalSnapshot(after, view),
    fromDayKey,
  });
}

//* Hány tétel fér a törzsbe. A rendszersáv ennél többet úgysem mutat
//* kinyitás nélkül, és a lényeg — hogy VAN változás — az első sorból kiderül.
const CHANGE_LINES = 3;

export function changeText(
  changes: readonly Change[],
  kind: TimetableSubjectKind,
  short: string,
): { title: string; body: string } {
  const shown = changes.slice(0, CHANGE_LINES).map((c) => c.text);
  const rest = changes.length - shown.length;
  if (rest > 0) shown.push(`+${rest} további változás`);
  //! A NÉVELŐ AZ ALANY FAJTÁJÁN MÚLIK. Az osztály jele elé kell („a 13C
  //! órarendje"), a tanári jel elé NEM („Változott KJ órarendje") — egy közös
  //! mondatsablon az egyik nézeten mindig helytelenül szólna, és pont a
  //! rendszersávban, ahol egyetlen sor az egész üzenet.
  const who = kind === "teacher" ? short : `a ${short}`;
  return {
    title:
      changes.length === 1
        ? `Változott ${who} órarendje`
        : `${changes.length} változás ${who} órarendjében`,
    body: shown.join("\n"),
  };
}

//! A KIKÜLDÉS FOGLALÁSÁNAK KULCSA. Ugyanaz a változáshalmaz kétszer ne menjen
//! ki: ha a következő lekérés ugyanazt a különbséget látja (mert a lenyomat
//! mentése elbukott, vagy a feladat újraindult), a kulcs már foglalt lesz.
//*
//! A SZÖVEG IS A KULCS RÉSZE. Nélküle ugyanannak az órának a MÁSODIK
//! teremcseréje aznap (214 → 305, aztán 305 → 410) ugyanazt a kulcsot kapná,
//! és a nap hátralévő részében némán elnyelődne. A szöveg a tartalmat hordozza,
//! tehát két eltérő hír két kulcs.
export function changeFingerprint(changes: readonly Change[]): string {
  let hash = 5381;
  const joined = changes
    .map((c) => `${c.kind}:${c.dayKey}:${c.startMin}:${c.text}`)
    .join(";");
  for (let i = 0; i < joined.length; i++) {
    hash = ((hash << 5) + hash + joined.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}
