"use client";

import { Merge, Undo2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { accentStyle } from "@/lib/accent";
import type {
  ClusterChoice,
  ClusterOption,
  ConflictCluster,
  GhostBlock,
} from "@/lib/timetable-merge";
import { groupLabel } from "@/lib/timetable-merge";
import { cn } from "@/lib/utils";
import { CELL_RADIUS, durationLabel, rangeLabel } from "./shared";

//* ---------------------------------------------------------------------------
//* Ütközés-feloldás vezérlői
//* ---------------------------------------------------------------------------
//! A szín SOHA nem az egyetlen jel: minden vezérlő ikont ÉS feliratot hordoz
//! (a két német csoport azonos tantárgy-színt kap, a csoportnév különbözteti
//! meg őket). A kék a DESIGN.md szerint az interakció színe — a piros itt tilos.

//* Egy versengő óra sora (egy kombináción belül lehet több is).
function OptionLine({ option }: { option: ClusterOption }) {
  const { lesson } = option;
  const group = groupLabel(lesson.group, lesson.subject);
  return (
    <span className="flex min-w-0 items-start gap-2.5">
      <span
        className="mt-1 size-2.5 shrink-0 rounded-full acc-dot"
        style={accentStyle(lesson.subjectShort || lesson.subject)}
        aria-hidden
      />
      {/*//! ITT NEM SZABAD CSONKOLNI. Ez DÖNTÉSI felület: a diák a két ág neve
          //! alapján választ, és a jedlikes tantárgynevek hosszúak („Informatikai
          //! rendszerüzemeltető szakmai idegen nyelv"). A `truncate` ráadásul
          //! flex-gyerekként `min-w-0` nélkül nem is csonkolt, hanem KILÓGOTT a
          //! buborékból. Törjön több sorba — van rá hely függőlegesen. */}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="min-w-0 text-pretty break-words text-sm font-semibold text-foreground">
            {lesson.subject}
          </span>
          {group && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[11px] font-medium text-foreground/75">
              {group}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-strong">
          <span className="tabular-nums">
            {rangeLabel(lesson.startMin, lesson.endMin)}
          </span>
          {lesson.room && (
            <>
              <span aria-hidden>·</span>
              {/*//* A terem a legfontosabb megkülönböztető adat — kiemelve. */}
              <span className="font-semibold tabular-nums text-foreground/80">
                {lesson.room}
              </span>
            </>
          )}
          {lesson.teacher && (
            <>
              <span aria-hidden>·</span>
              <span className="min-w-0 break-words">{lesson.teacher}</span>
            </>
          )}
        </span>
      </span>
    </span>
  );
}

//! EGY VÁLASZTHATÓ KOMBINÁCIÓ. Általában egyetlen óra, de nem mindig: ha az
//! ütköző sávban vannak egymással ÖSSZEFÉRŐ órák (pl. kLANe 08:55–10:35 és iot
//! 10:50–12:30 nem fedi egymást, csak a Mobil 09:50–12:30 ütközik mindkettővel),
//! akkor a valódi döntés „kLANe + iot" VAGY „Mobil". Ilyenkor a gomb több órát
//! sorol fel — különben a diák hamis vagy-vagyot kapna.
function ChoiceButton({
  choice,
  onSelect,
}: {
  choice: ClusterChoice;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 text-left transition-colors",
        "hover:border-primary/60 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      {choice.options.map((option, index) => (
        <span key={option.identity} className="contents">
          {index > 0 && (
            //* Két óra EGY kombinációban: a "+" ikon és az "és" szó ugyanazt
            //* mondaná — a szó marad, az egyértelműbb.
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-strong">
              <span className="h-px w-3 bg-border" aria-hidden />
              és
            </span>
          )}
          <OptionLine option={option} />
        </span>
      ))}
    </button>
  );
}

//* Az összevonás GOMBJA — a feloldatlan ütközés két kártyája közti varraton ül.
export function MergeButton({
  cluster,
  top,
  height,
  dayName,
  onChoose,
}: {
  cluster: ConflictCluster;
  top: number;
  height: number;
  dayName: string;
  onChoose: (clusterKey: string, chosen: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = `${cluster.options.length} óra ütközik ${dayName} ${rangeLabel(
    cluster.startMin,
    cluster.endMin,
  )} között — válaszd ki, melyikre jársz`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          //! z-30: a kártyák (z-auto) és a "most" vonal (z-10) FÖLÖTT, de a
          //! ragadó idősáv (z-10) és a fejléc (z-20) rendszerét nem borítja.
          className={cn(
            "absolute z-30 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full",
            "border-2 border-background bg-primary text-primary-foreground shadow-md",
            "transition-transform duration-150 hover:scale-110 motion-reduce:transition-none motion-reduce:hover:scale-100",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
          style={{ top: top + height / 2, left: "50%" }}
        >
          <Merge className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-[min(21rem,calc(100vw-1.5rem))] p-3"
      >
        <p className="text-sm font-semibold text-foreground">
          Melyik órára jársz?
        </p>
        <p className="mt-0.5 text-xs text-muted-strong">
          {dayName}, {rangeLabel(cluster.startMin, cluster.endMin)} —{" "}
          {cluster.options.length} óra ütközik.
        </p>
        <div className="mt-2.5 flex flex-col gap-1.5">
          {cluster.choices.map((choice) => (
            <ChoiceButton
              key={choice.key}
              choice={choice}
              onSelect={() => {
                setOpen(false);
                onChoose(cluster.key, choice.key);
              }}
            />
          ))}
        </div>
        <p className="mt-2.5 text-xs text-muted-strong">
          A választásod minden hétre érvényes marad, és bármikor visszavonhatod.
        </p>
      </PopoverContent>
    </Popover>
  );
}

//* Az összevont kártya JELVÉNYE — megmutatja, mi lett elrejtve, és visszavon.
//! Az összevonás sosem néma állapot: a jelvény nélkül a diák nem tudná, hogy a
//! rács szűr, és egy rossz döntést sem tudna hol visszacsinálni.
export function MergedBadge({
  hidden,
  onUndo,
  compact = false,
}: {
  hidden: ClusterOption[];
  //! Identitás szerint vonunk vissza, nem klaszterkulcs szerint — lásd
  //! `preferencesHiding` a lib/timetable-merge.ts-ben.
  onUndo: (identities: string[]) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (hidden.length === 0) return null;
  const label = `${hidden.length} elrejtett ütköző óra — mutasd`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border/80 bg-background/85 px-1 text-[10px] font-bold tabular-nums text-foreground/75 backdrop-blur-[2px]",
            "transition-colors hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            compact ? "h-4" : "h-[18px] px-1.5",
          )}
        >
          <Merge className="size-2.5" aria-hidden />
          {hidden.length + 1}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(21rem,calc(100vw-1.5rem))] p-3"
      >
        <p className="text-sm font-semibold text-foreground">Összevont sáv</p>
        <p className="mt-0.5 text-xs text-muted-strong">
          {hidden.length === 1
            ? "Ez az óra van elrejtve, mert a másikra jársz:"
            : "Ezek az órák vannak elrejtve, mert egy másikra jársz:"}
        </p>
        <div className="mt-2.5 flex flex-col gap-1.5">
          {hidden.map((option) => (
            <div
              key={option.identity}
              className="flex items-start gap-2.5 rounded-lg border border-dashed border-border bg-muted/40 px-2.5 py-2 opacity-80"
            >
              <span
                className="mt-1 size-2.5 shrink-0 rounded-full acc-dot"
                style={accentStyle(
                  option.lesson.subjectShort || option.lesson.subject,
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                  <span className="min-w-0 text-pretty break-words text-sm font-semibold text-foreground">
                    {option.lesson.subject}
                  </span>
                  {groupLabel(option.lesson.group, option.lesson.subject) && (
                    <span className="shrink-0 rounded-full bg-background px-1.5 py-px text-[11px] font-medium text-foreground/75">
                      {groupLabel(option.lesson.group, option.lesson.subject)}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block break-words text-xs text-muted-strong">
                  {[option.lesson.room, option.lesson.teacher]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-2.5 w-full gap-1.5"
          onClick={() => {
            setOpen(false);
            onUndo(hidden.map((option) => option.identity));
          }}
        >
          <Undo2 className="size-3.5" aria-hidden />
          Összevonás visszavonása
        </Button>
      </PopoverContent>
    </Popover>
  );
}

//* Teljesen elrejtett sáv: minden ága le van szavazva. Vékony szaggatott csík
//* marad a helyén — így a szabad sáv nem hibának, hanem a te döntésednek látszik.
export function GhostCard({
  ghost,
  style,
  onUndo,
}: {
  ghost: GhostBlock;
  style: React.CSSProperties;
  onUndo: (identities: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const compact = (style.height as number) < 30;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          style={style}
          title={`${ghost.hidden.length} elrejtett óra — ${rangeLabel(ghost.startMin, ghost.endMin)}`}
          className={cn(
            "absolute flex items-center justify-center gap-1 overflow-hidden border border-dashed border-border/80 bg-transparent px-1.5 text-[11px] text-muted-strong",
            "transition-colors hover:border-border hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            CELL_RADIUS,
          )}
        >
          <Merge className="size-3 shrink-0" aria-hidden />
          {!compact && (
            <span className="truncate">{ghost.hidden.length} rejtett óra</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-[min(21rem,calc(100vw-1.5rem))] p-3"
      >
        <p className="text-sm font-semibold text-foreground">Rejtett sáv</p>
        <p className="mt-0.5 text-xs text-muted-strong">
          {rangeLabel(ghost.startMin, ghost.endMin)} — erre a sávra egyik órára
          sem jársz a korábbi döntéseid szerint.
        </p>
        <div className="mt-2.5 flex flex-col gap-1.5">
          {ghost.hidden.map((option) => (
            <div
              key={option.identity}
              className="rounded-lg border border-dashed border-border bg-muted/40 px-2.5 py-2"
            >
              <span className="flex items-baseline gap-1.5">
                <span className="truncate text-sm font-semibold text-foreground">
                  {option.lesson.subject}
                </span>
                {groupLabel(option.lesson.group, option.lesson.subject) && (
                  <span className="shrink-0 rounded-full bg-background px-1.5 py-px text-[11px] font-medium text-foreground/75">
                    {groupLabel(option.lesson.group, option.lesson.subject)}
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-muted-strong">
                {[
                  option.lesson.teacher,
                  option.lesson.room,
                  durationLabel(option.lesson.endMin - option.lesson.startMin),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-2.5 w-full gap-1.5"
          onClick={() => {
            setOpen(false);
            onUndo(ghost.hidden.map((option) => option.identity));
          }}
        >
          <Undo2 className="size-3.5" aria-hidden />
          Órák visszahozása
        </Button>
      </PopoverContent>
    </Popover>
  );
}
