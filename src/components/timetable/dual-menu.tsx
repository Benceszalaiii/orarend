"use client";

import { Briefcase } from "lucide-react";
import { useMemo, useState } from "react";
import { DualScheduleGrid } from "@/components/ma/dual-setup";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CLASSIC_DUAL_SCHEDULE,
  type DualSchedule,
  EMPTY_DUAL_SCHEDULE,
  hasAnyDualDay,
} from "@/lib/dual-schedule";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* DUÁLIS BEOSZTÁS AZ ÓRAREND ESZKÖZTÁRÁBÓL
//* ---------------------------------------------------------------------------
//! UGYANAZ A RÁCS, MÁS HORDOZÓ. A `/ma` egy egész panelt szán a kérdésre, mert
//! ott van hely és ott KELL kérdezni (a nap magától nem tudja, hol vagy). Az
//! `/orarend` 100dvh-s, és a sávja már így is szűk: itt a beállítás nem
//! kérdezhet, csak ELÉRHETŐ lehet — egy ikon a jelmagyarázat mellett, ugyanaz
//! a méret, ugyanaz a súly. Ami mögötte kinyílik, az bitre azonos a `/ma`
//! párbeszédével (`DualScheduleGrid`), hogy aki ott állította be, itt ne
//! találkozzon egy MÁSIK beállítóval.
//!
//! A JELÖLÉS A GOMBON MARAD. Ha van beállított duális nap, az ikon a kiemelt
//! színt kapja: a rácson látható duális blokkoknak legyen egy megnevezett oka
//! a sávban is — különben úgy néz ki, mintha az órarend találná ki őket.
export function DualSetupButton({
  schedule,
  weekLetter,
  classShort,
  onChange,
  className,
}: {
  /** `null` = ez az osztály még nincs beállítva. */
  schedule: DualSchedule | null;
  /** A NÉZETT hét jelölése a forrásból (`"A"` / `"B"`), vagy üres. */
  weekLetter: string;
  classShort: string;
  onChange: (next: DualSchedule) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const active = schedule !== null && hasAnyDualDay(schedule);

  //* A rács a MAI napot emeli ki — tájékozódásul, nem a nézett hét visszhangjaként.
  //! Effekt nélkül a szerveren rendert dátum kerülne a HTML-be; a `useState`
  //! kezdőértéke helyett ezért a lusta számítás CSAK a párbeszéd nyitásakor
  //! fut le (a `DialogContent` addig nincs a fában).
  const todayDow = useMemo(() => {
    if (!open) return null;
    const dow = ((new Date().getDay() + 6) % 7) + 1;
    return dow <= 5 ? dow : null;
  }, [open]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className={cn(
          "size-9 rounded-full touch-target",
          //* Telefonon ez a gomb a beállítás-panel egyik sora — lásd
          //* `toolbar-more.tsx` és a `.tt-more-item` szabályt.
          "tt-more-item",
          active
            ? "text-primary hover:text-primary"
            : "text-muted-foreground hover:text-foreground",
          className,
        )}
        aria-label={
          active ? "Duális beosztás módosítása" : "Duális beosztás beállítása"
        }
        title="Duális képzés"
      >
        <Briefcase className="size-4 shrink-0" />
        {/*//* A felirat CSAK a panelben látszik: ikonsorban a `title` és az
            //* `aria-label` viszi a nevet, ott nincs hely kiírni. */}
        <span className="hidden tt-more-label text-sm font-medium">
          Duális beosztás
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mikor vagy duálison?</DialogTitle>
            <DialogDescription className="text-pretty">
              Koppints azokra a napokra, amelyeket a munkahelyen töltesz — azok
              a napok nem az osztály órarendjét mutatják. A duális blokk
              kéthetente ismétlődik, ezért az A és a B hetet külön kell megadni;
              hogy melyik hét van éppen, azt a suli rendszeréből tudjuk.
              {classShort && (
                //* A beosztás osztályonként külön áll (lásd `dual-schedule.ts`) —
                //* az osztályváltó pedig itt, ugyanebben a sávban ül: ki kell
                //* mondani, MELYIK osztályra vonatkozik, amit most beállít.
                <>
                  {" "}
                  A beállítás a(z){" "}
                  <span className="font-medium text-foreground">
                    {classShort}
                  </span>{" "}
                  órarendjére vonatkozik.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DualScheduleGrid
            value={schedule ?? EMPTY_DUAL_SCHEDULE}
            weekLetter={weekLetter}
            todayDow={todayDow}
            onChange={onChange}
          />

          <DialogFooter className="sm:justify-start">
            {/*//! A SZOKÁSOS BEOSZTÁS EGY KOPPINTÁS, DE NEM AZ ALAPÉRTELMEZÉS. */}
            <Button
              variant="outline"
              size="sm"
              className="touch-target"
              onClick={() => onChange(CLASSIC_DUAL_SCHEDULE)}
            >
              Szokásos blokk (teljes B hét)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="touch-target"
              onClick={() => onChange(EMPTY_DUAL_SCHEDULE)}
            >
              Nem járok duálisra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
