"use client";

import {
  CalendarPlus,
  CalendarSearch,
  Check,
  DoorOpen,
  Info,
  Loader2,
  Monitor,
} from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { TimeSuggestion } from "@/lib/club-planner";
import type { RoomPlan, TimePlan } from "@/lib/club-planner-source";
import { formatMinute, WEEKDAY_NAMES } from "@/lib/clubs";
import { cn } from "@/lib/utils";
import {
  type AddSlotResult,
  addPlannedSlot,
  suggestRooms,
  suggestTimes,
} from "./planner-actions";

//* ---------------------------------------------------------------------------
//* IDŐPONT- ÉS TEREMKERESŐ — A SZAKKÖR VEZETŐJÉNEK
//* ---------------------------------------------------------------------------
//! KÉT LÉPÉS, KÉT GOMB. Előbb az időpont (a tagok és a vezető órarendjéből),
//! aztán az ahhoz szabad termek — mert a terem az időponttól függ, fordítva
//! nem. A géptermes keresés ugyanaz a kérdés, szűkítve: a programozás-
//! szakkörnek a szabad 207-es semmit nem ér.

//! EGY VAGY KÉT TANÓRA — a csengetési rendhez illő hosszak. A mostani
//! időpont hosszához a közelebbit választjuk előre.
const DURATIONS = [45, 90] as const;

const BASIS_UNIT: Record<"members" | "classes" | "teachers", string> = {
  members: "tag",
  classes: "osztály",
  teachers: "",
};

export function ClubPlanner({
  slug,
  defaultDuration,
}: {
  slug: string;
  defaultDuration: number;
}) {
  const [duration, setDuration] = useState<number>(
    defaultDuration >= 68 ? 90 : 45,
  );
  const [times, setTimes] = useState<TimePlan | null>(null);
  const [picked, setPicked] = useState<TimeSuggestion | null>(null);
  const [rooms, setRooms] = useState<
    (RoomPlan & { onlyComputers: boolean }) | null
  >(null);
  const [timesPending, startTimes] = useTransition();
  const [roomsPending, startRooms] = useTransition();
  const [roomMode, setRoomMode] = useState<boolean | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [added, setAdded] = useState<AddSlotResult | null>(null);
  const [addPending, startAdd] = useTransition();

  function pick(s: TimeSuggestion | null) {
    setPicked(s);
    setRooms(null);
    setRoom(null);
    setAdded(null);
  }

  function findTimes() {
    pick(null);
    startTimes(async () => {
      const result = await suggestTimes(slug, duration);
      setTimes(result);
      if (result.ok && result.suggestions.length > 0) {
        pick(result.suggestions[0]);
      }
    });
  }

  function addSlot() {
    if (!picked) return;
    startAdd(async () => {
      setAdded(
        await addPlannedSlot({
          slug,
          weekday: picked.weekday,
          startMin: picked.startMin,
          endMin: picked.endMin,
          room,
        }),
      );
    });
  }

  function findRooms(onlyComputers: boolean) {
    if (!picked) return;
    setRoomMode(onlyComputers);
    setRoom(null);
    setAdded(null);
    startRooms(async () => {
      const result = await suggestRooms({
        slug,
        weekday: picked.weekday,
        startMin: picked.startMin,
        endMin: picked.endMin,
        onlyComputers,
      });
      setRooms({ ...result, onlyComputers });
    });
  }

  const unit = times?.ok ? BASIS_UNIT[times.basis] : "";

  return (
    <section
      className="mt-10 rounded-xl border border-border p-4 sm:p-5"
      aria-labelledby="planner-heading"
    >
      <h2 id="planner-heading" className="text-lg font-semibold">
        Időpont- és teremkereső
      </h2>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <fieldset className="flex rounded-full border border-border p-0.5">
          <legend className="sr-only">Időtartam</legend>
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={duration === d}
              onClick={() => setDuration(d)}
              className={cn(
                "rounded-full px-3 py-1 text-sm tabular-nums transition-colors",
                duration === d
                  ? "bg-foreground text-background"
                  : "text-muted-strong hover:text-foreground",
              )}
            >
              {d} perc
            </button>
          ))}
        </fieldset>
        <Button
          onClick={findTimes}
          disabled={timesPending}
          className="rounded-full"
        >
          {timesPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <CalendarSearch aria-hidden />
          )}
          Legjobb időpont keresése
        </Button>
      </div>

      {times && !times.ok && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {times.error}
        </p>
      )}

      {times?.ok && (
        <div className="mt-4">
          {times.suggestions.length === 0 ? (
            <p className="text-sm text-muted-strong">
              Nincs olyan {times.durationMin} perces sáv, amikor a vezető(k)
              ráérnek. Próbálj rövidebb időtartamot.
            </p>
          ) : (
            <>
              {times.basis === "classes" && (
                <p className="mb-2 text-xs text-muted-strong">
                  Még nincs tagja, ezért a célzott osztályok órarendjéből
                  számoltunk.
                </p>
              )}
              {times.basis === "teachers" && (
                //! KIMONDVA, NEM APRÓBETŰVEL. Tagok nélkül a javaslat a
                //! vezető lyukasóráit is hozza — tanítási időben is. Ez
                //! hasznos (a legolcsóbb időpont a tanárnak), de csak akkor,
                //! ha a tanár tudja, hogy a diákok órarendjét nem néztük.
                <div
                  role="note"
                  className="mb-3 flex gap-2.5 rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm"
                >
                  <Info
                    className="mt-0.5 size-4 shrink-0 text-muted-strong"
                    aria-hidden
                  />
                  <p className="text-pretty">
                    <span className="font-medium">
                      A szakkörnek még nincs tagja.
                    </span>{" "}
                    <span className="text-muted-strong">
                      Ezek csak a vezető(k) szabad sávjai — a diákok órarendjét
                      nem néztük, így tanítási időbe is eshetnek. Ha
                      jelentkeznek tagok, vagy megadsz célzott osztályokat, az ő
                      órarendjük szerint keresünk.
                    </span>
                  </p>
                </div>
              )}
              <ul
                aria-label="Javasolt időpontok"
                className="divide-y divide-border rounded-lg border border-border"
              >
                {times.suggestions.map((s) => {
                  const active =
                    picked?.weekday === s.weekday &&
                    picked.startMin === s.startMin;
                  return (
                    <li key={`${s.weekday}-${s.startMin}`}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => pick(s)}
                        className={cn(
                          "flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors",
                          active ? "bg-muted" : "hover:bg-muted/50",
                        )}
                      >
                        <span className="text-sm font-medium sm:w-44">
                          {WEEKDAY_NAMES[s.weekday]}{" "}
                          <span className="tabular-nums">
                            {formatMinute(s.startMin)}–{formatMinute(s.endMin)}
                          </span>
                        </span>
                        {s.total > 0 ? (
                          <span className="text-sm tabular-nums text-muted-strong">
                            {s.free}/{s.total} {unit} ráér
                            {s.unknown > 0 ? ` · ${s.unknown} nem tudjuk` : ""}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-strong">
                            a vezető ráér
                          </span>
                        )}
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                          {s.waitMinutes === 0
                            ? "nincs várakozás"
                            : `átl. ${s.waitMinutes} perc várakozás`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {picked && picked.busy.length > 0 && (
                <p className="mt-2 text-pretty text-xs text-muted-strong">
                  <span className="font-medium">Nem ér rá:</span>{" "}
                  {picked.busy.map((b) => b.label).join(", ")}
                </p>
              )}
              {times.unplaced > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {times.unplaced} tag fiókjában nincs osztály, róluk nem tudunk
                  semmit.
                </p>
              )}

              {picked && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="rounded-full"
                    disabled={roomsPending}
                    onClick={() => findRooms(false)}
                  >
                    {roomsPending && roomMode === false ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      <DoorOpen aria-hidden />
                    )}
                    Szabad termek ekkor
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full"
                    disabled={roomsPending}
                    onClick={() => findRooms(true)}
                  >
                    {roomsPending && roomMode === true ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      <Monitor aria-hidden />
                    )}
                    Szabad géptermek ekkor
                  </Button>
                </div>
              )}

              {rooms && picked && (
                <RoomList
                  rooms={rooms}
                  picked={picked}
                  selected={room}
                  onSelect={(short) => {
                    setRoom((r) => (r === short ? null : short));
                    setAdded(null);
                  }}
                />
              )}

              {picked && (
                <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-4">
                  <Button
                    onClick={addSlot}
                    disabled={addPending || added?.ok === true}
                    className="rounded-full"
                  >
                    {addPending ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : added?.ok ? (
                      <Check aria-hidden />
                    ) : (
                      <CalendarPlus aria-hidden />
                    )}
                    {added?.ok ? "Felvéve" : "Felvétel időpontnak"}
                  </Button>
                  <span
                    className="text-sm tabular-nums text-muted-strong"
                    aria-live="polite"
                  >
                    {added?.ok
                      ? `${added.label} — kint van a szakkör időpontjai között.`
                      : `${WEEKDAY_NAMES[picked.weekday]} ${formatMinute(picked.startMin)}–${formatMinute(picked.endMin)}${room ? ` · ${room}` : " · terem nélkül"}`}
                  </span>
                  {added && !added.ok && (
                    <p role="alert" className="w-full text-sm text-destructive">
                      {added.error}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function RoomList({
  rooms,
  picked,
  selected,
  onSelect,
}: {
  rooms: RoomPlan & { onlyComputers: boolean };
  picked: TimeSuggestion;
  selected: string | null;
  onSelect: (short: string) => void;
}) {
  if (!rooms.ok) {
    return (
      <p role="alert" className="mt-3 text-sm text-destructive">
        {rooms.error}
      </p>
    );
  }
  const when = `${WEEKDAY_NAMES[picked.weekday]} ${formatMinute(picked.startMin)}–${formatMinute(picked.endMin)}`;
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold">
        {rooms.onlyComputers ? "Szabad géptermek" : "Szabad termek"} · {when}
      </h3>
      {rooms.free.length === 0 ? (
        <p className="mt-2 text-sm text-muted-strong">
          {rooms.onlyComputers
            ? "Ebben a sávban egyetlen gépterem sem szabad mindkét héten."
            : "Ebben a sávban egyetlen terem sem szabad mindkét héten."}
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {rooms.free.map((room) => (
            <li key={room.short}>
              {/* A terem kiválasztása a felvételhez; újra rákattintva elengedi. */}
              <button
                type="button"
                aria-pressed={selected === room.short}
                onClick={() => onSelect(room.short)}
                title={room.name !== room.short ? room.name : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                  selected === room.short
                    ? "border-foreground bg-foreground text-background"
                    : room.reason
                      ? "border-foreground/40 hover:bg-muted/50"
                      : "border-border hover:bg-muted/50",
                )}
              >
                {room.computer && !rooms.onlyComputers && (
                  <Monitor
                    className="size-3.5 text-muted-strong"
                    aria-label="gépterem"
                  />
                )}
                <span className="font-medium">{room.short}</span>
                {room.reason && (
                  <span
                    className={cn(
                      "text-xs",
                      selected === room.short
                        ? "text-background/70"
                        : "text-muted-strong",
                    )}
                  >
                    {room.reason === "current" ? "mostani terme" : "itt tanít"}
                  </span>
                )}
                {room.freeUntil !== null && (
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      selected === room.short
                        ? "text-background/70"
                        : "text-muted-foreground",
                    )}
                  >
                    {formatMinute(room.freeUntil)}-ig
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Csak azok a termek, amelyek mindkét vizsgált héten szabadok ebben a
        sávban. Válassz egyet, és a felvételkor az lesz a szakkör terme.
        {rooms.unknown.length > 0 &&
          ` Nem tudtuk lekérni: ${rooms.unknown.join(", ")}.`}
      </p>
    </div>
  );
}
