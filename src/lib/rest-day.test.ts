import { describe, expect, test } from "bun:test";
import { describeRestDay, nightsUntil, weekendVoice } from "./rest-day";

const base = {
  weekend: false,
  teaching: false as boolean | null,
  notes: [] as string[],
  isToday: true,
};

describe("describeRestDay", () => {
  test("a hétvége mindent megelőz", () => {
    const day = describeRestDay({
      ...base,
      dateKey: "2026-12-25",
      weekend: true,
      notes: ["Téli szünet"],
    });
    expect(day).toMatchObject({
      kind: "weekend",
      season: "none",
      label: "Hétvége",
    });
  });

  test("a bejegyzés szava a címke, ékezet- és kisbetű-függetlenül", () => {
    const day = describeRestDay({
      ...base,
      dateKey: "2026-10-27",
      notes: ["ŐSZI SZÜNET"],
    });
    expect(day).toMatchObject({
      kind: "break",
      season: "autumn",
      label: "Őszi szünet",
      headline: "Őszi szünet",
    });
  });

  test("a húsvét tavaszi szünet", () => {
    expect(
      describeRestDay({
        ...base,
        dateKey: "2026-04-06",
        notes: ["Húsvéthétfő"],
      }),
    ).toMatchObject({
      kind: "break",
      season: "spring",
      label: "Húsvét",
    });
  });

  test("nyáron a bejegyzés nélküli nap is szünet", () => {
    expect(describeRestDay({ ...base, dateKey: "2026-07-10" })).toMatchObject({
      kind: "break",
      season: "summer",
      label: "Szünet",
      headline: "Nyári szünet",
    });
  });

  test("tanév közbeni tanítás nélküli nap: ünnep, a forrás szavával", () => {
    expect(
      describeRestDay({
        ...base,
        dateKey: "2026-05-01",
        notes: ["A munka ünnepe"],
      }),
    ).toMatchObject({
      kind: "holiday",
      season: "none",
      label: "A munka ünnepe",
      headline: "Ma nincs tanítás",
    });
    expect(describeRestDay({ ...base, dateKey: "2026-02-10" }).label).toBe(
      "Tanítás nélküli nap",
    );
  });

  test.each([
    ["2026-12-18", "Kezdődik a szünet", "christmas"],
    ["2026-12-24", "Áldott karácsonyt!", "christmas"],
    ["2026-12-28", "Két ünnep között", "christmas"],
    ["2026-12-31", "Boldog új évet!", "newyear"],
    ["2027-01-01", "Boldog új évet!", "newyear"],
    ["2027-01-05", "Még tart a szünet", "christmas"],
  ])("télen %s: %s", (dateKey, headline, season) => {
    const day = describeRestDay({ ...base, dateKey });
    expect(day.headline).toBe(headline);
    expect(day.season).toBe(season as never);
    expect(day.kind).toBe("break");
  });

  test("tanítási nap óra nélkül: szabadnap, a mai napra más szóval", () => {
    expect(
      describeRestDay({ ...base, dateKey: "2026-09-16", teaching: true }),
    ).toMatchObject({
      kind: "free",
      headline: "Ma nincs órád",
    });
    expect(
      describeRestDay({
        ...base,
        dateKey: "2026-09-16",
        teaching: null,
        isToday: false,
      }).headline,
    ).toBe("Ezen a napon nincs órád");
  });
});

describe("nightsUntil", () => {
  const at = (s: string) => new Date(s).getTime();

  test("péntek délutántól hétfő reggelig három éjfél", () => {
    expect(
      nightsUntil(at("2026-09-18T15:00:00"), at("2026-09-21T08:00:00")),
    ).toBe(3);
  });

  test("vasárnap estétől egy", () => {
    expect(
      nightsUntil(at("2026-09-20T20:00:00"), at("2026-09-21T08:00:00")),
    ).toBe(1);
  });

  test("ugyanazon a napon nulla", () => {
    expect(
      nightsUntil(at("2026-09-21T06:00:00"), at("2026-09-21T08:00:00")),
    ).toBe(0);
  });

  test("legfeljebb 14", () => {
    expect(
      nightsUntil(at("2026-07-01T12:00:00"), at("2026-09-01T08:00:00")),
    ).toBe(14);
  });

  test("az óraátállítás éjszakája is egy", () => {
    expect(
      nightsUntil(at("2026-10-24T12:00:00"), at("2026-10-26T08:00:00")),
    ).toBe(2);
  });
});

describe("weekendVoice", () => {
  test("több éjszaka szóval", () => {
    expect(weekendVoice({ nights: 3, remainingSec: 0 })).toBe(
      "Még három éjszaka, és köztük két teljes nap.",
    );
    expect(weekendVoice({ nights: 9, remainingSec: 0 })).toBe(
      "Még 9 éjszaka, és köztük 8 teljes nap.",
    );
  });

  test("egy éjszaka: napközben és az utolsó este", () => {
    expect(weekendVoice({ nights: 1, remainingSec: 20 * 3600 })).toContain(
      "A mai nap még a tiéd",
    );
    expect(weekendVoice({ nights: 1, remainingSec: 10 * 3600 })).toBe(
      "Az utolsó este. Reggel újra becsengetnek.",
    );
  });

  test("nulla: néhány óra", () => {
    expect(weekendVoice({ nights: 0, remainingSec: 3600 })).toBe(
      "Néhány óra, és újra becsengetnek.",
    );
  });
});
