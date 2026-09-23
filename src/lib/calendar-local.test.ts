import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type FakeBrowser, installBrowser, json, stubFetch, uninstallBrowser } from "@/test/browser";
import {
  currentFeedState,
  forgetStoredFeed,
  loadStoredFeed,
  refreshStoredFeeds,
  requestFeed,
  revokeFeed,
  type StoredFeed,
  saveStoredFeed,
} from "./calendar-local";
import { saveDualSchedule } from "./dual-schedule";
import { saveLocalPreferences } from "./timetable-merge";

const LINKS = {
  token: "AbCdEfGhIjKlMnOpQrStUv",
  webcal: "webcal://x",
  https: "https://x",
  google: "https://g",
};

let b: FakeBrowser;
let stub: ReturnType<typeof stubFetch>;
let reply: (url: string, init?: RequestInit) => Response;
beforeEach(() => {
  b = installBrowser();
  reply = () => json({ ...LINKS, bound: true });
  stub = stubFetch((url, init) => reply(url, init));
});
afterEach(() => {
  stub.restore();
  uninstallBrowser();
});

describe("tárolt feedek", () => {
  const feed: StoredFeed = { ...LINKS, kind: "class", short: "12A", bound: false, fingerprint: "|-", savedAt: 1 };

  test("mentés, olvasás, elfelejtés", () => {
    expect(loadStoredFeed("12A")).toBeNull();
    saveStoredFeed("12A", feed);
    expect(loadStoredFeed("12A")).toEqual(feed);
    forgetStoredFeed("12A");
    expect(loadStoredFeed("12A")).toBeNull();
  });

  test("üres kulcs: semmi", () => {
    saveStoredFeed("", feed);
    expect(loadStoredFeed("")).toBeNull();
    expect(b.localStorage.length).toBe(0);
  });

  test("sérült tár vagy jegy nélküli bejegyzés: null", () => {
    b.localStorage.setItem("orarend:calendar:v1", JSON.stringify({ "12A": { kind: "class" } }));
    expect(loadStoredFeed("12A")).toBeNull();
    b.localStorage.setItem("orarend:calendar:v1", "{");
    expect(loadStoredFeed("12A")).toBeNull();
  });
});

describe("currentFeedState", () => {
  test("a készülék döntései és duális beosztása, ujjlenyomattal", () => {
    saveLocalPreferences("12A", [
      { clusterKey: "b", chosen: "b" },
      { clusterKey: "a", chosen: "" },
    ]);
    saveDualSchedule("12A", { A: [1, 2], B: [5] });
    const state = currentFeedState("class", "12A");
    expect(state.storeKey).toBe("12A");
    expect(state.prefs).toHaveLength(2);
    expect(state.dual).toEqual({ A: [1, 2], B: [5] });
    //* Az ujjlenyomat a döntések sorrendjétől független.
    expect(state.fingerprint).toBe("a=;b=b|1,2/5");
  });

  test("tanárnál a tanár-kulcs, üresen „-” duális", () => {
    const state = currentFeedState("teacher", "LM");
    expect(state.storeKey).toBe("tanar:LM");
    expect(state.fingerprint).toBe("|-");
  });
});

describe("requestFeed", () => {
  test("siker: elküldi az állapotot és elmenti a linket", async () => {
    saveLocalPreferences("12A", [{ clusterKey: "a", chosen: "a" }]);
    const result = await requestFeed({ kind: "class", short: "12A", token: "old" });
    expect(result.status).toBe("ok");
    const [call] = stub.calls;
    expect(call.url).toBe("/api/naptar");
    expect(JSON.parse(call.init?.body as string)).toEqual({
      kind: "class",
      short: "12A",
      prefs: [{ clusterKey: "a", chosen: "a" }],
      dual: null,
      token: "old",
    });
    const saved = loadStoredFeed("12A");
    expect(saved).toMatchObject({ ...LINKS, kind: "class", short: "12A", bound: true, fingerprint: "a=a|-" });
  });

  test.each([
    [403, "teacher-session-required"],
    [503, "unavailable"],
    [500, "error"],
  ])("HTTP %i → %s", async (status, expected) => {
    reply = () => new Response("", { status });
    expect((await requestFeed({ kind: "teacher", short: "LM" })).status).toBe(expected as never);
    expect(loadStoredFeed("tanar:LM")).toBeNull();
  });

  test("hálózati hiba és üres alany: error", async () => {
    reply = () => {
      throw new Error("offline");
    };
    expect((await requestFeed({ kind: "class", short: "12A" })).status).toBe("error");
    expect((await requestFeed({ kind: "class", short: "" })).status).toBe("error");
  });
});

describe("revokeFeed", () => {
  const feed: StoredFeed = { ...LINKS, kind: "teacher", short: "LM", bound: true, fingerprint: "", savedAt: 1 };

  test("siker: törli a szerverről és a készülékről", async () => {
    saveStoredFeed("tanar:LM", feed);
    reply = () => new Response(null, { status: 204 });
    expect(await revokeFeed(feed)).toBe(true);
    expect(stub.calls[0].url).toBe(`/api/naptar?token=${LINKS.token}`);
    expect(stub.calls[0].init?.method).toBe("DELETE");
    expect(loadStoredFeed("tanar:LM")).toBeNull();
  });

  test("hiba: a helyi példány megmarad", async () => {
    saveStoredFeed("tanar:LM", feed);
    reply = () => new Response("", { status: 500 });
    expect(await revokeFeed(feed)).toBe(false);
    reply = () => {
      throw new Error("offline");
    };
    expect(await revokeFeed(feed)).toBe(false);
    expect(loadStoredFeed("tanar:LM")).not.toBeNull();
  });
});

describe("refreshStoredFeeds", () => {
  test("csak a megváltozott alanyt küldi újra, a meglévő jeggyel", async () => {
    saveStoredFeed("12A", { ...LINKS, kind: "class", short: "12A", bound: false, fingerprint: "|-", savedAt: 1 });
    saveStoredFeed("10B", { ...LINKS, token: "Tok10B", kind: "class", short: "10B", bound: false, fingerprint: "|-", savedAt: 1 });
    saveLocalPreferences("10B", [{ clusterKey: "x", chosen: "x" }]);
    await refreshStoredFeeds();
    expect(stub.calls).toHaveLength(1);
    const body = JSON.parse(stub.calls[0].init?.body as string);
    expect(body.short).toBe("10B");
    expect(body.token).toBe("Tok10B");
  });

  test("hibás kulcsú bejegyzést nem küld", async () => {
    b.localStorage.setItem(
      "orarend:calendar:v1",
      JSON.stringify({
        rossz: { ...LINKS, kind: "class", short: "12A", fingerprint: "más" },
        "12B": { kind: "class", short: "12B" },
      }),
    );
    await refreshStoredFeeds();
    expect(stub.calls).toHaveLength(0);
  });
});
