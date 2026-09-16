"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  extrasKey,
  type ScreenAddress,
  type SharedExtras,
  type SharedScreen,
  type TeacherLink,
} from "./lesson-extras";
import type { MutationResult } from "./lesson-extras-store";

//! ═══════════════════════════════════════════════════════════════════════════
//! A TANÁR ÁLTAL BEÁLLÍTOTT SOROK — A BÖNGÉSZŐ OLDALA
//! ═══════════════════════════════════════════════════════════════════════════
//! Egy lekérés hozza az ÖSSZESET (terem-címek + tanári linkek), és ez a válasz
//! mindenkinek ugyanaz — a CDN tartja, nem az adatbázis. A tároló modulszintű:
//! a részletlap és a `/kivetites` lap ugyanazt a példányt látja.
//!
//! A SAJÁT ÍRÁS NEM VESZHET EL A GYORSÍTÓTÁRBAN. A CDN egy írás után még percekig
//! kiadhatja a régi választ; ha a író lapja ezt töltené le, a mentett cím
//! eltűnne a szeme elől. Ezért írás után egy ideig gyorsítótár-kerülő címet
//! kérünk — csak az író böngészője, a többieknek marad az olcsó út.
//! ═══════════════════════════════════════════════════════════════════════════

const ENDPOINT = "/api/kozos-kiegeszitok";
const REFRESH_AFTER_MS = 60_000;
const BYPASS_AFTER_WRITE_MS = 5 * 60_000;

type Status = "idle" | "loading" | "ready" | "error";
export type SharedExtrasState = { status: Status; shared: SharedExtras };

const EMPTY: SharedExtras = { screens: [], links: [] };
const IDLE: SharedExtrasState = { status: "idle", shared: EMPTY };

let state: SharedExtrasState = IDLE;
let loadedAt = 0;
let wroteAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: SharedExtrasState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function toShared(value: unknown): SharedExtras {
  const raw = (value ?? {}) as Partial<SharedExtras>;
  return {
    screens: Array.isArray(raw.screens) ? raw.screens : [],
    links: Array.isArray(raw.links) ? raw.links : [],
  };
}

export function refreshSharedExtras(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && Date.now() - loadedAt < REFRESH_AFTER_MS) {
    return Promise.resolve();
  }
  if (state.status === "idle") publish({ ...state, status: "loading" });

  const bypass = Date.now() - wroteAt < BYPASS_AFTER_WRITE_MS;
  const url = bypass ? `${ENDPOINT}?friss=${Date.now()}` : ENDPOINT;
  const startedAt = Date.now();

  inflight = (async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const shared = toShared(await res.json());
      //* Ha közben írtunk, a válasz már régi lehet — a következő kör pótolja.
      if (wroteAt > startedAt) return;
      loadedAt = Date.now();
      publish({ status: "ready", shared });
    } catch {
      if (state.status !== "ready") publish({ ...state, status: "error" });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useSharedExtras(): SharedExtrasState {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => IDLE,
  );
  useEffect(() => {
    void refreshSharedExtras();
  }, []);
  return snapshot.status === "idle"
    ? { status: "loading", shared: EMPTY }
    : snapshot;
}

//* ---------------------------------------------------------------------------
//* KI VAGYOK ÉN — csak tanárnál kérdezzük meg
//* ---------------------------------------------------------------------------
export type TeacherSelf = { isTeacher: boolean; short: string | null };

let selfCache: { userId: string; promise: Promise<TeacherSelf> } | null = null;
const NOT_TEACHER: TeacherSelf = { isTeacher: false, short: null };

//! A MUNKAMENET `isTeacher` MEZŐJE CSAK AZT DÖNTI EL, KÉRDEZÜNK-E. Diáknál
//! (és vendégnél) egy kör sem megy ki; tanárnál a szerver mondja meg a jelét,
//! mert azt a tanárlistából kell feloldani.
export function useTeacherSelf(
  userId: string | null,
  sessionSaysTeacher: boolean,
): TeacherSelf {
  const [self, setSelf] = useState<TeacherSelf>(NOT_TEACHER);
  useEffect(() => {
    if (!userId || !sessionSaysTeacher) {
      setSelf(NOT_TEACHER);
      return;
    }
    if (selfCache?.userId !== userId) {
      selfCache = {
        userId,
        promise: fetch(`${ENDPOINT}/en`, { cache: "no-store" })
          .then((res) => (res.ok ? res.json() : NOT_TEACHER))
          .then((data: Partial<TeacherSelf>) => ({
            isTeacher: data.isTeacher === true,
            short: typeof data.short === "string" ? data.short : null,
          }))
          .catch(() => {
            selfCache = null;
            return NOT_TEACHER;
          }),
      };
    }
    let alive = true;
    void selfCache.promise.then((value) => {
      if (alive) setSelf(value);
    });
    return () => {
      alive = false;
    };
  }, [userId, sessionSaysTeacher]);
  return self;
}

//* ---------------------------------------------------------------------------
//* MÓDOSÍTÁSOK — a szerver válasza az igazság
//* ---------------------------------------------------------------------------
function describeError(code: unknown, status: number): string {
  if (status === 401 || code === "forbidden") {
    return "Ezt csak belépett tanár módosíthatja. Lépj be újra, és próbáld meg még egyszer.";
  }
  switch (code) {
    case "not-your-lesson":
      return "Linket csak az óra saját tanára tehet fel.";
    case "invalid-url":
      return "Ez nem érvényes webcím. Adj meg egy http:// vagy https:// kezdetű linket.";
    case "invalid-host":
      return "Helyi hálózati IP-címet adj meg, pl. 192.168.1.20 vagy 192.168.1.20:7070.";
    case "too-many":
      return "Elérted a menthető linkek felső határát. Törölj egy régit, és próbáld újra.";
    default:
      return status >= 500
        ? "A szerver most nem tudta elmenteni. Próbáld újra pár perc múlva."
        : "Nem sikerült a mentés. Próbáld újra.";
  }
}

async function send(
  method: "POST" | "PUT" | "DELETE",
  body: unknown,
): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
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
      message:
        "Nincs kapcsolat a szerverrel — ellenőrizd a netet, és próbáld újra.",
    };
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (data as { error?: unknown } | null)?.error;
    return { ok: false, message: describeError(code, res.status) };
  }
  wroteAt = Date.now();
  return { ok: true, data };
}

function update(change: (shared: SharedExtras) => SharedExtras) {
  publish({ status: "ready", shared: change(state.shared) });
}

export async function saveRoomScreen(
  room: string,
  address: ScreenAddress,
): Promise<MutationResult> {
  const result = await send("PUT", { kind: "screen", room, ...address });
  if (!result.ok) return result;
  const screen = (result.data as { screen: SharedScreen }).screen;
  update((shared) => ({
    ...shared,
    screens: [...shared.screens.filter((s) => s.room !== screen.room), screen],
  }));
  return { ok: true };
}

export async function removeRoomScreen(room: string): Promise<MutationResult> {
  const result = await send("DELETE", { kind: "screen", room });
  if (!result.ok) return result;
  const key = extrasKey(room);
  update((shared) => ({
    ...shared,
    screens: shared.screens.filter((s) => s.room !== key),
  }));
  return { ok: true };
}

export async function addTeacherLink(input: {
  teacher: string;
  subject: string;
  classes: string[];
  url: string;
  label: string | null;
}): Promise<MutationResult> {
  const result = await send("POST", { kind: "link", ...input });
  if (!result.ok) return result;
  const link = (result.data as { link: TeacherLink }).link;
  update((shared) => ({ ...shared, links: [...shared.links, link] }));
  return { ok: true };
}

export async function removeTeacherLink(id: string): Promise<MutationResult> {
  const result = await send("DELETE", { kind: "link", id });
  if (!result.ok) return result;
  update((shared) => ({
    ...shared,
    links: shared.links.filter((l) => l.id !== id),
  }));
  return { ok: true };
}
