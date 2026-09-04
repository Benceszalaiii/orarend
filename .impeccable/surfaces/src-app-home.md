---
version: 1
slug: "src-app-home"
primary_target: "src/app/home"
related_targets: []
---

Scope: the whole `/home` landing surface — the scroll film, the cobalt changelog
band, the closing pair of doors, and the floating view switcher that crosses all
three grounds. Visitor mode: Persuade. The surface helps phone-first Jedlik
students trust Órarend and open their timetable.

## Audience and job

Students checking their timetable quickly between lessons. They should
understand what Órarend does differently and know which of the two views to
open.

## Product truth this surface carries

- Csoportbontás is resolved so the student sees their own lesson.
- Duális képzés shows school and workplace days in one week.
- Progresszív mód reduces the day to what matters now.
- The bell schedule, the accent hues and the card itself are the app's own.

## Direction contract

THESIS: The landing page is not a description of the timetable — it is the
timetable, seen from four distances.
OWN-WORLD: One week grid, built from the real `EventCard` and the real subject
hues, sitting on the app's own `bg-card` plate. Warm paper opens, cobalt passes
through, the app's night surface closes. Dark instrument panels carry the words.
STORY: The whole week at a glance → the week resolves → the student's own group
is picked out of a conflicting pair → the dual week reads as one shape → a single
running lesson → two doors.
FIRST VIEWPORT: Display headline on warm paper at the left, the week board
tilted away at the right, one CTA.
FORM: Scroll-driven camera over a single grid instance; local extension of the
existing world; seed key: home-grid-film.
FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review and the verdict.

## Boundaries

Preserve the Hungarian voice, the product's factual claims, the two view names,
and the app's behavior on `/orarend` and `/ma`. Do not sell no-login access, add
usage numbers, or add testimonials. The grid is sample data and must stay
`inert`: the words carry the meaning, never the board.

## Measured constraints

- `--primary` (#1C9CF0) gives white only 2.97:1. Anything sitting on a cobalt
  fill uses `--ink-on-primary` (6.2:1, 5.0:1 at 85%).
- The two-column composition needs 1280px; below that the board goes above the
  copy and the veil comes back.
- Camera poses are anchored to the measured beat centres, never to hand-written
  scroll fractions — the first version drifted a whole keyframe.
