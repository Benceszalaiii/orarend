import { describe, expect, test } from "bun:test";
import { createClockStore, isClockJump, msToNextSecond } from "./clock-store";

//* Kézzel léptetett óra és időzítő: a teszt dönti el, mikor „alszik" a gép.
function harness(start: Date) {
  let wall = start.getTime();
  let pending: { fn: () => void; at: number } | null = null;
  const doc = Object.assign(new EventTarget(), {
    visibilityState: "visible",
  });
  const win = new EventTarget();
  const store = createClockStore({
    now: () => new Date(wall),
    setTimeout: (fn, ms) => {
      pending = { fn, at: wall + ms };
      return pending;
    },
    clearTimeout: (id) => {
      if (pending === id) pending = null;
    },
    doc,
    win,
  });
  return {
    store,
    doc,
    win,
    //* Előre tekeri az órát, és lefuttatja az esedékes ütéseket.
    advance(ms: number) {
      const target = wall + ms;
      while (pending && pending.at <= target) {
        const job = pending;
        pending = null;
        //* A lekésett ütés (alvás után) MOST sül el, nem visszamenőleg.
        wall = Math.max(wall, job.at);
        job.fn();
      }
      wall = target;
    },
    //* Alvás: az óra halad, az időzítő NEM sül el.
    sleep(ms: number) {
      wall += ms;
    },
  };
}

describe("isClockJump", () => {
  test("rendes ütés nem ugrás", () => {
    expect(isClockJump(1_000, 2_005, true)).toBe(false);
  });
  test("hosszú szünet látható lapon ugrás", () => {
    expect(isClockJump(1_000, 1_000 + 60_000, true)).toBe(true);
  });
  test("rejtett lapon a ritkított ütem nem ugrás", () => {
    expect(isClockJump(1_000, 1_000 + 60_000, false)).toBe(false);
  });
  test("visszafelé állított óra ugrás", () => {
    expect(isClockJump(10_000, 2_000, true)).toBe(true);
  });
  test("első olvasás nem ugrás", () => {
    expect(isClockJump(0, 5_000_000, true)).toBe(false);
  });
});

test("msToNextSecond a következő másodperc-határ után üt", () => {
  expect(msToNextSecond(10_250)).toBe(755);
  expect(msToNextSecond(10_000)).toBe(1_005);
});

describe("createClockStore", () => {
  test("feliratkozás nélkül is friss pillanatképet ad", () => {
    const h = harness(new Date(2026, 10, 23, 9, 15, 0));
    expect(h.store.getSnapshot()?.clock.sec).toBe(9 * 3600 + 15 * 60);
    h.sleep(3 * 3600_000);
    expect(h.store.getSnapshot()?.clock.sec).toBe(12 * 3600 + 15 * 60);
  });

  test("másodpercenként lép, és szól a figyelőnek", () => {
    const h = harness(new Date(2026, 10, 23, 9, 15, 0, 200));
    let calls = 0;
    const off = h.store.subscribe(() => calls++);
    h.advance(3_000);
    expect(h.store.getSnapshot()?.clock.sec).toBe(9 * 3600 + 15 * 60 + 3);
    expect(calls).toBe(3);
    off();
  });

  test("alvás után az első jelre a valódi időt mutatja és új horgonyt ad", () => {
    const h = harness(new Date(2026, 10, 23, 9, 15, 0));
    const off = h.store.subscribe(() => {});
    const before = h.store.getSnapshot();
    h.sleep(40 * 60_000);
    //* A gép felébredt, a lap végig látható volt: csak `focus` jön.
    h.win.dispatchEvent(new Event("focus"));
    const after = h.store.getSnapshot();
    expect(after?.clock.sec).toBe(9 * 3600 + 55 * 60);
    expect(after?.epoch).toBe((before?.epoch ?? 0) + 1);
    off();
  });

  test("ébredési jel nélkül is az első ütés észreveszi az alvást", () => {
    const h = harness(new Date(2026, 10, 23, 9, 15, 0));
    const off = h.store.subscribe(() => {});
    const epoch = h.store.getSnapshot()?.epoch ?? 0;
    h.sleep(10 * 60_000);
    //* A lekésett ütés az ébredés pillanatában sül el — és a valódi időt olvassa.
    h.advance(10);
    expect(h.store.getSnapshot()?.clock.sec).toBe(9 * 3600 + 25 * 60);
    expect(h.store.getSnapshot()?.epoch).toBe(epoch + 1);
    off();
  });

  test("láthatóvá váláskor új horgony", () => {
    const h = harness(new Date(2026, 10, 23, 9, 15, 0));
    const off = h.store.subscribe(() => {});
    const epoch = h.store.getSnapshot()?.epoch ?? 0;
    h.doc.visibilityState = "hidden";
    h.doc.dispatchEvent(new Event("visibilitychange"));
    h.sleep(5 * 60_000);
    h.doc.visibilityState = "visible";
    h.doc.dispatchEvent(new Event("visibilitychange"));
    expect(h.store.getSnapshot()?.clock.sec).toBe(9 * 3600 + 20 * 60);
    expect(h.store.getSnapshot()?.epoch).toBe(epoch + 1);
    off();
  });

  test("éjfélkor a nap kulcsa lép", () => {
    const h = harness(new Date(2026, 10, 23, 23, 59, 59));
    const off = h.store.subscribe(() => {});
    expect(h.store.getSnapshot()?.clock.day).toBe("2026-11-23");
    h.advance(1_500);
    expect(h.store.getSnapshot()?.clock.day).toBe("2026-11-24");
    expect(h.store.getSnapshot()?.clock.sec).toBe(0);
    off();
  });

  test("leiratkozás után leállnak a figyelők", () => {
    const h = harness(new Date(2026, 10, 23, 9, 15, 0));
    let calls = 0;
    const off = h.store.subscribe(() => calls++);
    off();
    h.advance(5_000);
    h.win.dispatchEvent(new Event("focus"));
    expect(calls).toBe(0);
  });
});
