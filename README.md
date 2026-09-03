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
- **Értesítések.** 10 perccel az óra kezdése előtt, és ha megváltozik az órarend.
  Osztályonként kapcsolható, és a böngésző engedélyét CSAK a harang ikon utáni
  saját párbeszédből kérjük — soha oldalbetöltéskor.
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
- Két szerveroldali funkció: az osztályszintű használati számláló és a
  push-értesítések (Upstash Redis + VAPID)

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

## Értesítések (web push)

Két dologról szól, semmi másról: **10 perccel az óra kezdése előtt**, és ha
**megváltozik az órarend** (elmarad egy óra, teremcsere, tanárcsere,
áthelyezés).

**Az engedélyt csak kattintás után kérjük.** A böngésző kérdését egyszer lehet
feltenni, és a reflexből elutasított engedélyt JS-ből soha többé nem lehet
újrakérni — egy oldalbetöltéskor felugró kérdés tehát nem „korai", hanem
végleges. Ezért a sorrend kötött: harang ikon → **saját** párbeszéd (mit
ajánlunk, melyik osztályra) → és csak az igenlő gombból a böngésző kérdése.
A feliratkozás **osztályonkénti**, legfeljebb ötre; alapértelmezésben a nézett
osztály van kijelölve.

iOS-en a web push csak a **kezdőképernyőre kitett** appnál működik — a
párbeszéd ilyenkor nem hibát mutat, hanem a két telepítési lépést.

### Hogyan áll össze

| Rész | Mit csinál |
| --- | --- |
| `components/pwa/notification-menu.tsx` | A harang és a párbeszéd — az engedélykérés egyetlen kiindulópontja |
| `lib/push.ts` | Feliratkozás, módosítás, leiratkozás, képességfelismerés (kliens) |
| `lib/push-plan.ts` | Tiszta számítás: kinek, mikor, miről — hálózat és tároló nélkül |
| `lib/push-store.ts` | Feliratkozások, foglalások, heti lenyomatok (Redis, csak szerver) |
| `lib/push-send.ts` | VAPID-aláírás és kiküldés; a lejárt végpontok takarítása |
| `api/ertesites/` | Feliratkozás (`POST`) és leiratkozás (`DELETE`) |
| `api/ertesites/tick/` | Az ütemezett feladat — az egyetlen hely, ahonnan értesítés kimegy |
| `public/sw.js` | A `push`, `notificationclick` és `pushsubscriptionchange` kezelése |

A háttérfeladatot percenként érdemes futtatni, de a Jedlikinfót **10
percenként** kérdezi meg osztályonként: az emlékeztető perc-pontos, a
változásfigyelés viszont nem éri meg, hogy a suli szerverét terheljük vele. A
kétszeres kiküldést nem az ütemezés pontossága zárja ki, hanem egy Redisben
**lefoglalt** kulcs (`SET NX`) — ugyanaz a minta, mint a jedlik-szakkor
levélküldésénél.

> **Az ütemezés kívülről jön.** A repóban nincs `vercel.json`: a Vercel
> Hobby-terve naponta csak egyszer futtat cront, ami az óra előtti
> emlékeztetőhöz kevés. A végpont bármelyik ütemezőnek megfelel — a hívás
> `GET` vagy `POST` a `/api/ertesites/tick`-re, `Authorization: Bearer
> $CRON_SECRET` fejléccel.

### Ütemezés Upstash QStash-sel

A QStash **Vercel-integráción keresztül napi 500 üzenet** a keret. Percenként
futva ez már a tanítási sávban is kevés lenne — de percenként futni sosem volt
szükséges: a `LEAD_WINDOW_MINUTES` (6 perc) miatt egy emlékeztető nem egy
pillanatban, hanem egy **hat perc széles ablakban** esedékes. Egy **5
percenkénti** tick ezért minden ablakba beleesik; nem szerencse kérdése, hanem
a `push-shared.ts`-ben leírt tűrés.

| Sáv | Mire jó | Hívás/nap |
| --- | --- | --- |
| `*/5 6-17` | a tanítási nap: emlékeztető + változásfigyelés | 144 |
| `*/5 19-21` | esti sáv: a másnapi változások még aznap kimennek | 36 |
| | **összesen** | **180** |

Ez az 500-as keret **harmada** — marad hely kézi tesztre, egy harmadik sávra,
és arra is, ha a suli később hosszabb napot csenget.

> **A csengetési rend ezt megengedi.** A Jedlik minden kezdése 5-tel osztható
> perc (07:10, 08:00, 08:55, 09:50, 10:50, 11:45, 12:40, 13:35, 14:30 —
> ellenőrizve több évfolyamon), tehát `start - 10` is az: a tick PONT az
> emlékeztető percében fut, nulla csúszással, és a „10 perc múlva" szöveg
> szó szerint igaz. Ráadásul minden ablakba KÉT tick esik (pl. 07:50 és
> 07:55), így egy kiesett hívás sem némítja el a jelzést.
>
> Ha a suli valaha 5-ös rácson kívüli kezdésre vált, a jelzés akkor sem vész
> el, csak legfeljebb 4 percet csúszik; `*/3` (napi 300 hívás) 2 percre
> szorítja, és szintén belefér a keretbe.

```bash
curl -X POST \
  -H "Authorization: Bearer $QSTASH_TOKEN" \
  -H "Upstash-Cron: CRON_TZ=Europe/Budapest */5 6-17,19-21 * * 1-5" \
  -H "Upstash-Method: GET" \
  -H "Upstash-Forward-Authorization: Bearer $CRON_SECRET" \
  -H "Upstash-Retries: 0" \
  "https://qstash.upstash.io/v2/schedules/https://<a-domain>/api/ertesites/tick"
```

Amire figyelni kell:

- **`Upstash-Forward-` prefix.** A QStash a saját `Authorization` fejlécével
  azonosítja magát nálad; a tick titkát ezért `Upstash-Forward-Authorization`
  néven kell átadni, és a prefix nélkül érkezik meg a végponthoz.
- **`Upstash-Method: GET`.** A QStash alapból `POST`-tal hív. A végpont
  mindkettőt kiszolgálja, szóval ez nem törik el, ha lemarad.
- **`Upstash-Retries: 0`.** Az újrapróbálkozás itt fölösleges: egy perc múlva
  úgyis jön a következő tick, a foglalások miatt pedig egy sikeres kiküldést
  nem küld el újra senki. Minden retry viszont üzenet a napi keretből.
- Az óra-mező sávjai a záró órát is tartalmazzák: az utolsó délutáni tick
  17:55-kor, az utolsó esti 21:55-kor fut. A `CRON_TZ` miatt a nyári/téli
  időszámítás váltása sem csúsztatja el a sávokat.
- **A `*/5` nem szabadon hangolható.** Ha 6 percnél ritkábbra állítod, az
  emlékeztetők egy része NÉMÁN elmarad: a tick átlépi az ablakot. A kettő
  együtt mozog — a `LEAD_WINDOW_MINUTES`-t is emelni kell hozzá.

Percenkénti cront támogató platformon (vagy Vercel Prón) ugyanez egy
`vercel.json`-nal is megoldható:
`{ "crons": [{ "path": "/api/ertesites/tick", "schedule": "* * * * *" }] }`.

| Env-változó | Mire kell |
| --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | A feliratkozás nyilvános kulcsa (a kliensbe is bekerül — nem titok) |
| `VAPID_PRIVATE_KEY` | **A küldés joga.** Aki megszerzi, a te nevedben ír a diákok telefonjára |
| `VAPID_SUBJECT` | Elérhetőség a push-szolgáltatóknak (`mailto:` vagy `https://`) |
| `CRON_SECRET` | Az ütemezett feladat kulcsa. Nélküle a végpont `404` |

A `QSTASH_TOKEN` nem az app env-változója — csak az ütemezés
létrehozásához kell egyszer, az Upstash konzoljából.

Kulcspár generálása: `bunx web-push generate-vapid-keys`.

VAPID-kulcs vagy Redis nélkül az app változatlanul működik, csak a harang nem
kapcsol be semmit — egy elfelejtett env-változó itt sem viheti el az órarendet.

## Felépítés

```
src/
  app/
    orarend/       heti rács (alapértelmezett útvonal)
    dualis/        ugyanaz a rács duális napjelöléssel (noindex)
    adatvedelem/   adatvédelmi tájékoztató
    statisztika/   jelszóval védett használati kimutatás (noindex)
    api/hasznalat/ osztályszintű használati számláló
    api/ertesites/ push-feliratkozás + az ütemezett kiküldő (`tick`)
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
    known-class.ts      az elfogadható osztálynevek határa (a kulcstér védelme)
    push.ts             feliratkozás és képességfelismerés (kliens)
    push-shared.ts      a kliens, a szerver és a service worker közös szerződése
    push-plan.ts        mikor és miről szóljunk — tiszta számítás
    push-store.ts       feliratkozások, foglalások, heti lenyomatok (csak szerveren)
    push-send.ts        VAPID-aláírás és kiküldés (csak szerveren)
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
