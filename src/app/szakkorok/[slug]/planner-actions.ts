"use server";

import { revalidatePath } from "next/cache";
import { canEditClub } from "@/lib/club-access";
import { LATEST_END } from "@/lib/club-planner";
import {
  planClubRooms,
  planClubTimes,
  type RoomPlan,
  type TimePlan,
} from "@/lib/club-planner-source";
import { invalidateScheduleClubs, resolveActor } from "@/lib/club-store";
import { formatSlot } from "@/lib/clubs";
import { loadRoomList } from "@/lib/free-rooms-source";
import prisma from "@/lib/prisma";

//! A TERVEZŐ A SZAKKÖR SZERKESZTŐJÉÉ. Egy kérdés akár húsz órarend-lekérés
//! (és egy teljes teremseprés); ezt nem nyitjuk meg bárkinek, aki a lapot
//! nézi. Ugyanaz a jog, mint a szerkesztésé (`canEditClub`) — akinek az
//! időpontot joga van átírni, az kérdezheti meg, mire írja át.
async function allowed(slug: string): Promise<boolean> {
  const actor = await resolveActor();
  if (!actor) return false;
  const club = await prisma.club.findUnique({
    where: { slug },
    select: {
      status: true,
      proposedById: true,
      organizers: { select: { teacher: true } },
    },
  });
  if (!club) return false;
  return canEditClub(actor, {
    status: club.status,
    proposedById: club.proposedById,
    organizers: club.organizers.map((o) => o.teacher),
  });
}

//! EGY VAGY KÉT TANÓRA. A 60 perc sehova nem illik a csengetési rendben:
//! 9:50–10:50 a 4. óra közepén ér véget, és senki nem jegyzi meg.
const DURATIONS: ReadonlySet<number> = new Set([45, 90]);
const DENIED = "Ezt csak a szakkör vezetője használhatja.";

export async function suggestTimes(
  slug: string,
  durationMin: number,
): Promise<TimePlan> {
  if (!DURATIONS.has(durationMin)) {
    return { ok: false, error: "Érvénytelen időtartam." };
  }
  if (!(await allowed(slug))) return { ok: false, error: DENIED };
  return planClubTimes(slug, durationMin);
}

function validBand(input: {
  weekday: number;
  startMin: number;
  endMin: number;
}): boolean {
  const { weekday, startMin, endMin } = input;
  return (
    Number.isInteger(weekday) &&
    weekday >= 1 &&
    weekday <= 5 &&
    Number.isInteger(startMin) &&
    Number.isInteger(endMin) &&
    startMin >= 0 &&
    endMin > startMin &&
    endMin <= LATEST_END
  );
}

export async function suggestRooms(input: {
  slug: string;
  weekday: number;
  startMin: number;
  endMin: number;
  onlyComputers: boolean;
}): Promise<RoomPlan> {
  if (!validBand(input)) return { ok: false, error: "Érvénytelen időpont." };
  if (!(await allowed(input.slug))) return { ok: false, error: DENIED };
  return planClubRooms({
    ...input,
    onlyComputers: input.onlyComputers === true,
  });
}

//* ---------------------------------------------------------------------------
//* EGY KATTINTÁSSAL FELVENNI
//* ---------------------------------------------------------------------------
//! A JAVASLATBÓL IDŐPONT. Eddig a tanár kiírta magának, átment a szerkesztőbe,
//! és kézzel vitte fel ugyanazt. Itt a kiválasztott sáv (és ha választott,
//! a terem) egy új rendszeres időpont lesz — a többi időpontot nem bántjuk.
//!
//! `ORGANIZER` FORRÁS: a Jedlikinfóban ez az időpont még nincs benne, csak a
//! vezető szerint van. Ha később a kártyája megjelenik, a szerkesztőben
//! átállítható.
export type AddSlotResult =
  | { ok: true; label: string }
  | { ok: false; error: string };

const MAX_SLOTS = 10;

export async function addPlannedSlot(input: {
  slug: string;
  weekday: number;
  startMin: number;
  endMin: number;
  room: string | null;
}): Promise<AddSlotResult> {
  if (!validBand(input)) return { ok: false, error: "Érvénytelen időpont." };
  if (!DURATIONS.has(input.endMin - input.startMin)) {
    return { ok: false, error: "Érvénytelen időtartam." };
  }
  if (!(await allowed(input.slug))) return { ok: false, error: DENIED };

  const club = await prisma.club.findUnique({
    where: { slug: input.slug },
    select: {
      id: true,
      organizers: { select: { teacher: true, lead: true } },
      slots: {
        select: { weekday: true, startMinute: true, endMinute: true },
      },
    },
  });
  if (!club) return { ok: false, error: "Nincs ilyen szakkör." };
  if (club.organizers.length === 0) {
    return { ok: false, error: "A szakkörnek nincs vezető tanára." };
  }
  if (club.slots.length >= MAX_SLOTS) {
    return { ok: false, error: "A szakkörnek már 10 időpontja van." };
  }
  //* Ugyanaz a nap, egymásba lógó sáv: az dupla alkalom lenne a rácson.
  const clash = club.slots.find(
    (s) =>
      s.weekday === input.weekday &&
      s.startMinute < input.endMin &&
      input.startMin < s.endMinute,
  );
  if (clash) {
    return {
      ok: false,
      error: `Ebben a sávban már van időpontja (${formatSlot(clash)}).`,
    };
  }

  let room: string | null = null;
  if (input.room !== null) {
    const rooms = await loadRoomList();
    if (!rooms) {
      return {
        ok: false,
        error:
          "A teremlista most nem érhető el a Jedlikinfóban. Próbáld újra pár perc múlva, vagy vedd fel terem nélkül.",
      };
    }
    const match = rooms.find((r) => r.short === input.room);
    if (!match) return { ok: false, error: "Ismeretlen terem." };
    room = match.short;
  }

  //* A vezető elöl, legfeljebb négyen — ugyanaz a korlát, mint az űrlapon.
  const teachers = [...club.organizers]
    .sort((a, b) => Number(b.lead) - Number(a.lead))
    .map((o) => o.teacher)
    .slice(0, 4);
  await prisma.clubSlot.create({
    data: {
      clubId: club.id,
      weekday: input.weekday,
      startMinute: input.startMin,
      endMinute: input.endMin,
      room,
      teachers,
      source: "ORGANIZER",
    },
  });
  invalidateScheduleClubs();
  revalidatePath("/szakkorok");
  revalidatePath(`/szakkorok/${input.slug}`);
  const label = formatSlot({
    weekday: input.weekday,
    startMinute: input.startMin,
    endMinute: input.endMin,
  });
  return { ok: true, label: room ? `${label} · ${room}` : label };
}
