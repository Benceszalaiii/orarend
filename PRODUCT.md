# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Jedlik students looking up their own class timetable, without logging in. The
default class in code is `13C` — a dual-training (duális) class — and the dual
cycle logic is first-class, so at least part of the audience alternates between
school weeks and workplace weeks.

Two distinct situations, both confirmed by what the code already optimizes for:

- **Phone, between lessons.** One class column at full width, `viewport-fit=cover`,
  safe-area padding, a landscape-phone breakpoint at `max-height: 480px`, and a
  live "Most / Szünet / Mára vége" rail. The question in this scene is *where do I
  go next*, not *what is my week*.
- **Wall print.** `@page { size: A4 landscape }` with its own light palette and
  retained subject colors. The printed week is a second medium, not a fallback.

Teachers and parents are **not** confirmed as an audience; nothing in the code
targets them.

## Product Purpose

Show the Jedlikinfo timetable in a form the school's own portal does not: full
screen, no login, on a phone, with the group-split conflicts (csoportbontás)
resolved to the student's own subset. Success is that a student stops opening
the school portal.

## Positioning

Two mechanisms a generic timetable viewer could not truthfully copy:

1. **Group-split merging.** Jedlikinfo returns every parallel group's card for a
   class. `src/lib/timetable-merge.ts` clusters the overlapping identities, lets
   the student pick which one is theirs, and remembers it per class in
   localStorage. The grid then shows *their* timetable, not the class's.
2. **Dual-cycle translation.** `src/lib/dualis.ts` derives workplace-vs-school
   days from the API's own A/B week letter (B week Wed–Fri + A week Mon–Tue)
   rather than counting from a hardcoded start date, so a holiday shifting the
   cycle does not desynchronize the app.

## Operating Context

- Data comes from the Jedlikinfo API (`jedlikinfo.jedlik.eu/api/api`), proxied by
  a Next.js rewrite at `/api/jedlik/*`. The app produces no timetable data of its
  own.
- School bell schedule: periods 0–9, 07:10 to 15:55, 45-minute lessons.
- The school day is punctuated by 10-minute breaks — the realistic window in
  which the app is opened at all.
- Printing the week and putting it on a wall is a real, supported ritual.

## Capabilities and Constraints

- **No auth, no accounts.** Deployed on Vercel. All user-facing state is
  localStorage: selected class (`orarend:class:v1`), merge preferences
  (`orarend:merge-prefs:v1`), and the local-only daily marker that keeps the
  usage counter from double-counting one device (`orarend:usage:v1`).
- **One server-side endpoint, and only one.** `/api/hasznalat` counts how many
  devices opened each class's timetable per day (Upstash Redis). It stores the
  class name and nothing else — no device id, no IP, no precise timestamp — so
  it cannot describe an individual student. Reading the aggregate needs the
  `STATS_KEY` header; without it the endpoint answers 404. If Redis is absent
  the app behaves exactly as before, it just does not count.
- **Language is Hungarian**, throughout UI and source comments. Not localized.
- **Dark only.** `colorScheme: "dark"` is set inline on `<html>`; the light
  palette exists solely for print.
- **The API has no substitution feed.** `timetable/substitutions` returns 404.
  The card payload does carry a `movedCard: boolean` and a `type` field that the
  current parser drops — these are the only first-party change signals available.
- Available endpoints confirmed working: `GET timetable/classes`,
  `GET timetable/teachers`, `POST timetable/cards`.
- Every external failure is already named rather than generalized:
  `TimetableErrorKind` distinguishes offline / network / timeout / server /
  request / payload / no-class / unknown-class, and each message says whose
  fault it is and whether waiting helps. This is a product commitment, not an
  implementation detail.

## Brand Commitments

- Name: **Órarend**.
- Existing routes: `/orarend` (week grid, default), `/dualis` (same grid, dual
  labels, noindex), `/adatvedelem` (privacy), `/statisztika` (operator-only
  usage report, password-gated, noindex).
- The subject-color system is **data, not decoration**: a hash of the subject
  seeds one of 12 accent hues (`src/lib/accent.ts`), and print explicitly
  re-requests those backgrounds because the color identifies the subject.
- Voice: direct, second-person Hungarian, no hedging, no apology. Error copy
  tells the student who broke it and whether to wait.

## Evidence on Hand

- Live Jedlikinfo API, verified reachable during this session.
- Real bell schedule and real class list (09A … 13C and more) from the API.
- **No public/ directory, no icon set, no manifest.** A PWA needs these authored
  from scratch; there is no existing logo asset to reuse.
- `@vercel/analytics` is installed, but the account is on the Hobby plan, where
  **custom events are not available** (Vercel's plan table lists them as Pro+).
  Per-class usage is therefore measured by the app's own `/api/hasznalat`
  counter, not by Vercel. Hobby also caps Web Analytics at 50,000 events/month
  with a 1-month reporting window.
- The usage counter is new; it has collected no meaningful data yet. No
  user-research findings, no testimonials. Do not invent adoption numbers.

## Product Principles

1. **Name the failure, and whose it is.** The app is a window onto someone
   else's data; when that data is broken, say so precisely instead of showing an
   empty grid.
2. **Color carries meaning.** Accent hues identify subjects; they survive into
   print because they are information.
3. **The phone question is "where now", the desktop question is "what week".**
   The same data, two genuinely different jobs.
4. **Client-only is a feature.** No login, no account, no per-user server-held
   data — which also means every capability must be derivable on-device. The
   one exception is the class-level usage counter, which is aggregate by
   construction: if a measurement could describe one student, it does not ship.
5. **Legibility outranks fitting.** The grid refuses to shrink below a scale
   where the subject name survives; it scrolls instead.

## Accessibility & Inclusion

- `prefers-reduced-motion` is honored for the drain bar and all view
  transitions.
- Touch targets are gated on `(pointer: coarse)`, not viewport width.
- Live regions and `sr-only` labels are used in the now rail; the countdown has
  a text equivalent.
