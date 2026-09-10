import { describe, expect, test } from "bun:test";
import { isSchoolEmail, schoolRoleForEmail } from "./school-domain";

//! ═══════════════════════════════════════════════════════════════════════════
//! REGRESSZIÓS TESZT — MIÉRT ÉPP EZ
//! ═══════════════════════════════════════════════════════════════════════════
//! Ez a függvény dönti el, ki juthat be Google-fiókkal, és tanárként vagy
//! diákként. Egy elgépelt domainnév itt nem hibaüzenetet ad, hanem CSENDESEN
//! beenged valakit, akit nem kellene, vagy tévesen tanárrá tesz egy diákot —
//! ezért a domainlistát és a `@` kezelését a leggyakoribb hibás bemenetekkel
//! (üres, hiányzó `@`, aldomain-eltévesztés, nagybetűs cím) is le kell fogni.
//! ═══════════════════════════════════════════════════════════════════════════

describe("schoolRoleForEmail", () => {
  test("a tantestületi domain tanárt jelent", () => {
    expect(schoolRoleForEmail("kovacs.j@jedlik.eu")).toBe("teacher");
  });

  test("a diák-aldomain diákot jelent", () => {
    expect(schoolRoleForEmail("nagy.b@students.jedlik.eu")).toBe("student");
  });

  test("a domain nem érzékeny kis/nagybetűre", () => {
    expect(schoolRoleForEmail("kovacs.j@JEDLIK.EU")).toBe("teacher");
    expect(schoolRoleForEmail("nagy.b@Students.Jedlik.Eu")).toBe("student");
  });

  test("egy hasonló, de idegen domain nem fogadható el", () => {
    //* A `students.jedlik.eu.evil.example` a `students.jedlik.eu`-ra
    //* VÉGZŐDIK, de nem az — a `domainOf` a `@` UTÁNI teljes részt veszi
    //* domainnek, tehát ez nem véletlenül futhat át egy `endsWith`-en.
    expect(schoolRoleForEmail("x@jedlik.eu.evil.example")).toBeNull();
    expect(schoolRoleForEmail("x@notjedlik.eu")).toBeNull();
  });

  test("személyes Gmail nem iskolai", () => {
    expect(schoolRoleForEmail("valaki@gmail.com")).toBeNull();
  });

  test("hiányzó vagy hibás bemenet nem dob, csak null", () => {
    expect(schoolRoleForEmail(null)).toBeNull();
    expect(schoolRoleForEmail(undefined)).toBeNull();
    expect(schoolRoleForEmail("")).toBeNull();
    expect(schoolRoleForEmail("nincs-kukac")).toBeNull();
    expect(schoolRoleForEmail("ures-domain@")).toBeNull();
  });
});

describe("isSchoolEmail", () => {
  test("igaz mindkét iskolai domainre, hamis máshol", () => {
    expect(isSchoolEmail("a@jedlik.eu")).toBe(true);
    expect(isSchoolEmail("a@students.jedlik.eu")).toBe(true);
    expect(isSchoolEmail("a@gmail.com")).toBe(false);
  });
});
