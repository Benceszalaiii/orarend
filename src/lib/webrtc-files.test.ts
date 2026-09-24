import { describe, expect, spyOn, test } from "bun:test";
import {
  classifyFile,
  fileExtension,
  formatBytes,
  Inbox,
  readFrame,
  STALE_TRANSFER_MS,
  sanitizeFileName,
  sendBlob,
} from "./webrtc-files";
import {
  FILE_CHUNK_BYTES,
  MAX_FILE_BYTES,
  MAX_FILE_NAME_LENGTH,
} from "./webrtc-shared";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

//* Egy adatcsatorna annyija, amennyit a `sendBlob` használ.
class FakeChannel extends EventTarget {
  readyState: RTCDataChannelState = "open";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  sent: Uint8Array[] = [];
  failAt = -1;
  send(data: Uint8Array) {
    if (this.sent.length === this.failAt) throw new Error("closed");
    this.sent.push(data);
  }
}

describe("readFrame / sendBlob", () => {
  test("keretenként az azonosító + a darab, a vevő visszaolvassa", async () => {
    const channel = new FakeChannel();
    const content = new Uint8Array(FILE_CHUNK_BYTES * 2 + 10).map(
      (_, i) => i % 251,
    );
    const progress: number[] = [];
    const ok = await sendBlob(
      channel as unknown as RTCDataChannel,
      ID,
      new Blob([content]),
      {
        onProgress: (sent) => progress.push(sent),
      },
    );
    expect(ok).toBe(true);
    expect(channel.sent).toHaveLength(3);
    expect(progress).toEqual([
      FILE_CHUNK_BYTES,
      FILE_CHUNK_BYTES * 2,
      content.length,
    ]);

    const parts = channel.sent.map((f) => readFrame(f.buffer as ArrayBuffer));
    expect(parts.every((p) => p?.id === ID)).toBe(true);
    const joined = new Uint8Array(
      await new Blob(
        parts.map((p) => p?.body as Uint8Array<ArrayBuffer>),
      ).arrayBuffer(),
    );
    expect(joined).toEqual(content);
  });

  test("túl rövid keret: null", () => {
    expect(readFrame(new ArrayBuffer(36))).toBeNull();
    expect(readFrame(new ArrayBuffer(3))).toBeNull();
  });

  test("lezárt csatorna, lemondás, küldési hiba: false", async () => {
    const blob = new Blob([new Uint8Array(FILE_CHUNK_BYTES * 3)]);
    const closed = new FakeChannel();
    closed.readyState = "closed";
    expect(await sendBlob(closed as unknown as RTCDataChannel, ID, blob)).toBe(
      false,
    );

    const cancelled = new FakeChannel();
    let calls = 0;
    expect(
      await sendBlob(cancelled as unknown as RTCDataChannel, ID, blob, {
        cancelled: () => ++calls > 1,
      }),
    ).toBe(false);
    expect(cancelled.sent).toHaveLength(1);

    const failing = new FakeChannel();
    failing.failAt = 1;
    expect(await sendBlob(failing as unknown as RTCDataChannel, ID, blob)).toBe(
      false,
    );
  });

  test("tele puffernél megvárja a bufferedamountlow eseményt", async () => {
    const channel = new FakeChannel();
    channel.bufferedAmount = 2 * 1024 * 1024;
    const done = sendBlob(
      channel as unknown as RTCDataChannel,
      ID,
      new Blob([new Uint8Array(10)]),
    );
    await Bun.sleep(5);
    expect(channel.sent).toHaveLength(0);
    expect(channel.bufferedAmountLowThreshold).toBe(256 * 1024);
    channel.bufferedAmount = 0;
    channel.dispatchEvent(new Event("bufferedamountlow"));
    expect(await done).toBe(true);
    expect(channel.sent).toHaveLength(1);
  });
});

describe("Inbox", () => {
  const meta = (id: string, size = 10) => ({
    id,
    name: "a.txt",
    mime: "text/plain",
    size,
    kind: "code" as const,
  });

  test("teljes átvitel: ok … done, majd take egy Blobot ad", async () => {
    const inbox = new Inbox();
    expect(inbox.begin(meta("a"))).toBe(true);
    expect(inbox.chunk("a", new Uint8Array(4))).toBe("ok");
    expect(inbox.progress("a")).toEqual({ received: 4, size: 10 });
    expect(inbox.take("a")).toBeNull();
    expect(inbox.chunk("a", new Uint8Array([1, 2, 3, 4, 5, 6]))).toBe("done");
    const taken = inbox.take("a");
    expect(taken?.blob.size).toBe(10);
    expect(taken?.blob.type).toStartWith("text/plain");
    expect(inbox.size).toBe(0);
  });

  test("elutasítja a hibás méretet, az ismétlést és a negyediket", () => {
    const inbox = new Inbox();
    expect(inbox.begin(meta("x", 0))).toBe(false);
    expect(inbox.begin(meta("x", 1.5))).toBe(false);
    expect(inbox.begin(meta("x", MAX_FILE_BYTES + 1))).toBe(false);
    expect(inbox.begin(meta("a"))).toBe(true);
    expect(inbox.begin(meta("a"))).toBe(false);
    expect(inbox.begin(meta("b"))).toBe(true);
    expect(inbox.begin(meta("c"))).toBe(true);
    expect(inbox.begin(meta("d"))).toBe(false);
  });

  test("a bejelentettnél több bájt: overflow, és eldobja", () => {
    const inbox = new Inbox();
    inbox.begin(meta("a", 3));
    expect(inbox.chunk("a", new Uint8Array(4))).toBe("overflow");
    expect(inbox.size).toBe(0);
    expect(inbox.chunk("a", new Uint8Array(1))).toBe("unknown");
  });

  test("a darabot lemásolja — a küldő puffere újrahasznosítható", async () => {
    const inbox = new Inbox();
    inbox.begin(meta("a", 2));
    const buf = new Uint8Array([7, 8]);
    inbox.chunk("a", buf);
    buf[0] = 0;
    const taken = inbox.take("a");
    expect([
      ...new Uint8Array(await (taken?.blob as Blob).arrayBuffer()),
    ]).toEqual([7, 8]);
  });

  test("drop, clear, sweep", () => {
    const inbox = new Inbox();
    const clock = spyOn(Date, "now").mockReturnValue(1000);
    inbox.begin(meta("a"));
    inbox.begin(meta("b"));
    clock.mockReturnValue(1000 + STALE_TRANSFER_MS);
    inbox.chunk("b", new Uint8Array(1));
    clock.mockReturnValue(1000 + STALE_TRANSFER_MS + 1);
    expect(inbox.sweep()).toEqual(["a"]);
    inbox.drop("b");
    expect(inbox.size).toBe(0);
    inbox.begin(meta("c"));
    expect(inbox.clear()).toEqual(["c"]);
    clock.mockRestore();
  });
});

describe("fileExtension / classifyFile", () => {
  test("kiterjesztés kisbetűsen, a rejtett fájl nem kiterjesztés", () => {
    expect(fileExtension("Main.JAVA")).toBe("java");
    expect(fileExtension("archive.tar.gz")).toBe("gz");
    expect(fileExtension(".env")).toBe("");
    expect(fileExtension("README")).toBe("");
  });

  test.each([
    ["kép.png", "image/png", "image"],
    ["jegyzet", "text/plain", "code"],
    ["q.SQL", "application/octet-stream", "code"],
    ["adat", "application/json", "code"],
    ["doc.pdf", "application/pdf", "other"],
    ["x.zip", "", "other"],
  ])("%s (%s) → %s", (name, mime, kind) => {
    expect(classifyFile(name, mime)).toBe(kind as never);
  });
});

describe("sanitizeFileName", () => {
  test("útvonal-elválasztók és vezérlők nélkül", () => {
    const traversal = sanitizeFileName("../../etc/passwd");
    expect(traversal).not.toContain("/");
    expect(traversal.startsWith(".")).toBe(false);
    expect(sanitizeFileName("a\\b/c.txt")).toBe("a_b_c.txt");
    expect(sanitizeFileName("rossz‮txt.exe")).toBe("rossztxt.exe");
    expect(sanitizeFileName("  sok   szóköz .md ")).toBe("sok szóköz .md");
  });

  test("üres vagy nem szöveg: „fajl”", () => {
    expect(sanitizeFileName("...")).toBe("fajl");
    expect(sanitizeFileName("")).toBe("fajl");
    expect(sanitizeFileName(null)).toBe("fajl");
  });

  test("hosszra vágva", () => {
    expect(sanitizeFileName("a".repeat(500))).toHaveLength(
      MAX_FILE_NAME_LENGTH,
    );
  });
});

describe("formatBytes", () => {
  test.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1 kB"],
    [1536, "2 kB"],
    [1024 * 1024, "1.0 MB"],
    [5.25 * 1024 * 1024, "5.3 MB"],
  ])("%i → %s", (n, label) => {
    expect(formatBytes(n)).toBe(label);
  });
});
