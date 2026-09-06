---
version: 1
slug: "src-app-home"
primary_target: "src/app/home"
related_targets: []
---

Scope: the whole `/home` landing surface — the scroll film, the cobalt light-box
band, the closing pair of doors, and the floating view switcher that crosses all
three grounds. Visitor mode: Persuade. The surface helps phone-first Jedlik
students trust Órarend and open their timetable.

## Audience and job

Students checking their timetable quickly between lessons. They should
understand what Órarend does differently and know which of the two views to
open. Teachers arrive here too now: the band's last frame is the only place on
the page that names the second subject.

## Product truth this surface carries

- Csoportbontás is resolved so the student sees their own lesson.
- Duális képzés shows school and workplace days in one week.
- Progresszív mód reduces the day to what matters now.
- The teacher gets the same week from the other side: which class, which room,
  and when the free periods are (`/tanari`, `components/ma/teacher-week.ts`).
- The bell schedule, the accent hues and the card itself are the app's own.

## Direction contract

THESIS: The landing page is not a description of the timetable — it is the
timetable, seen from four distances.
OWN-WORLD: One week grid, built from the real `EventCard` and the real subject
hues, sitting on the app's own `bg-card` plate. Warm paper opens, cobalt passes
through, the app's night surface closes. Dark instrument panels carry the words.
STORY: The whole week at a glance → the week resolves → the student's own group
is picked out of a conflicting pair → the dual week reads as one shape → a single
running lesson → the four newest capabilities on a lit board → two doors.
FIRST VIEWPORT: Display headline on warm paper at the left, the week board
tilted away at the right, one CTA.
FORM: Scroll-driven camera over a single grid instance; local extension of the
existing world; seed key: home-grid-film.
FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review and the verdict.

## The cobalt band is a light box

The band was the one part of the page that was not made of the timetable: flat
brand colour with text on it. It now carries a WebGL field built from the same
`week.ts` cards and `lib/accent.ts` hues the film draws, seen very close and
through slow-moving glass; the four items ride it as glass slides. Rules that
hold the band together:

- **The field only ever adds light.** No vignette, no shadow, no darkening term.
  This is what keeps `--ink-on-primary` at or above its 6.21:1 on bare cobalt
  (measured worst background in the built page: 6.29:1; inside a slide 6.72:1).
- **The glass is a contrast device, not a mood.** `backdrop-filter` flattens the
  moving field under the reading text; below 40rem a solid, slightly lighter
  cobalt plate does the same job without the compositing cost.
- **Three switches retire the canvas, and the still frame is a full design, not
  an error state:** reduced motion, no WebGL / lost context, and a measured
  frame cadence slower than ~38fps. The CSS still frame draws the same five lit
  day columns.
- The band's item count drives its height (`STEP_SVH` per transition) and the
  rail's station count; station labels appear only from 48rem.

## Boundaries

Preserve the Hungarian voice, the product's factual claims, the two view names,
and the app's behavior on `/orarend`, `/ma` and `/tanari`. Do not sell no-login
access, add usage numbers, or add testimonials. The grid is sample data and must
stay `inert`: the words carry the meaning, never the board — and the light field
is not readable data either, only the board's rhythm.

## Measured constraints

- `--primary` (#1C9CF0) gives white only 2.97:1. Anything sitting on a cobalt
  fill uses `--ink-on-primary` (6.2:1, 5.0:1 at 85%).
- The two-column composition needs 1280px; below that the board goes above the
  copy and the veil comes back.
- Camera poses are anchored to the measured beat centres, never to hand-written
  scroll fractions — the first version drifted a whole keyframe.
- A `<style>` template literal must not contain a backtick, not even inside a
  CSS comment: it silently terminates the literal and the route 500s.
- The band's sticky light field must keep a full-height margin box. Zeroing it
  with `margin-bottom: -100svh` removes sticky's bottom clamp and the field
  hangs a whole viewport past the section, burying the closing doors — the CTA
  was invisible above 1024px. The negative margin belongs to `.latest-stage` as
  `margin-top`, so field and stage un-pin on the same frame.
- The two doors open side by side from `md`, not `sm`. At 640px a two-up door is
  280px wide against 72px of its own padding; the title breaks in two and the
  detail in five. Below 768px the full-measure stacked door is the right shape.
- The closing section's spacing rhythm widens outward at every viewport:
  section frame > heading-to-doors > door-to-door gutter > door padding
  (128/64/40/36 at 1440, 96/56/32/28 at 390). The gutter was 16px against 36px
  of padding, which read as one cracked slab rather than two doors.
