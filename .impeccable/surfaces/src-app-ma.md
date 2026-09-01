---
version: 1
slug: "src-app-ma"
primary_target: "src/app/ma"
related_targets: []
---

Scope: the `/ma` route. Visitor mode: Operate. Name: „Ma" (nav label, homescreen
label, title). Sibling to `/orarend`, which stays the default at `/`.

## Audience and job

A Jedlik student on a phone, standing, during a 10-minute break or the walk in.
Three to fifteen seconds of attention, and exactly one of three questions: where
am I supposed to be now, where do I go next and how long have I got, did anything
about today move. `/orarend` answers all three but each must be hunted for; `/ma`
hands them over.

Designed at 390x844 first. Desktop is a courtesy, not the scene.

## Product truth this surface carries

- `now.ts`'s state machine (most / szünet / mára vége / ma szabad / before) already
  models the day correctly, including the rule that the "next" item cannot be an
  earlier time on a later day. This surface is that logic given a screen.
- **Merge preferences are load-bearing.** Jedlikinfo returns every parallel
  group's card; without `resolveDay()` from `timetable-merge.ts`, „most" is
  ambiguous because two lessons claim the same minute. Resolving is correctness,
  not tidiness.
- **Dual status belongs here.** For a dual-training class, "school or workplace
  today" outranks every other fact. `dualStatusOf()` derives it from the A/B week
  letter already.
- `movedCard` (and `type`) are real first-party fields the parser currently drops.

## Chosen direction: dashboard in the jedlik-szakkor personal-home grammar

Superseded the originally locked "Most + Utána" structure at the user's
direction, twice: first because a day-only view is not a dashboard, then because
the accent hues must not paint surfaces.

- **Thesis:** the day lives at the top, the week lives beside it. Not the week
  grid zoomed in, and not a second grid — every rail panel answers something the
  grid can only answer by being read end to end.
- **Grammar, borrowed wholesale from `jedlik-szakkor/src/app/_components/personal-home.tsx`:**
  hero band (page background plus the crest light-field, red top-left / blue
  bottom-right, soft bottom fade to `--background`); hero blocks as
  `rounded-2xl border-hero-foreground/15 bg-hero-foreground/[0.06]`; the time as
  the largest element in `tabular-nums`; icon+label metadata rows
  (CalendarClock / MapPin / GraduationCap); `SectionRow` headings over
  `divide-y divide-border rounded-xl border bg-card` list groups; dashed
  `EmptyPanel` for quiet states.
- **Colour rule:** the twelve deterministic subject hues appear ONLY as dots
  (`acc-dot`) and as text (`acc-text`). They never fill a surface. Red
  (`--brand`) is reserved for live and action roles: the "Most" pill, the now
  rule on the ribbon, today's marker, moved-lesson warnings.
- **Layout:** `max-w-5xl`, one column under `lg`, `lg:grid-cols-[minmax(0,1fr)_19rem]`
  above it. DOM order puts the main column first, so mobile reading order is
  priority order.

## What the dashboard adds beyond the grid

- **A hét** — five day rows with a neutral load bar, hours, dual-day marking, a
  moved-lesson warning, and today's red dot. Also the navigation: any day can be
  focused, and the whole left side follows.
- **Áthelyezve a héten** — moved lessons across the entire week, not just today.
- **Tantárgyak** — weekly minutes per subject, sorted, with the group name shown
  only where two entries share a short name. Dual days are excluded from the
  totals, and the panel says so.
- **A mai nap** — a neutral proportional ribbon (the day's shape, with lanes for
  unresolved group splits) over a list of the day's lessons; past lessons dim.

## Content ranges

Periods 0–9, 07:10–15:55, 45-minute lessons, 10-minute breaks. Typical day 5–7
lessons, possible 0. Blocks run to 3 periods (150 min). Subject titles reach ~40
characters ("Mobil alkalmazások fejlesztése altantárgy"). Rooms are short numerics
(102, 303) but not guaranteed to be.

## States, all designed rather than discovered

Lesson running · break · before first lesson (60-min lead-in) · day over (tomorrow's
first lesson, named by day) · day empty or weekend · **dual day** (workplace stated
first — the day's lessons are not yours to attend) · nothing moved · something
moved · offline/stale (last-fetched timestamp, shown not hidden) · no class chosen
(first-run picker) · every `TimetableErrorKind` with its existing named message.

**The `movedCard` consequence.** All 32 cards in the sampled week had
`movedCard: false`; the school may set it rarely, so the alert lane is silent
nearly always. It therefore cannot be a box that sits empty — it must be a line
worth reading when nothing happened („Ma semmi nem változott"), whose loud state is
a change of tone rather than the appearance of new furniture.

## Alert source

`movedCard` only — decided. No snapshot diffing, no inferred changes. Nothing is
presented as a change that the API did not itself flag.

## PWA

Installable + offline cache only. Manifest, authored icon set, service worker
caching the app shell and the last fetched week, with an honest stale marker. No
push: that needs VAPID keys, a subscription store, and a polling backend this
client-only app does not have. Next 16's manifest and service-worker conventions
must be read from `node_modules/next/dist/docs/` before implementation.

## Boundaries

Untouched: `/orarend` (default at `/`, print stylesheet, week grid, merge
controls, its own `NowRail`), `timetable-merge.ts` (consumed, not modified),
existing tokens in `globals.css` (additions only).

Anti-goals: a second week grid; `/orarend` zoomed in; a backend; login; push;
light mode; a print stylesheet for this route; any inferred change beyond
`movedCard`.

## Asserted, open to correction

1. PWA `start_url` is `/ma` — the homescreen icon is the daily-driver entry.
   `/` keeps redirecting to `/orarend`.
2. A persistent route switch in the header of each route. There is currently no
   navigation at all between `/orarend`, `/dualis`, and `/adatvedelem`.
3. The icon set is authored from the accent-hue system; no logo asset exists.

## Undecided

Whether `/dualis` survives. It is a near-copy of `/orarend` with one badge; if
„Ma" states dual status prominently, its remaining reason is seeing the cycle
across weeks. Left untouched pending the user's call.
