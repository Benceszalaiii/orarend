import "server-only";

import { dash, sentinel } from "@better-auth/infra";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { isBlockedAuthPath } from "./auth-blocked-paths";
import { jedlikAd } from "./auth-jedlik";
import prisma from "./prisma";
import { schoolRoleForEmail } from "./school-domain";

//! ═══════════════════════════════════════════════════════════════════════════
//! BEJELENTKEZÉS — MIÉRT VAN, ÉS MIÉRT PONT ÍGY
//! ═══════════════════════════════════════════════════════════════════════════
//!
//! AZ ÓRAREND MEGNÉZÉSÉHEZ SOHA NEM KELL BEJELENTKEZNI, ÉS EZ NEM ALKU TÁRGYA.
//! A lap attól használható, hogy a folyosón, egy idegen telefonján, fiók nélkül
//! is azonnal mutatja a rácsot. Aki nem lép be, pontosan ugyanazt látja, mint
//! eddig.
//!
//! AMIT A BELÉPÉS AD, KÉT DOLOG:
//!   1. az iskolai rendszer megmondja, MELYIK OSZTÁLYBA jár a diák — belépés
//!      után rögtön a helyes órarend jön, kézi kiválasztás nélkül;
//!   2. a beállításai (osztály, összevont csoportbontások, duális beosztás)
//!      átjönnek a telefonjáról a gépére.
//!
//! NINCS REGISZTRÁCIÓ. Nem egy kikapcsolt kapcsoló miatt, hanem mert nincs mit
//! regisztrálni: az egyetlen belépési út az ISKOLAI fiók, ami a suli
//! rendszerében már létezik. Aki oda nem tud belépni, ide sem.
//!
//! ─── A JELSZÓRÓL, NYÍLTAN ──────────────────────────────────────────────────
//! Ez a folyamat az iskolai jelszót a MI szerverünkön vezeti át (lásd
//! `jedlik-ad.ts`). Ez tudatos csere: cserébe kapjuk meg az osztályt, amit
//! semmilyen külső azonosító nem ad meg. A vele járó kötelezettségek végig be
//! vannak tartva — a jelszó sehol nem áll meg, nem kerül naplóba, és a
//! végpontnak sebességkorlátja van (`auth-jedlik.ts`).
//!
//! EBBŐL KÖVETKEZIK EGY SZABÁLY, AMIT NEM SZABAD MEGSZEGNI: iskolai jelszót
//! CSAK a saját, `/belepes` lapunk kérhet be, és csak azért, hogy azonnal
//! továbbadja az iskolának. Ha valaha bárhol máshol (felugró ablakban,
//! beágyazott keretben, „erősítsd meg a jelszavad" párbeszédben) is bekérnénk,
//! azzal pont azt a szokást tanítanánk meg a diákoknak, amit egy adathalász lap
//! később kihasznál.
//! ═══════════════════════════════════════════════════════════════════════════

//! A PASSKEY A HOSZTNÉVHEZ (Relying Party ID) kötődik, nem az URL-hez: se séma,
//! se port nem lehet benne, különben a böngésző néma `SecurityError`-ral eldobja
//! a regisztrációt.
//!
//! FIGYELEM: a domain megváltoztatása MINDEN meglévő passkey-t érvénytelenít (az
//! eszközök a régi rpID-hez kötötték a kulcsot). Ilyenkor a diákoknak újra kell
//! venniük — az iskolai belépés marad a tartalék, ezért ez kellemetlenség, nem
//! kizárás.
const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const RP_ID = safeHostname(BASE_URL);

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "localhost";
  }
}

export const auth = betterAuth({
  appName: "Órarend",
  baseURL: BASE_URL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  //! ─── HOVA IRÁNYÍTSUNK OAUTH-HIBÁNÁL ──────────────────────────────────────
  //! ALAPBÓL `<baseURL>/error`-ra menne — olyan lap, ami ennél az appnál NEM
  //! LÉTEZIK. Ez akkor futna le, ha a hívó (`signIn.social`, `linkSocial`)
  //! nem adna meg saját `errorCallbackURL`-t, VAGY ha a hiba még azelőtt
  //! történne, hogy a hívó URL-je egyáltalán számítana (pl. a domain-ellenőrzés
  //! a `validateUserInfo`-ban — lásd lentebb — mindig ide redirekt, a `code`
  //! és `error_description` lekérdezési paraméterekkel). A `/belepes` a lap
  //! egyetlen olyan pontja, ami MEGTUDJA magyarázni, mi történt és mit lehet
  //! tenni — ide irányítjuk tehát a tartalékot is.
  onAPIError: { errorURL: "/belepes" },

  //! ─── MEGBÍZHATÓ EREDETEK ─────────────────────────────────────────────────
  //! Élesben CSAK a `baseURL` eredete megbízható (ezt a Better Auth magától
  //! hozzáadja), és ez így is helyes: a lista minden eleme egy hely, ahonnan
  //! elfogadunk bejelentkezési kérést.
  //!
  //! FEJLESZTÉSKOR viszont a projekt SAJÁT indítói több porton futnak
  //! (.claude/launch.json: 3000, 3001, 3005), és a `BETTER_AUTH_URL` csak az
  //! egyiket nevezi meg — a többiről minden belépés „Invalid origin"-nal bukna
  //! el. A helyettesítő karakter ezért kizárólag fejlesztői módban él;
  //! élesben a lista üres marad, és a CSRF-védelem teljes szigorral áll.
  trustedOrigins:
    process.env.NODE_ENV === "development"
      ? ["http://localhost:*", "http://127.0.0.1:*"]
      : [],

  //! SAJÁT JELSZAVAS BELÉPÉS SOHA. Ez NEM az iskolai belépésre vonatkozik (az a
  //! `jedlikAd` bővítményé) — hanem arra, hogy mi magunk ne kezdjünk el
  //! jelszavakat tárolni. Ha ez az ág bekapcsolódna, egy MÁSODIK, gyengébb
  //! bejárat nyílna ugyanahhoz a fiókhoz, ráadásul olyan, amit már nem az
  //! iskola jelszóházirendje véd. A sémában ezért nincs is jelszómező a
  //! felhasználón.
  emailAndPassword: { enabled: false },

  //! AZ E-MAIL-CÍM NEM CSERÉLHETŐ, ÉS A FIÓK NEM TÖRÖLHETŐ A KLIENSBŐL.
  //! Mindkettő alapból ki van kapcsolva a Better Authban; azért áll itt kiírva,
  //! hogy a bekapcsolásuk tudatos döntés legyen. Az AD-fiók e-mail-címe amúgy
  //! is szintetikus (`<felhasználónév>@jedlik-ad.invalid`) — átírni
  //! értelmetlen lenne, és elrontaná a fiók és az iskolai felhasználónév
  //! közötti kapcsolatot. A Google-fiókoké viszont a valódi iskolai címük —
  //! azt meg pláne nem a mi appunk cserélgeti.
  user: {
    changeEmail: { enabled: false },
    deleteUser: { enabled: false },

    //! ─── A FELHASZNÁLÓ EXTRA MEZŐI ──────────────────────────────────────────
    //! Ezek régebben a `jedlikAd()` bővítmény saját `schema`-jában álltak.
    //! Azóta a Google-belépés (lásd lentebb, `socialProviders.google` +
    //! `validateUserInfo`) is ír `isTeacher`-t, tehát a mezők tulajdonosa a
    //! KÖZÖS `user`, nem egyetlen bővítmény — két hely deklarálná ugyanazt a
    //! mezőt, ami a Better Authban ütközés volna. Emellett ez a migráció
    //! egyik célja is: hogy a `jedlikAd()` bővítmény (és vele a `schema`-ja)
    //! a migráció végén nyomtalanul törölhető legyen, anélkül hogy elvinné
    //! ezeket az oszlopokat.
    //!
    //! EGYIK SEM `input`, tehát a Better Auth SOHA nem veszi át őket a kliens
    //! kéréséből — kizárólag az AD-belépés (`auth-jedlik.ts`) vagy a
    //! Google-belépés `databaseHooks`-a írja őket. Enélkül egy `/update-user`
    //! hívással bárki tanárrá vagy más osztály tagjává tehetné magát.
    additionalFields: {
      //* Az iskolai (AD) felhasználónév kisbetűsítve. `null` egy
      //* Google-fiókkal érkezett felhasználónál — lásd `prisma/schema.prisma`.
      username: {
        type: "string",
        required: false,
        unique: true,
        input: false,
        returned: true,
      },
      //* Ugyanaz, ahogy a diák beírta (nagybetűkkel együtt) — csak AD-belépésnél
      //* van értéke, csak megjelenítésre.
      displayUsername: {
        type: "string",
        required: false,
        input: false,
        returned: true,
      },
      //* Csak az AD megmondja, melyik osztályba jár a diák — a Google-belépés
      //* ezt nem tudja, `null` marad. Lásd `jedlik-ad.ts`.
      class: {
        type: "string",
        required: false,
        input: false,
        returned: true,
      },
      //* AD-belépésnél az iskolai válasz mondja meg (és csak akkor írjuk
      //* felül, ha nyilatkozott róla — lásd `jedlik-ad.ts`). Google-belépésnél
      //* a `validateUserInfo` alatti `databaseHooks.user.create.before` írja,
      //* a tantestületi (`jedlik.eu`) kontra diák (`students.jedlik.eu`)
      //* domain alapján.
      isTeacher: {
        type: "boolean",
        required: false,
        input: false,
        returned: true,
        defaultValue: false,
      },
      //* Mikor néztük meg utoljára az AD-ban, hogy az osztály és a
      //* tanár-státusz stimmel-e. Google-belépésnél nincs értelme: ott minden
      //* belépés újraértékeli a szerepet a domainből (lásd lent).
      adCheckedAt: {
        type: "date",
        required: false,
        input: false,
        returned: false,
      },
    },

    //! ─── A KAPU: KI JOGOSULT EGYÁLTALÁN FIÓKOT KAPNI ────────────────────────
    //! Ez fut le MINDEN fiók-létrehozásnál, fiók-összekötésnél, és — OAuth
    //! esetén — MINDEN EGYES BELÉPÉSNÉL is (lásd a Better Auth
    //! `oauth2/link-account.mjs`-ét: a `sign-in` ág is idehívja). Ez utóbbi
    //! szándékos: ha valakinek időközben megváltozna vagy megszűnne az
    //! iskolai Google-fiókja, a következő belépésekor újra megvizsgáljuk —
    //! nem elég, hogy régen jogosult volt.
    //!
    //! AZ AD-BELÉPÉST NEM ÉRINTI. Az `auth-jedlik.ts` a saját kapuja: az
    //! iskolai jelszó helyes ellenőrzése maga a jogosultság. Ez a függvény a
    //! `method === "jedlik-ad"` esetben szándékosan nem dönt semmiről (a
    //! `void` visszatérés = beengedés) — ha egyszer, a migráció végén, az
    //! AD-bővítmény törlődik, ez az ág is elhagyható lesz.
    validateUserInfo: ({ user, source }) => {
      if (source.oauth?.providerId !== "google") return;
      //! A GOOGLE `email_verified` MEZŐJE NEM ELÉG. A `hd: "*"` (lásd
      //! `socialProviders.google`) csak azt zárja ki, hogy valaki SEMMILYEN
      //! Workspace-domainnel ne jusson be — a MI két konkrét domainünket
      //! (`jedlik.eu`, `students.jedlik.eu`) ez a hívás ellenőrzi, a
      //! hitelesített e-mail-cím alapján.
      if (!schoolRoleForEmail(user.email)) {
        return {
          error: "NOT_SCHOOL_ACCOUNT",
          errorDescription:
            "Csak iskolai Google-fiókkal (@jedlik.eu vagy @students.jedlik.eu) lehet belépni.",
        };
      }
    },
  },

  //! ─── A GOOGLE-FIÓK BEÁLLÍTÁSA ISKOLAI SZEREPPÉ ────────────────────────────
  //! A `user.validateUserInfo` már eldöntötte, hogy a domain elfogadható —
  //! ez a hook csak azt írja be, MILYEN szerepet jelent. `databaseHooks`, nem
  //! `validateUserInfo`, mert az utóbbi csak elfogad/elutasít, adatot nem
  //! módosíthat.
  //!
  //! AZ AD-BELÉPÉST NEM ÉRINTI, ÉS EZ SZÁNDÉKOS ŐRZÉS, NEM MELLÉKHATÁS: az
  //! AD szintetikus címe (`@jedlik-ad.invalid`) nem szerepel egyik iskolai
  //! domainben sem, tehát a `role` itt `null` lesz, és a feltétel át sem fut
  //! — az `auth-jedlik.ts` által a `directoryData`-ban már beállított
  //! `isTeacher` érintetlen marad. Enélkül ez a hook minden AD-fiókot
  //! csendben visszaminősítene diákká.
  databaseHooks: {
    user: {
      create: {
        //! `async`, MERT A HOOK TÍPUSA `Promise`-OT VÁR — a `validateUserInfo`
        //! `Awaitable`-lel megelégszik szinkron visszatéréssel is, ez a hook
        //! nem, tehát ez itt NEM stilisztikai, hanem fordítási kényszer.
        before: async (user) => {
          const role = schoolRoleForEmail(user.email);
          if (!role) return;
          return { data: { ...user, isTeacher: role === "teacher" } };
        },
      },
    },
  },

  //! ─── A GOOGLE-BELÉPÉS ─────────────────────────────────────────────────────
  //! A KLIENS-OLDALI KULCSOK NÉLKÜL EZ AZ EGÉSZ ÁG HIÁNYZIK, NEM HIBÁZIK. Ha a
  //! `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` nincs beállítva (pl. helyi
  //! fejlesztésnél), a `socialProviders` objektum üres marad — sem a
  //! `/sign-in/social`, sem a `/callback/google` végpont nem regisztrálódik,
  //! ahelyett hogy üres kulcsokkal próbálkozna és a Google 400-at adna.
  //!
  //! `hd: "*"`: MEGKÖVETELI, hogy a Google-fiók valamilyen Workspace-domainhez
  //! tartozzon (tehát egy személyes `@gmail.com` cím már itt, a
  //! Google-válaszban elbukik — nem kell a mi domain-listánkig eljutnia).
  //! A KONKRÉT domaint (`jedlik.eu` / `students.jedlik.eu`) a fenti
  //! `validateUserInfo` dönti el, mert a `hd` csak EGY domaint tudna
  //! megkövetelni, nálunk pedig kettő van.
  //!
  //! `accessType: "online"`: NINCS `refreshToken`-t kérő ág. Az app soha nem
  //! hív semmilyen Google API-t a bejelentkezésen túl — a `profile`/`email`
  //! scope-on kívül semmit nem kérünk —, tehát nincs mit frissíteni. Egy
  //! offline (refresh tokent adó) hozzáférés csak egy olyan titkot tárolna,
  //! aminek soha nem vennénk hasznát.
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            hd: "*",
            accessType: "online" as const,
            prompt: "select_account",
          },
        }
      : {}),
  },

  account: {
    accountLinking: {
      //! A KÉZI ÖSSZEKÖTÉS MOSTANTÓL NYITOTT — ez teszi lehetővé, hogy egy
      //! MÁR bejelentkezett AD-fiók Google-fiókot kössön magához
      //! (`authClient.linkSocial`, lásd `account-menu.tsx` és
      //! `belepes/sign-in-panel.tsx`). Enélkül minden Google-belépés ÚJ
      //! fiókot hozna létre, és az AD-fiók beállításai (osztály,
      //! csoportbontás) elveszne az átállásnál.
      enabled: true,
      //! AZ IMPLICIT (AUTOMATIKUS) ÖSSZEFŰZÉS VISZONT MARAD KIKAPCSOLVA. Az
      //! implicit összefűzés akkor lépne be, ha egy beérkező Google-fiók
      //! e-mail-címe VÉLETLENÜL egyezne egy meglévő fiók e-mail-címével — ez
      //! klasszikus fiókátvételi út máshol, nálunk pedig eleve nem
      //! fordulhatna elő (az AD-fiókok szintetikus `@jedlik-ad.invalid`
      //! címén), tehát az implicit ág csak kockázat, haszon nélkül. A kézi
      //! összekötés (fent) egy MÁR bejelentkezett munkamenetből indul — ott a
      //! „ki vagy" kérdés már el van döntve, ez a kapcsoló arra nem vonatkozik.
      disableImplicitLinking: true,
      //! `allowDifferentEmails: true` KÖTELEZŐ, KÜLÖNBEN A KÉZI ÖSSZEKÖTÉS
      //! MINDIG ELUTASÍTVA VISSZATÉRNE. Az AD-fiók e-mail-címe szintetikus
      //! (`<felhasználónév>@jedlik-ad.invalid`), a Google-fióké a valódi
      //! iskolai cím — a kettő SOSEM egyezhet, tehát az alapértelmezett
      //! „csak azonos e-mail-lel köthető össze" szabály itt mindig bukna.
      //! A kockázat, amit ez a kapcsoló egyébként hordozna (valaki egy
      //! IDEGEN fiókhoz köt egy saját Google-fiókot), itt nem áll fenn: a
      //! `linkSocial` a MUNKAMENET felhasználójához köt, a hívó nem
      //! választhatja meg, MELYIK helyi fiókhoz csatlakozik.
      allowDifferentEmails: true,
    },
  },

  session: {
    //! HOSSZÚ MUNKAMENET — ÉS ITT EZ KIFEJEZETTEN BIZTONSÁGI DÖNTÉS. Minden
    //! lejárt munkamenet egy újabb alkalom, amikor a diáknak be kell gépelnie
    //! az iskolai jelszavát; minél többször teszi, annál inkább szokássá válik,
    //! és annál könnyebben gépeli be legközelebb egy hamis lapon is. A ritkább
    //! belépés tehát kevesebb kitettség.
    //! Amit egy ellopott munkamenet elér: látja és átírja valakinek az
    //! órarend-beállításait. A jelszót NEM tudja megszerezni belőle, mert nem
    //! tároljuk.
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      //! A MUNKAMENET-SÜTI GYORSÍTÓTÁRA. Enélkül minden oldalbetöltés egy
      //! adatbázis-lekérés lenne csak azért, hogy kiírjuk a nevet a sávba. Öt
      //! perc a kompromisszum: ennyivel késhet egy kijelentkezés érvényesülése
      //! a többi fülön.
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  //! ─── SEBESSÉGKORLÁT ──────────────────────────────────────────────────────
  //! `storage: "database"`, mert az app serverless-en fut: a memóriaszámláló
  //! minden hideg indításnál nulláról kezdene, tehát gyakorlatilag nem
  //! korlátozna (lásd a `RateLimit` modellt a sémában). Jelszó-próbálgatásnál
  //! épp ez volna a legdrágább hiba.
  //*
  //* A belépés SAJÁT, szigorúbb szabálya a bővítményben áll (`auth-jedlik.ts`),
  //* mert ott van mellette a magyarázat is, hogy miért pont annyi.
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 200,
    customRules: {
      //* A passkey-folyamat egy belépéshez több kört tesz (opciók kérése, majd
      //* ellenőrzés), ezért kap nagyobb keretet — de nem korlátlant.
      "/passkey/*": { window: 300, max: 40 },
    },
  },

  advanced: {
    ipAddress: {
      //! A KORLÁTOZÁS EGYETLEN AZONOSÍTÓJA AZ IP, tehát számít, honnan vesszük.
      //! A Better Auth a fejléc ELSŐ elemét használja — az `x-forwarded-for` bal
      //! oldalát viszont a KLIENS írja, azaz hamisítható. Az `x-real-ip` ezért
      //! áll elöl: azt a fordított proxy (Vercel) állítja be a ténylegesen látott
      //! címre, és nem lista, tehát nem toldható meg.
      //!
      //! ÜZEMELTETÉS: ha az app egyszer saját proxy mögé kerül, annak KÖTELEZŐ
      //! beállítania az `x-real-ip`-t. Enélkül a lánc az `x-forwarded-for`-ra
      //! esik vissza, ami megkerülhető — és ezzel a belépés korlátja is.
      ipAddressHeaders: ["x-real-ip", "x-forwarded-for"],
      //* Egy IPv6-előfizetés egész prefixszel gazdálkodik: cím szerinti
      //* korlátozás ott ingyen megkerülhető lenne, ezért /64-re normalizálunk.
      ipv6Subnet: 64,
    },
  },

  hooks: {
    //! ─── A ZÁRT VÉGPONTOK KAPUJA ─────────────────────────────────────────
    //! Egy bővítmény bekapcsolása MINDEN végpontját felcsatolja — válogatni nem
    //! lehet. Amit ez az app nem akar kiszolgálni, azt tehát itt kell lezárni,
    //! a kérés útjában. A lista és a hozzá tartozó indoklás az
    //! `auth-blocked-paths.ts`-ben áll, hogy tesztelhető legyen.
    //!
    //! Ami itt záródik: a profilírás (`/update-user` — a nevet az iskola adja),
    //! a `dash()` meghívós ága (hitelesítés NÉLKÜL csinál fiókot és
    //! munkamenetet), és az „összes napló" nézet (idegen hatókör).
    before: createAuthMiddleware(async (ctx) => {
      if (isBlockedAuthPath(ctx.path)) {
        throw new APIError("FORBIDDEN", {
          message: "Ez a végpont ezen az oldalon nem érhető el.",
        });
      }
    }),
  },

  plugins: [
    //* Az iskolai felhasználónév + jelszó belépés. Ez az EGYETLEN út, amin új
    //* fiók keletkezhet.
    jedlikAd(),
    //! A passkey NEM bejárat, hanem rövidebb út: csak már bejelentkezett
    //! felhasználó veheti fel. Minden passkey-s belépés eggyel kevesebb
    //! alkalom, amikor az iskolai jelszót egyáltalán be kell gépelni — ezért
    //! ez itt biztonsági funkció is, nem csak kényelmi.
    passkey({
      rpID: RP_ID,
      rpName: "Órarend",
      //* Az elfogadott origin. Enélkül a kliens által küldött origint hinné el
      //* a szerver — itt szögezzük le a sajátunkra.
      origin: BASE_URL,
      authenticatorSelection: {
        //! `residentKey: "required"` — discoverable credential. Ez kell ahhoz,
        //! hogy a belépéshez NE kelljen előbb azonosítót megadni: a böngésző
        //! maga kínálja fel a fiókot.
        residentKey: "required",
        requireResidentKey: true,
        //* Biometria/PIN kötelező a felvételkor: a passkey ettől lesz önmagában
        //* kétfaktoros (birtoklás = eszköz, tudás/tulajdonság = PIN vagy ujjlenyomat).
        userVerification: "required",
      },
    }),

    //! ─── A BETTER AUTH INFRA IRÁNYÍTÓPULTJA ──────────────────────────────
    //! Üzemeltetői rálátás a fiókokra (a távoli pult ezeken a végpontokon át
    //! olvas), és a bejelentkezett diáknak a SAJÁT auditnaplója.
    //!
    //! ─── MIT CSATOL FEL, ÉS MI VÉDI ────────────────────────────────────────
    //! Ez az egy sor ~90 útvonalat tesz nyilvánosan hívhatóvá az `/api/auth/*`
    //! alatt. Három csoportra bomlanak, és NEM ugyanaz védi őket:
    //!
    //! 1. ÜZEMELTETŐI VÉGPONTOK (`/dash/create-user`, `/dash/set-password`,
    //!    `/dash/impersonate-user`, `/dash/execute-adapter`, …). Ezek nem
    //!    munkamenettel hitelesítenek: rövid életű, az infra által aláírt JWT-t
    //!    követelnek, amit a szerver a távoli JWKS ellen ellenőriz, ÉS a helyi
    //!    `BETTER_AUTH_API_KEY` hasheléhez köt. Bejelentkezett felhasználó — a
    //!    tanár sem — nem éri el őket; kulcs hiányában `UNAUTHORIZED`.
    //!
    //! 2. MUNKAMENETES VÉGPONTOK (`/events/list`, `/events/types`,
    //!    `/events/audit-logs`). Ezek a saját sorokra szűrnek: idegen `userId`
    //!    kérése `FORBIDDEN`.
    //!
    //! 3. HITELESÍTÉS NÉLKÜLI VÉGPONTOK — a meghívós ág. EZEK NEM KÉRNEK SEM
    //!    JWT-T, SEM MUNKAMENETET, és fiókot hoznak létre + beléptetnek. Ezért
    //!    a `hooks.before` FORBIDDEN-nel zárja őket (`auth-blocked-paths.ts`).
    //!    Ne legyen félreértés: a bővítmény bekapcsolása ÖNMAGÁBAN nem hagyja
    //!    zárva ezt a csoportot — a tiltás az, ami zárja.
    //!
    //! ÜZEMELTETÉSI SZABÁLY: aki a `BETTER_AUTH_API_KEY`-t birtokolja, az az
    //! 1. csoporton át jelszót állíthat, megszemélyesíthet, és az
    //! `/dash/execute-adapter`-rel az adatbázis BÁRMELY tábláját olvashatja és
    //! írhatja. A kulcs ezért pontosan olyan érzékeny, mint a
    //! `BETTER_AUTH_SECRET`: nem megy a repóba, és a kiszivárgása teljes
    //! adatbázis-hozzáférés — cserélni kell, nem „figyelni".
    //!
    //! AMIT TUDNI KELL, ÉS AMI NEM KAPCSOLHATÓ KI: a bővítmény minden
    //! belépésnél, kilépésnél és munkamenet-létrehozásnál eseményt küld a
    //! `https://dash.better-auth.com` címre, és az esemény tartalmazza a diák
    //! NEVÉT, e-mail-címét, IP-címét, város/ország adatát és böngészőazonosítóját.
    //! Erre a bővítménynek NINCS kapcsolója, és a kulcs hiánya sem állítja meg a
    //! kimenő kérést. Ez tehát egy új adatfeldolgozó — az adatvédelmi
    //! tájékoztatóban (`/adatvedelem`) meg kell nevezni, mielőtt élesbe megy.
    dash({
      //! Az `activityTracking` `lastActiveAt`-et ír a `User`-re minden nem-GET
      //! kérésnél (séma: `prisma/schema.prisma`, migrálva `bun run db:push`-sal).
      //! FIGYELEM: ez rögzíti, ki mikor használja a lapot — olyan adat, amit az
      //! órarend nem igényel, és amiről az adatvédelmi tájékoztató jelenleg nem
      //! szól. Élesbe menet előtt ezt meg kell nevezni ott (`/adatvedelem`).
      activityTracking: { enabled: true },
    }),
    sentinel(),
  ],
});

export type Session = typeof auth.$Infer.Session;
