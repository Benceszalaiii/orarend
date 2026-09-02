"use client";

import { AlertTriangle, Coffee } from "lucide-react";
import {
  CELL_RADIUS,
  durationLabel,
  minLabel,
  rangeLabel,
} from "@/components/timetable/shared";
import { accentStyle } from "@/lib/accent";
import { groupLabel } from "@/lib/timetable-merge";
import { cn } from "@/lib/utils";
import type { DayModel, DaySegment } from "./day";

//* ---------------------------------------------------------------------------
//* A MAI NAP — alakja és tételei
//* ---------------------------------------------------------------------------
//! KÉT RÉTEG, KÉT KÉRDÉS. A szalag a nap ALAKJÁRA felel („mikor végzek", „hol a
//! lyukasórám") — arányos, egyetlen pillantás. Alatta a nap órái, a RÁCS SAJÁT
//! KÁRTYANYELVÉN: tantárgyszínű felület, időarányos magasság, terem-jelvény.
//!
//! MIÉRT A RÁCS NYELVE. Ez a lap sokáig semleges sorokban sorolta a napot, a
//! tantárgy színe pedig egyetlen pötty volt. Aki a `/orarend`-ről érkezett, két
//! különböző programot látott ugyanarról a napról: ott a kék tömb a matek, itt
//! egy szürke sor, amit el kell OLVASNI. A szín ebben a projektben nem
//! dekoráció, hanem azonosító (lásd `accent.ts`) — a napi nézetben pont annyira
//! az, mint a rácson. Ugyanaz a tantárgy ugyanúgy néz ki mindkét lapon; a nap
//! felismerhető, mielőtt elolvasnák.
//!
//! AMI NEM A RÁCS. Itt nincs öt naposzlop és nincs 07:10-től 15:55-ig húzott
//! üres idővonal: csak a nap saját órái, egymás alatt, a hosszukkal arányosan.
//! A lyukasóra ezért VALÓDI HÉZAG a kártyák közt, nem egy sor a listában.

//! IDŐARÁNY, TOMPÍTVA. A rácson egy perc egy fix pixel; itt ugyanez a lap
//! aljáig nyúló oszlopot adna telefonon (egy hét órás nap 470 perc). A lépték
//! ezért lassabb, a legkisebb kártya pedig kap egy alsó határt — a 45 perces
//! óra két sornyi szöveget hordoz, az nem mehet 58 px alá. A dupla óra így is
//! láthatóan kétszer akkora, mint a szimpla.
const PX_PER_MIN = 1.15;
const CARD_MIN_H = 58;
//* A lyukasóra hézagja arányos, de két korlát közt: 25 percnél rövidebb szünet
//* nem is kerül ide (lásd `GAP_MIN_MIN` a day.ts-ben), egy háromórás lyuk pedig
//* nem tolhatja le a nap végét a képernyőről.
//* Az osztozó sávon belül a kártya a saját idejét kapja, alsó határ csak
//* annyi, hogy a tantárgy és az idő elférjen egymás alatt.
const CLUSTER_MIN_H = 46;
const GAP_MIN_H = 34;
const GAP_MAX_H = 76;

function lessonHeight(minutes: number): number {
  return Math.max(CARD_MIN_H, Math.round(minutes * PX_PER_MIN));
}

function gapHeight(minutes: number): number {
  return Math.min(GAP_MAX_H, Math.max(GAP_MIN_H, Math.round(minutes * 0.5)));
}

function pct(min: number, from: number, to: number): number {
  const span = to - from;
  if (span <= 0) return 0;
  return ((min - from) / span) * 100;
}

type LessonSegment = Extract<DaySegment, { kind: "lesson" }>;

//! EGY SORBAN, AMI EGY IDŐBEN VAN. Feloldatlan csoportbontásnál két óra
//! ugyanarra a percre esik. Egymás ALÁ téve a lista azt állítaná, hogy előbb az
//! egyik van, aztán a másik — pedig a döntés még hátravan. Ezért ami időben
//! fedi egymást, az egy sorban, egymás MELLETT áll: pontosan úgy, ahogy a
//! rácson a fél oszlop.
type LessonRowGroup = { kind: "row"; key: string; items: LessonSegment[] };
type GapRow = { kind: "gap"; seg: Extract<DaySegment, { kind: "gap" }> };

function buildRows(segments: DaySegment[]): (LessonRowGroup | GapRow)[] {
  const rows: (LessonRowGroup | GapRow)[] = [];
  let cluster: LessonSegment[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  const flush = () => {
    if (cluster.length === 0) return;
    rows.push({ kind: "row", key: cluster[0].key, items: cluster });
    cluster = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  };

  for (const seg of segments) {
    if (seg.kind === "gap") {
      flush();
      rows.push({ kind: "gap", seg });
      continue;
    }
    if (cluster.length > 0 && seg.startMin >= clusterEnd) flush();
    cluster.push(seg);
    clusterEnd = Math.max(clusterEnd, seg.endMin);
  }
  flush();
  return rows;
}

//! A SZALAG SZÍNEI UGYANAZOK, MINT A KÁRTYÁKÉ. Amíg a lista semleges volt, a
//! szalag is az volt; most viszont pont az a dolga, hogy a nap alakját a
//! kártyákhoz KÖSSE — a hosszú kék csík lentebb a hosszú kék kártya. A piros
//! továbbra is egyetlen dolgot jelent rajta: hol tartunk most.
export function DayRibbon({
  day,
  nowMin,
  selectedKey,
  mineKeys,
  className,
}: {
  day: DayModel;
  nowMin: number | null;
  selectedKey: string | null;
  //* `null` = a feloldott nap; egyébként a diák saját óráinak kulcsai.
  mineKeys: Set<string> | null;
  className?: string;
}) {
  const { firstMin, lastMin } = day;
  if (day.lessonCount === 0 || lastMin <= firstMin) return null;
  const nowVisible = nowMin !== null && nowMin >= firstMin && nowMin <= lastMin;

  return (
    <div className={cn("select-none", className)}>
      <div className="relative h-7 w-full rounded-md bg-muted/40" aria-hidden>
        {day.segments.map((seg) => {
          if (seg.kind === "gap") return null;
          const style = {
            left: `${pct(seg.startMin, firstMin, lastMin)}%`,
            width: `${pct(seg.endMin, firstMin, lastMin) - pct(seg.startMin, firstMin, lastMin)}%`,
          };
          const selected = seg.key === selectedKey;
          const past = nowMin !== null && nowMin >= seg.endMin;
          const mine = mineKeys === null || mineKeys.has(seg.key);
          //* Ütköző órák (feloldatlan csoportbontás) sávokra osztoznak, hogy a
          //* szalag ne egyetlen tömbnek mutassa a döntést, ami még vár.
          const laneStyle =
            seg.lanes > 1
              ? {
                  top: `${(seg.lane / seg.lanes) * 100}%`,
                  height: `calc(${100 / seg.lanes}% - 1px)`,
                }
              : { top: 0, bottom: 0 };
          return (
            <span
              key={seg.key}
              className={cn(
                "absolute rounded-[3px] border acc-tint transition-[opacity,filter]",
                past && "opacity-45 saturate-[0.55]",
                selected && "acc-tint-strong",
                //* Más csoport órája: ugyanaz a szaggatott, visszavett jelölés,
                //* mint a kártyáján — a szalag és a lista egy nyelvet beszél.
                !mine && "border-dashed opacity-40 saturate-[0.5]",
              )}
              style={{
                ...style,
                ...laneStyle,
                ...accentStyle(
                  seg.run.lesson.subjectShort || seg.run.lesson.subject,
                ),
              }}
            />
          );
        })}

        {nowVisible && (
          //* A nap egyetlen márkaszínű eleme: hol tartunk most.
          <span
            className="absolute inset-y-[-3px] z-10 w-0.5 -translate-x-1/2 rounded-full bg-brand"
            style={{ left: `${pct(nowMin, firstMin, lastMin)}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[11px] font-medium tabular-nums text-muted-foreground">
        <time dateTime={minLabel(firstMin)}>{minLabel(firstMin)}</time>
        <time dateTime={minLabel(lastMin)}>{minLabel(lastMin)}</time>
      </div>
    </div>
  );
}

export function DayList({
  day,
  nowMin,
  selectedKey,
  onSelect,
  mineKeys,
  className,
}: {
  day: DayModel;
  nowMin: number | null;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  //! CSAK A „MINDEN CSOPORT" ÁLLAPOTBAN VAN ÉRTÉKE. Ilyenkor a nap az OSZTÁLY
  //! órarendje, és meg kell tudni különböztetni, melyik óra a diáké: ami nincs
  //! ebben a halmazban, az egy másik csoporté — látszik, de nem az övé.
  //! `null` = a feloldott nap, minden kártya a sajátja.
  mineKeys: Set<string> | null;
  className?: string;
}) {
  if (day.segments.length === 0) return null;
  const rows = buildRows(day.segments);

  return (
    <ol className={cn("space-y-1.5", className)}>
      {rows.map((row) => {
        if (row.kind === "gap")
          return <GapCard key={row.seg.key} seg={row.seg} />;

        //* Egyedül álló óra: a kártya maga a sor, a magassága a hossza.
        if (row.items.length === 1) {
          const seg = row.items[0];
          const height = lessonHeight(seg.endMin - seg.startMin);
          return (
            <li key={row.key} style={{ height }}>
              <LessonCard
                seg={seg}
                height={height}
                compact={false}
                className="size-full"
                nowMin={nowMin}
                selected={seg.key === selectedKey}
                onSelect={onSelect}
                mine={mineKeys === null || mineKeys.has(seg.key)}
              />
            </li>
          );
        }

        //! AZ OSZTOZÓ SÁV EGY KIS RÁCS. Egyforma magas hasábokra osztva a 45
        //! perces óra ugyanolyan hosszúnak látszana, mint a mellette futó
        //! háromórás tömb — a lista pont arról hazudna, amiért időarányos.
        //! Ezért a sávon belül minden kártya a SAJÁT idejére van kitéve,
        //! ugyanúgy, ahogy a rács naposzlopában.
        const start = Math.min(...row.items.map((s) => s.startMin));
        const end = Math.max(...row.items.map((s) => s.endMin));
        return (
          <li
            key={row.key}
            className="relative"
            style={{ height: Math.max(CARD_MIN_H, (end - start) * PX_PER_MIN) }}
          >
            {row.items.map((seg) => {
              const height = Math.max(
                CLUSTER_MIN_H,
                (seg.endMin - seg.startMin) * PX_PER_MIN,
              );
              return (
                <LessonCard
                  key={seg.key}
                  seg={seg}
                  height={height}
                  compact
                  className="absolute"
                  style={{
                    top: (seg.startMin - start) * PX_PER_MIN,
                    height,
                    left: `${(seg.lane / seg.lanes) * 100}%`,
                    width: `calc(${100 / seg.lanes}% - 3px)`,
                  }}
                  nowMin={nowMin}
                  selected={seg.key === selectedKey}
                  onSelect={onSelect}
                  mine={mineKeys === null || mineKeys.has(seg.key)}
                />
              );
            })}
          </li>
        );
      })}
    </ol>
  );
}

//! A LYUKASÓRA A NAP RÉSZE, NEM A LISTA SORA. A hézag hossza maga az adat: a
//! kártyák közti üres sáv annyit mutat, amennyit a diák tényleg vár.
function GapCard({ seg }: { seg: Extract<DaySegment, { kind: "gap" }> }) {
  const minutes = seg.endMin - seg.startMin;
  return (
    <li
      className="flex items-center justify-center"
      style={{ height: gapHeight(minutes) }}
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-px w-6 bg-border" aria-hidden />
        <Coffee className="size-3.5 shrink-0" aria-hidden />
        Lyukasóra · {durationLabel(minutes)}
        <span className="tabular-nums">
          ({rangeLabel(seg.startMin, seg.endMin)})
        </span>
        <span className="h-px w-6 bg-border" aria-hidden />
      </span>
    </li>
  );
}

//! A RÁCS KÁRTYÁJA, EGY HASÁBBAN. Ugyanaz a felület, ugyanaz a keret, ugyanaz
//! a két állapotjelzés — a lefutott óra halványabb, a futó órán gyűrű van —,
//! csak a szélesség más: itt egy egész hasáb jut rá, tehát elfér a teljes
//! tantárgynév és a tanár is.
function LessonCard({
  seg,
  height,
  compact,
  className,
  style,
  nowMin,
  selected,
  onSelect,
  mine,
}: {
  seg: LessonSegment;
  //* A kártya tényleges magassága — a sűrűség-fokozat ebből következik.
  height: number;
  compact: boolean;
  className?: string;
  style?: React.CSSProperties;
  nowMin: number | null;
  selected: boolean;
  onSelect: (key: string | null) => void;
  //* Hamis csak a „minden csoport" nézetben: más csoport órája.
  mine: boolean;
}) {
  const { run } = seg;
  const lesson = run.lesson;
  const short = lesson.subjectShort || lesson.subject;
  const title = compact ? short : lesson.subject || short;
  //* A már lezárt órák halkulnak — a nap „elfogyása" magától olvasható.
  const past = nowMin !== null && nowMin >= seg.endMin;
  const running =
    nowMin !== null && nowMin >= seg.startMin && nowMin < seg.endMin;
  //* Alacsony kártyán a tanár a dátum mellé kerül; magason saját sort kap.
  const roomy = height >= 78;
  //* Teljes név ott, ahol elfér: a fél szélességű (osztozó) kártyán a rövid
  //* alak az, ami még kifér a csoportnév mellé.
  const teacher = compact
    ? lesson.teacherShort || lesson.teacher
    : lesson.teacher || lesson.teacherShort;
  //! A CSOPORT NEVE CSAK AKKOR ADAT, HA RÖVID. A forrás csoportnevei nem
  //! egységesek: van, ahol „A csoport", és van, ahol a tantárgy nevét vagy a
  //! tanár monogramját ismétlik el benne („Szakmai német nyelv", „BKE"). A
  //! hosszú alak a kártyán nem különböztet meg semmit, csak elveszi a helyet a
  //! teremtől és az időtől — és amikor a tanár nevét ismétli, kétszer mondja
  //! ugyanazt. Ezért csak a valóban csoportnév-szerű, rövid alak kerül ki.
  const rawGroup = lesson.wholeClass
    ? ""
    : groupLabel(lesson.group, lesson.subject);
  const group =
    rawGroup.length > 0 &&
    rawGroup.length <= 14 &&
    rawGroup !== lesson.teacherShort &&
    !title.toLocaleLowerCase("hu").includes(rawGroup.toLocaleLowerCase("hu"))
      ? rawGroup
      : "";
  const label = [
    lesson.subject || short,
    rangeLabel(seg.startMin, seg.endMin),
    run.lessonCount > 1 ? `${run.lessonCount} egymást követő óra` : null,
    lesson.teacher || null,
    run.rooms.join(" · ") || null,
  ]
    .filter(Boolean)
    .join(" — ");

  return (
    //! A KÁRTYA NEM MAGA A GOMB, hanem alatta fekszik egy teljes felületű gomb:
    //! így a tartalom szabadon tördelhet, a kattintható terület mégis a teljes
    //! kártya — ugyanaz a szerkezet, mint a rács kártyáján.
    <div
      className={cn(
        "group relative min-w-0 flex-1 overflow-hidden border acc-tint shadow-xs",
        "transition-[opacity,filter,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        CELL_RADIUS,
        past && "opacity-45 saturate-[0.55]",
        running && "z-[5] shadow-sm ring-2 ring-brand/45",
        selected && "acc-tint-strong shadow-sm",
        //! MÁS CSOPORT ÓRÁJA — LÁTSZIK, DE NEM A TIÉD. Szaggatott keret és
        //! visszavett szín: ugyanaz a nyelv, amit a rács a leszavazott sávra
        //! használ. Tömör kártyával a nap azt hazudná, hogy oda is menned kell.
        !mine && "border-dashed opacity-70 saturate-[0.45] shadow-none",
        className,
      )}
      style={{ ...style, ...accentStyle(short) }}
    >
      {/*//! SZÜNET-SÁVOK: a többórás blokk nem hazudik egybefüggő órát.
          //! Arányosan a kártya MAGASSÁGÁHOZ mérve, nem fix pixel/perccel: a
          //! rövid kártyáknak alsó határa van, és a csík ott is a helyén kell
          //! maradjon. */}
      {run.breaks.map((gap) => (
        <span
          key={`${gap.startMin}-${gap.endMin}`}
          className="pointer-events-none absolute inset-x-0 acc-break"
          style={{
            top: `${pct(gap.startMin, seg.startMin, seg.endMin)}%`,
            height: `${Math.max(
              pct(gap.endMin, seg.startMin, seg.endMin) -
                pct(gap.startMin, seg.startMin, seg.endMin),
              3,
            )}%`,
          }}
          aria-hidden
        />
      ))}

      <button
        type="button"
        onClick={() => onSelect(selected ? null : seg.key)}
        aria-pressed={selected}
        aria-label={label}
        className={cn(
          "absolute inset-0 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          CELL_RADIUS,
        )}
      />

      <div className="pointer-events-none relative flex h-full flex-col px-2.5 py-1.5">
        <div className="flex min-w-0 items-start gap-1.5">
          <span
            className={cn(
              "min-w-0 flex-1 text-[13px] font-semibold leading-tight text-foreground",
              roomy ? "line-clamp-2" : "truncate",
            )}
          >
            {title}
          </span>
          {running && (
            //* Piros csak élő szerepben.
            <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-foreground">
              Most
            </span>
          )}
          <RoomChip rooms={run.rooms} />
        </div>

        <div className="mt-px flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] leading-tight text-foreground/70">
          <time
            className="shrink-0 tabular-nums"
            dateTime={minLabel(seg.startMin)}
          >
            {rangeLabel(seg.startMin, seg.endMin)}
          </time>
          {run.lessonCount > 1 && (
            <span className="shrink-0 tabular-nums text-foreground/70">
              ×{run.lessonCount}
            </span>
          )}
          {/*//! AZ OSZTOZÓ KÁRTYÁN A CSOPORT NEVE ADAT, NEM DÍSZ. Két „német"
              //! egymás mellett csak a teremben különbözik — pedig épp azt kell
              //! eldönteni, melyik a sajátod. A rácson erre nincs hely; itt van. */}
          {compact && group && (
            <span className="min-w-0 truncate font-medium text-foreground/85">
              {group}
            </span>
          )}
          {!roomy && teacher && (
            <span className="min-w-0 truncate">{teacher}</span>
          )}
          {lesson.moved && (
            <span className="flex shrink-0 items-center gap-1 font-medium text-brand">
              <AlertTriangle className="size-3" aria-hidden />
              áthelyezve
            </span>
          )}
        </div>

        {/*//! MAGAS KÁRTYÁN A TANÁR SAJÁT SORT KAP — de ha a blokkot szünet
            //! szeli át, a név a kártya ALJÁRA megy: különben pont a szaggatott
            //! sávra esne, és két információ takarná egymást. */}
        {roomy && teacher && (
          <span
            className={cn(
              "min-w-0 truncate text-[11px] leading-tight text-foreground/70",
              run.breaks.length > 0 ? "mt-auto" : "mt-0.5",
            )}
          >
            {teacher}
          </span>
        )}
      </div>
    </div>
  );
}

//! A TEREM ELSŐ OSZTÁLYÚ ADAT — ugyanaz a jelvény, mint a rácson: telefonon az
//! órarendet nem olvassák, hanem megnézik, hova kell menni. A blokkon belüli
//! teremváltás pedig a kártya egyetlen valódi figyelmeztetése.
function RoomChip({ rooms }: { rooms: string[] }) {
  if (rooms.length === 0) return null;
  const moved = rooms.length > 1;
  return (
    <span
      title={
        moved
          ? `Teremváltás a blokkon belül: ${rooms.join(" → ")}`
          : `Terem: ${rooms[0]}`
      }
      className={cn(
        "shrink-0 rounded-[4px] px-1 py-px text-[11px] font-bold leading-tight tabular-nums",
        moved
          ? "border border-brand/55 bg-brand/12 text-foreground"
          : "bg-foreground/[0.08] text-foreground dark:bg-foreground/15",
      )}
    >
      {moved ? rooms.join("→") : rooms[0]}
    </span>
  );
}
