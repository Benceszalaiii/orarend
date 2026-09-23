import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type FakeBrowser, installBrowser, stubFetch, uninstallBrowser } from "@/test/browser";
import { reportClassUse } from "./usage";
import { usageDayKey } from "./usage-day";

let b: FakeBrowser;
let stub: ReturnType<typeof stubFetch>;
beforeEach(() => {
  b = installBrowser();
  stub = stubFetch(() => new Response(null, { status: 204 }));
});
afterEach(() => {
  stub.restore();
  uninstallBrowser();
});

describe("reportClassUse", () => {
  test("osztályonként naponta egyszer jelent", () => {
    reportClassUse("12A");
    reportClassUse("12A");
    reportClassUse("10B");
    expect(stub.calls).toHaveLength(2);
    const [first] = stub.calls;
    expect(first.url).toBe("/api/hasznalat");
    expect(first.init?.method).toBe("POST");
    expect(first.init?.keepalive).toBe(true);
    expect(JSON.parse(first.init?.body as string)).toEqual({ class: "12A" });
  });

  test("tegnapi jelölő nem számít", () => {
    b.localStorage.setItem(
      "orarend:usage:v1",
      JSON.stringify({ date: "2000-01-01", classes: ["12A"] }),
    );
    reportClassUse("12A");
    expect(stub.calls).toHaveLength(1);
    expect(JSON.parse(b.localStorage.getItem("orarend:usage:v1") as string)).toEqual({
      date: usageDayKey(),
      classes: ["12A"],
    });
  });

  test("üres osztály: semmi", () => {
    reportClassUse(null);
    reportClassUse(undefined);
    reportClassUse("");
    expect(stub.calls).toHaveLength(0);
  });

  //! Dobó tárhelynél NEM jelentünk: különben minden megnyitás újra számítana.
  test("dobó tárhely: nincs jelentés", () => {
    b.localStorage.broken = true;
    reportClassUse("12A");
    expect(stub.calls).toHaveLength(0);
  });

  test("a hálózati hiba nem szökik ki", async () => {
    stub.restore();
    stub = stubFetch(() => Promise.reject(new Error("offline")));
    expect(() => reportClassUse("12A")).not.toThrow();
    await Bun.sleep(0);
  });
});

describe("szerveren", () => {
  test("semmi", () => {
    uninstallBrowser();
    reportClassUse("12A");
    expect(stub.calls).toHaveLength(0);
  });
});
