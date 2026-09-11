"use client";

import { useEffect, useSyncExternalStore } from "react";
import type {
  LessonExtras,
  LessonLink,
  ScreenAddress,
  ScreenHost,
} from "./lesson-extras";

//! ═══════════════════════════════════════════════════════════════════════════
//! AZ ÓRÁHOZ KÖTÖTT LINKEK ÉS KIVETÍTŐ-CÍMEK — A BÖNGÉSZŐ OLDALA
//! ═══════════════════════════════════════════════════════════════════════════
//! Egy modulszintű tároló, nem komponensállapot: a részletlap minden
//! megnyitáskor újra felépül, a sorokat viszont nem akarjuk minden kártya
//! megérintésekor újra letölteni. Egy lekérés hozza az ÖSSZESET (egy diáknak
//! legfeljebb pár tucat sor), a lap pedig helyben keres benne.
//!
//! A SZINKRON A MEGNYITÁSKOR TÖRTÉNIK. Ha a sorok egy percnél régebbiek, a
//! következő megnyitás a háttérben frissít — így a telefonon felvett link a
//! gépen is megjelenik, lapújratöltés nélkül.
//!
//! AKI NINCS BEJELENTKEZVE, ANNÁL EGYETLEN KÉRÉS SEM MEGY KI.
//! ═══════════════════════════════════════════════════════════════════════════

const ENDPOINT = "/api/ora-kiegeszitok";
const REFRESH_AFTER_MS = 60_000;

type Status = "idle" | "loading" | "ready" | "error";

export type LessonExtrasState = {
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

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => IDLE;

function toExtras(value: unknown): LessonExtras {
  const raw = (value ?? {}) as Partial<LessonExtras>;
  return {
    links: Array.isArray(raw.links) ? raw.links : [],
    screens: Array.isArray(raw.screens) ? raw.screens : [],
  };
}

async function refresh(userId: string): Promise<void> {
  //! FIÓKVÁLTÁSKOR AZ ELŐZŐ FELHASZNÁLÓ SORAI AZONNAL ELTŰNNEK — nem várjuk
  //! meg az új választ, különben egy pillanatig a másik diák linkjei látszanának.
  if (state.userId !== userId) {
    loadedAt = 0;
    publish({ userId, status: "loading", extras: EMPTY });
  }
  if (inflight?.userId === userId) return inflight.promise;
  if (Date.now() - loadedAt < REFRESH_AFTER_MS) return;

  const promise = (async () => {
    try {
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
    if (userId) {
      void refresh(userId);
    } else if (state.userId !== null) {
      loadedAt = 0;
      publish(IDLE);
    }
  }, [userId]);

  if (!userId) return IDLE;
  return snapshot.userId === userId
    ? snapshot
    : { userId, status: "loading", extras: EMPTY };
}

//* ---------------------------------------------------------------------------
//* MÓDOSÍTÁSOK
//* ---------------------------------------------------------------------------
//! A SZERVER VÁLASZA AZ IGAZSÁG, NEM A KÉRÉS. A mentett sort a szerver
//! kanonikus alakjában (kisbetűs kulcs, kiegészített cím) tesszük a tárolóba —
//! így a lap pontosan azt mutatja, ami a másik készüléken is meg fog jelenni.

function describeError(code: unknown, status: number): string {
  if (status === 401)
    return "Lejárt a belépésed. Lépj be újra, és próbáld meg még egyszer.";
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
    return {
      ok: false,
      message: describeError(
        (data as { error?: unknown } | null)?.error,
        res.status,
      ),
    };
  }
  return { ok: true, data };
}

function update(
  userId: string,
  change: (extras: LessonExtras) => LessonExtras,
) {
  if (state.userId !== userId) return;
  publish({ ...state, status: "ready", extras: change(state.extras) });
}

export async function addLessonLink(
  userId: string,
  input: {
    teacher: string;
    subject: string;
    url: string;
    label: string | null;
  },
): Promise<MutationResult> {
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
  userId: string,
  id: string,
): Promise<MutationResult> {
  const result = await send("DELETE", { kind: "link", id });
  if (!result.ok) return result;
  update(userId, (extras) => ({
    ...extras,
    links: extras.links.filter((l) => l.id !== id),
  }));
  return { ok: true };
}

export async function saveScreenHost(
  userId: string,
  input: { teacher: string; room: string } & ScreenAddress,
): Promise<MutationResult> {
  const result = await send("PUT", input);
  if (!result.ok) return result;
  const screen = (result.data as { screen: ScreenHost }).screen;
  update(userId, (extras) => ({
    ...extras,
    screens: [
      ...extras.screens.filter(
        (s) => !(s.teacher === screen.teacher && s.room === screen.room),
      ),
      screen,
    ],
  }));
  return { ok: true };
}

export async function removeScreenHost(
  userId: string,
  screen: Pick<ScreenHost, "teacher" | "room">,
): Promise<MutationResult> {
  const result = await send("DELETE", { kind: "screen", ...screen });
  if (!result.ok) return result;
  update(userId, (extras) => ({
    ...extras,
    screens: extras.screens.filter(
      (s) => !(s.teacher === screen.teacher && s.room === screen.room),
    ),
  }));
  return { ok: true };
}
