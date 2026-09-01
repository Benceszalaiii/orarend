"use client";

import {
  ArrowUpRight,
  Clock3,
  EyeOff,
  MapPin,
  Sparkles,
  Undo2,
  User,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { accentStyle } from "@/lib/accent";
import type { LessonRun } from "@/lib/timetable-merge";
import { cn } from "@/lib/utils";
import { durationLabel, rangeLabel } from "./shared";

export type CalendarEvent = {
  id: string;
  title: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  room: string;
  szakkorName: string;
  szakkorSlug: string;
  kozossegi: boolean;
  cancelled: boolean;
};

//* ---------------------------------------------------------------------------
//* Részletlap — a kártya kinagyítva
//* ---------------------------------------------------------------------------
//! MOBILON EZ NEM LUXUS. A rács kártyája idő-arányos: egy 45 perces óra
//! telefonon ~50 px magas, ahol a terem és a tanár már nem fér ki, a `title`
//! buboréknak pedig nincs érintéses megfelelője. Eddig a diák telefonon
//! egyszerűen NEM tudta megnézni, melyik teremben lesz az órája.
//*
//* A megnyitás a `view-transition-name: tt-focus` párral MORF: ugyanaz a doboz
//* nő ki lappá, és záráskor visszahúzódik a saját kártyájába — így sosem kell
//* megkeresni, honnan jött. (Ahol nincs View Transitions API, ott egyszerűen
//* megjelenik: a tartalom ugyanaz.)

export type FocusTarget =
  | { kind: "lesson"; key: string; run: LessonRun; dayLabel: string }
  | { kind: "event"; key: string; event: CalendarEvent; dayLabel: string };

const MORPH_NAME = "tt-focus";

export function LessonSheet({
  target,
  morph,
  onClose,
  onUndoMerge,
}: {
  target: FocusTarget;
  //* Fut-e view transition — ilyenkor a Radix saját be-/kifutása nem kell.
  morph: boolean;
  onClose: () => void;
  onUndoMerge: (identities: string[]) => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        style={morph ? { viewTransitionName: MORPH_NAME } : undefined}
        //! UGYANEZ A FÁTYOLRA. A morf pillanatképe közvetlenül a commit után
        //! készül — ha a fátyol ilyenkor még a 100 ms-os beúszása elején jár,
        //! a felvett képen se sötétítés, se elmosás nincs. Az átmenet a
        //! VÉGÉN dobja el a pillanatképeket, és ekkor villan be egyszerre a
        //! kész elmosás. Némán, kész állapotban kell a képre kerülnie, hogy
        //! a `root` átúsztatása maga vigye fel az elmosást.
        overlayClassName={cn(
          "duration-0 data-open:animate-none data-closed:animate-none",
          //! Csak morf mellett halasztjuk az elmosást: e nélkül (csökkentett
          //! mozgás, vagy ahol nincs View Transitions API) nincs pillanatkép,
          //! ami elnyelné — ott az azonnali elmosás a helyes, és a késleltetés
          //! csak indokolatlan üresjárat lenne.
          morph && "tt-scrim-deferred",
        )}
        className={cn(
          "gap-0 overflow-hidden p-0 sm:max-w-md",
          //* Mobilon alsó lap: a hüvelykujj közelében nyílik.
          "max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none",
          //! A mozgást a morf adja, nem a Radix — különben kétszer mozogna.
          "duration-0 data-closed:animate-none data-open:animate-none",
        )}
      >
        {target.kind === "lesson" ? (
          <LessonBody
            run={target.run}
            dayLabel={target.dayLabel}
            onUndoMerge={onUndoMerge}
            onClose={onClose}
          />
        ) : (
          <EventBody
            event={target.event}
            dayLabel={target.dayLabel}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

//* A lap fejléce a kártya színét viszi tovább — ez köti össze a kettőt.
function SheetHead({
  seed,
  strong = false,
  title,
  sub,
  children,
}: {
  seed: string;
  strong?: boolean;
  title: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-b px-4 py-3.5",
        strong ? "acc-tint-strong" : "acc-tint",
      )}
      style={accentStyle(seed)}
    >
      <DialogTitle className="text-balance break-words text-lg font-bold leading-tight tracking-tight text-foreground">
        {title}
      </DialogTitle>
      <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-foreground/70">
        {sub}
        {children}
      </DialogDescription>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3 px-4 py-2.5">
      <Icon className="size-4 shrink-0 translate-y-0.5 text-muted-foreground" />
      <span className="w-20 shrink-0 text-xs text-muted-strong">{label}</span>
      <span className="min-w-0 flex-1 text-pretty break-words text-sm font-medium text-foreground">
        {children}
      </span>
    </div>
  );
}

function LessonBody({
  run,
  dayLabel,
  onUndoMerge,
  onClose,
}: {
  run: LessonRun;
  dayLabel: string;
  onUndoMerge: (identities: string[]) => void;
  onClose: () => void;
}) {
  const { lesson } = run;
  const seed = lesson.subjectShort || lesson.subject;
  const rooms = run.rooms.filter(Boolean);
  return (
    <>
      <SheetHead
        seed={seed}
        title={lesson.subject || seed}
        sub={`${dayLabel} · ${rangeLabel(run.startMin, run.endMin)}`}
      >
        {lesson.group && (
          <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-semibold">
            {lesson.group}
          </span>
        )}
      </SheetHead>

      <div className="divide-y divide-border">
        {/*//! A TEREM AZ ELSŐ SOR. Ezért nyitja meg valaki a kártyát: „hova
            //! menjek". Minden más — időtartam, tanár, csoport — utána jön. */}
        {rooms.length > 0 && (
          <Row icon={MapPin} label="Terem">
            <span className="text-base font-bold tabular-nums">
              {rooms.join(" → ")}
            </span>
            {rooms.length > 1 && (
              //! TEREMVÁLTÁS a blokkon belül: itt óránként kibontva, mert a
              //! kártyán csak a nyíl fér el. Ez az a pillanat, amikor a diák
              //! rossz ajtó előtt állna.
              <span className="mt-1.5 flex flex-col gap-0.5 text-xs font-normal text-muted-strong">
                {run.segments.map((segment) => (
                  <span key={`${segment.startMin}-${segment.room}`}>
                    <span className="tabular-nums">
                      {rangeLabel(segment.startMin, segment.endMin)}
                    </span>{" "}
                    — <span className="font-medium">{segment.room || "?"}</span>
                  </span>
                ))}
              </span>
            )}
          </Row>
        )}

        <Row icon={Clock3} label="Időtartam">
          {durationLabel(run.endMin - run.startMin)}
          {run.lessonCount > 1 && (
            <span className="ml-1.5 font-normal text-muted-strong">
              · {run.lessonCount} egymást követő óra
            </span>
          )}
          {run.breaks.length > 0 && (
            //! A blokk EGY kártya, de nem egybefüggő: a szüneteket ki kell
            //! mondani, különben a lap hazudna 100 perc tanítást.
            <span className="mt-1 block text-xs font-normal text-muted-strong">
              Szünet:{" "}
              {run.breaks
                .map((b) => rangeLabel(b.startMin, b.endMin))
                .join(", ")}
            </span>
          )}
        </Row>

        {lesson.teacher && (
          <Row icon={User} label="Tanár">
            {lesson.teacher}
          </Row>
        )}
        {lesson.group && (
          <Row icon={Users} label="Csoport">
            {lesson.group}
          </Row>
        )}

        {run.hidden.length > 0 && (
          //* Amit az összevonás elrejtett — itt is visszavonható, nem csak a
          //* kártya kis jelvényén.
          <div className="px-4 py-3">
            <p className="flex items-center gap-2 text-xs text-muted-strong">
              <EyeOff className="size-3.5 shrink-0" aria-hidden />
              Emiatt a döntés miatt rejtve:
            </p>
            <ul className="mt-2 space-y-1.5">
              {run.hidden.map((option) => (
                <li
                  key={option.identity}
                  className="flex items-start justify-between gap-2 text-sm"
                >
                  {/*//! ITT NEM SZABAD CSONKOLNI, és a `truncate` ráadásul
                      //! ÁRTOTT is: a `white-space: nowrap` teljes szélessége a
                      //! lap rács-oszlopának min-content mérete lett (a
                      //! `min-w-0` ezen nem segít), így a hosszú jedlikes
                      //! tantárgynevek szétfeszítették a lapot, és mobilon a
                      //! „Vissza" gomb kilógott a képernyőről. Törjön több
                      //! sorba — van rá hely függőlegesen. */}
                  <span className="min-w-0 flex-1 text-pretty break-words text-foreground/80">
                    {option.lesson.subject}
                    {option.lesson.group && (
                      <span className="ml-1.5 text-xs text-muted-strong">
                        {option.lesson.group}
                      </span>
                    )}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 gap-1.5 rounded-full px-2 text-xs"
                    onClick={() => {
                      onUndoMerge([option.identity]);
                      onClose();
                    }}
                  >
                    <Undo2 className="size-3" aria-hidden />
                    Vissza
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <SheetFoot onClose={onClose} />
    </>
  );
}

function EventBody({
  event,
  dayLabel,
  onClose,
}: {
  event: CalendarEvent;
  dayLabel: string;
  onClose: () => void;
}) {
  return (
    <>
      <SheetHead
        seed={event.szakkorSlug}
        strong
        title={event.title}
        sub={`${dayLabel} · ${rangeLabel(event.startMin, event.endMin)}`}
      >
        {event.cancelled && (
          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">
            Elmarad
          </span>
        )}
      </SheetHead>

      <div className="divide-y divide-border">
        {event.room && (
          <Row icon={MapPin} label="Terem">
            <span className="text-base font-bold tabular-nums">
              {event.room}
            </span>
          </Row>
        )}
        <Row icon={Clock3} label="Időtartam">
          {durationLabel(event.endMin - event.startMin)}
        </Row>
        <Row icon={Users} label="Szakkör">
          {event.szakkorName}
        </Row>
        {event.kozossegi && !event.cancelled && (
          <Row icon={Sparkles} label="Közösségi">
            Ezért az alkalomért közösségi óra jár.
          </Row>
        )}
      </div>

      <SheetFoot onClose={onClose}>
        <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground">
          Szakkör megnyitása
          <ArrowUpRight className="size-3.5" aria-hidden />
        </span>
      </SheetFoot>
    </>
  );
}

function SheetFoot({
  onClose,
  children,
}: {
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/40 px-4 py-3">
      <Button
        size="sm"
        variant="ghost"
        className="h-9 rounded-full px-4 text-xs"
        onClick={onClose}
      >
        Bezárás
      </Button>
      {children}
    </div>
  );
}
