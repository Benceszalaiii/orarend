import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { json, stubFetch } from "@/test/browser";
import {
  announceStream,
  drainSignals,
  endStream,
  fetchStreams,
  IceOutbox,
  readCandidates,
  sendSignal,
} from "./webrtc-signal";

const me = { peer: "p-1", nickname: "Pisti" };
let stub: ReturnType<typeof stubFetch>;
let reply: (url: string, init?: RequestInit) => Response;
beforeEach(() => {
  reply = () => json({});
  stub = stubFetch((url, init) => reply(url, init));
});
afterEach(() => stub.restore());

const body = (i: number) => JSON.parse(stub.calls[i].init?.body as string);

describe("sendSignal", () => {
  test("a küldő azonosítójával és a becenévvel", async () => {
    expect(await sendSignal(me, "host", "s1", "offer", { sdp: "x" })).toBe(
      true,
    );
    expect(stub.calls[0].url).toBe("/api/webrtc/signal");
    expect(stub.calls[0].init?.credentials).toBe("same-origin");
    expect(body(0)).toEqual({
      peer: "p-1",
      nickname: "Pisti",
      to: "host",
      streamId: "s1",
      kind: "offer",
      payload: { sdp: "x" },
    });
  });

  test("hiba: false", async () => {
    reply = () => new Response("", { status: 403 });
    expect(await sendSignal(me, "h", "s", "bye", null)).toBe(false);
    reply = () => {
      throw new Error("offline");
    };
    expect(await sendSignal(me, "h", "s", "bye", null)).toBe(false);
  });
});

describe("drainSignals", () => {
  test("a peer kódolva kerül a címbe", async () => {
    reply = () => json({ messages: [{ kind: "join" }] });
    expect(await drainSignals("a b&c")).toEqual([{ kind: "join" }] as never);
    expect(stub.calls[0].url).toBe("/api/webrtc/signal?peer=a%20b%26c");
  });

  test("hiányzó lista, hiba: üres", async () => {
    expect(await drainSignals("p")).toEqual([]);
    reply = () => new Response("", { status: 500 });
    expect(await drainSignals("p")).toEqual([]);
  });
});

describe("IceOutbox", () => {
  test("az első jelölt azonnal megy, a többi kötegben", async () => {
    const box = new IceOutbox(() => me, "host", "s1");
    box.add({ candidate: "a" });
    box.add({ candidate: "b" });
    box.add({ candidate: "c" });
    expect(stub.calls).toHaveLength(1);
    expect(body(0).payload).toEqual([{ candidate: "a" }]);
    await Bun.sleep(150);
    expect(stub.calls).toHaveLength(2);
    expect(body(1).payload).toEqual([{ candidate: "b" }, { candidate: "c" }]);
    expect(body(1).kind).toBe("ice");
  });

  test("close azonnal feladja a maradékot, utána nem fogad", async () => {
    const box = new IceOutbox(() => me, "host", "s1");
    box.add({ candidate: "a" });
    box.add({ candidate: "b" });
    box.close();
    box.add({ candidate: "c" });
    expect(stub.calls).toHaveLength(2);
    expect(body(1).payload).toEqual([{ candidate: "b" }]);
    await Bun.sleep(150);
    expect(stub.calls).toHaveLength(2);
  });

  test("üres sorral a flush nem küld", () => {
    const box = new IceOutbox(() => me, "host", "s1");
    box.flush();
    expect(stub.calls).toHaveLength(0);
  });
});

describe("readCandidates", () => {
  test("tömb, egyedüli jelölt vagy semmi", () => {
    expect(readCandidates([{ candidate: "a" }])).toEqual([{ candidate: "a" }]);
    expect(readCandidates({ candidate: "a" })).toEqual([{ candidate: "a" }]);
    expect(readCandidates(null)).toEqual([]);
  });
});

describe("közvetítések", () => {
  const stream = { id: "s1", title: "Óra" };

  test("fetchStreams", async () => {
    reply = () => json({ streams: [stream], distributed: true });
    expect(await fetchStreams()).toEqual({
      streams: [stream],
      distributed: true,
    } as never);
    reply = () => new Response("", { status: 500 });
    expect(await fetchStreams()).toBeNull();
  });

  test("announceStream: a szívverés a levelek számával", async () => {
    reply = () => json({ stream, mail: 3 });
    expect(await announceStream(me, "s1", "Óra", 2, true)).toEqual({
      stream,
      mail: 3,
    } as never);
    expect(body(0)).toEqual({
      peer: "p-1",
      nickname: "Pisti",
      id: "s1",
      title: "Óra",
      viewers: 2,
      locked: true,
    });
    reply = () => json({ stream });
    expect((await announceStream(me, "s1", "Óra", 0, false))?.mail).toBe(0);
    reply = () => json({});
    expect(await announceStream(me, "s1", "Óra", 0, false)).toBeNull();
    reply = () => new Response("", { status: 409 });
    expect(await announceStream(me, "s1", "Óra", 0, false)).toBeNull();
  });

  test("endStream keepalive DELETE, a hibát elnyeli", async () => {
    endStream(me, "s1");
    expect(stub.calls[0].init?.method).toBe("DELETE");
    expect(stub.calls[0].init?.keepalive).toBe(true);
    expect(body(0)).toEqual({ peer: "p-1", id: "s1" });
    reply = () => {
      throw new Error("offline");
    };
    expect(() => endStream(me, "s1")).not.toThrow();
    await Bun.sleep(0);
  });
});
