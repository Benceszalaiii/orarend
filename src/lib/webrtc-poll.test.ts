import { describe, expect, test } from "bun:test";
import { afterFailure, backoff, Pump } from "./webrtc-poll";

describe("afterFailure", () => {
  test("duplázódik, a hatodik után nem, és egy percnél megáll", () => {
    expect(afterFailure(0, 100)).toBe(100);
    expect(afterFailure(1, 100)).toBe(200);
    expect(afterFailure(6, 100)).toBe(6400);
    expect(afterFailure(20, 100)).toBe(6400);
    expect(afterFailure(3, 10_000)).toBe(60_000);
  });
});

describe("backoff", () => {
  test("tíz üres kör után lassít", () => {
    expect(backoff(0, 1, 9)).toBe(1);
    expect(backoff(9, 1, 9)).toBe(1);
    expect(backoff(10, 1, 9)).toBe(9);
  });
});

describe("Pump", () => {
  test("köröz, amíg a törzs késleltetést ad, null-ra megáll", async () => {
    let n = 0;
    const pump = new Pump(async () => (++n < 3 ? 1 : null));
    pump.restart();
    await Bun.sleep(30);
    expect(n).toBe(3);
    pump.stop();
  });

  test("ensure csak egyszer indít", async () => {
    let n = 0;
    const pump = new Pump(async () => {
      n++;
      return null;
    });
    pump.ensure();
    pump.ensure();
    await Bun.sleep(5);
    expect(n).toBe(1);
    pump.stop();
  });

  test("restart elveti a futó kör ütemezését — nem lesz két párhuzamos szál", async () => {
    let n = 0;
    const pump = new Pump(async () => {
      n++;
      return 5;
    });
    pump.restart();
    pump.restart();
    pump.restart();
    await Bun.sleep(28);
    pump.stop();
    //* Egyetlen szál ~5 ms-onként: 3 azonnali + legfeljebb ~6 ütemezett.
    //* Három szál esetén ennek a háromszorosa lenne.
    expect(n).toBeLessThan(12);
  });

  test("stop után semmi nem fut, és nem indítható újra", async () => {
    let n = 0;
    const pump = new Pump(async () => {
      n++;
      return 1;
    });
    pump.restart();
    await Bun.sleep(1);
    pump.stop();
    const at = n;
    await Bun.sleep(10);
    expect(n).toBe(at);
    pump.restart();
    pump.ensure();
    await Bun.sleep(5);
    expect(n).toBe(at);
  });

  test("a leállítás a futó kör végén sem ütemez újat", async () => {
    let release = () => {};
    let n = 0;
    const pump = new Pump(async () => {
      n++;
      await new Promise<void>((r) => {
        release = r;
      });
      return 1;
    });
    pump.restart();
    pump.stop();
    release();
    await Bun.sleep(10);
    expect(n).toBe(1);
  });
});
