import { afterEach, describe, expect, jest, test } from "bun:test";
import { installBrowser, uninstallBrowser } from "@/test/browser";
import {
  acceptCandidate,
  canShareScreen,
  canWatch,
  escalateAfterGrace,
  flushCandidates,
  hasWideFallback,
  newConnection,
  requestScreen,
  tuneScreenSender,
  widenConnection,
} from "./webrtc-peer";
import { LAN_GRACE_MS } from "./webrtc-shared";

afterEach(uninstallBrowser);

class FakePc {
  static last: FakePc | null = null;
  config: RTCConfiguration;
  remoteDescription: RTCSessionDescription | null = null;
  connectionState: RTCPeerConnectionState = "new";
  added: RTCIceCandidateInit[] = [];
  failOn = "";
  constructor(config: RTCConfiguration) {
    this.config = config;
    FakePc.last = this;
  }
  setConfiguration(config: RTCConfiguration) {
    if (this.failOn === "config") throw new Error("InvalidModificationError");
    this.config = config;
  }
  async addIceCandidate(init: RTCIceCandidateInit) {
    if (init.candidate === this.failOn) throw new Error("bad candidate");
    this.added.push(init);
  }
}
const pc = () => new FakePc({}) as unknown as RTCPeerConnection & FakePc;

describe("kapcsolat", () => {
  test("helyi hálózaton kezd, STUN nélkül", () => {
    const g = globalThis as Record<string, unknown>;
    const original = g.RTCPeerConnection;
    g.RTCPeerConnection = FakePc;
    try {
      newConnection();
      expect(FakePc.last?.config).toEqual({
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
        iceServers: [],
      });
    } finally {
      g.RTCPeerConnection = original;
    }
  });

  test("tágítás a nyilvános STUN-okra", () => {
    expect(hasWideFallback()).toBe(true);
    const p = pc();
    expect(widenConnection(p)).toBe(true);
    expect(p.config.iceServers?.[0].urls).toContain(
      "stun:stun.l.google.com:19302",
    );
    const stuck = pc();
    stuck.failOn = "config";
    expect(widenConnection(stuck)).toBe(false);
  });

  test("a türelmi idő után tágít, ha még nem kapcsolódott", () => {
    jest.useFakeTimers();
    try {
      const p = pc();
      let widened = 0;
      escalateAfterGrace(p, () => widened++);
      jest.advanceTimersByTime(LAN_GRACE_MS - 1);
      expect(widened).toBe(0);
      jest.advanceTimersByTime(1);
      expect(widened).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("kapcsolódva, lezárva vagy lemondva nem tágít", () => {
    jest.useFakeTimers();
    try {
      let widened = 0;
      const connected = pc();
      connected.connectionState = "connected";
      escalateAfterGrace(connected, () => widened++);
      const closed = pc();
      closed.connectionState = "closed";
      escalateAfterGrace(closed, () => widened++);
      const cancel = escalateAfterGrace(pc(), () => widened++);
      cancel();
      jest.advanceTimersByTime(LAN_GRACE_MS * 2);
      expect(widened).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("ICE-jelöltek", () => {
  test("távoli leírás előtt sorba állnak, utána egyben mennek", async () => {
    const p = pc();
    const queue: RTCIceCandidateInit[] = [];
    await acceptCandidate(p, queue, { candidate: "a" });
    await acceptCandidate(p, queue, { candidate: "b" });
    expect(p.added).toEqual([]);
    expect(queue).toHaveLength(2);
    p.remoteDescription = {} as RTCSessionDescription;
    await flushCandidates(p, queue);
    expect(queue).toEqual([]);
    expect(p.added.map((c) => c.candidate)).toEqual(["a", "b"]);
    await acceptCandidate(p, queue, { candidate: "c" });
    expect(p.added).toHaveLength(3);
  });

  test("egy rossz jelölt nem állítja meg a többit", async () => {
    const p = pc();
    p.failOn = "bad";
    p.remoteDescription = {} as RTCSessionDescription;
    await acceptCandidate(p, [], { candidate: "bad" });
    await flushCandidates(p, [{ candidate: "bad" }, { candidate: "ok" }]);
    expect(p.added.map((c) => c.candidate)).toEqual(["ok"]);
  });
});

describe("tuneScreenSender", () => {
  test("éles szöveg: felbontás megtartása, bitráta- és fps-plafon", async () => {
    let applied: RTCRtpSendParameters | null = null;
    const sender = {
      getParameters: () =>
        ({ encodings: [] }) as unknown as RTCRtpSendParameters,
      setParameters: async (p: RTCRtpSendParameters) => {
        applied = p;
      },
    } as unknown as RTCRtpSender;
    const track = { contentHint: "" } as MediaStreamTrack;
    await tuneScreenSender(sender, track);
    expect(track.contentHint).toBe("detail");
    expect(applied).toMatchObject({
      degradationPreference: "maintain-resolution",
      encodings: [{ maxBitrate: 2_500_000, maxFramerate: 30 }],
    });
  });

  test("a böngésző elutasítása nem végzetes", async () => {
    const sender = {
      getParameters: () => {
        throw new Error("nope");
      },
    } as unknown as RTCRtpSender;
    await expect(
      tuneScreenSender(sender, {} as MediaStreamTrack),
    ).resolves.toBeUndefined();
  });
});

describe("képességek", () => {
  test("szerveren semmi", () => {
    expect(canWatch()).toBe(false);
  });

  test("böngészőben a meglévő API-k szerint", async () => {
    const b = installBrowser();
    expect(canShareScreen()).toBe(false);
    expect(canWatch()).toBe(false);
    let asked: unknown = null;
    b.navigator.mediaDevices = {
      getDisplayMedia: async (opts: unknown) => {
        asked = opts;
        return "stream";
      },
    };
    b.window.RTCPeerConnection = FakePc;
    expect(canShareScreen()).toBe(true);
    expect(canWatch()).toBe(true);
    expect(await requestScreen()).toBe("stream" as never);
    expect(asked).toMatchObject({
      audio: false,
      selfBrowserSurface: "exclude",
      video: { frameRate: { ideal: 15, max: 30 } },
    });
  });
});
