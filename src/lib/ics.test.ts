import { describe, expect, test } from "bun:test";
import { buildIcs, type IcsEvent, icsLocalTime, icsUtcStamp } from "./ics";

//! ═══════════════════════════════════════════════════════════════════════════
//! REGRESSZIÓS TESZT — MIÉRT ÉPP EZ
//! ═══════════════════════════════════════════════════════════════════════════
//! Egy elrontott iCalendar-fájl NEM hibát ad: a naptár némán nem importál,
//! vagy importál, de fél eseménnyel. Ezért pont azokat a szabályokat fogjuk le,
//! amiket a formátum előír, de semmi nem kényszerít ki:
//!
//!  • A HAJTÁS OKTETTBEN MÉR. Magyar tantárgynevekben minden ékezet két bájt —
//!    karakterben számolva a sorok túllógnának a 75-ös határon.
//!  • A HAJTÁS NEM VÁGHAT KARAKTERT. Egy félbevágott többbájtos karakter
//!    érvénytelen UTF-8-at ad, és onnantól a fájl maradéka is romlott.
//!  • AZ ESCAPE. A forrás tantárgynevei vesszőt és pontosvesszőt is
//!    tartalmaznak; escape nélkül ezek új mezőt kezdenek.
//!  • CRLF. LF-es feedet az Outlook eldob.
//! ═══════════════════════════════════════════════════════════════════════════

const STAMP = Date.UTC(2026, 8, 10, 6, 30, 0);

function calendar(events: IcsEvent[], name = "13C órarend") {
  return buildIcs({ name, events, stamp: STAMP, refreshMinutes: 60 });
}

function event(overrides: Partial<IcsEvent> = {}): IcsEvent {
  return {
    uid: "20260910-480-abc-def@orarend.jedlik.info",
    dateKey: "2026-09-10",
    startMin: 8 * 60,
    endMin: 8 * 60 + 45,
    summary: "Matematika",
    ...overrides,
  };
}

//* A hajtás visszafejtése: CRLF + egyetlen szóköz = semmi (RFC 5545 3.1).
function unfold(ics: string): string {
  return ics.replace(/\r\n /g, "");
}

function lines(ics: string): string[] {
  return unfold(ics).split("\r\n");
}

describe("idő és bélyeg", () => {
  test("a helyi idő a nyers budapesti percből áll, zóna-jelölés nélkül", () => {
    expect(icsLocalTime("2026-09-10", 8 * 60)).toBe("20260910T080000");
    expect(icsLocalTime("2026-09-10", 13 * 60 + 5)).toBe("20260910T130500");
  });

  test("a DTSTAMP UTC, másodpercre vágva", () => {
    expect(icsUtcStamp(Date.UTC(2026, 0, 2, 3, 4, 5))).toBe("20260102T030405Z");
  });
});

describe("szerkezet", () => {
  test("minden sor CRLF-fel zárul, LF magában nem fordul elő", () => {
    const ics = calendar([event()]);
    expect(ics.includes("\n")).toBe(true);
    //* Minden `\n` előtt `\r` áll — vagyis nincs magányos LF.
    expect(/[^\r]\n/.test(ics)).toBe(false);
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  test("a naptár burkolata és a VTIMEZONE a helyén van", () => {
    const out = lines(calendar([event()]));
    expect(out[0]).toBe("BEGIN:VCALENDAR");
    expect(out.at(-2)).toBe("END:VCALENDAR");
    expect(out).toContain("TZID:Europe/Budapest");
    //! A BEÁGYAZOTT ZÓNA NÉLKÜL az Outlook és több Android-naptár UTC-ként
    //! olvassa az időket — vagyis nyáron két órával máshova teszi az órát.
    expect(out).toContain("BEGIN:VTIMEZONE");
    expect(out).toContain("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU");
    expect(out).toContain("RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU");
  });

  test("az esemény ideje TZID-del megy ki, nem UTC-ben", () => {
    const out = lines(calendar([event()]));
    expect(out).toContain("DTSTART;TZID=Europe/Budapest:20260910T080000");
    expect(out).toContain("DTEND;TZID=Europe/Budapest:20260910T084500");
    //* Ha valaha UTC-re váltanánk, ez a sor jelenne meg — és vele a nyári
    //* időszámítás hibája. A VTIMEZONE saját `DTSTART:`-jai nem tartoznak ide,
    //* ezért csak az eseményt nézzük.
    const vevent = out.slice(out.indexOf("BEGIN:VEVENT"));
    expect(vevent.some((l) => l.startsWith("DTSTART:"))).toBe(false);
  });

  test("a frissítési tipp mindkét kliens-dialektusban ott van", () => {
    const out = lines(calendar([event()]));
    expect(out).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT60M");
    expect(out).toContain("X-PUBLISHED-TTL:PT60M");
  });

  test("az üres helyszín és leírás nem ad üres mezőt", () => {
    const out = lines(calendar([event({ location: "", description: "" })]));
    expect(out.some((l) => l.startsWith("LOCATION"))).toBe(false);
    expect(out.some((l) => l.startsWith("DESCRIPTION:"))).toBe(false);
  });
});

describe("escape", () => {
  test("a vessző, a pontosvessző és a visszaperjel escape-elve megy ki", () => {
    const out = lines(
      calendar([event({ summary: "Háló; IoT, elmélet\\gyak" })]),
    );
    expect(out).toContain("SUMMARY:Háló\\; IoT\\, elmélet\\\\gyak");
  });

  test("a sortörés az iCalendar saját `\\n`-je lesz, nem igazi sortörés", () => {
    const ics = calendar([event({ description: "KJ\n214" })]);
    expect(lines(ics)).toContain("DESCRIPTION:KJ\\n214");
    //! A NYERS SORTÖRÉS ITT A LEGÁRULKODÓBB HIBA: a leírás második sora
    //! érvénytelen tulajdonság-névként állna a fájlban, és a naptár az
    //! eseménytől kezdve mindent eldobna.
    expect(ics.includes("DESCRIPTION:KJ\r\n214")).toBe(false);
  });
});

describe("hajtás", () => {
  //* Hosszú, csupa ékezetes tantárgynév: karakterben 90, bájtban 180 alatt —
  //* vagyis karakter-alapú hajtással „átmenne", oktett-alapúval nem.
  const longSummary = "Hálózat programozása és IoT elmélet altantárgy".repeat(
    2,
  );

  test("egyetlen kimenő sor sem hosszabb 75 oktettnél", () => {
    const ics = calendar([event({ summary: longSummary })], longSummary);
    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  test("a hajtás visszafejtve pontosan az eredeti szöveget adja", () => {
    const ics = calendar([event({ summary: longSummary })]);
    expect(lines(ics)).toContain(`SUMMARY:${longSummary}`);
  });

  test("a hajtás nem vág félbe többbájtos karaktert", () => {
    const ics = calendar([event({ summary: "é".repeat(200) })]);
    //! AZ ÚJRAKÓDOLÁS A PRÓBA. Ha a hajtás egy karakter közepén esett volna, a
    //! bájtsorból dekódolt szöveg cserekaraktert (U+FFFD) tartalmazna.
    const round = new TextDecoder("utf-8", { fatal: true }).decode(
      new TextEncoder().encode(ics),
    );
    expect(round.includes("�")).toBe(false);
    expect(lines(ics)).toContain(`SUMMARY:${"é".repeat(200)}`);
  });

  test("a folytatósor szóközzel kezdődik", () => {
    const ics = calendar([event({ summary: longSummary })]);
    const raw = ics.split("\r\n");
    const first = raw.findIndex((l) => l.startsWith("SUMMARY:"));
    expect(raw[first + 1].startsWith(" ")).toBe(true);
  });
});
