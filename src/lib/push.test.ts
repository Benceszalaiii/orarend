import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type FakeBrowser, installBrowser, json, stubFetch, uninstallBrowser } from "@/test/browser";
import { currentSubscription, disablePush, enablePush, loadPrefs, pushSupport, refreshPush, updatePush } from "./push";
import { DEFAULT_PREFS } from "./push-shared";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile Safari/604.1";
//* Egy valódi alakú (65 bájtos) VAPID nyilvános kulcs, base64url-ben.
const VAPID = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

type FakeSub = { endpoint: string; unsubscribed: boolean; toJSON(): unknown; unsubscribe(): Promise<boolean> };
function fakeSubscription(endpoint = "https://push.example/abc"): FakeSub {
  return {
    endpoint,
    unsubscribed: false,
    toJSON: () => ({ endpoint, keys: { p256dh: "P", auth: "A" } }),
    async unsubscribe() {
      this.unsubscribed = true;
      return true;
    },
  };
}

let b: FakeBrowser;
let stub: ReturnType<typeof stubFetch>;
let reply: () => Response;
let existing: FakeSub | null;
let created: FakeSub;
let permission: NotificationPermission;
const g = globalThis as Record<string, unknown>;

function withPush(browser: FakeBrowser) {
  const registration = {
    pushManager: {
      subscribe: async () => created,
      getSubscription: async () => existing,
    },
  };
  browser.navigator.serviceWorker = { ready: Promise.resolve(registration), register: async () => registration };
  browser.window.Notification = {};
  browser.window.PushManager = {};
  g.Notification = {
    get permission() {
      return permission;
    },
    requestPermission: async () => permission,
  };
}

beforeEach(() => {
  b = installBrowser();
  withPush(b);
  permission = "default";
  existing = null;
  created = fakeSubscription();
  reply = () => json({ ok: true });
  stub = stubFetch(() => reply());
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = VAPID;
});
afterEach(() => {
  stub.restore();
  uninstallBrowser();
  delete g.Notification;
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
});

describe("loadPrefs", () => {
  test("üres tár: alapérték", () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  test("a szemét mezőket kiszűri", () => {
    b.localStorage.setItem("orarend:push:v1", JSON.stringify({ classes: ["12A", 3], teachers: "LM", everyLesson: "true" }));
    expect(loadPrefs()).toEqual({ classes: ["12A"], teachers: [], everyLesson: false });
    b.localStorage.setItem("orarend:push:v1", "{");
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });
});

describe("pushSupport", () => {
  test("minden megvan: ready; tiltva: blocked", () => {
    expect(pushSupport()).toBe("ready");
    permission = "denied";
    expect(pushSupport()).toBe("blocked");
  });

  test("service worker vagy PushManager nélkül: unsupported", () => {
    delete b.window.PushManager;
    expect(pushSupport()).toBe("unsupported");
    delete b.navigator.serviceWorker;
    expect(pushSupport()).toBe("unsupported");
  });

  test("iPhone-on csak telepítve", () => {
    b = installBrowser({ userAgent: IPHONE });
    withPush(b);
    expect(pushSupport()).toBe("needs-install");
    b.navigator.standalone = true;
    expect(pushSupport()).toBe("ready");
  });

  test("az asztali módú iPad is iOS", () => {
    b = installBrowser({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" });
    withPush(b);
    b.navigator.maxTouchPoints = 5;
    expect(pushSupport()).toBe("needs-install");
    b.navigator.maxTouchPoints = 0;
    expect(pushSupport()).toBe("ready");
  });

  test("szerveren unsupported", () => {
    uninstallBrowser();
    expect(pushSupport()).toBe("unsupported");
  });
});

describe("enablePush", () => {
  const prefs = { classes: ["12A"], teachers: [], everyLesson: true };

  test("siker: feliratkozik, feltölti, elmenti", async () => {
    permission = "granted";
    expect(await enablePush(prefs)).toEqual({ ok: true });
    const [call] = stub.calls;
    expect(call.url).toBe("/api/ertesites");
    expect(JSON.parse(call.init?.body as string)).toEqual({
      endpoint: created.endpoint,
      keys: { p256dh: "P", auth: "A" },
      classes: ["12A"],
      teachers: [],
      everyLesson: true,
    });
    expect(loadPrefs()).toEqual(prefs);
  });

  test("a korlát fölötti alanyokat levágja", async () => {
    permission = "granted";
    await enablePush({ classes: ["1", "2", "3", "4", "5", "6", "7"], teachers: ["A", "B", "C"], everyLesson: false });
    const body = JSON.parse(stub.calls[0].init?.body as string);
    expect(body.classes).toHaveLength(5);
    expect(body.teachers).toHaveLength(2);
  });

  test("üres választás, hiányzó kulcs, elutasított engedély", async () => {
    expect(await enablePush(DEFAULT_PREFS)).toEqual({ ok: false, reason: "unsupported" });
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    expect(await enablePush(prefs)).toEqual({ ok: false, reason: "misconfigured" });
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = VAPID;
    permission = "denied";
    expect(await enablePush(prefs)).toEqual({ ok: false, reason: "denied" });
    expect(stub.calls).toHaveLength(0);
  });

  test("a szerver elutasítja: leiratkozik, nem ment", async () => {
    permission = "granted";
    reply = () => new Response("", { status: 403 });
    expect(await enablePush(prefs)).toEqual({ ok: false, reason: "forbidden" });
    expect(created.unsubscribed).toBe(true);
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    reply = () => new Response("", { status: 500 });
    expect(await enablePush(prefs)).toEqual({ ok: false, reason: "server" });
  });
});

describe("feliratkozás után", () => {
  beforeEach(() => {
    permission = "granted";
    existing = fakeSubscription("https://push.example/existing");
  });

  test("currentSubscription", async () => {
    expect(await currentSubscription()).toBe(existing as never);
    permission = "denied";
    expect(await currentSubscription()).toBeNull();
  });

  test("updatePush elküldi és elmenti", async () => {
    expect(await updatePush({ classes: [], teachers: ["LM"], everyLesson: false })).toEqual({ ok: true });
    expect(JSON.parse(stub.calls[0].init?.body as string).endpoint).toBe("https://push.example/existing");
    expect(loadPrefs().teachers).toEqual(["LM"]);
    expect(await updatePush(DEFAULT_PREFS)).toEqual({ ok: false, reason: "unsupported" });
    existing = null;
    expect(await updatePush({ classes: ["12A"], teachers: [], everyLesson: false })).toEqual({ ok: false, reason: "server" });
  });

  test("disablePush: törli a szerverről, leiratkozik, elfelejt", async () => {
    b.localStorage.setItem("orarend:push:v1", JSON.stringify({ classes: ["12A"] }));
    const sub = existing as FakeSub;
    await disablePush();
    expect(stub.calls[0].init?.method).toBe("DELETE");
    expect(sub.unsubscribed).toBe(true);
    expect(b.localStorage.getItem("orarend:push:v1")).toBeNull();
  });

  test("refreshPush csak mentett választással küld", async () => {
    await refreshPush();
    expect(stub.calls).toHaveLength(0);
    b.localStorage.setItem("orarend:push:v1", JSON.stringify({ classes: ["12A"] }));
    await refreshPush();
    expect(stub.calls).toHaveLength(1);
  });
});
