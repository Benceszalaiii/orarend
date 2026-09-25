import { beforeEach, describe, expect, mock, test } from "bun:test";
import { resetRedis } from "@/test/redis";

//! A verseny-ág hálózat és adatbázis nélkül: a versenylistát és a küldést
//! kicseréljük, a foglalások a hamis Redisen valódi úton mennek.

let status: "OPEN" | "CANCELLED" = "OPEN";
const sent: { title: string }[] = [];

mock.module("./competition-store", () => ({
  loadLiveCompetitions: async () => [
    {
      slug: "osztv",
      name: "OSZTV",
      status,
      registrationDeadline: new Date("2026-09-27T20:00:00Z"),
      startsAt: new Date("2026-10-10T08:00:00Z"),
    },
  ],
}));
mock.module("./push-send", () => ({
  sendPush: async (subs: unknown[], payload: { title: string }) => {
    sent.push(payload);
    return { sent: subs.length, dropped: 0 };
  },
}));

const { runContest } = await import("./contest-push");
const { saveSubscription } = await import("./push-store");

//* Csütörtök 16:05 Budapesten — három nappal a vasárnapi határidő előtt.
const AT_FOUR = new Date("2026-09-24T14:05:00Z");

beforeEach(async () => {
  resetRedis();
  sent.length = 0;
  status = "OPEN";
  await saveSubscription({
    endpoint: "https://push/1",
    p256dh: "k",
    auth: "a",
    classes: [],
    teachers: [],
    contests: ["osztv"],
    everyLesson: false,
  });
});

describe("runContest", () => {
  test("három nappal előtte, délután, egyszer szól", async () => {
    const tally = { reminders: 0, dropped: 0 };
    await runContest("osztv", tally, AT_FOUR);
    await runContest("osztv", tally, new Date("2026-09-24T14:10:00Z"));
    expect(tally.reminders).toBe(1);
    expect(sent.map((p) => p.title)).toEqual([
      "OSZTV: 3 nap múlva lejár a nevezés",
    ]);
  });

  test("délelőtt nem szól", async () => {
    await runContest(
      "osztv",
      { reminders: 0, dropped: 0 },
      new Date("2026-09-24T08:00:00Z"),
    );
    expect(sent).toEqual([]);
  });

  test("elmaradó versenyről nem szól", async () => {
    status = "CANCELLED";
    await runContest("osztv", { reminders: 0, dropped: 0 }, AT_FOUR);
    expect(sent).toEqual([]);
  });

  test("feliratkozó nélkül nem szól", async () => {
    resetRedis();
    await runContest("osztv", { reminders: 0, dropped: 0 }, AT_FOUR);
    expect(sent).toEqual([]);
  });
});
