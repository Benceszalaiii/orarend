import { describe, expect, test } from "bun:test";
import {
  extrasKey,
  formatScreenAddress,
  type LessonExtras,
  linkDisplayName,
  linksFor,
  parseScreenAddress,
  SCREENTASK_DEFAULT_PORT,
  sanitizeLinkLabel,
  sanitizeLinkUrl,
  sanitizeScreenHost,
  screenFor,
  screenTaskFrameUrl,
} from "./lesson-extras";

//! ═══════════════════════════════════════════════════════════════════════════
//! REGRESSZIÓS TESZT — MIÉRT ÉPP EZ
//! ═══════════════════════════════════════════════════════════════════════════
//! Ezek a függvények döntik el, mi kerülhet az adatbázisba, és milyen címre
//! kattint majd a diák. Három dolgot fog le:
//!
//!  • A LINK SÉMÁJA. Egy `javascript:` link egy kattintással kódot futtatna.
//!  • A HELYI CÍM. A néző csak helyi IP-n működik (lásd a modul fejét) — egy
//!    nyilvános cím elfogadása néma, érthetetlen hibát adna a diáknak.
//!  • A KULCS. A tanár jele két nézetből, két betűzéssel érkezik; ha a kulcs
//!    nem egyezik, a tanári nézetben mentett link a diákén nem jelenik meg.
//! ═══════════════════════════════════════════════════════════════════════════

describe("extrasKey", () => {
  test("kisbetűsít és összevonja a szóközöket", () => {
    expect(extrasKey("  KovJ ")).toBe("kovj");
    expect(extrasKey("Szabó   Anna")).toBe("szabó anna");
  });

  test("üres vagy nem szöveg: nincs kulcs", () => {
    expect(extrasKey("")).toBeNull();
    expect(extrasKey("   ")).toBeNull();
    expect(extrasKey(42)).toBeNull();
    expect(extrasKey("x".repeat(65))).toBeNull();
  });
});

describe("sanitizeLinkUrl", () => {
  test("a séma nélküli címet https-sel egészíti ki", () => {
    expect(sanitizeLinkUrl("classroom.google.com/c/abc")).toBe(
      "https://classroom.google.com/c/abc",
    );
  });

  test("a http és https címet átengedi", () => {
    expect(sanitizeLinkUrl("http://example.com")).toBe("http://example.com/");
    expect(sanitizeLinkUrl(" https://a.b/c?d=1 ")).toBe("https://a.b/c?d=1");
  });

  test("minden más sémát elutasít", () => {
    expect(sanitizeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeLinkUrl("JavaScript:alert(1)")).toBeNull();
    expect(sanitizeLinkUrl("data:text/html,<b>x</b>")).toBeNull();
    expect(sanitizeLinkUrl("mailto:a@b.hu")).toBeNull();
    expect(sanitizeLinkUrl("ftp://a.b")).toBeNull();
  });

  test("belépési adatot tartalmazó címet nem tárol", () => {
    expect(sanitizeLinkUrl("https://nev:jelszo@example.com")).toBeNull();
  });

  test("üres és túl hosszú bemenet", () => {
    expect(sanitizeLinkUrl("")).toBeNull();
    expect(sanitizeLinkUrl(`https://a.b/${"x".repeat(2100)}`)).toBeNull();
  });
});

describe("sanitizeLinkLabel", () => {
  test("üresen null, vezérlőkarakter nélkül, levágva", () => {
    expect(sanitizeLinkLabel("   ")).toBeNull();
    expect(sanitizeLinkLabel(" Feladat\nlap ")).toBe("Feladat lap");
    expect(sanitizeLinkLabel("Feladat-lap (2.)")).toBe("Feladat-lap (2.)");
    expect(sanitizeLinkLabel("x".repeat(100))?.length).toBe(80);
  });
});

describe("linkDisplayName", () => {
  test("felirat nélkül a tartomány és az útvonal", () => {
    expect(
      linkDisplayName({ url: "https://www.example.com/a/b/", label: null }),
    ).toBe("example.com/a/b");
    expect(linkDisplayName({ url: "https://a.b/", label: "Kurzus" })).toBe(
      "Kurzus",
    );
  });
});

describe("sanitizeScreenHost", () => {
  test("a helyi IPv4-tartományokat elfogadja", () => {
    expect(sanitizeScreenHost("192.168.1.20")).toBe("192.168.1.20");
    expect(sanitizeScreenHost("10.0.0.15")).toBe("10.0.0.15");
    expect(sanitizeScreenHost("172.16.4.2")).toBe("172.16.4.2");
    expect(sanitizeScreenHost("172.31.255.1")).toBe("172.31.255.1");
    expect(sanitizeScreenHost("169.254.3.3")).toBe("169.254.3.3");
  });

  test("nyilvános, loopback és hibás címet elutasít", () => {
    expect(sanitizeScreenHost("8.8.8.8")).toBeNull();
    expect(sanitizeScreenHost("172.32.0.1")).toBeNull();
    expect(sanitizeScreenHost("127.0.0.1")).toBeNull();
    expect(sanitizeScreenHost("192.168.1.256")).toBeNull();
    expect(sanitizeScreenHost("example.com")).toBeNull();
    expect(sanitizeScreenHost("192.168.1")).toBeNull();
  });

  test("kanonikus, tízes alakot tárol", () => {
    expect(sanitizeScreenHost("192.168.010.005")).toBe("192.168.10.5");
  });

  test("a .local mDNS-nevet elfogadja", () => {
    expect(sanitizeScreenHost("Tanari-Gep.local")).toBe("tanari-gep.local");
    expect(sanitizeScreenHost("-rossz.local")).toBeNull();
  });
});

describe("parseScreenAddress", () => {
  test("port nélkül a ScreenTask alapértelmezése", () => {
    expect(parseScreenAddress("192.168.1.20")).toEqual({
      host: "192.168.1.20",
      port: SCREENTASK_DEFAULT_PORT,
    });
  });

  test("a ScreenTask ablakából másolt teljes címet is érti", () => {
    expect(parseScreenAddress(" http://192.168.1.20:8080/ ")).toEqual({
      host: "192.168.1.20",
      port: 8080,
    });
  });

  test("érvénytelen port vagy cím: null", () => {
    expect(parseScreenAddress("192.168.1.20:0")).toBeNull();
    expect(parseScreenAddress("192.168.1.20:70000")).toBeNull();
    expect(parseScreenAddress("8.8.8.8:7070")).toBeNull();
    expect(parseScreenAddress("")).toBeNull();
  });

  test("formázás: az alapértelmezett portot nem írja ki", () => {
    expect(formatScreenAddress({ host: "10.0.0.1", port: 7070 })).toBe(
      "10.0.0.1",
    );
    expect(formatScreenAddress({ host: "10.0.0.1", port: 8080 })).toBe(
      "10.0.0.1:8080",
    );
  });

  test("a képkocka címe a ScreenTask saját útvonala", () => {
    expect(screenTaskFrameUrl({ host: "10.0.0.1", port: 7070 }, "123")).toBe(
      "http://10.0.0.1:7070/ScreenTask.jpg?rand=123",
    );
  });
});

describe("keresés az óra kulcsaival", () => {
  const extras: LessonExtras = {
    links: [
      {
        id: "1",
        teacher: "kovj",
        subject: "mat",
        url: "https://a.b/",
        label: null,
        createdAt: "",
      },
      {
        id: "2",
        teacher: "kovj",
        subject: "fiz",
        url: "https://c.d/",
        label: null,
        createdAt: "",
      },
    ],
    screens: [
      {
        teacher: "kovj",
        room: "102",
        host: "10.0.0.5",
        port: 7070,
        updatedAt: "",
      },
    ],
  };

  test("a link a tanár + tantárgy párhoz tartozik, betűzéstől függetlenül", () => {
    expect(linksFor(extras, "KovJ", "MAT").map((l) => l.id)).toEqual(["1"]);
    expect(linksFor(extras, "", "MAT")).toEqual([]);
  });

  test("a kivetítő a tanár + terem párhoz tartozik", () => {
    expect(screenFor(extras, "KOVJ", "102")?.host).toBe("10.0.0.5");
    expect(screenFor(extras, "KOVJ", "103")).toBeNull();
  });
});
