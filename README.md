# Órarend

A Jedlik heti órarendje teljes képernyőn, bejelentkezés nélkül.

A nyilvános órarend API-t olvassa, feloldja az osztály csoportbontásait arra a csoportra, ahová a
diák tényleg jár, és a hetet teljes képernyős rácsként mutatja — ami egy A4-es
fekvő lapra is kinyomtatható.

## Mit tud

- **Heti rács.** A suli listájából bármelyik osztály, regisztráció nélkül. Az
  utoljára választott osztály megmarad az eszközön.
- **Csoportbontás összevonása.** Az API az osztály minden párhuzamos csoportjának
  kártyáját visszaadja, ezért a bontott órák a rácsban egymásra csúsznak. Az
  ütköző kártyák azonosság szerint csoportokba kerülnek, a diák kiválasztja a
  sajátját, és a választás osztályonként megmarad — onnantól a rács az *ő*
  órarendje, nem az osztályé.
- **Most sáv.** Aktuális óra, szünet vagy *Mára vége*, visszaszámlálóval a
  következő váltásig.
- **Nyomtatás.** `@page { size: A4 landscape }`, saját világos palettával, ami
  megtartja a tantárgyak színeit: a szín itt információ, nem dekoráció.
- **Megnevezett hibák.** Az órarend adatai nem a mieink, ezért minden hibafajtának
  — offline, hálózat, időtúllépés, szerver, kérés, hibás válasz, ismeretlen
  osztály — saját üzenete van, ami megmondja, kinél van a baj, és van-e értelme
  várni.

## Mire épül

- [Next.js 16](https://nextjs.org) (App Router) + React 19
- Tailwind CSS 4, Radix UI primitívek, `motion`, `sonner`
- TypeScript, [Biome](https://biomejs.dev) linthez és formázáshoz
- [Bun](https://bun.sh) csomagkezelőnek
- Nincs belépés és felhasználói fiók — az órarend kliensoldalon áll össze, Vercelen
- Egyetlen szerveroldali végpont: az osztályszintű használati számláló (Upstash Redis)

## Indítás

```bash
bun install
```

```bash
bun dev
```

Nyisd meg: [http://localhost:3000](http://localhost:3000). A `/` átirányít az
`/orarend` útvonalra.

### Parancsok

| Parancs | Mit csinál |
| --- | --- |
| `bun dev` | Fejlesztői szerver |
| `bun run build` | Éles build |
| `bun start` | Az éles build kiszolgálása |
| `bun run lint` | `biome check` |
| `bun run format` | `biome format --write` |

## Honnan jönnek az adatok

Az órarendnek nincs saját szervere. A `next.config.ts` az `/api/jedlik/:path*`
kéréseket átírja a `https://jedlikinfo.jedlik.eu/api/api/:path*` címre, és a
kliens ezt a proxyt hívja:

| Végpont | Mire kell |
| --- | --- |
| `GET timetable/classes` | Az osztálylista |
| `POST timetable/cards` | Egy hét óráinak kártyái |

A `timetable/substitutions` 404-et ad — az API-ban nincs helyettesítés-feed,
ezért az app sem mutat ilyet.

Minden állapot a `localStorage`-ban van:

| Kulcs | Mit tárol |
| --- | --- |
| `orarend:class:v1` | Az utoljára választott osztály |
| `orarend:merge-prefs:v1` | A csoportbontás-választások, osztályonként |
| `orarend:usage:v1` | Mely osztályokat jelezte ma ez az eszköz (helyi, sosem küldjük el) |

## Használati statisztika

Egyetlen kérdésre válaszol: **melyik osztály órarendjét nézik a legtöbben.**

A kliens osztályonként naponta egyszer küld egy jelzést a `/api/hasznalat`
végpontra, amiben egyetlen adat van — az osztály neve. Eszközazonosító, IP,
pontos időpont nem megy vele, és a szerver sem tárol ilyet: a tárolóban napi
bontású, osztályonkénti darabszám áll. A napi deduplikáció jelölője a
`localStorage`-ban marad, elküldve soha nincs.

A számokat a **`/statisztika`** oldal mutatja meg: jelszóval védett, `noindex`,
osztályonkénti rangsor sávokkal, napi görbe és 7 / 30 / 90 / 365 napos időszak.
A jelszó ugyanaz a `STATS_KEY`. A belépés után egy aláírt (HMAC-SHA256), `httpOnly`
süti tartja a munkamenetet egy hétig — a jelszó magába a sütibe SOSEM kerül bele.

Gépi kiolvasásra ugyanez elérhető végponton is:

| Végpont | Mire kell |
| --- | --- |
| `POST /api/hasznalat` | Egy osztály jelzése (`{"class":"13C"}`) → `204` |
| `GET /api/hasznalat?days=30` | Az összesítés kiolvasása — `x-stats-key` fejléc kell hozzá |

A kiolvasás kulcs nélkül `404`-et ad, tehát a végpont létezése sem derül ki.

| Env-változó | Mire kell |
| --- | --- |
| `REDIS_KV_REST_API_URL`, `REDIS_KV_REST_API_TOKEN` | A számláló tárolója (Vercel marketplace → Upstash Redis) |
| `STATS_KEY` | A `/statisztika` jelszava és a `GET` kulcsa. Beállítatlanul egyik sem működik |

A `STATS_KEY` legyen hosszú és véletlenszerű (`openssl rand -hex 24`): egyetlen
titok véd mindent, és rossz jelszóra csak egy fix késleltetés jár, nem kizárás.

Redis nélkül az app változatlanul működik, csak nem számol — egy elfelejtett
env-változó nem viheti el az órarendet.

## Felépítés

```
src/
  app/
    orarend/       heti rács (alapértelmezett útvonal)
    dualis/        ugyanaz a rács duális napjelöléssel (noindex)
    adatvedelem/   adatvédelmi tájékoztató
    statisztika/   jelszóval védett használati kimutatás (noindex)
    api/hasznalat/ osztályszintű használati számláló (az egyetlen saját végpont)
  components/
    timetable/     rács, óra-blokkok, most sáv, összevonás-vezérlők
    ui/            Radix-alapú primitívek
  lib/
    timetable.ts        API-kliens, típusok, hibafajták
    timetable-merge.ts  ütközések klaszterezése, csoportbontás feloldása
    dualis.ts           A/B hét-jelölés → munkahelyi vagy iskolai nap
    accent.ts           tantárgy neve → a 12 kiemelőszín egyike
    usage.ts            a kliens jelzése + napi deduplikáció
    usage-day.ts        a közös, budapesti naphatár (kliens és szerver)
    usage-store.ts      a Redis-számláló (csak szerveren)
    stats-auth.ts       a statisztika-oldal beléptetése (csak szerveren)
```

## Ha hozzányúlsz

- Az `AGENTS.md`-t a `next dev` írja; ez a Next.js-verzió konvencióit írja le —
  olvasd el, mielőtt app-kódot írsz.
- A `src/` kommentjei magyarul vannak: `//!` a nem sérthető megkötésekhez, `//*`
  a magyarázathoz. Tartsd ezt a stílust.
- Csak sötét téma. A világos paletta kizárólag a nyomtatásé.
- A `prefers-reduced-motion` mindenhol érvényesül; az érintős méretezés
  `(pointer: coarse)`-hoz kötött, nem a viewport szélességéhez.

## Jogi megjegyzés

Nem hivatalos alkalmazás. Nem áll kapcsolatban a sulival vagy a Jedlikinfóval, és
nem is ők üzemeltetik. Az órarend adatai a forrásukhoz tartoznak; ez az app csak
megjeleníti őket.

## Licenc

A projekt licence [MIT, névfeltüntetési kikötéssel](LICENSE): szabadon
használható, módosítható és terjeszthető, amíg a terjesztett változat láthatóan
feltünteti **Szalai Bencét** eredeti szerzőként.
