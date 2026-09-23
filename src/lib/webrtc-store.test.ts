import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { redisControl, redisDump, resetRedis } from "@/test/redis";
import { MAILBOX_MAX, type SignalEnvelope, STREAM_TTL_SECONDS } from "./webrtc-shared";
import type { StoredStream } from "./webrtc-store";
import * as redisStore from "./webrtc-store";

//* A Redis nélküli (egyetlen szerverpéldányos) ág külön modulpéldányban: a
//* kliens a betöltéskor, a környezeti változókból jön létre.
const saved = {
  url: process.env.REDIS_KV_REST_API_URL,
  token: process.env.REDIS_KV_REST_API_TOKEN,
};
delete process.env.REDIS_KV_REST_API_URL;
delete process.env.REDIS_KV_REST_API_TOKEN;
const localStore = (await import("./webrtc-store.ts?local")) as typeof redisStore;
process.env.REDIS_KV_REST_API_URL = saved.url;
process.env.REDIS_KV_REST_API_TOKEN = saved.token;

function stream(id: string, over: Partial<StoredStream> = {}): StoredStream {
  return {
    id,
    title: `Óra ${id}`,
    hostPeer: `host-${id}`,
    host: { name: "Tanár", verified: true },
    startedAt: 1000,
    viewers: 0,
    teacher: null,
    locked: false,
    updatedAt: 1000,
    ...over,
  };
}

function envelope(n: number): SignalEnvelope {
  return {
    kind: "ice",
    from: { peer: "p", name: "Néző", verified: false },
    streamId: "s",
    payload: { n },
    at: n,
  };
}

for (const [label, store] of [
  ["Redisszel", redisStore],
  ["Redis nélkül", localStore],
] as const) {
  describe(label, () => {
    beforeEach(resetRedis);

    test("a jelző a módot mondja", () => {
      expect(store.webrtcStoreDistributed()).toBe(label === "Redisszel");
    });

    test("közvetítés fel, le, és a lista újabb elöl", async () => {
      expect(await store.putStream(stream("a", { startedAt: 1 }))).toBe(0);
      await store.putStream(stream("b", { startedAt: 2 }));
      expect((await store.getStream("a"))?.title).toBe("Óra a");
      expect((await store.listStreams()).map((s) => s.id)).toEqual(["b", "a"]);
      await store.dropStream("a");
      expect(await store.getStream("a")).toBeNull();
      expect((await store.listStreams()).map((s) => s.id)).toEqual(["b"]);
      await store.dropStream("b");
    });

    test("a szívverés visszaadja a megosztó várakozó leveleit", async () => {
      await store.pushSignal("host-c", envelope(1));
      await store.pushSignal("host-c", envelope(2));
      expect(await store.putStream(stream("c"))).toBe(2);
      await store.dropStream("c");
      await store.drainSignals("host-c");
    });

    test("a postaláda sorrendben ürül, és üres marad", async () => {
      await store.pushSignal("peer-1", envelope(1));
      await store.pushSignal("peer-1", envelope(2));
      expect((await store.drainSignals("peer-1")).map((e) => e.at)).toEqual([1, 2]);
      expect(await store.drainSignals("peer-1")).toEqual([]);
      expect(await store.drainSignals("senki")).toEqual([]);
    });

    test("a láda legfeljebb MAILBOX_MAX levelet tart, a régiek esnek ki", async () => {
      for (let i = 0; i < MAILBOX_MAX + 5; i++) await store.pushSignal("peer-2", envelope(i));
      const got = await store.drainSignals("peer-2");
      expect(got).toHaveLength(MAILBOX_MAX);
      expect(got[0].at).toBe(5);
    });
  });
}

describe("Redisszel — részletek", () => {
  beforeEach(resetRedis);
  afterEach(() => {
    redisControl.broken = false;
  });

  test("a közvetítés lejárati idővel, az indexben", async () => {
    await redisStore.putStream(stream("x"));
    const dump = redisDump();
    expect(dump["rtc:streams"]).toEqual(new Set(["x"]));
    expect(dump["rtc:stream:x"]).toBeDefined();
    await redisStore.dropStream("x");
    expect(redisDump()["rtc:streams"]).toBeUndefined();
  });

  test("a lejárt közvetítés kikerül az indexből listázáskor", async () => {
    await redisStore.putStream(stream("y"));
    //* Csak a kulcs tűnik el (lejárt), az index még emlegeti.
    const fake = new (await import("@upstash/redis")).Redis({} as never);
    await fake.del("rtc:stream:y");
    await redisStore.dropStream("nincs"); //* üríti a lista gyorsítótárát
    expect(await redisStore.listStreams()).toEqual([]);
    expect(redisDump()["rtc:streams"]).toBeUndefined();
  });

  test("elérhetetlen tároló: tartalék értékek, dobás nélkül", async () => {
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    redisControl.broken = true;
    expect(await redisStore.putStream(stream("z"))).toBeNull();
    expect(await redisStore.getStream("z")).toBeNull();
    expect(await redisStore.listStreams()).toEqual([]);
    expect(await redisStore.pushSignal("p", envelope(1))).toBe(false);
    expect(await redisStore.drainSignals("p")).toEqual([]);
    await expect(redisStore.dropStream("z")).resolves.toBeUndefined();
    quiet.mockRestore();
  });

  test("a sérült levél kimarad", async () => {
    const fake = new (await import("@upstash/redis")).Redis({} as never);
    await fake.rpush("rtc:box:q", "{nem json", JSON.stringify(envelope(7)));
    expect((await redisStore.drainSignals("q")).map((e) => e.at)).toEqual([7]);
  });
});

describe("Redis nélkül — lejárat", () => {
  test("a lejárt közvetítés eltűnik", async () => {
    const now = Date.now();
    const clock = spyOn(Date, "now").mockReturnValue(now);
    await localStore.putStream(stream("old"));
    clock.mockReturnValue(now + STREAM_TTL_SECONDS * 1000 + 1);
    expect(await localStore.getStream("old")).toBeNull();
    clock.mockRestore();
  });
});
