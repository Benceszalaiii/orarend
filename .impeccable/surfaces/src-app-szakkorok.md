---
version: 1
slug: "src-app-szakkorok"
primary_target: "src/app/szakkorok"
related_targets: ["src/app/szakkorok/[slug]"]
---

Scope: `/szakkorok` (index) and `/szakkorok/[slug]` (club page). Visitor mode:
Operate. Inherits the `/ma` world (dark, crest light-field, `divide-y` list
groups, hues only as dots/text, red for live/action only).

## Audience and job

A student at the start of a year or semester, sitting down on purpose to pick a
club. Question: of the clubs I may attend, which fit my week, and can I trust
the time? Success: they leave with one or two clubs whose time they have seen
against their own timetable, joined or added to their calendar.

## Direction contract

THESIS: The page opens on how the clubs fall against YOUR week — a fit
breakdown, not a directory. Refuses the same-size three-column card grid.

OWN-WORLD: `/ma` grammar: black ground, crest field, `rounded-xl border
bg-card divide-y` row groups, `tabular-nums` times, hue dot per club. Fit
blue (`--primary`) = belefér; clash is muted, never red; unknown is dashed.
Time sources: solid mark = school timetable, dashed = teacher says so, hollow =
still being scheduled.

STORY: Student sees "12 of 31 fit your 11B week", checks the reason line
("ütközik: hétfő, Matematika"), opens a club, sees its time drawn against their
own day, joins.

FIRST VIEWPORT: Title + class line; a full-width proportional fit bar
(Belefér · Részben · Ütközik · Nem tudjuk, counts, each a filter); under it the
five-day "last lesson" strip; search + kind chips; the Belefér rows begin.
Primary action (új szakkör / javaslok) top-right.

FORM: Fit-sorted triage (grounded list #6, dealt lead), seed a0061824.
Signature interaction: tapping a bar segment filters and the bar is the legend.
Dual workplace days count as clash on their week letter.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Detail page

Focal block „Időpontok": one row per regular slot — day, time, room, source
mark, the student's verdict for that slot, this week's status, and a day ruler
(own lessons as a muted band, the club as a bar). Join + Naptárba directly
under it. `lg`: sticky right column; mobile: straight after the title.

## States

No class → class picker in the bar's place. Loading → placeholder bar, list
renders with reserved verdict line. Jedlikinfo failure → named message, list
stays. Zero-count segment disabled. Empty search → link to the idea board.
Teacher (no class) → no bar; own clubs + pending approvals first.

## Content ranges

~47 clubs (39 matched to school cards), 0–3 slots, names often generic
(„Tehetséggondozó szakkör"), 1–3 organizers, 0–30 members, 6 kinds.
