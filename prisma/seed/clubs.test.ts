import { describe, expect, test } from "bun:test";
import { clubSlug } from "../../src/lib/clubs";
import { SEED_CLUBS } from "./clubs";
import { checkAgainstJedlikinfo, checkShape } from "./validate";

function find(name: string) {
  const club = SEED_CLUBS.find((c) => c.name === name);
  if (!club) throw new Error(`Nincs ilyen szakkör: ${name}`);
  return club;
}

describe("a kezdő szakkörlista", () => {
  test("hibátlan alakú, egyedi URL-kulcsokkal", () => {
    expect(checkShape(SEED_CLUBS)).toEqual([]);
  });

  //* A lista 47 sora + a 10E kompetenciafejlesztés, ami a Jedlikinfóból jött.
  test("48 szakkör", () => {
    expect(SEED_CLUBS).toHaveLength(48);
  });

  //! Az eltéréseknél a Jedlikinfo nyer — ha valaki „visszajavítja" a lista
  //! szerintire, ez szól.
  test("ahol eltért, a Jedlikinfo adata áll benne", () => {
    expect(find("09. évf. fizika korrepetálás").slots[0].room).toBe("112");
    expect(find("09. évf. fizika korrepetálás").organizers).toEqual(["AA"]);
    expect(find("10C matematikai kompetenciafejlesztés").slots).toEqual([
      expect.objectContaining({ weekday: 5, room: "106" }),
    ]);
    expect(find("10E matematikai kompetenciafejlesztés").slots).toEqual([
      expect.objectContaining({ weekday: 2, room: "104" }),
    ]);
    expect(find("Tehetséggondozó szakkör (DÖK)").slots[0]).toMatchObject({
      room: "112",
      startMinute: 870,
      endMinute: 1090,
    });
    expect(find("Forgácsolás szakkör").slots[0]).toMatchObject({
      startMinute: 915,
      endMinute: 1000,
    });
  });

  test("amiről a Jedlikinfo hallgat, az csak-tanár-szerinti", () => {
    for (const name of ["Social média szakkör", "Rendszergazda szakkör"]) {
      expect(find(name).slots.every((s) => s.source === "ORGANIZER")).toBe(
        true,
      );
    }
  });

  test("az egyeztetés alatti szakköröknek nincs időpontja", () => {
    const pending = SEED_CLUBS.filter((c) => c.slots.length === 0).map(
      (c) => c.name,
    );
    expect(pending).toHaveLength(6);
    expect(pending).toContain("Hegesztés szakkör");
  });

  test("a leírást nem találjuk ki", () => {
    expect(SEED_CLUBS.every((c) => c.description === null)).toBe(true);
  });
});

describe("checkShape", () => {
  const base = find("Drón szakkör");

  test("ütköző URL-kulcs", () => {
    const twin = { ...base, name: "Drón  szakkör!" };
    expect(clubSlug(twin.name)).toBe(clubSlug(base.name));
    expect(checkShape([base, twin])).toEqual([
      expect.objectContaining({ club: "Drón  szakkör!" }),
    ]);
  });

  test("a séma hibái a szakkör nevével jönnek", () => {
    const broken = { ...base, organizers: [] };
    expect(checkShape([broken])[0].club).toBe("Drón szakkör");
  });
});

describe("checkAgainstJedlikinfo", () => {
  const lists = {
    teachers: new Set(["SK", "TGY"]),
    rooms: new Set(["204"]),
    classes: new Set(["13D"]),
  };

  test("ismert jelekkel nincs panasz", () => {
    expect(checkAgainstJedlikinfo([find("Drón szakkör")], lists)).toEqual([]);
  });

  test("minden ismeretlen jelet néven nevez", () => {
    const problems = checkAgainstJedlikinfo(
      [find("OSZTV elméleti felkészítés")],
      lists,
    ).map((p) => p.problem);
    expect(problems).toContain("Ismeretlen osztály: 13E");
    expect(problems).toContain("Ismeretlen terem: 205");
    expect(problems).not.toContain("Ismeretlen tanárjel: TGY");
  });

  test("terem nélküli időpont nem hiba", () => {
    const club = find("Rendszergazda szakkör");
    expect(
      checkAgainstJedlikinfo([club], {
        ...lists,
        teachers: new Set(["HF"]),
      }),
    ).toEqual([]);
  });
});
