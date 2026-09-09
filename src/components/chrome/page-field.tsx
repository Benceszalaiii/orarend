//* ---------------------------------------------------------------------------
//* A LAP DÍSZRÉTEGE ÉS HASÁBRÁCSA
//* ---------------------------------------------------------------------------
//! KÉT APRÓSÁG, AMI MÉGSEM MARADHAT EGY LAPON BELÜL. A fénymező és a hasábrács
//! eddig a `ma/day-view.tsx`-ben állt, mert csak az használta. A
//! folyosóügyelet (`/ugyelet`) ugyanabban a burokban ül — ugyanaz a ragadó
//! fejléc, ugyanaz a napsáv, ugyanaz a kéthasábos törzs —, és ha ezt a kettőt
//! lemásolná, a két lap ATTÓL a naptól kezdve külön csúszna el egymástól: egy
//! `max-w-5xl` javítás az egyiken a másikon nem történne meg, és a napsáv
//! többé nem állna egy vonalban a tartalommal.
//*
//! ÉS MIÉRT NEM A `day-view.tsx`-BŐL IMPORTÁLVA. Az a modul behúzza a napi
//! nézet teljes gépezetét (órarend-lekérés, helyi példány, használatjelzés) —
//! egy díszdobozért cserébe a `/ugyelet` kötegébe kerülne az egész órarend.
//! Ez a fájl ezért nem tud SEMMIT: két konstans és egy `div`.

//! A FÉNYMEZŐ A LAPÉ, NEM A HERO DOBOZÁÉ. A negyedelt címer visszfénye nem
//! lapozhat együtt a tartalommal — egy háttér, ami oldalra csúszik, nem háttér.
//! Ezért díszrétegként áll a lap tetején, rögzített magassággal, alsó
//! elolvadással.
export function CrestField() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[30rem] overflow-hidden"
    >
      <div className="absolute -top-40 -left-40 size-96 rounded-full bg-[radial-gradient(circle,oklch(0.55_0.2_27/0.14),transparent_70%)]" />
      <div className="absolute -right-32 bottom-0 size-120 rounded-full bg-[radial-gradient(circle,var(--hero-crest-aura),transparent_70%)]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-b from-transparent to-background" />
    </div>
  );
}

//* A tartalom hasábrácsa. Ugyanaz a definíció a napsáv, a „most" sor és a
//* törzs fölött — az igazodás így szerkezetből következik, nem egyeztetésből.
export const PAGE_COLUMNS =
  "mx-auto w-full max-w-5xl px-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-8";
