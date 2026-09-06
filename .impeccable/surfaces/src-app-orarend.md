---
version: 1
slug: "src-app-orarend"
primary_target: "src/app/orarend"
related_targets:
  - "src/app/ma"
  - "src/app/tanari"
  - "src/components/site-nav.tsx"
  - "src/components/timetable/calendar.tsx"
  - "src/components/timetable/toolbar-more.tsx"
---

Scope: the shared page chrome across every timetable cell, plus a redesign of
`/orarend`'s reading layer. Visitor mode: Operate. Confirmed 2026-09-04.
Concept round: surface scope, seed `39962ec7`, dealt 7/4/6, locked **The
Standing Line** (`standing-line`), build path code-led.

## The matrix this chrome serves

|        | Hét (week grid) | Ma (today)  |
| ------ | --------------- | ----------- |
| Diák   | `/orarend`      | `/ma`       |
| Tanár  | `/tanari`       | *new cell*  |

`/orarend` and `/tanari` are already ONE component (`TimetablePage`, `mode`).
The old nav flattened two orthogonal axes — WHOSE timetable and WHICH view —
into one row of sibling pills, which is why the fourth cell had nowhere to go
and why the bar could only grow.

**The user's chosen model: identity above views.** Identity (Diák / Tanár) is
set once and inferred from login where possible; the views hang below it.

## Audience and job

A Jedlik student on a 375–390px phone, standing, mid-break, 3–15 seconds of
attention. A teacher asking the third question: not where 13C is, but where
*they* have to be. Desktop is the planning and wall-print scene, not primary.

## Measured failure this replaces

Measured 2026-09-04 against the live dev server, not estimated:

- `/ma` at 375px: document width **445px** — 70px of hard horizontal overflow.
  `SITE_BAR_CLUSTER` measures 434px inside a 351px content box and every child
  is `shrink-0`: bell + class picker (104) + home (32) + 3-pill nav (194) +
  account (44). `Tanári` is clipped; the account button is fully off-screen.
- `/orarend` at 375px: toolbar **171px** + sticky block **133px** = **304px of
  812 (37%)** before one lesson is visible. 171px is the exact figure
  `calendar.tsx`'s own comment says `ToolbarMore` was introduced to fix.
- The class picker sits alone on its own row, right-aligned, beside a ~240px
  void. On desktop the bar is a flat run of 12+ controls at one visual weight.

## Reported pain (from the user, not inferred)

1. Too many controls, no grouping — no sense of which are daily and which are
   set-once.
2. Csoportbontás / merge — people do not know what the person icons and the
   Szűrések panel do, or that they filtered their own timetable.
3. Which week / how to move — paging, `Ma`, the A/B badge and the date range do
   not read as one thing.

("No orientation on arrival" was offered and NOT selected.)

## Selected direction: The Standing Line

**The header is a single line that states exactly where you are, and tapping it
opens everything.**

    ┌──────────────────────────────────────────────────┐
    │ 13C · aug. 31 – szept. 4.   [👤 🎓│Hét Ma]   (◕) │  ≤48px, all four cells
    ├──────────────────────────────────────────────────┤
    │ H 08.31   K 09.01   Sze 09.02   Cs 09.03  P 09.04│
    └──────────────────────────────────────────────────┘

One 44px row. Never two. The line is title, status and the only gate. Tapping
it opens ONE sheet, sectioned by frequency and identical on all four pages:

  **Kit nézel** (which class / which teacher) → **Melyik hetet** →
  **Beállítások** (merge, duális, értesítés, jelmagyarázat) → **Fiók**

Amended 2026-09-04: identity (Diák / Tanár) left the sheet and fused with the
view switch in the line's right cluster — one capsule, a hairline, two axes
(`ViewMatrix` in `chrome/standing-line.tsx`). The sheet's **Kit nézel** now
carries only the subject's *name*; the bar carries the *axis*. Measured at
375px: capsule 149px, line 194px, chrome row 44px, document width 375px. The
cost is the cross-month week label, which now truncates at `aug. 31. …` — the
DayStrip one row below still spells every date.

`ToolbarMore`, the loose icon row, the orphaned class picker and the three-pill
nav all dissolve into it.

**Why the overflow cannot recur.** The line truncates; the right cluster is
fixed. `Hét|Ma` (~92px) + account (44px) = 136px, leaving the line ≥215px at
375px. Nothing but the cluster is `shrink-0`. Adding the fourth cell costs zero
header width — that is the whole point of the structure.

### The four raises, each named for the hand it came from

Surface round, seed `39962ec7`. The gate board fused *competitive* (its
departure-ordered ranking is already `/ma`'s thesis; it lost on product clarity
because `/orarend` is a week grid that must survive print). Teletext, the
vertical feed and the box wall were *declined* as costume, each donating one
discipline:

- **From the gate board** — a moved or merged lesson **shifts in place and holds
  its alert until acknowledged**; it never vanishes and reappears elsewhere.
  This is what the csoportbontás report is actually asking for.
- **From teletext** — the line always spells the **full address**; where you are
  is never left to a highlighted pill alone.
- **From the vertical feed** — **nothing in the centre**. Controls hold the top
  and bottom edges; the middle of the phone is lessons.
- **From the box wall** — **one lesson label schema** (subject · room · teacher ·
  time), set identically in the grid, the day list and the sheet. Today
  `lesson-block`, `day-list` and `lesson-sheet` each phrase it differently.

## Success, measured

- `/ma` document width ≤ viewport width at 375px (from 445px).
- `/orarend` chrome above the day-header row ≤ **48px** (from 171px).
- Total sticky chrome ≤ **140px** of 812 (from 304px).
- The fourth cell adds **zero** header width.

## Interaction and layout

- The date range in the line **is** the calendar trigger — the text that tells
  you which week is the text that changes it.
- `Ma` appears in the line **only when you are off the current week**: a control
  that exists only when it has work to do.
- Desktop keeps `‹ ›` flanking the line and the existing `←` / `→` / `T`
  shortcuts; phone pages weeks by the swipe that already exists.
- Merge stops being an icon with a number. `/ma` already ships the right model
  — „3 csoportbontás eldöntetlen — a »most« pontatlan lehet… **Kiválasztom**" —
  a sentence in the content, not a badge in the chrome. `/orarend` adopts it.
- `/home` keeps a floating variant of the line; its `nav-glass` closed colour
  world stays, or the warm-paper hero swallows the controls.
- The `site-nav.tsx` invariant survives structurally: one shared bar component
  means the switcher sits at identical coordinates on all four cells. Do not
  reintroduce per-page geometry.

## Scope

**In:** the shared chrome across all four cells; `/orarend`'s reading layer —
day headers, now rail, lesson-card density and content, and how merge conflicts
announce themselves; the fourth cell's information design.

**Untouched:** the visual world (dark-only, accent hues as data, `--brand` red
reserved for live and action roles); `timetable-merge.ts`, `now.ts`,
`dual-schedule.ts` consumed not modified; the drag-paging mechanics and print
stylesheet in `calendar.tsx`; `/adatvedelem`, `/statisztika`, `/valtozasok`.

**Anti-goals:** light mode; a second week grid; a bottom tab bar (dealt and not
chosen); a header that changes shape on scroll (dealt and not chosen — and
`site-nav.tsx`'s measured 99px-jump thesis forbids it); a backend; a new
palette; any inferred change beyond `movedCard`.

## Content ranges

Class `13C` (3 chars) vs teacher `Baranyainé Beck Gabriella` (25) — the line's
truncation is designed for both. Subject titles to ~40 chars, rooms short but
not guaranteed numeric, periods 0–9 / 07:10–15:55, 5–7 lessons/day, blocks to
3 periods, 5 columns.

## States

No subject chosen · off the current week · A/B badge present or absent · dual
day · undecided group splits (n unresolved) · something moved · nothing moved ·
offline/stale with timestamp · every `TimetableErrorKind` with its existing
named message · teacher signed in vs anonymous · print.

## Asserted and confirmed by the user

1. **Identity in the line.** Identity is explicit and governing INSIDE the
   sheet; the line shows only the resolved subject (`13C` vs `Kovács B.`),
   which already reads as class-or-teacher by shape. Students never see a
   control that does not apply to them. This is the reading of "set once, or
   inferred from login" that was confirmed.
2. **The bell on teacher-Ma.** Push subscriptions are class-keyed server-side
   (`push-store.ts`), so a teacher subscription would silently vanish.
   Teacher-Ma therefore ships WITHOUT notifications, as `/tanari` does today.
3. **Desktop `‹ ›` stay in the bar.** Week-stepping is a per-second action while
   planning; it does not go behind the sheet on desktop.

## ~~Undecided~~ — RESOLVED 2026-09-04

**Routing for the fourth cell: ONE `/ma`, and the ALANY decides whose day it
shows.** Not `/tanari/ma`, not a query param. The rule: **what encodes identity
in a route WRITES it, `/ma` READS it** — `/orarend` writes `class`, `/tanari`
writes `teacher`, `/ma` writes nothing. The **Hét** pill resolves its href from
the stored identity (`/tanari` for a teacher, else `/orarend`); `VIEW_OF` keeps
lighting Hét on `/tanari`. `VIEW_ROUTES` and `last-view.ts` are unchanged, and
the PWA `start_url` stays `/ma` — now genuinely serving both identities, which
is the strongest argument for this shape.

Consequences accepted with it: the identity becomes a persisted field in
`prefs-shared.ts` beside `class` / `teacher` / `lastView`; `IdentitySwitch`
gains a variant that flips **in place** on `/ma` instead of navigating; and
teacher-Ma has **no shareable URL and no indexable page** — a link sent to a
colleague opens their own identity's day.

Full brief for the cell: `.impeccable/surfaces/src-app-ma.md`, section
„A TANÁRI »MA«".

## Direction contract

**THESIS:** The header is one line that states where you are and opens
everything. It refuses the category default — a toolbar that grows a control per
feature until it wraps.

**OWN-WORLD:** Committed dark: black ground, `--card` panels, `--brand` red for
live and action only, the twelve accent hues as dots and text only. One 44px
row, one sheet, `tabular-nums` for time. No icon row.

**STORY:** The student sees whose timetable, which week, which view — in one
sentence — and never hunts for a control.

**FIRST VIEWPORT:** `13C · aug. 31 – szept. 4.` at title weight on the left,
truncating; `Hét|Ma` then account fixed at the right; day headers immediately
below; lessons from ~96px down. Tapping the line is the primary action.

**FORM:** The Standing Line — candidate 7 of 7, dealt lead. Seed `39962ec7`.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance

## Build log

### Phase 1 — shared chrome: DONE, measured 2026-09-04

`src/components/chrome/standing-line.tsx` (new, the bar) and
`chrome/chrome-sheet.tsx` (new, the sectioned sheet) now serve `/orarend`,
`/tanari`, `/ma`, `/home` (floating) and `/design`. Deleted as orphaned:
`components/site-nav.tsx`, `components/timetable/toolbar-more.tsx`, and the
`.tt-more*` block in `globals.css` (all its selectors were descendants of a
`.tt-more` parent that no longer exists).

Measured on the dev server, 375x812:

| | before | after | target |
| --- | --- | --- | --- |
| `/ma` document width | **445px** (+70 overflow) | **375px** (0) | ≤375 ✅ |
| `/orarend` header | **171px** | **44px** | ≤48 ✅ |
| `/tanari` header | 171px | **44px** | ≤48 ✅ |
| `/orarend` total sticky chrome | **304px** | **177px** | ≤140 ⚠️ |

The remaining 133px is `NowRail` + the day-header row — the reading layer, which
is phase 2. The ≤140px total is phase 2's number, not phase 1's.

Verified: no horizontal overflow on any route; `/tanari` correctly lights the
**Hét** pill (teacher = subject, not view); the sheet opens in-viewport at 375px
(x=4, w=367) with all three sections; desktop keeps `‹ ›` and the `←`/`→`/`T`
shortcuts; every former icon-only control now carries a written name.
`tsc --noEmit` clean; `detect.mjs` returns `[]`.

Fixed during the round: the subject truncated before the date (`13C` became
`1…`) — the subject is now capped and `shrink-0`, the date truncates first;
`/tanari` showed the teacher's internal code (`AA`) instead of the name;
`aria-haspopup="dialog"` removed from a panel that is not a dialog.

### Phase 1b — user-reported defects, fixed and measured 2026-09-04

Four defects the first pass shipped. The second and third were visible in my own
inspection round; I dismissed the sheet one as "a fine scroll affordance", which
was wrong — the user reported it immediately.

1. **The line had no affordance.** It was bare text; a `title` and a hover
   background were the only signals, and both are invisible on a touchscreen.
   Now it wears the app's own control language — `rounded-full border
   border-input` + a rotating `ChevronDown`, the same shape as every other
   dropdown in the project.
2. **The sheet's settings fell below the fold.** The calendar took ~300px of a
   544px sheet and pushed „Beállítások" — the reason the sheet exists — out of
   view. „Melyik hetet" is now a `SheetDisclosure`: collapsed it is one row
   stating the range with a „Mai hét" action beside it, so the week's two most
   frequent operations need no expansion. All three sections plus Fiók now fit
   at 375x812 with no scrolling (sheet bottom 368 of 812 on `/ma`).
3. **„Ma" displaced the next-week arrow.** In `‹ line › Ma` order, „Ma"
   appearing pushed the `›` arrow sideways, so after several steps forward the
   next tap hit „Ma" instead of „next week". „Ma" now lives inside the line's
   own `flex-1` box, so its width comes out of the truncating date and nothing
   outside the line moves. Measured across 3 and 5 steps: **next arrow 0px
   shift, prev arrow 0px shift**.
4. **Rapid week-stepping threw unhandled rejections.** A new view transition
   aborts the running one and the aborted transition's `ready` rejects;
   `view-transition.ts` only caught `finished`. Now `ready` and
   `updateCallbackDone` are caught too. Measured: 6 steps at 180ms →
   **0 unhandled rejections** (was 3).

Also restored: the loading state. The old bar's spinner sat beside the week
label and shifted its neighbours on every load; it is now a 2px brand-coloured
progress line on the bar's bottom edge, outside the flow, honouring
`prefers-reduced-motion`.

### Phase 1c — the account button fused into the sheet

At the user's direction: **login exists only to sync preferences**, so it is not
a peer of the views. `AccountMenu` left the right cluster and became the sheet's
last section, „Fiók → Beállítások szinkronizálása / Belépéssel átjönnek a többi
eszközödre". Where there is no sheet (`/home`'s floating bar) it stays inline —
verified `/home` still reads „Hét Ma Belépés".

This bought 44px back: `/orarend` at 375px now shows the **full** date
(`13C · aug. 31. – szept. 4.`) where it previously truncated to `aug. 31. – …`.

Right cluster is now two pills only. Header still 44px, overflow still 0 on
every route.

### Phase 1d — the rows were fake rows

The user asked how an icon on the left plus a clickable icon on the right could
be good UX. It is not, and the first `SheetRow` shipped exactly that:

- **Every icon appeared twice.** A decorative `aria-hidden` glyph on the left,
  and the same glyph again on the right as the real trigger — briefcase and
  briefcase, bell and bell, info and info.
- **A 343px row with a 36px hit area.** The label, the hint and all the space
  between them did nothing. A list that looked like rows but was tiny buttons
  wearing rows — the icon-field the sheet existed to abolish.

The project already had the right pattern and I deleted it as dead code: the old
`.tt-more-item` rule made the trigger *become* the full-width row. Reinstated as
`sheetItem()` + `SheetItemBody` in `chrome-sheet.tsx`, and unconditional this
time — these four controls now render only inside sheets, so no media query is
needed. Each of `PreferencesMenu`, `DualSetupButton`, `NotificationMenu`,
`LegendMenu` and `AccountMenu` now *is* its row: full width, icon once on the
left, label and hint inside the button, so the accessible name carries both.

`AccountMenu` gained a `variant` of `icon` (the `/home` floating bar) and `row`
(inside a sheet).

Measured at 375px, `/orarend`: every settings row **343x48px, 93% of the sheet
width, exactly 1 icon** — against a 36px circle before, roughly **9.5x the hit
area**. Same at 1280px (328px rows). Verified the rewritten triggers still open
their layers (legend popover, dual dialog) and that the sheet survives their
Escape, so the layering discipline inherited from `toolbar-more.tsx` holds.

Regression caught and fixed in the same round: `/ma` and `/design` still wrapped
`NotificationMenu` in a `SheetRow`, so „Értesítés" rendered twice side by side
once the button carried its own label.

`SheetRow` survives for genuinely non-interactive rows only (the „Ma: duális
nap" status line) and for the native `<select>` class picker, where a labelled
form control on the right is the conventional and correct shape.

### Phase 1e — two rows on desktop; the premise was wrong

The user rejected all three options I offered and reframed the problem: **two
lines of actions are fine — the fault was visual hierarchy and unclear actions,
not row count.** That corrects a premise I had been building on since the start.

The original 304px chrome was not bad because it was three rows. It was bad
because twelve controls sat at one visual weight, ungrouped, most of them bare
icons. Compressing everything into one row was the same mistake from the other
direction: measured at 1440, the full inline rail (1033px) squeezed the line to
„2026. aug…" — truncating the very date the line exists to state.

**Desktop is now two rows with a real hierarchy:**

- Row 1 (44px) — *where you are*: `‹ 13C · 2026. aug. 31. – szept. 4. B ›` at
  title weight, with the view pills at the right.
- Row 2 (40px) — *what you can do*: identity, class picker, calendar, then the
  named actions, then Belépés. Quieter, smaller, separated from row 1 by a
  hairline.

84px total on a 900px desktop — 9%, and nothing is hidden behind a click.

**Phone keeps one row plus the sheet.** There the second row would come out of
the 812px the timetable has to live in, which was the original complaint.
Breakpoint measured, not chosen: the action row is 1033px, 1065 with margins, so
it earns its place from 80rem up.

Also fixed this round:

- **The steppers straddled the whole bar.** `‹` and `›` sat on the outer edges
  of a stretching line, so at 1440 they were ~1200px apart — a paired control at
  opposite ends of the screen. They now sit inside the line's own group:
  measured **270px apart**, flanking the date.
- **The group boundaries were invisible.** With equal gaps, „ki vagy", „melyik
  hét" and the actions read as one undifferentiated ribbon — the original sin,
  reproduced. The section `<hr>` no longer hides in rail mode; it rotates into a
  vertical rule, so the three groups are visibly separate.
- **The account disappeared on desktop.** It had been nested inside the popover,
  so rail mode dropped it entirely. The sheet body is now composed once and
  handed to whichever container is active.
- **`sheetItem()` never emitted a `sheet-item` class** — the helper returned only
  Tailwind utilities, so every rail rule targeting it was dead, and the rows
  stayed full-width stacked, blowing the bar out to 2918px on a 1440 viewport.

Measured after: **1440 → 0px overflow, 84px chrome; 1280 → 0px overflow, 84px;
375 → 0px overflow, 44px, no rail, sheet intact.**

### Phase 2 — `/orarend` reading layer: NOT STARTED

Day headers, `NowRail`, lesson-card density and content, and the merge
affordance (the gate-board raise: a moved or merged lesson shifts in place and
holds its alert until acknowledged; `/ma`'s sentence-shaped prompt replaces the
badge). The ≤140px total-chrome target lands here.

### Phase 2a — telefonos lapozás: DONE 2026-09-06

Three measured defects in the day-to-day swipe, all in `calendar.tsx`:

1. **A rács fölötti sáv naponta más magas volt.** The `effCols === 1`
   circumstance row (Nincs tanítás / Csengetés / a tanév rendje) sized itself to
   its content, so the sticky block measured **105 / 130 / 130 / 146 / 162px**
   across one week's five days — the grid jumped up to **57px vertically under
   the thumb on every horizontal swipe.** That was the reported "cheap feel".
   Replaced by `DayCircumstance`: one 24px line, always present, tone and text
   change but never the height — the `ChangeRow` idiom from
   `components/ma/day-status.tsx`, cited there for the same reason. What does
   not fit opens in the `DayNotesButton` popover, uncut. Measured after:
   **sticky 129px on all five days, frame top 175px, zero vertical movement.**

2. **The fit measurement never re-ran when something appeared ABOVE the grid.**
   The `ResizeObserver` watched only the frame, whose *size* does not change
   when a row is inserted over it. So the offline `StaleNote` (30px), the empty
   week's pill and the now-rail's tone changes pushed the frame down while the
   scale stayed on the old `docTop`: the page became scrollable by exactly the
   height of the new row. Now the observer also watches the calendar root; the
   measurement is idempotent, so it settles in one extra pass. Measured: a 30px
   band inserted above the grid takes the grid **637 → 607px** and the document
   stays **812px on an 812px viewport — not scrollable.**

3. **The snap-pause hung on `vScroll`, which is the wrong question.** `vScroll`
   reports only that the *grid* overflows the scale floor; the vertical scroll
   that fights `snap-mandatory` can equally come from a row above it. With the
   offline note up, `vScroll` was false, the pause never installed, and every
   slightly-diagonal drag was yanked to the neighbouring day — the reported
   "with the offline indicator on, moving between days is impossible". The
   guard is now installed wherever paging exists at all; where the page cannot
   scroll it never fires. Verified in landscape (812×375): `scroll-snap-type`
   goes to `none` during a page scroll and returns after it settles.

Snap stays `mandatory` + `snap-always`. It was never the fault; the geometry
under it was. Programmatic check: `scrollLeft = 170` lands on **327**, exactly
one day step, with the chrome unmoved.

### Open, raised during phase 1

**The pill is now „Ma", but the rest of the site still says „Progresszív mód"**
(`home-redirect.tsx`, `home/_components/cta.tsx`, `home/_components/film.tsx`,
`valtozasok/page.tsx`). „Ma" matches `.impeccable/surfaces/src-app-ma.md`, which
names the route „Ma" for nav, homescreen and title, and it buys header width —
but the marketing copy was NOT rewritten, because that is factual product copy
and the user's call. Decide: rename the copy, or rename the pill back.

### FINISH — still owed

Undischarged: the finish review, the verdict, and DESIGN.md. Phase 1 alone does
not discharge it; the run ends after phase 2.
