# Biztonság

## Támogatott verzió

Csak az élő változat (a `main` ág, ami a jedlik.info alatt fut) kap
javítást. Régebbi commitokra és forkokra nem adunk ki javítást.

## Sebezhetőség bejelentése

**Ne nyiss róla nyilvános issue-t.** Jelentsd privátban a GitHubon:
[Security → Report a vulnerability](https://github.com/Benceszalaiii/orarend/security/advisories/new).
Írd le, mit találtál, hogyan reprodukálható, és mit érint (diákok adatai,
belépés, értesítések). Igyekszünk néhány napon belül válaszolni, és a
javítás után — ha szeretnéd — megnevezünk.

Kérjük, a teszteléshez **ne használd más diák vagy tanár fiókját**, ne
olvass ki és ne módosíts mások adatait, és ne terheld a Jedlikinfo
szerverét. Ha egy hiba más adataihoz ad hozzáférést, állj meg az első
bizonyítéknál, és jelentsd.

## Mi tartozik ide

- Az app összes lapja és `/api/*` végpontja, a Server Actionök és a
  service worker (`public/sw.js`).
- Belépés és munkamenet (Better Auth, iskolai AD- és Google-belépés),
  jogosultságok (admin, tanár, szakkörvezető, tag).
- A tárolt adatok: fiókok, beállítás-szinkron, szakkörök, tagság,
  szakkör-hírfolyam, versenynevezések, push-feliratkozások, naptárcsatornák.

Nem tartozik ide: a Jedlikinfo saját hibái (azokat az iskolának kell
jelezni), a harmadik fél szolgáltatók (Vercel, Upstash, Neon, Google)
infrastruktúrája, és a szolgáltatásmegtagadás puszta terheléssel.

## Hogyan kezeljük a titkokat

- Minden titok környezeti változóban él, a repóba soha nem kerül; a lista és
  a magyarázat a `.env.example`-ben áll. Titok: `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_API_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `STATS_KEY`, a
  `REDIS_*` tokenek, a `DB_*` címek és a `GOOGLE_CLIENT_SECRET`.
- Kiszivárgott titkot **cserélünk**, nem figyelünk. A `BETTER_AUTH_SECRET`
  cseréje mindenkit kijelentkeztet — ez a szándékolt viselkedés.
- Az iskolai jelszó nem áll meg nálunk: a belépés továbbadja a Jedlikinfo
  bejelentkező végpontjának, és csak a válaszban kapott azonosságot tároljuk
  (`src/lib/jedlik-ad.ts`).
- Az ütemezett végpont (`/api/ertesites/tick`) kulcs nélkül 404-et ad, tehát
  a létezése sem derül ki.

## A felhasználói tartalom

A szakkör-hírfolyam (bejegyzések, hozzászólások), a szakkör-ötletek és a
szakkör-javaslatok diákok által írt szövegek. A szabályaik:

- **Minden írás a szerveren dől el.** A Server Action maga oldja fel, ki
  hívja (`resolveActor`), és maga kérdezi meg a jogot
  (`src/lib/club-access.ts`); a kliens csak azonosítót és szöveget küld,
  szerzőt, tagságot vagy tanári jelet soha.
- **Sima szöveg, nem HTML.** A hírfolyam szövege React szövegként jelenik
  meg; linket csak `http(s)://` címből csinálunk, `rel="noopener noreferrer
  nofollow ugc"`-vel (`src/lib/club-board.ts`).
- **Hossz- és gyakoriságkorlát.** Bejegyzés legfeljebb 4000, hozzászólás
  1000 karakter; felhasználónként óránként legfeljebb 10 bejegyzés és 60
  hozzászólás (`club-board.ts`). Az ötleteknél és a javaslatoknál saját
  darabszám-korlát van (`club-ideas.ts`).
- **Olvasni csak belépve.** A hírfolyam belépés nélkül nem látszik, és a
  push-értesítés sem viszi a szövegét vagy a szerző nevét — a feliratkozás
  névtelen, a tartalom nem (lásd az `/adatvedelem` lapot).
- **Moderálás törléssel.** A szerző, a szakkör vezető tanára és az admin
  törölhet; a törlés végleges.

## Szakkörök és versenyek: a bevezetés előtt és után

- **A bevezetés-kapcsoló a szerveren is kapu.** Amíg a
  `NEXT_PUBLIC_CLUBS_PUBLIC` nem `1`, a `/szakkorok` és a `/versenyek` lapjai
  diáknak és belépés nélkül 404-et adnak — és ugyanez a kapu
  (`canBrowseClubs`) áll minden szakkör- és verseny-Server Action előtt is
  (jelentkezés, kilépés, javaslat, nevezés, visszalépés, tervező, hírfolyam,
  ötletek). Az action azonosítója a kliens csomagjában benne van, tehát a lap
  404-e egymagában nem védene.
- **A nem látható elem „nincs".** Egy idegen javaslat, egy piszkozat verseny
  vagy a bevezetés előtti lap esetén az action „nincs ilyen" választ ad, a lap
  címe (`<title>`) pedig általános marad — a név a 404-en sem szivárog ki.
- **A létszámkorlát zárral áll.** A nevezés a verseny sorát `FOR UPDATE`-tel
  zárja, mielőtt megszámolja a nevezéseket, így két egyszerre érkező nevezés
  sem lépheti túl a korlátot (`src/app/versenyek/actions.ts`).
- **A kérésből jövő azonosító bármi lehet.** A slugot és az azonosítókat az
  action típusra és hosszra ellenőrzi, mielőtt az adatbázishoz nyúlna.
