import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { isMenuItemId } from "@/lib/menu-items";
import { installBrowser, uninstallBrowser } from "@/test/browser";
import { launchFlight, PLACES, placeOf, readFlight } from "./places";

afterEach(uninstallBrowser);

describe("PLACES", () => {
  test("egyedi útvonalak és gyorsbillentyűk, ismert menüjelek", () => {
    expect(new Set(PLACES.map((p) => p.href)).size).toBe(PLACES.length);
    expect(new Set(PLACES.map((p) => p.hotkey)).size).toBe(PLACES.length);
    for (const p of PLACES) {
      expect(isMenuItemId(p.id)).toBe(true);
      expect(p.hotkey).toMatch(/^[a-z]$/);
    }
  });

  test("placeOf pontos egyezéssel", () => {
    expect(placeOf("/ugyelet")?.id).toBe("duty");
    expect(placeOf("/ugyelet/x")).toBeNull();
    expect(placeOf("/")).toBeNull();
  });
});

describe("repülés", () => {
  const el = {
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 40, height: 30 }),
  } as Element;

  test("a gomb közepéből indul, és csak a saját helyének szól", () => {
    installBrowser();
    launchFlight("rooms", el);
    expect(readFlight("rooms")).toMatchObject({
      id: "rooms",
      x: 30,
      y: 35,
      size: 40,
    });
    expect(readFlight("duty")).toBeNull();
    expect(readFlight(undefined)).toBeNull();
  });

  test("elem nélkül nem indul", () => {
    installBrowser();
    launchFlight("home", el);
    launchFlight("screens", null);
    expect(readFlight("screens")).toBeNull();
    expect(readFlight("home")).not.toBeNull();
  });

  test("1,4 másodperc után lejár", () => {
    installBrowser();
    const clock = spyOn(performance, "now").mockReturnValue(1000);
    launchFlight("duty", el);
    clock.mockReturnValue(2399);
    expect(readFlight("duty")).not.toBeNull();
    clock.mockReturnValue(2400);
    expect(readFlight("duty")).toBeNull();
    clock.mockRestore();
  });

  test("szerveren soha", () => {
    launchFlight("duty", el);
    expect(readFlight("duty")).toBeNull();
  });
});
