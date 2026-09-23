import { describe, expect, test } from "bun:test";
import {
  isPeerId,
  isProof,
  joinProof,
  MAX_CHAT_LENGTH,
  MAX_NICKNAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_TITLE_LENGTH,
  newPeerId,
  sameProof,
  sanitizeChatText,
  sanitizeNickname,
  sanitizePassword,
  sanitizeTitle,
  stunServers,
  VIEWER_POLL_MS,
  viewerDelay,
} from "./webrtc-shared";

describe("viewerDelay", () => {
  test("gyorsan kezd, aztán ritkít, végül feladja", () => {
    expect(viewerDelay(0)).toBe(VIEWER_POLL_MS);
    expect(viewerDelay(9_999)).toBe(VIEWER_POLL_MS);
    expect(viewerDelay(10_000)).toBe(2_000);
    expect(viewerDelay(30_000)).toBe(5_000);
    expect(viewerDelay(74_999)).toBe(5_000);
    expect(viewerDelay(75_000)).toBeNull();
  });
});

describe("stunServers", () => {
  test("alapból a két nyilvános STUN", () => {
    expect(stunServers(undefined)).toEqual([
      { urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
    ]);
  });

  test("csak stun: címek, a turn: és a szemét kimarad", () => {
    expect(stunServers(" stun:a:1 , turn:b:2, http://x,  ")).toEqual([{ urls: ["stun:a:1"] }]);
  });

  test("üres beállítás: nincs STUN (csak helyi hálózat)", () => {
    expect(stunServers("")).toEqual([]);
  });
});

describe("sanitizeNickname", () => {
  test("láthatatlan karakterek és felesleges szóközök nélkül", () => {
    expect(sanitizeNickname("  Kis​   Pista‮ ")).toBe("Kis Pista");
    expect(sanitizeNickname("a\tb\nc")).toBe("abc");
  });

  test("túl rövid vagy nem szöveg: null", () => {
    expect(sanitizeNickname("x")).toBeNull();
    expect(sanitizeNickname("​​x")).toBeNull();
    expect(sanitizeNickname(42)).toBeNull();
  });

  test("hosszra vágva", () => {
    expect(sanitizeNickname("a".repeat(100))).toHaveLength(MAX_NICKNAME_LENGTH);
  });
});

describe("sanitizeTitle", () => {
  test("összevont szóközök, vágás, üres: null", () => {
    expect(sanitizeTitle("  Matek   óra  ")).toBe("Matek óra");
    expect(sanitizeTitle("x".repeat(500))).toHaveLength(MAX_TITLE_LENGTH);
    expect(sanitizeTitle("   ")).toBeNull();
    expect(sanitizeTitle(null)).toBeNull();
  });
});

describe("sanitizeChatText", () => {
  test("a sortörés megmarad, legfeljebb egy üres sor", () => {
    expect(sanitizeChatText("  első\n\n\n\nmásodik  \t  sor ")).toBe("első\n\nmásodik sor");
  });

  test("vezérlőkarakterek ki", () => {
    expect(sanitizeChatText("a\u0000b‮c")).toBe("abc");
  });

  test("üres: null, hosszú: vágva", () => {
    expect(sanitizeChatText(" \n ")).toBeNull();
    expect(sanitizeChatText("x".repeat(5000))).toHaveLength(MAX_CHAT_LENGTH);
  });
});

describe("sanitizePassword", () => {
  test("a belső szóköz megmarad, a széleké nem", () => {
    expect(sanitizePassword("  a b c ")).toBe("a b c");
  });

  test("túl rövid: null, hosszú: vágva", () => {
    expect(sanitizePassword("ab")).toBeNull();
    expect(sanitizePassword("x".repeat(300))).toHaveLength(MAX_PASSWORD_LENGTH);
    expect(sanitizePassword(undefined)).toBeNull();
  });
});

describe("joinProof / sameProof / isProof", () => {
  test("SHA-256 hex, a streamhez kötve", async () => {
    const a = await joinProof("s1", "titok");
    expect(isProof(a)).toBe(true);
    expect(a).toBe(await joinProof("s1", "titok"));
    expect(a).not.toBe(await joinProof("s2", "titok"));
    //* sha256("s1:titok")
    const expected = new Bun.CryptoHasher("sha256").update("s1:titok").digest("hex");
    expect(a).toBe(expected);
  });

  test("sameProof: egyezés és eltérés", () => {
    expect(sameProof("abc", "abc")).toBe(true);
    expect(sameProof("abc", "abd")).toBe(false);
    expect(sameProof("abc", "ab")).toBe(false);
  });

  test("isProof alak", () => {
    expect(isProof("A".repeat(64))).toBe(false);
    expect(isProof("a".repeat(63))).toBe(false);
    expect(isProof(1)).toBe(false);
  });
});

describe("peer azonosító", () => {
  test("UUID, és az őr felismeri", () => {
    const id = newPeerId();
    expect(isPeerId(id)).toBe(true);
    expect(newPeerId()).not.toBe(id);
    expect(isPeerId("nem-uuid")).toBe(false);
    expect(isPeerId(id.toUpperCase())).toBe(false);
  });
});
