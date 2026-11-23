"use client";

import { ChevronLeft, List } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ALPHABET, type PickGroup, pickGroups } from "@/lib/subject-groups";
import type { TimetableSubject, TimetableSubjectKind } from "@/lib/timetable";
import { cn } from "@/lib/utils";

//! ═══════════════════════════════════════════════════════════════════════════
//! A GYORSVÁLASZTÓ — KI, KINEK, MELYIK TEREM, LEGFELJEBB KÉT KOPPINTÁSBÓL
//! ═══════════════════════════════════════════════════════════════════════════
//! A folyékony váltó aktív szerepére koppintva nyílik (`pill-nav.tsx`). Nincs
//! benne kereső és nincs görgetés: az osztályok évfolyam-sorokban, a tanárok
//! betű szerint, a termek emelet szerint állnak (`lib/subject-groups.ts`),
//! tehát bármelyik alany egy vagy két koppintásra van.
//*
//! NINCS RÁMUTATÁS-ANIMÁCIÓ. A csempe egérre csak halványan színeződik; a
//! jelenlegi csoportot egy keret, a jelenlegi alanyt a szerep színe mutatja.
//! Mozgás csak ott van, ahol állapot változik: nyitás és lépésváltás.
//*
//! A JOBB FELSŐ SAROKBAN A KIÚT. Aki a böngésző saját listáját szokta meg,
//! egy koppintással visszakapja (`lib/quick-pick.ts`); a buborék helyett
//! felugró üzenet mondja meg, hol kapcsolhatja vissza.
//! ═══════════════════════════════════════════════════════════════════════════

/** Amit egy lap a váltónak átad, hogy az aktív szerep a választó is legyen. */
export type SubjectPickerSpec = {
  kind: TimetableSubjectKind;
  subjects: TimetableSubject[];
  /** A kiválasztott alany rövid jele; üres, ha még nincs. */
  value: string;
  disabled?: boolean;
  onChange: (short: string) => void;
};

//* A szerep színe — ugyanaz, mint a váltó folyadékáé.
export const ROLE_FILL: Record<TimetableSubjectKind, string> = {
  class: "bg-primary text-ink-on-primary",
  teacher: "bg-chart-3 text-[var(--ink-on-band)]",
  classroom: "bg-chart-2 text-[var(--ink-on-band)]",
};
const ROLE_RING: Record<TimetableSubjectKind, string> = {
  class: "ring-primary",
  teacher: "ring-chart-3",
  classroom: "ring-chart-2",
};

const TILE =
  "relative flex min-w-0 items-center justify-center rounded-lg bg-foreground/[0.06] px-1.5 text-sm font-semibold text-foreground outline-none hover:bg-foreground/[0.12] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-default disabled:bg-transparent disabled:opacity-30";

export function SubjectQuickPick({
  spec,
  open,
  onClose,
  onLegacy,
  panelId,
}: {
  spec: SubjectPickerSpec;
  open: boolean;
  onClose: (opts?: { refocus?: boolean }) => void;
  /** „Hagyományos lista": a gyorsválasztás kikapcsolása. */
  onLegacy: () => void;
  panelId: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const [step, setStep] = useState<string | null>(null);
  const [dir, setDir] = useState(1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(
    () => pickGroups(spec.kind, spec.subjects),
    [spec.kind, spec.subjects],
  );
  const current = spec.subjects.find((s) => s.short === spec.value) ?? null;
  const currentGroup =
    groups.find((g) => g.items.some((i) => i.subject.short === spec.value))
      ?.key ?? null;
  const twoStep = spec.kind !== "class";
  const group = step ? groups.find((g) => g.key === step) : undefined;

  //* Minden nyitás az első lépéssel indul.
  useEffect(() => {
    if (open) setStep(null);
  }, [open]);

  //* A fókusz oda kerül, ahol a diák folytatná: a mostani alanyra, ha
  //* látszik, különben a mostani csoportra, különben az első csempére.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a lépés a jel
  useLayoutEffect(() => {
    if (!open) return;
    const body = bodyRef.current;
    if (!body) return;
    const target =
      body.querySelector<HTMLElement>("[aria-pressed=true]") ??
      body.querySelector<HTMLElement>("[data-current=true]") ??
      body.querySelector<HTMLElement>("button:not(:disabled)");
    target?.focus({ preventScroll: true });
  }, [open, step]);

  const pick = (short: string) => {
    onClose({ refocus: true });
    if (short !== spec.value) spec.onChange(short);
  };
  const enter = (g: PickGroup) => {
    //* Egy elemű csoport: a második koppintás fölösleges, azonnal választ.
    if (g.items.length === 1) {
      pick(g.items[0].subject.short);
      return;
    }
    setDir(1);
    setStep(g.key);
  };
  const back = () => {
    setDir(-1);
    setStep(null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (step) back();
      else onClose({ refocus: true });
    } else if (e.key === "Backspace" && step) {
      e.preventDefault();
      back();
    }
  };

  const fill = ROLE_FILL[spec.kind];
  const ring = ROLE_RING[spec.kind];
  const tile = (selected: boolean, extra?: string) =>
    cn(TILE, selected && cn(fill, "hover:brightness-105"), extra);

  let body: React.ReactNode;
  if (spec.kind === "class") {
    body = (
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
        {groups.map((g) => (
          <div key={g.key} className="contents">
            <span className="text-right text-xs font-semibold tabular-nums text-muted-foreground">
              {g.label}
            </span>
            <div
              className={cn(
                "grid gap-1",
                g.key === "egyeb"
                  ? "grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]"
                  : "grid-cols-8",
              )}
            >
              {g.items.map((item) => {
                const selected = item.subject.short === spec.value;
                return (
                  <button
                    key={item.subject.short}
                    type="button"
                    aria-pressed={selected}
                    aria-label={item.subject.name || item.subject.short}
                    onClick={() => pick(item.subject.short)}
                    className={tile(selected, "h-10 px-0.5 text-[13px]")}
                  >
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  } else if (!group) {
    body =
      spec.kind === "teacher" ? (
        <div className="grid grid-cols-7 gap-1">
          {ALPHABET.map((letter) => {
            const g = groups.find((x) => x.key === letter);
            const n = g?.items.length ?? 0;
            const isCurrent = letter === currentGroup;
            return (
              <button
                key={letter}
                type="button"
                disabled={n === 0}
                data-current={isCurrent || undefined}
                aria-label={`${letter}: ${n} tanár`}
                onClick={() => g && enter(g)}
                className={tile(
                  false,
                  cn(
                    "h-11 flex-col gap-0 leading-none",
                    isCurrent && cn("ring-[1.5px] ring-inset", ring),
                  ),
                )}
              >
                {letter}
                {n > 0 && (
                  <span className="mt-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1">
          {groups.map((g) => {
            const isCurrent = g.key === currentGroup;
            const first = g.items[0]?.label;
            const last = g.items.at(-1)?.label;
            return (
              <button
                key={g.key}
                type="button"
                data-current={isCurrent || undefined}
                onClick={() => enter(g)}
                className={tile(
                  false,
                  cn(
                    "h-14 flex-col items-start gap-0.5 px-3 text-left",
                    isCurrent && cn("ring-[1.5px] ring-inset", ring),
                  ),
                )}
              >
                <span>{g.label}</span>
                <span className="w-full truncate text-[11px] font-medium tabular-nums text-muted-foreground">
                  {g.items.length} terem ·{" "}
                  {g.items.length > 1 ? `${first} … ${last}` : first}
                </span>
              </button>
            );
          })}
        </div>
      );
  } else {
    body = (
      <div
        className={cn(
          "grid gap-1",
          spec.kind === "teacher" ? "grid-cols-2" : "grid-cols-3",
        )}
      >
        {group.items.map((item) => {
          const selected = item.subject.short === spec.value;
          return (
            <button
              key={item.subject.short}
              type="button"
              aria-pressed={selected}
              aria-label={item.subject.name || item.subject.short}
              onClick={() => pick(item.subject.short)}
              className={tile(
                selected,
                cn(
                  "h-11",
                  spec.kind === "teacher"
                    ? "justify-start px-2.5 text-[13px] font-medium"
                    : "flex-col gap-0 leading-tight",
                ),
              )}
            >
              <span className="max-w-full truncate">{item.label}</span>
              {item.hint && (
                <span
                  className={cn(
                    "max-w-full truncate text-[10.5px] font-medium",
                    selected ? "opacity-80" : "text-muted-foreground",
                  )}
                >
                  {item.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          id={panelId}
          role="dialog"
          aria-label="Kit nézel"
          onKeyDown={onKeyDown}
          initial={reduced ? false : { opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
          style={{ transformOrigin: "top right" }}
          className={cn(
            //! `absolute` a váltóhoz képest, nem portál: a buborék a ragadós
            //! fejléccel együtt mozog, és a sor „kívülre koppintás" szabálya
            //! (lásd `standing-line.tsx`) sem csukja be.
            "absolute top-[calc(100%+0.5rem)] right-0 z-30 w-[min(25rem,calc(100vw-1rem))] overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-[0_24px_48px_-20px_oklch(0_0_0/0.85)] ring-1 ring-border",
          )}
        >
          <div className="flex min-h-11 items-center gap-2 border-b border-border/70 py-1.5 pr-1.5 pl-3">
            {group ? (
              <>
                <button
                  type="button"
                  onClick={back}
                  className="-ml-1.5 flex h-8 items-center gap-0.5 rounded-lg pr-2 pl-1 text-sm font-semibold hover:bg-foreground/[0.08] focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  Vissza
                </button>
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {group.label}
                  </span>
                  {" · "}
                  {group.items.length}{" "}
                  {spec.kind === "teacher" ? "tanár" : "terem"}
                </span>
              </>
            ) : (
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                Most:{" "}
                <span className="font-semibold text-foreground">
                  {current ? current.name || current.short : "—"}
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={onLegacy}
              aria-label="Hagyományos lista"
              title="A böngésző saját listája, gyorsválasztás nélkül"
              className="ml-auto flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[11.5px] font-semibold text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <List className="size-3.5" aria-hidden />
              Hagyományos lista
            </button>
          </div>
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div
              key={step ?? "root"}
              ref={bodyRef}
              initial={
                reduced || !twoStep ? false : { opacity: 0, x: dir * 12 }
              }
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: dir * -12 }}
              transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
              className="p-2"
            >
              {body}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

//! ─── A FELUGRÓ ÜZENET ─────────────────────────────────────────────────────
//! A „Hagyományos lista" egy BEÁLLÍTÁST vált, nem csak ezt az egy nyitást —
//! ezért ki kell mondani, hol lehet visszakapcsolni, és egy koppintással
//! vissza is lehet vonni. `body`-ba kerül: a fejléc `backdrop-filter`-e a
//! benne álló `fixed` elemet a sávhoz vágná.
export function QuickPickToast({
  open,
  onUndo,
  onDismiss,
}: {
  open: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(onDismiss, 7000);
    return () => window.clearTimeout(t);
  }, [open, onDismiss]);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : 8 }}
          transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
          className="fixed inset-x-0 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex w-max max-w-[min(30rem,calc(100vw-2rem))] items-center gap-3 rounded-xl bg-foreground py-2.5 pr-2.5 pl-3.5 text-[13.5px] leading-snug text-background shadow-[0_18px_40px_-16px_oklch(0_0_0/0.6)]"
        >
          <p className="text-pretty">
            Hagyományos listára váltottál. A gyorsválasztást a{" "}
            <b className="font-semibold">Testreszabásban</b> kapcsolhatod
            vissza.
          </p>
          <button
            type="button"
            onClick={onUndo}
            className="h-8 shrink-0 rounded-lg bg-background/15 px-2.5 text-[13px] font-semibold hover:bg-background/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-background"
          >
            Visszavonás
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
