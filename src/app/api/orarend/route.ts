import {
  fetchTimetableClasses,
  fetchTimetableTeachers,
  getTimetableWeek,
  mondayOf,
  type TimetableErrorKind,
} from "@/lib/timetable";

//! ─── AZ ÓRAREND, KÖZVETÍTVE ────────────────────────────────────────────────
//! A Jedlikinfo `timetable/cards` végpontja csak a SAJÁT felületének válaszol:
//! `Origin` és `Referer` nélkül 403 (lásd `jedlik-api.ts`). Egy chatbot vagy
//! bármilyen külső kliens ezt nem tudja megadni — a legtöbb csak GET-et tud,
//! fejlécet egyáltalán nem. Ez a végpont a KÖZVETÍTŐ: a szerver kéri le a hetet
//! a helyes fejlécekkel, és egyszerű GET-re JSON-t ad vissza. A leírása a
//! `/llms.txt`-ben van.
//*
//* Nyilvános, mint maga az órarend: bejelentkezés nélkül ugyanez látszik a
//* `/orarend` lapon is. Nincs benne semmi, ami egy diákról szólna.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SUBJECT_LENGTH = 64;

//! A JEDLIKINFO NEM A MI SZERVERÜNK. Egy hét adata percek alatt nem változik,
//! ezért a CDN rövid ideig kiszolgálhatja ugyanazt — így száz egyforma kérésből
//! nem lesz száz kérés az iskola felé.
const WEEK_CACHE =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=900";
const LIST_CACHE =
  "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";

//* A hiba fajtájából a HTTP-kód: a kérdező hibája 4xx, a forrásé 5xx.
const ERROR_STATUS: Record<TimetableErrorKind, number> = {
  "no-class": 400,
  "unknown-class": 404,
  offline: 502,
  network: 502,
  timeout: 504,
  server: 502,
  request: 502,
  payload: 502,
};

function clock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h < 10 ? "0" : ""}${h}:${m < 10 ? "0" : ""}${m}`;
}

//* Ugyanaz az alak, mint a Jedlikinfo-hibáké, hogy a hívónak egy fajta
//* hibát kelljen olvasnia.
function badRequest(message: string) {
  return Response.json(
    {
      error: {
        kind: "bad-request",
        title: "Hibás kérés",
        message,
        hint: "A paraméterek leírása: /llms.txt",
        retryable: false,
      },
    },
    { status: 400 },
  );
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const className = params.get("osztaly")?.trim() || null;
  const teacher = params.get("tanar")?.trim() || null;
  const week = params.get("het")?.trim() || undefined;

  //! ALANY NÉLKÜL A LISTA. Aki nem tudja, milyen jelek léteznek, itt kérdezi
  //! meg — ugyanazt, amiből a lap választóját is töltjük.
  if (!className && !teacher) {
    const [classes, teachers] = await Promise.all([
      fetchTimetableClasses(),
      fetchTimetableTeachers(),
    ]);
    const error = classes.error ?? teachers.error;
    if (error) {
      return Response.json({ error }, { status: ERROR_STATUS[error.kind] });
    }
    return Response.json(
      { classes: classes.classes, teachers: teachers.subjects },
      { headers: { "Cache-Control": LIST_CACHE } },
    );
  }

  //! PONTOSAN EGY ALANY. A Jedlikinfo két kitöltött szűrőből nem metszetet ad,
  //! hanem kiszámíthatatlan választ (lásd `getTimetableWeek`).
  if (className && teacher) {
    return badRequest(
      "Az `osztaly` és a `tanar` közül csak az egyiket add meg.",
    );
  }
  const subject = (className ?? teacher) as string;
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return badRequest("Túl hosszú osztály- vagy tanárjel.");
  }
  if (week && !DATE_PATTERN.test(week)) {
    return badRequest("A `het` paraméter alakja `ÉÉÉÉ-HH-NN`.");
  }

  const result = await getTimetableWeek(
    className
      ? { kind: "class", class: className, weekStart: week }
      : { kind: "teacher", teacher, weekStart: week },
  );

  if (!result.ok || result.error) {
    const error = result.error;
    return Response.json(
      { error, weekStart: result.weekStart ?? mondayOf(week) },
      { status: error ? ERROR_STATUS[error.kind] : 502 },
    );
  }

  //* A perceket órára is kiírjuk: a géppel olvasó kliensnek ne kelljen
  //* visszaszámolnia, mikor kezdődik a harmadik óra.
  return Response.json(
    {
      kind: result.kind,
      subject: result.subject,
      weekStart: result.weekStart,
      days: result.days,
      periods: result.periods.map((p) => ({
        ...p,
        start: clock(p.startMin),
        end: clock(p.endMin),
      })),
      lessons: result.lessons.map((l) => ({
        ...l,
        start: clock(l.startMin),
        end: clock(l.endMin),
      })),
    },
    { headers: { "Cache-Control": WEEK_CACHE } },
  );
}
