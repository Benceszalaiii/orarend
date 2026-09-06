"use client";

import { useStoredIdentity } from "@/lib/use-identity";
import { StudentDay } from "./student-day";
import { TeacherDay } from "./teacher-day";

//* ---------------------------------------------------------------------------
//* „Ma" — EGY ÚTVONAL, KÉT ALANY
//* ---------------------------------------------------------------------------
//! EZ A FÁJL EDDIG 1220 SOR VOLT, ÉS EBBŐL NAGYJÁBÓL 900 NEM TUDTA, KIÉ AZ
//! ÓRAREND. A lekérés, a helyi példány, a napköteg, a „most", a pihenőnapok és
//! a hero őrszeme mind ugyanaz a gépezet a diák napjához és a tanáréhoz — a
//! negyedik cellát ide toldani azt jelentette volna, hogy minden `if (tanár)`
//! ág átszövi a diák lapját is. Ezért a gépezet a `ma/use-day-view.ts`-be, a
//! szerkezet a `ma/day-view.tsx`-be került, ÁTÍRÁS NÉLKÜL; ami alanyfüggő, az
//! a két lapon áll (`student-day.tsx`, `teacher-day.tsx`).
//!
//! ÉS MIÉRT NEM KÉT ÚTVONAL. Az `/orarend` és a `/tanari` külön cím, mert azok
//! régebbiek, indexeltek és könyvjelzőzöttek. A „Ma" viszont EGY cím maradt:
//! az alany tárolt beállítás (`lib/identity.ts`), amit a fejléc mátrixa állít,
//! a `/tanari`-ra vagy az `/orarend`-re érkezés pedig magától felír. Így a PWA
//! `start_url`-je nem hasad ketté, és a nézetváltó két pirula marad.
//!
//! AMIT EZ ELVESZ, ÉS NEM HALLGATUNK EL: a tanári „Ma"-nak nincs megosztható
//! címe. Aki elküldi a linkjét egy kollégának, annál a kolléga SAJÁT alanya
//! szerinti nap nyílik meg.
//*
//* Kiszolgálón és az első képkockán a diák olvasata fut (a tároló csak a
//* böngészőben van) — ezért nincs hidratálási eltérés, és ezért nem tartozik
//* ide `Suspense`: a lap úgyis a saját töltés-jelzőjével indul.
export function MaPage() {
  const identity = useStoredIdentity();
  return identity === "teacher" ? <TeacherDay /> : <StudentDay />;
}
