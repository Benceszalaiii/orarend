"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  extrasKey,
  type LessonExtras,
  type LessonLink,
  MAX_LINKS_PER_LESSON,
  MAX_LINKS_TOTAL,
  MAX_SCREENS_TOTAL,
  type ScreenAddress,
  type ScreenHost,
  sanitizeLinkLabel,
  sanitizeLinkUrl,
  sanitizePort,
  sanitizeScreenHost,
  sanitizeStoredExtras,
} from "./lesson-extras";

//! ═══════════════════════════════════════════════════════════════════════════
//! AZ ÓRÁHOZ KÖTÖTT LINKEK ÉS KIVETÍTŐ-CÍMEK — A BÖNGÉSZŐ OLDALA
//! ═══════════════════════════════════════════════════════════════════════════
//! KÉT GAZDÁJA LEHET A SOROKNAK, ÉS A FELÜLET NEM TUDJA, MELYIK AZ:
//!   • BELÉPVE a fiók (`/api/ora-kiegeszitok`, Postgres) — minden eszközön
//!     ugyanaz;
//!   • VENDÉGKÉNT a készülék `localStorage`-a — hálózati kérés egyáltalán
//!     nincs, és semmi nem hagyja el a készüléket.
//!
//! Egy modulszintű tároló, nem komponensállapot: a részletlap minden
//! megnyitáskor újra felépül, a sorokat viszont nem akarjuk minden kártya
//! megérintésekor újra letölteni. Belépve egy lekérés hozza az ÖSSZESET, és
//! ha egy percnél régebbi, a következő megnyitás a háttérben frissít — így a
//! telefonon felvett link a gépen is megjelenik, lapújratöltés nélkül.
//! ═══════════════════════════════════════════════════════════════════════════

const ENDPOINT = "/api/ora-kiegeszitok";
const REFRESH_AFTER_MS = 60_000;

//* A vendég sorai. Belépéskor a fiókba költöznek, és innen törlődnek.
export const GUEST_EXTRAS_KEY = "orarend:lesson-extras:v1";

type Status = "idle" | "loading" | "ready" | "error";

export type LessonExtrasState = {
  //* `null` = vendég: a sorok a készülék `localStorage`-ában élnek.
  userId: string | null;
  status: Status;
  extras: LessonExtras;
};

export type MutationResult = { ok: true } | { ok: false; message: string };

const EMPTY: LessonExtras = { links: [], screens: [] };
const IDLE: LessonExtrasState = { userId: null, status: "idle", extras: EMPTY };

let state: LessonExtrasState = IDLE;
let loadedAt = 0;
let inflight: { userId: string; promise: Promise<void> } | null = null;
const listeners = new Set<() => void>();

function publish(next: LessonExtrasState) {
  state = next;
  for (const listener of listeners) listener();
}

const isGuestState = (s: LessonExtrasState) =>
  s.userId === null && s.status === "ready";

//* Egy másik lapon mentett vendég-sor ezen a lapon is azonnal megjelenik.
function onStorage(event: StorageEvent) {
  if (event.key === GUEST_EXTRAS_KEY && isGuestState(state)) showGuest();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", onStorage);
    }
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => IDLE;

//* ---------------------------------------------------------------------------
//* A VENDÉG TÁROLÓJA
//* ---------------------------------------------------------------------------
//! A TÁROLÓ ELÉRÉSE DOBHAT (privát ablak, letiltott webhelyadat, betelt
//! kvóta). Olvasáskor ez üres listát jelent, íráskor kimondott hibát — a
//! lap attól még működik.
function readGuest(): LessonExtras {
  try {
    const raw = window.localStorage.getItem(GUEST_EXTRAS_KEY);
    return raw ? sanitizeStoredExtras(JSON.parse(raw)) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeGuest(extras: LessonExtras): boolean {
  try {
    //* Üresen nem hagyunk kulcsot magunk után.
    if (extras.links.length === 0 && extras.screens.length === 0) {
      window.localStorage.removeItem(GUEST_EXTRAS_KEY);
    } else {
      window.localStorage.setItem(GUEST_EXTRAS_KEY, JSON.stringify(extras));
    }
    return true;
  } catch {
    return false;
  }
}

function showGuest() {
  loadedAt = 0;
  publish({ userId: null, status: "ready", extras: readGuest() });
}

//* Csak a készüléken belül kell egyedinek lennie — a szerver a feltöltéskor
//* úgyis saját azonosítót ad. (`crypto.randomUUID` nem mindenhol érhető el:
//* titkosítatlan, helyi címről megnyitott lapon hiányzik.)
function localId(): string {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function changeGuest(
  change: (extras: LessonExtras) => LessonExtras | { error: string },
): Promise<MutationResult> {
  const next = change(readGuest());
  if ("error" in next) return { ok: false, message: next.error };
  if (!writeGuest(next)) {
    return {
      ok: false,
      message:
        "A böngésző most nem enged helyben menteni (pl. privát ablakban). Lépj be, és a fiókodba mentjük.",
    };
  }
  if (state.userId === null) {
    publish({ userId: null, status: "ready", extras: next });
  }
  return { ok: true };
}

//* ---------------------------------------------------------------------------
//* A FIÓK
//* ---------------------------------------------------------------------------
function toExtras(value: unknown): LessonExtras {
  const raw = (value ?? {}) as Partial<LessonExtras>;
  return {
    links: Array.isArray(raw.links) ? raw.links : [],
    screens: Array.isArray(raw.screens) ? raw.screens : [],
  };
}

function describeError(code: unknown, status: number): string {
  if (status === 401) {
    return "Lejárt a belépésed. Lépj be újra, és próbáld meg még egyszer.";
  }
  switch (code) {
    case "invalid-url":
      return "Ez nem érvényes webcím. Adj meg egy http:// vagy https:// kezdetű linket.";
    case "invalid-host":
      return "Helyi hálózati IP-címet adj meg, pl. 192.168.1.20 vagy 192.168.1.20:7070.";
    case "too-many":
      return "Elérted a menthető sorok felső határát. Törölj egy régit, és próbáld újra.";
    default:
      return status >= 500
        ? "A szerver most nem tudta elmenteni. Próbáld újra pár perc múlva."
        : "Nem sikerült a mentés. Próbáld újra.";
  }
}

async function send(
  method: "POST" | "PUT" | "DELETE",
  body: unknown,
): Promise<
  | { ok: true; data: unknown }
  //* `status: 0` = a kérés el sem jutott a szerverig.
  | { ok: false; status: number; message: string }
> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      status: 0,
      message:
        "Nincs kapcsolat a szerverrel — ellenőrizd a netet, és próbáld újra.",
    };
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: describeError(
        (data as { error?: unknown } | null)?.error,
        res.status,
      ),
    };
  }
  return { ok: true, data };
}

//! ─── BELÉPÉSKOR A VENDÉG SORAI A FIÓKBA KÖLTÖZNEK ──────────────────────────
//! Aki vendégként mentett, majd belép, ne veszítse el — és ne is maradjon a
//! készüléken egy második, a fióktól elszakadt példány, ami kijelentkezés után
//! előbukkanna. Soronként feltöltjük (a szerver ugyanúgy ellenőriz, és az
//! ismétlődő linket nem veszi fel kétszer), és ami felment, azt töröljük.
//!
//! AMI NEM MENT FEL, MARAD A KÉSZÜLÉKEN a következő körre — hálózati hiba,
//! lejárt munkamenet, betelt fiók. Egyetlen kivétel a 400: azt a szerver
//! érvénytelennek mondta, soha nem fog felmenni, és örökké újrapróbálnánk.
async function uploadGuest(): Promise<void> {
  const local = readGuest();
  if (local.links.length === 0 && local.screens.length === 0) return;

  const left: LessonExtras = { links: [], screens: [] };
  //* Egymás után, nem párhuzamosan: így a szerver darabszám-korlátja és
  //* ismétlődés-szűrése nem versenyez önmagával.
  for (const link of local.links) {
    const result = await send("POST", {
      teacher: link.teacher,
      subject: link.subject,
      url: link.url,
      label: link.label,
    });
    if (!result.ok && result.status !== 400) left.links.push(link);
  }
  for (const screen of local.screens) {
    const result = await send("PUT", {
      teacher: screen.teacher,
      room: screen.room,
      host: screen.host,
      port: screen.port,
    });
    if (!result.ok && result.status !== 400) left.screens.push(screen);
  }
  writeGuest(left);
}

async function refresh(userId: string): Promise<void> {
  //! FIÓKVÁLTÁSKOR AZ ELŐZŐ GAZDA SORAI AZONNAL ELTŰNNEK — nem várjuk meg az
  //! új választ, különben egy pillanatig a másik diák (vagy a vendég) sorai
  //! látszanának.
  if (state.userId !== userId) {
    loadedAt = 0;
    publish({ userId, status: "loading", extras: EMPTY });
  }
  if (inflight?.userId === userId) return inflight.promise;
  if (Date.now() - loadedAt < REFRESH_AFTER_MS) return;

  const promise = (async () => {
    try {
      await uploadGuest();
      const res = await fetch(ENDPOINT, { cache: "no-store" });
      if (state.userId !== userId) return;
      if (!res.ok) {
        if (state.status !== "ready") publish({ ...state, status: "error" });
        return;
      }
      const extras = toExtras(await res.json());
      if (state.userId !== userId) return;
      loadedAt = Date.now();
      publish({ userId, status: "ready", extras });
    } catch {
      //* Hálózati hiba: ami már megvolt, marad; a következő megnyitás újrapróbál.
      if (state.userId === userId && state.status !== "ready") {
        publish({ ...state, status: "error" });
      }
    } finally {
      if (inflight?.userId === userId) inflight = null;
    }
  })();
  inflight = { userId, promise };
  return promise;
}

export function useLessonExtras(userId: string | null): LessonExtrasState {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    if (userId) void refresh(userId);
    else showGuest();
  }, [userId]);

  if (snapshot.userId === userId && snapshot.status !== "idle") {
    return snapshot;
  }
  return { userId, status: "loading", extras: EMPTY };
}

//* ---------------------------------------------------------------------------
//* MÓDOSÍTÁSOK — `userId: null` = vendég, helyben
//* ---------------------------------------------------------------------------
//! BELÉPVE A SZERVER VÁLASZA AZ IGAZSÁG, NEM A KÉRÉS. A mentett sort a szerver
//! kanonikus alakjában (kisbetűs kulcs, kiegészített cím) tesszük a tárolóba.
//! VENDÉGKÉNT ugyanazokat a szabályokat helyben futtatjuk — így ami a
//! készüléken megmaradt, belépéskor gond nélkül felmegy a fiókba is.

function update(
  userId: string,
  change: (extras: LessonExtras) => LessonExtras,
) {
  if (state.userId !== userId) return;
  publish({ ...state, status: "ready", extras: change(state.extras) });
}

const sameScreen = (
  a: Pick<ScreenHost, "teacher" | "room">,
  b: Pick<ScreenHost, "teacher" | "room">,
) => a.teacher === b.teacher && a.room === b.room;

export async function addLessonLink(
  userId: string | null,
  input: {
    teacher: string;
    subject: string;
    url: string;
    label: string | null;
  },
): Promise<MutationResult> {
  if (userId === null) {
    const teacher = extrasKey(input.teacher);
    const subject = extrasKey(input.subject);
    const url = sanitizeLinkUrl(input.url);
    const label = sanitizeLinkLabel(input.label);
    if (!teacher || !subject) {
      return { ok: false, message: describeError("invalid-lesson", 400) };
    }
    if (!url) return { ok: false, message: describeError("invalid-url", 400) };

    return changeGuest((extras) => {
      const same = (l: LessonLink) =>
        l.teacher === teacher && l.subject === subject;
      const duplicate = extras.links.find((l) => same(l) && l.url === url);
      if (duplicate) {
        return {
          ...extras,
          links: extras.links.map((l) =>
            l === duplicate && label ? { ...l, label } : l,
          ),
        };
      }
      if (
        extras.links.filter(same).length >= MAX_LINKS_PER_LESSON ||
        extras.links.length >= MAX_LINKS_TOTAL
      ) {
        return { error: describeError("too-many", 409) };
      }
      const link: LessonLink = {
        id: localId(),
        teacher,
        subject,
        url,
        label,
        createdAt: new Date().toISOString(),
      };
      return { ...extras, links: [...extras.links, link] };
    });
  }

  const result = await send("POST", input);
  if (!result.ok) return result;
  const link = (result.data as { link: LessonLink }).link;
  update(userId, (extras) => ({
    ...extras,
    links: [...extras.links.filter((l) => l.id !== link.id), link],
  }));
  return { ok: true };
}

export async function removeLessonLink(
  userId: string | null,
  id: string,
): Promise<MutationResult> {
  if (userId === null) {
    return changeGuest((extras) => ({
      ...extras,
      links: extras.links.filter((l) => l.id !== id),
    }));
  }

  const result = await send("DELETE", { kind: "link", id });
  if (!result.ok) return result;
  update(userId, (extras) => ({
    ...extras,
    links: extras.links.filter((l) => l.id !== id),
  }));
  return { ok: true };
}

export async function saveScreenHost(
  userId: string | null,
  input: { teacher: string; room: string } & ScreenAddress,
): Promise<MutationResult> {
  if (userId === null) {
    const teacher = extrasKey(input.teacher);
    const room = extrasKey(input.room);
    const host = sanitizeScreenHost(input.host);
    const port = sanitizePort(input.port);
    if (!teacher || !room) {
      return { ok: false, message: describeError("invalid-lesson", 400) };
    }
    if (!host || port === null) {
      return { ok: false, message: describeError("invalid-host", 400) };
    }
    const screen: ScreenHost = {
      teacher,
      room,
      host,
      port,
      updatedAt: new Date().toISOString(),
    };

    return changeGuest((extras) => {
      const exists = extras.screens.some((s) => sameScreen(s, screen));
      if (!exists && extras.screens.length >= MAX_SCREENS_TOTAL) {
        return { error: describeError("too-many", 409) };
      }
      return {
        ...extras,
        screens: [
          ...extras.screens.filter((s) => !sameScreen(s, screen)),
          screen,
        ],
      };
    });
  }

  const result = await send("PUT", input);
  if (!result.ok) return result;
  const screen = (result.data as { screen: ScreenHost }).screen;
  update(userId, (extras) => ({
    ...extras,
    screens: [...extras.screens.filter((s) => !sameScreen(s, screen)), screen],
  }));
  return { ok: true };
}

export async function removeScreenHost(
  userId: string | null,
  screen: Pick<ScreenHost, "teacher" | "room">,
): Promise<MutationResult> {
  if (userId === null) {
    return changeGuest((extras) => ({
      ...extras,
      screens: extras.screens.filter((s) => !sameScreen(s, screen)),
    }));
  }

  const result = await send("DELETE", {
    kind: "screen",
    teacher: screen.teacher,
    room: screen.room,
  });
  if (!result.ok) return result;
  update(userId, (extras) => ({
    ...extras,
    screens: extras.screens.filter((s) => !sameScreen(s, screen)),
  }));
  return { ok: true };
}
