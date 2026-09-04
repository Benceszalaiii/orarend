"use client";

import { TimetablePage } from "@/components/timetable/timetable-page";

//* A lap TELJES tartalma a közös rácslapban van (`timetable-page.tsx`) — itt
//* csak az dől el, KINEK az órarendjéről van szó. A tanári párja: `/tanari`.
export function OrarendPage() {
  return <TimetablePage mode="class" heading="Órarend" />;
}
