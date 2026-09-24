import { describe, expect, test } from "bun:test";
import {
  CALENDAR_TOKEN_BYTES,
  createCalendarToken,
  feedLinks,
  feedPath,
  googleCalendarUrl,
  httpsFeedUrl,
  isCalendarToken,
  sanitizeFeedRequest,
  webcalUrl,
} from "./calendar-shared";

describe("sanitizeFeedRequest", () => {
  test("érvényes osztály-kérés", () => {
    expect(
      sanitizeFeedRequest({
        short: " 12A ",
        prefs: [{ clusterKey: "k", chosen: "c" }, "x"],
        dual: { A: [1, 1, 9], B: [] },
      }),
    ).toEqual({
      kind: "class",
      short: "12A",
      prefs: [{ clusterKey: "k", chosen: "c" }],
      dual: { A: [1], B: [] },
    });
  });

  test("tanár-kérés, duális nélkül", () => {
    expect(
      sanitizeFeedRequest({
        kind: "teacher",
        short: "LM",
        prefs: null,
        dual: null,
      }),
    ).toEqual({
      kind: "teacher",
      short: "LM",
      prefs: [],
      dual: null,
    });
  });

  test("ismeretlen fajta osztálynak számít", () => {
    expect(sanitizeFeedRequest({ kind: "room", short: "12A" })?.kind).toBe(
      "class",
    );
  });

  test("érvénytelen alany vagy bemenet: null", () => {
    expect(sanitizeFeedRequest({ short: "LM" })).toBeNull();
    expect(sanitizeFeedRequest({ kind: "teacher", short: "12A" })).toBeNull();
    expect(sanitizeFeedRequest({ short: 12 })).toBeNull();
    expect(sanitizeFeedRequest(null)).toBeNull();
    expect(sanitizeFeedRequest([])).toBeNull();
    expect(sanitizeFeedRequest("12A")).toBeNull();
  });

  test("szemét duális: null helyett üres beosztás nem lesz belőle", () => {
    expect(sanitizeFeedRequest({ short: "12A", dual: "x" })?.dual).toBeNull();
  });
});

describe("jegyek", () => {
  test("22 karakteres base64url, nem ismétlődik", () => {
    const a = createCalendarToken();
    const b = createCalendarToken();
    expect(a).toHaveLength(Math.ceil((CALENDAR_TOKEN_BYTES * 4) / 3));
    expect(isCalendarToken(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/[+/=]/);
  });

  test("az őr csak a pontos alakot fogadja", () => {
    expect(isCalendarToken("a".repeat(22))).toBe(true);
    expect(isCalendarToken("a".repeat(21))).toBe(false);
    expect(isCalendarToken(`${"a".repeat(21)}/`)).toBe(false);
    expect(isCalendarToken(null)).toBe(false);
  });
});

describe("címek", () => {
  const token = "AbCdEfGhIjKlMnOpQrStUv";

  test("az út és a három link", () => {
    expect(feedPath(token)).toBe(`/api/naptar/${token}.ics`);
    expect(webcalUrl("https://orarend.hu", token)).toBe(
      `webcal://orarend.hu/api/naptar/${token}.ics`,
    );
    expect(webcalUrl("http://localhost:3000", token)).toBe(
      `webcal://localhost:3000/api/naptar/${token}.ics`,
    );
    expect(httpsFeedUrl("https://orarend.hu", token)).toBe(
      `https://orarend.hu/api/naptar/${token}.ics`,
    );
    expect(googleCalendarUrl("https://orarend.hu", token)).toBe(
      `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`https://orarend.hu/api/naptar/${token}.ics`)}`,
    );
  });

  test("feedLinks mind a hármat egyben adja", () => {
    const links = feedLinks("https://orarend.hu", token);
    expect(links).toEqual({
      token,
      webcal: webcalUrl("https://orarend.hu", token),
      https: httpsFeedUrl("https://orarend.hu", token),
      google: googleCalendarUrl("https://orarend.hu", token),
    });
  });
});
