"use client";

import { TimetablePage } from "@/components/timetable/timetable-page";

//! UGYANAZ A LAP, HARMADIK ALANNYAL. Ami a `/tanari`-ra igaz, az ide is: a
//! különbség a `mode`-ban él, nem ebben a fájlban (lásd `TimetablePage`).
export function TeremPage() {
  return <TimetablePage mode="classroom" heading="Terem-órarend" />;
}
