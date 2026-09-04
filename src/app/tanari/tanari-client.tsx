"use client";

import { TimetablePage } from "@/components/timetable/timetable-page";

//! UGYANAZ A LAP, MÁS ALANNYAL. A rács, a lapozás, az offline tartalék és a
//! duális beosztás mind a közös `TimetablePage`-ben van; itt csak annyi áll,
//! hogy ez a lap TANÁRT kérdez, nem osztályt. Ha ez a fájl valaha hosszabb
//! lesz néhány sornál, az azt jelenti, hogy a két nézet elkezdett szétcsúszni
//! — és a különbséget a `mode`-ba kell visszavinni, nem ide.
export function TanariPage() {
  return <TimetablePage mode="teacher" heading="Tanári órarend" />;
}
