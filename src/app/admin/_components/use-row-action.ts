"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

//* Minden pult- és lap-action ezt az alakot adja (a `slug` mellékes).
type Result = { ok: true } | { ok: false; error: string };

//! EGY ÍRÁSI ÚT, EGY HIBAHELY. A pult minden sorgombja ugyanígy fut:
//! megerősítés (ha kell), action, majd a lap újratöltése a szerverről — a pult
//! soha nem „hiszi el" a saját állapotát, mindig azt mutatja, ami az
//! adatbázisban van. A hiba a sorhoz tartozik, nem a laphoz: egy elutasított
//! törlés ne takarja el a többi sor állapotát.
export function useRowAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<Result>, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return { pending, error, run };
}
