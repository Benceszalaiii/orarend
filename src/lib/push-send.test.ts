import { beforeEach, describe, expect, mock, test } from "bun:test";
import { resetRedis } from "@/test/redis";
import { readSubscription, saveSubscription } from "./push-store";

//* A `web-push` helyett egy felvevő: a teszt dönti el, melyik címzett bukik el.
const sent: { endpoint: string; payload: unknown; options: unknown }[] = [];
const vapid: unknown[] = [];
let failures: Record<string, number> = {};
mock.module("web-push", () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => vapid.push(args),
    sendNotification: async (
      sub: { endpoint: string },
      payload: string,
      options: unknown,
    ) => {
      const status = failures[sub.endpoint];
      if (status)
        throw Object.assign(new Error("push failed"), { statusCode: status });
      sent.push({
        endpoint: sub.endpoint,
        payload: JSON.parse(payload),
        options,
      });
    },
  },
}));

//* A kulcsok a modul betöltésekor olvasódnak — kulcs nélküli és kulcsos példány.
const unconfigured = (await import(
  `./push-send.ts?${"nokeys"}`
)) as typeof import("./push-send");
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
process.env.VAPID_PRIVATE_KEY = "priv";
const configured = (await import(
  `./push-send.ts?${"keys"}`
)) as typeof import("./push-send");
delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;

const payload = {
  kind: "lesson" as const,
  title: "t",
  body: "b",
  url: "/ma",
  tag: "x",
};
const sub = (endpoint: string) => ({
  endpoint,
  p256dh: "k",
  auth: "a",
  classes: ["12A"],
  teachers: [],
  everyLesson: false,
});

beforeEach(() => {
  resetRedis();
  sent.length = 0;
  failures = {};
});

describe("push-send", () => {
  test("kulcs nélkül nem kész, és nem küld", async () => {
    expect(unconfigured.pushSendReady()).toBe(false);
    expect(await unconfigured.sendPush([sub("https://p/1")], payload)).toEqual({
      sent: 0,
      dropped: 0,
    });
    expect(sent).toEqual([]);
  });

  test("kulccsal beállítja a VAPID-ot az alapértelmezett feladóval", () => {
    expect(configured.pushSendReady()).toBe(true);
    expect(vapid).toContainEqual(["mailto:orarend@example.com", "pub", "priv"]);
  });

  test("mindenkinek elküldi, 30 perces élettartammal", async () => {
    const result = await configured.sendPush(
      [sub("https://p/1"), sub("https://p/2")],
      payload,
    );
    expect(result).toEqual({ sent: 2, dropped: 0 });
    expect(sent[0]).toEqual({
      endpoint: "https://p/1",
      payload,
      options: { TTL: 1800, urgency: "normal" },
    });
  });

  test("a megszűnt feliratkozást (404/410) törli, a többi hibát elnyeli", async () => {
    await saveSubscription(sub("https://p/gone"));
    failures = { "https://p/gone": 410, "https://p/flaky": 500 };
    const result = await configured.sendPush(
      [sub("https://p/gone"), sub("https://p/flaky"), sub("https://p/ok")],
      payload,
    );
    expect(result).toEqual({ sent: 1, dropped: 1 });
    expect(await readSubscription("https://p/gone")).toBeNull();
  });

  test("üres címzettlista", async () => {
    expect(await configured.sendPush([], payload)).toEqual({
      sent: 0,
      dropped: 0,
    });
  });
});
