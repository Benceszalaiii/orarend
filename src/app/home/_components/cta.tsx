import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

//! ─── A KÉT AJTÓ ────────────────────────────────────────────────────────────
//! A lap egyetlen döntéssel zár, és a döntés NEM az, hogy „belépjek-e".
//! A `site-nav.tsx` már kimondja, mi a két nézet viszonya: ugyanarra az
//! adatra néznek, csak MÁS KÉRDÉSRE válaszolnak. A nyitólap végén ezért nem
//! egy elsődleges és egy „másodlagos" gomb áll, hanem két egyenrangú ajtó —
//! a diák maga tudja, most melyik kérdése van.
//*
//! A KÉT AJTÓ UGYANAZT A JELRENDSZERT VISELI, AMIT A LAP VÉGIG HASZNÁLT: a
//! hét öt oszlopa és a mai nap egyetlen futó sávja. Nem ikonok, hanem a rács
//! saját mértana kicsiben.

function WeekMark() {
  //* Öt oszlop, óra-arányos sávokkal — a heti rács legkisebb olvasható alakja.
  const columns = [
    [1, 1, 1, 0, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1],
    [2, 0, 0, 0, 0, 0, 0],
    [2, 0, 0, 0, 0, 0, 0],
    [2, 0, 0, 0, 0, 0, 0],
  ];
  return (
    <span
      aria-hidden
      className="flex h-12 w-[4.5rem] shrink-0 items-stretch gap-[3px] opacity-90"
    >
      {columns.map((col, ci) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: rögzített, öt elemű mértani jel
          key={ci}
          className="flex flex-1 flex-col gap-[2px]"
        >
          {col[0] === 2 ? (
            <span className="flex-1 rounded-[2px] bg-current opacity-35" />
          ) : (
            col.map((on, ri) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: rögzített, hét elemű mértani jel
                key={ri}
                className={
                  on
                    ? "h-[3px] rounded-[1px] bg-current"
                    : "h-[3px] rounded-[1px] bg-current opacity-20"
                }
              />
            ))
          )}
        </span>
      ))}
    </span>
  );
}

function NowMark() {
  //* Egyetlen sáv, félig lefutva — a progresszív nézet egész mondanivalója.
  return (
    <span
      aria-hidden
      className="flex h-12 w-[4.5rem] shrink-0 flex-col justify-center gap-2"
    >
      <span className="h-[3px] rounded-full bg-current opacity-25" />
      <span className="relative h-2.5 overflow-hidden rounded-[3px]">
        <span className="absolute inset-0 rounded-[3px] bg-current opacity-25" />
        <span className="absolute inset-y-0 left-0 w-[58%] rounded-[3px] bg-current" />
      </span>
      <span className="h-[3px] w-2/3 rounded-full bg-current opacity-25" />
    </span>
  );
}

function Door({
  href,
  title,
  detail,
  mark,
  variant,
}: {
  href: string;
  title: string;
  detail: string;
  mark: React.ReactNode;
  variant: "default" | "outline";
}) {
  return (
    //! A KOBALT KITÖLTÉSŰ AJTÓ SZÖVEGE SÖTÉT. A `Button` alap változata
    //! `text-primary-foreground`-ot, azaz fehéret ad — az a kobalton 2,97:1.
    //! Az `--ink-on-primary` ugyanezen a kitöltésen 6,2:1; a `cn` a
    //! szövegszínt cseréli, a gomb minden más viselkedése változatlan.
    <Button
      asChild
      variant={variant}
      size="lg"
      className={cn(
        "h-auto w-full flex-col items-start gap-6 rounded-[calc(var(--radius)-2px)] p-7 text-left whitespace-normal sm:gap-8 sm:p-9",
        variant === "default" && "text-ink-on-primary",
      )}
    >
      <Link href={href}>
        {mark}
        <span className="flex flex-col gap-2.5">
          <span className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            {title}
          </span>
          <span className="max-w-[34ch] text-sm leading-6 opacity-80">
            {detail}
          </span>
        </span>
      </Link>
    </Button>
  );
}

export default function Cta() {
  return (
    <section className="bg-card px-5 py-24 md:px-8 md:py-32">
      {/*//* A cím a teljes szélességen áll, a két ajtó pedig alatta — így
          //* mindkettő akkora felület, amekkora egy döntést megérdemel. Egy
          //* oldalsó hasábba szorítva keskeny kártyapárrá zsugorodnának. */}
      <div className="mx-auto max-w-6xl">
        <div className="max-w-[46rem]">
          <h2 className="max-w-[14ch] text-[clamp(2.1rem,5.5vw,4rem)] font-semibold leading-[1.0] tracking-[-0.045em] text-foreground">
            Két kérdés, két nézet.
          </h2>

        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 md:mt-14">
          <Door
            href="/orarend"
            title="Heti órarend"
            detail="A teljes hét egy rácson, feloldott csoportbontással és a duális napokkal együtt."
            mark={<WeekMark />}
            variant="default"
          />
          <Door
            href="/ma"
            title="Progresszív mód"
            detail="A mai nap egy képernyőn: a futó óra, a hátralévő idő és a következő terem."
            mark={<NowMark />}
            variant="outline"
          />
        </div>
      </div>
    </section>
  );
}
