"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DEFAULT_VIEW, loadLastView } from "@/lib/last-view";

//! A `/` NEM EGY HARMADIK NÉZET, HANEM EGY AJTÓ. Az emléket (melyik nézetben
//! járt utoljára a diák) csak a böngésző ismeri — cookie-t az oldal nem használ
//! —, ezért a döntés kliensoldalon születik meg, és `replace`-szel megyünk
//! tovább: a `/` ne kerüljön az előzményekbe, különben a Vissza gomb ide dobná
//! vissza a felhasználót, és rögtön újra elirányítaná.
export function HomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace(loadLastView() ?? DEFAULT_VIEW);
  }, [router]);

  //! JAVASCRIPT NÉLKÜL IS TOVÁBB KELL LEHETNI JUTNI. A fenti átirányítás egy
  //! szempillantás alatt lefut, de ha nem fut le (letiltott JS, hibás betöltés),
  //! ez a két hivatkozás marad az egyetlen kijárat — ezért valódi linkek, nem
  //! csak egy „Betöltés…" felirat.
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm text-muted-strong">Órarend betöltése…</p>
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/orarend"
          className="rounded-full border border-input px-3 py-1.5 font-medium text-foreground hover:bg-muted"
        >
          Heti órarend
        </Link>
        <Link
          href="/ma"
          className="rounded-full border border-input px-3 py-1.5 font-medium text-foreground hover:bg-muted"
        >
          Progresszív mód
        </Link>
      </div>
    </main>
  );
}
