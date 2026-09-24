import { afterEach, describe, expect, test } from "bun:test";
import { installBrowser, uninstallBrowser } from "@/test/browser";
import { launchPour, readPour } from "./pour";

//! A sugár maga `motion` rugókkal hajtott DOM-animáció — itt csak a kapukat
//! nézzük: szerveren és csökkentett mozgásnál semmi nem indul, és a
//! befogadó oldal ilyenkor nem talál cseppet.

afterEach(uninstallBrowser);

const box = () =>
  ({
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }),
  }) as unknown as HTMLElement;

describe("pour", () => {
  test("szerveren nem indul, és nincs mit olvasni", () => {
    expect(() =>
      launchPour({ id: "rooms", row: box(), icon: null, cell: box() }),
    ).not.toThrow();
    expect(readPour("rooms")).toBeNull();
  });

  test("csökkentett mozgásnál nem indul", () => {
    installBrowser({ media: { "(prefers-reduced-motion: reduce)": true } });
    launchPour({ id: "rooms", row: box(), icon: null, cell: box() });
    expect(readPour("rooms")).toBeNull();
  });

  test("ismeretlen hely: null", () => {
    installBrowser();
    expect(readPour(undefined)).toBeNull();
  });
});
