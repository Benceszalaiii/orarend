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
2. ~~A persistent route switch in the header of each route.~~ **SUPERSEDED
   2026-09-04** by the confirmed „Standing Line" chrome — see
   `.impeccable/surfaces/src-app-orarend.md`. The three-pill switch overflowed
   this route by 70px at 375px (measured: 445px document on a 375px viewport)
   and could not carry a fourth cell. The switch is now two view pills in a
   shared one-line bar; identity (Diák/Tanár) moved into that bar's sheet.
3. The icon set is authored from the accent-hue system; no logo asset exists.

## Undecided

Whether `/dualis` survives. It is a near-copy of `/orarend` with one badge; if
„Ma" states dual status prominently, its remaining reason is seeing the cycle
across weeks. Left untouched pending the user's call.

---

# A TANÁRI „MA" — shape, megerősítve 2026-09-04

Ez a `/orarend` briefben nyitva hagyott **negyedik cella**. Nem új felület: a
`/ma` ugyanaz a lap, más alannyal — a mátrix (Diák/Tanár × Hét/Ma) itt zárul be.

## Munka és közönség

Tanár, telefonnal, folyosón, két óra közt. Mód: **Operate**. A kérdése NEM a
diáké. A diák azt kérdezi, mi a következő órám; a tanár a tantárgyát tudja, és
azt kérdezi: **melyik osztály, melyik terem**. Ez az a két adat, ami
negyvenöt percenként változik, és amit a fej nem tart meg.

Második olvasat, ugyanez a lap: tanár az asztalánál, tervezés közben — „mikor
vagyok tényleg szabad ezen a héten".

## Terméki igazság, ami ezt a lapot hordozza

- A `teacherLessons()` (`src/lib/timetable.ts:938`) MÁR összevonja egy tanár
  párhuzamos csoportkártyáit egy órává, és SZÁNDÉKOSAN nem vonja össze a két
  KÜLÖNBÖZŐ osztályt ugyanabban a percben — az órarendi hiba vagy helyettesítés,
  és a függvény saját megjegyzése mondja ki, hogy azt nem szabad eltüntetni. A
  tanári „Ma" az első felület, ami ezzel kezdeni tud valamit.
- Ugyanez a függvény mondja ki a hero szabályát is: a tanár kártyáján az
  OSZTÁLY a hír, a tanár magától értetődik.
- A **csoportbontás a diák mechanizmusa**. A tanárnak nem választás. Ezért a
  `useMergePreferences`, a „minden csoport" kapcsoló, a `hiddenCount` és a
  „Kiválasztom" mondat NINCS a lapon — nem letiltva: nincs.
- A **duális beosztás a diák saját, osztályonkénti helyi beállítása**
  (`dual-schedule.ts`). Egy tanár készülékén EGYETLEN osztályra sincs meg a
  sok közül, amit tanít. A duális tehát kimarad: nincs panel, nincs hero,
  nincs jelölés.
- **Értesítés nincs.** A feliratkozás szerveroldalon osztályra kulcsolt
  (`push-store.ts`) — megerősítve a `/orarend` briefben.

## Irány

Ugyanaz a világ, nem új: sötét alap, `--card` panelek, `--brand` piros csak élő
és cselekvő szerepben, a tizenkét akcenthue pöttyként és szövegként,
`tabular-nums` az időnek. Ugyanaz a nyelvtan, mint a `/ma`-n: hero a
címer-fénymező fölött, `max-w-5xl`, `lg:grid-cols-[minmax(0,1fr)_19rem]`,
napköteg mint fogantyú, napsáv fölötte, összecsukódó „most" sor.

**A hero tézise: az osztály a főcím.** Ahol a diák heróján a tantárgy a
legnagyobb elem, ott a tanárén **`13C · 214`** áll a legnagyobb méretben, a
tantárgy alatta. Ugyanaz a blokk, ugyanazok a méretek, egy felcserélt
hierarchia. Ez az EGYETLEN hely, ahol a két hero különbözik.

**A lyukasóra előlép.** A `day.ts` már ad `gap` szakaszt 25 perctől. A tanár
napján valódi lyukak vannak, a diákén ritkán. Az ÉPPEN futó lyuk „Lyukasóra",
nem „Szünet" — ugyanaz a `NowState` fázis, helyes főnévvel, ugyanazzal a
visszaszámlálással a következő óráig.

**Az ütközés figyelmeztetés, nem kérdés.** Két különböző osztály egy percben:
sávokban, ahogy most, de `--brand`-del és a `/orarend` briefben elfogadott
mondat alakú riasztással („Két órád ütközik 9:55-kor — 12A és 13C"). SOHA nem a
diák „melyik a tiéd?" kérdése, mert mindkettő az.

## Útvonal és alany — a felhasználó döntése, következményeivel

**EGY `/ma` útvonal; hogy kinek a napját mutatja, tárolt ALANY dönti el.** Ez
lezárja a `/orarend` brief „Undecided — routing for the fourth cell" pontját.

- Új, megőrzött alany (`class` | `teacher`) a `prefs-shared.ts`-ben, a `class`,
  `teacher`, `lastView` mellett — így a többivel együtt szinkronizál.
- **Ami az alanyt útvonalba kódolja, az ÍRJA; a `/ma` OLVASSA.** `/orarend`-re
  érkezés `class`-t ír, `/tanari` `teacher`-t, a `/ma` nem ír semmit.
- A **Hét** pirula href-je az alanyból oldódik fel: tanárnak `/tanari`, egyébként
  `/orarend`. A `VIEW_OF` továbbra is a Hét pirulát világítja a `/tanari`-n.
- Az `IdentitySwitch` a `/ma` lapjában HELYBEN vált, nem navigál — ehhez kap egy
  változatot; az `/orarend`-en és a `/tanari`-n marad a navigálás.
- A `last-view.ts` és a `VIEW_ROUTES` változatlan. A PWA `start_url` marad a
  `/ma`, és mostantól ténylegesen mindkét alanyt kiszolgálja — ez a döntés
  legerősebb érve.
- **Vállalt ár:** a tanári „Ma"-nak nincs megosztható URL-je és nincs indexelhető
  lapja; a `/ma` metadata marad, ahogy van. Ha egy tanár elküldi a linkjét egy
  kollégának, a kolléga a SAJÁT alanyának napját látja.
- SSR-költség nincs: a `/ma` amúgy is töltésjelzőt rajzol, amíg a `today` és a
  nézet kliensoldalon feloldódik.

## Szerkezet — a kiemelés

A `ma-client.tsx` 1220 sor, és nagyjából 900 belőle alanyfüggetlen: lekérés,
gyorsítótár, láthatóság-újratöltés, köteg- és sávindex, a hero őrszeme a
holtsávjával, az üres hét lapja, a hibapanel, a lábléc. A felhasználó kikötése:
a diák komponensét NEM toldjuk tovább.

- `src/components/ma/use-day-view.ts` — az adat- és állapothorog. Bemenete
  `{ kind, subjectShort, prefs, dualSchedule }`; kimenete a lapok, az index, a
  `state`, a `rests`, a `weekendSpan`, a `heroGone`, a hiba/függő/gyorsítótár és
  a betöltők. A diák valódi `prefs`-et és duális beosztást ad; a tanár `[]`-t és
  `null`-t.
- `src/components/ma/day-view.tsx` — a burok: fénymező, álló sor, napsáv, „most"
  sor, köteg, sáv-hely, lábléc. A lapot és a jobb hasábot slotként kapja.
- `src/app/ma/ma-client.tsx` — az alanyt oldja fel, ~40 sor.
- `src/app/ma/student-day.tsx` — osztályválasztó, összevonás, duális, diák-sáv.
- `src/app/ma/teacher-day.tsx` — tanárválasztó, tanár-sáv.
- `src/components/ma/teacher-week.ts` — az „Osztályaim" és a „Lyukasórák"
  levezetése a `WeekModel.days`-ből és a nézetből. A `week.ts` NEM kap `mode`-ot.
- `src/components/ma/teacher-panels.tsx` — a két új panel.
- Egysoros változás a `day.ts:agendaItem`-ben: a `classShort` bekerül a
  `meta`-ba. Diákórán üres, tehát ott semmit nem változtat.

**A `/ma`-nak képpontra azonosnak kell kijönnie.** Ez a diáklap ÁTRENDEZÉSE, nem
áttervezése. Ellenőrzés: előtte/utána felvétel 375×812-n és 1280-on.

## A sáv — mind a négy, ebben a sorrendben

1. **A hét** — a `WeekPulse` változatlanul, a duális jelölés nélkül. Öt napsor,
   órák, mai pötty; továbbra is ez a napváltás egyik útja.
2. **Osztályaim** — mely osztályok a héten, és melyik hány óra: a tanár válasza
   a diák „Tantárgyak" paneljére. Az osztály rövid jele az akcentpötty, a teljes
   név ott, ahol megkülönböztet. Ágsorok nincsenek: nincs miből választani.
3. **Lyukasórák** — a hét lyukasórái a meglévő `gap` szakaszokból, naponként
   csoportosítva, összesítéssel. „Nincs lyukasórád ezen a héten" — nem tűnik el.
4. **Áthelyezve a héten** — a `MovedThisWeek` változatlanul. Majdnem mindig
   néma, ezért a `/ma` brief szabálya áll rá: olvasásra érdemes SOR marad akkor
   is, amikor nem történt semmi.

## Állapotok

**A „nincs kiválasztott tanár" az ÉRKEZÉSI állapot** mindenkinek, aki nincs
belépve — és az `initialSubject()` szándékosan nem ad alapértelmezést („egy
tetszőleges kolléga órarendjét felütni köszönés helyett rosszabb, mint egy üres
választó"). A tanári „Ma" ezt örökli: nevesített választó, nem üres rács. Belépve
és a tanárlistával egyezve → a saját napja; belépve, de egyezés nélkül → a
választó, kimondott okkal.

Aztán: óra megy · szünet · **futó lyukasóra** · első óra előtt · mára vége ·
**óra nélküli tanítási nap** (a tanárnál normális, nem rendellenesség) · hétvége ·
szünet a `school-calendar.ts` szerint · **ütközés** · ma mozdult valami · nem
mozdult semmi · offline/állott, időbélyeggel · minden `TimetableErrorKind` a
meglévő nevesített üzenetével.

Tartományok: napi 0–8 óra, napi ~6 különböző osztályig; tanárnév 25 karakterig
(`Baranyainé Beck Gabriella`) — az álló sor csonkolása erre már készen áll.

## Határok

**Érintetlen:** `/orarend`, `/tanari`, a heti rács és a nyomtatási stíluslapja,
`timetable-merge.ts`, `now.ts`, `dual-schedule.ts`, a `week.ts` diák-levezetései,
a vizuális világ, az álló sor mértana.

**Anti-célok:** negyedik pirula (az alany nem nézet); második heti rács;
értesítés a tanári „Ma"-n; duális bárhol rajta; bármilyen KÖVETKEZTETETT
helyettesítés — a `movedCard` marad az egyetlen változásjelzés; világos mód;
nyomtatási stíluslap erre az útvonalra; új, szerveren tartott adat.

**Célszámok:** a fejléc marad 44 px, nulla vízszintes túlcsordulás 375 px-en, és
a negyedik cella nulla fejlécszélességbe kerül — most már szó szerint, mert
egyáltalán nem tesz hozzá pirulát.

## Nyitva, szándékosan ki nem találva

A `/orarend` brief álló kérdése: **a lap többi helyén még „Progresszív mód" áll**,
ahol a pirula már „Ma" (`home-redirect.tsx`, `home/_components/cta.tsx`,
`film.tsx`, `valtozasok/page.tsx`). Ez terméki tényszöveg, a felhasználó döntése
— és mostantól két alanyra vonatkozik, nem egyre.

## Build log — tanári „Ma", 2026-09-04

### Megépült, és a dev szerveren mérve

**A kiemelés.** A `ma-client.tsx` 1220 sorból **31 sor** lett: már csak az
alanyt oldja fel és a két lap közül választ. A gépezet a
`components/ma/use-day-view.ts`-be (lekérés, gyorsítótár,
láthatóság-újratöltés, napköteg, „most", pihenőnapok, hétvége-szakasz, a hero
őrszeme a holtsávjával), a szerkezet a `components/ma/day-view.tsx`-be került
(fénymező, álló sor, napsáv, „most" sor, köteg, sáv-hely, lábléc). Új, közös
darabok: `ma/error-panel.tsx`, `ma/subject-picker.tsx`. A diák lapja
`app/ma/student-day.tsx`, a tanáré `app/ma/teacher-day.tsx`.

**A `/ma` változatlan.** Előtte/utána felvétel 375×812-n: a diák lapja
képpontra ugyanaz. Egyetlen szándékos viselkedésbeli különbség sincs; ami
átkerült, az szó szerint került át.

**Amit az alanyfüggetlenség NEM tud elrejteni — és ezért nevesített mező lett.**
Az `AgendaItem.meta` lapos tömb volt, amiből három hívó POZÍCIÓ szerint olvasott
(`meta[0]` = terem, `meta[1]` = tanár). A tanári lekérésnél viszont a tanár
mezői üresek, tehát a tömb egy elemmel rövidebb: a `NowBlock` némán az
OSZTÁLYT írta volna ki „tanár" (`GraduationCap`) ikonnal. Az `AgendaItem` ezért
kapott `room` és `who: { kind, label }` mezőt; a `meta` maradt a futó szövegnek
(képernyőolvasó-mondat, a heti rács sorának vége). Ez a hiba így nem tud
létrejönni.

**A tanári olvasat, ami az adatból következik, nem `mode`-ból.** Az
`agendaItem()` és a `LessonCard` a `who`-t abból dönti el, hogy a tanár mezői
üresek-e — a `classLesson` / `teacherLessons` ezt már eldöntötte a
`lib/timetable.ts`-ben. Egyetlen kapcsoló sincs, ami kicsúszhatna a
szinkronból azzal, amit a lap hisz magáról.

### Mérve 375×812-n és 1280-on (BBG = Baranyainé Beck Gabriella)

| | mért |
| --- | --- |
| `/ma` dokumentumszélesség, tanári | **375 px** (0 túlcsordulás) |
| Álló sor magassága | **44 px** |
| Teljes ragadó fejléc (sor + napsáv) | **83 px** telefonon, 123 px 1280-on |
| Konzolhiba `/ma`, `/orarend`, `/tanari` | **0** |
| `tsc --noEmit` / `detect.mjs` | tiszta / `[]` |

Valós adaton: 6 osztály (11D 6ó … 10E 45p), 4 lyukasóra a héten (5ó 30p),
péntek „3 óra · 2 lyukasóra · 14:20-ig".

### Az inspekciós kör négy hibája, mind javítva

1. **Az osztály elárvult a magas kártyán.** A `roomy && counterpart` ág a
   szemközti felet a kártya ALJÁRA küldte, ha a blokkot szünet szeli át — ez a
   TANÁR NEVÉNEK jó szabály volt (ne essen a szaggatott sávra). Egy háromórás
   blokk 150 képpontján viszont az osztály a címtől 130 képpontra került, és a
   szem nem kötötte össze a kettőt. Az osztály mostantól a cím alatt marad; a
   tanár neve továbbra is lemegy.
2. **A lábléc a semmiben lógott a tanárválasztó lapján.** Két bekezdés és egy
   legördülő után a lábléc a lap harmadánál ért véget, alatta fél képernyőnyi
   fekete. A `main` oszlop lett, a tartalom `grow` — a lábléc az ablak aljára
   került, hosszú lapon változatlanul a görgetés végén marad.
3. **Kétféle mérték egy oszlopban.** Az „Osztályaim" sor a teljes NEVET mutatta,
   ha eltért a jeltől, egyébként az óraszámot — a forrás viszont az
   osztályoknál rendszerint ugyanazt küldi mindkét mezőben, tehát a sorok
   többsége számot mutatott, egy-kettő meg egy nevet. Most minden sor
   ugyanazt: `N óra · M nap`.
4. **Fölösleges mondat a fejléc alatt.** „A teljes heti rácsot a Hét nézet
   adja" — a „Hét" cella két centivel feljebb, névvel kiírva ott áll a
   mátrixban. Törölve.

### Ami a shape-briefhez képest MÁSKÉNT valósult meg

**Az alany a fejlécbe került, nem a lapba.** A megerősített brief a lapban
tartotta az alanyt, és a „Hét" pirula href-jét oldotta volna fel belőle. Ehelyett
a `chrome/standing-line.tsx` négycellás `ViewMatrix`-ot kapott (Diák/Tanár │
Hét/Ma) — lásd `.impeccable/surfaces/src-app-orarend.md` 2026-09-04-i
kiegészítését a méréseivel. A `lib/identity.ts` szabálya változatlan: **ami az
alanyt útvonalba kódolja, az írja; a `/ma` olvassa.**

**A hero „legnagyobb eleme" nem cserélt.** A brief úgy fogalmazott, hogy a
tanári hero „13C · 214"-et tesz a legnagyobb méretbe. A dobozban azonban az IDŐ
a legnagyobb elem, és az a világ szabálya (`now-block.tsx`: „AZ IDŐ A LEGNAGYOBB
ELEM"). Ami cserélt, az az AZONOSÍTÓ sor: az osztály és a terem került a
tantárgy helyére, a tantárgy pedig alá — a pöttyével együtt, mert a tizenkét hue
a tantárgyat azonosítja, nem az osztályt.

### Nem ellenőrizve

- **Ütközés élő adaton.** A `clashesOf` és a piros figyelmeztetés megírva és
  típusra ellenőrizve, de a mintahéten egyetlen tanárnak sincs két osztálya
  ugyanabban a percben — hamis adatot pedig nem tettem a lapra egy képernyőképért.
- **Éles fordítás.** A `next build` nem futott: a felhasználó `next dev`-je
  tartja a `.next`-et. A dev szerveren mind a négy cella hibátlanul renderel.

---

## A hétvége kártyája — delight, 2026-09-06

A `RestHero` hétvége-ága műszer volt ÁLLANDÓ FELIRATTAL: a szám
másodpercenként mozdult, a sáv töltődött, alattuk viszont szombat reggel és
vasárnap este ugyanaz a négy szó állt („Nincs óra, nincs csengő"), és a
visszaszámlálás egy NÉVTELEN falig tartott. Három mozdulat, mind a meglévő két
végpontból — új adat, új kérés, új dísz nélkül.

1. **A műszer a hétvége egységében beszél.** A `countdownLabel` a következő
   csengőig számol, ott a perc a tét; egy ötvenhat órás hétvégére ráengedve
   „39 ó 55 p"-et írt, amit senki nem mond ki. Az új `longCountdownLabel`
   (`timetable/now.ts`) napokban kezd és a csengő közeledtével ÉLESEDIK:
   „1 nap 22 óra" → „16 óra 47 perc". A kártya ettől nyugodt szombaton és
   sürgető vasárnap este — dísz nélkül.
2. **A mondat követi az ívet.** `weekendVoice()` (`lib/rest-day.ts`) a hátralévő
   ÉJFELEKBŐL dolgozik (`nightsUntil`), mert a hétvégét alvásokban élik, és
   ebből a teljes napok száma is következik (`éjszaka − 1`). Három elérhető
   állapot — szombat, vasárnap, az utolsó este —, mind csak azt állítja, amit a
   szakasz bizonyít; napnév nincs benne. Negyedik fokozatot szándékosan NEM
   kapott: a szombati mondat huszonnégy órán át igaz, és a finom mozgást a szám
   viszi. A `describeRestDay` óra nélküli marad, a hangnem a heróban dől el.
3. **A túlsó végnek neve van.** A vonalzó jobb széle eddig egy IDŐPONT volt
   („H 08:00"). Alatta most a hétfői első óra áll a diák saját,
   csoportbontás-feloldott órarendjéből — `RestNext.lesson`, a `use-day-view`
   `sameSlot()` őrével: eldöntetlen bontásnál `null`, mert ott két óra állítaná
   ugyanazt a percet, és egyiket kimondani találgatás lenne.

**Ami nem változott, és miért.** A hétvége továbbra sem kap évszak-jelenetet: a
`seasonal-sky.tsx` érve áll (évi negyven alkalom → a második hétvégére dísz, a
harmadikra zaj). A sáv kitöltése továbbra is az ELTELT hányad, a `DualHero`
szótárával.

### Az inspekciós kör három javítása

1. **A terem elárvult.** Külön `flex` testvérként a „102" a tantárgynév után egy
   saját sorba esett, a bal margóhoz tapadva, mintha másik adat lenne. A terem
   most a névvel EGY szövegfolyamban ül.
2. **A pötty osztályt festett.** A tanári lapon ebben a sorban az OSZTÁLY a hír
   („10E · 208"), a tizenkét hue viszont a TANTÁRGYAT azonosítja — a pötty ott
   elmarad, ahogy a `now-block.tsx` szabálya kimondja.
3. **A holtsáv-helykitöltő elavult.** 192 → `h-[282px] sm:h-[255px]`, újramérve.

### Mérve

`/ma` 375-ön: dokumentumszélesség **375 px** (0 túlcsordulás), kártya **282 px**;
1280-on **255 px**. Konzolhiba **0**. `tsc --noEmit` tiszta, `biome check` a négy
érintett fájlon tiszta, `detect.mjs` → `[]`. Az ív egy szimulált teljes hétvégén
végigfuttatva (kétóránként), az óraátállítás hétvégéjével együtt: az 57 órás
szakasz szombaton is 2, vasárnap 1 éjszakát ad.
