"use client";

import { Briefcase } from "lucide-react";
import { useMemo, useState } from "react";
import { SheetItemBody, sheetItem } from "@/components/chrome/chrome-sheet";
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
import type { TimetableSubjectKind } from "@/lib/timetable";
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
  mode = "class",
  schedule,
  weekLetter,
  subjectShort,
  onChange,
  className,
}: {
  //* Kinek a beosztása — ettől függ, mit MOND a párbeszéd; a rács és a
  //* tárolás mindkét ágon ugyanaz.
  mode?: TimetableSubjectKind;
  /** `null` = ez az alany még nincs beállítva. */
  schedule: DualSchedule | null;
  /** A NÉZETT hét jelölése a forrásból (`"A"` / `"B"`), vagy üres. */
  weekLetter: string;
  /** Az ÉPPEN nézett osztály vagy tanár jele. */
  subjectShort: string;
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
        onClick={() => setOpen(true)}
        className={sheetItem(className)}
      >
        <Briefcase
          className={cn(
            "size-4 shrink-0",
            active ? "text-primary" : "text-muted-foreground",
          )}
          aria-hidden
        />
        <SheetItemBody
          label="Duális beosztás"
          hint={active ? "Beállítva" : "Mely napokon vagy a munkahelyen"}
        />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mikor vagy duálison?</DialogTitle>
            <DialogDescription className="text-pretty">
              {mode === "teacher"
                ? //! A TANÁRNÁL A KÉRDÉS UGYANAZ, A KÖVETKEZMÉNY MÁS. A duális
                  //! nap nem „az osztály órarendje helyett" áll: azon a napon a
                  //! tanárnak nincs órája a rácson, mert a képzés a
                  //! munkahelyen folyik.
                  "Koppints azokra a napokra, amelyeken nem az iskolai órarended szerint dolgozol — azokra a napokra a rács nem tanórákat mutat. A duális blokk kéthetente ismétlődik, ezért az A és a B hetet külön kell megadni; hogy melyik hét van éppen, azt a suli rendszeréből tudjuk."
                : "Koppints azokra a napokra, amelyeket a munkahelyen töltesz — azok a napok nem az osztály órarendjét mutatják. A duális blokk kéthetente ismétlődik, ezért az A és a B hetet külön kell megadni; hogy melyik hét van éppen, azt a suli rendszeréből tudjuk."}
              {subjectShort && (
                //* A beosztás alanyonként külön áll (lásd `dual-schedule.ts`) —
                //* a választó pedig itt, ugyanebben a sávban ül: ki kell
                //* mondani, MIRE vonatkozik, amit most beállít.
                <>
                  {" "}
                  A beállítás a(z){" "}
                  <span className="font-medium text-foreground">
                    {subjectShort}
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
