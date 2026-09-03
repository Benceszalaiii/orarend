import "server-only";

import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { jedlikAd } from "./auth-jedlik";
import prisma from "./prisma";

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

  //! SAJÁT JELSZAVAS BELÉPÉS SOHA. Ez NEM az iskolai belépésre vonatkozik (az a
  //! `jedlikAd` bővítményé) — hanem arra, hogy mi magunk ne kezdjünk el
  //! jelszavakat tárolni. Ha ez az ág bekapcsolódna, egy MÁSODIK, gyengébb
  //! bejárat nyílna ugyanahhoz a fiókhoz, ráadásul olyan, amit már nem az
  //! iskola jelszóházirendje véd. A sémában ezért nincs is jelszómező a
  //! felhasználón.
  emailAndPassword: { enabled: false },

  //! AZ E-MAIL-CÍM NEM CSERÉLHETŐ, ÉS A FIÓK NEM TÖRÖLHETŐ A KLIENSBŐL.
  //! Mindkettő alapból ki van kapcsolva a Better Authban; azért áll itt kiírva,
  //! hogy a bekapcsolásuk tudatos döntés legyen. A címünk amúgy is szintetikus
  //! (`<felhasználónév>@jedlik-ad.invalid`) — átírni értelmetlen, és elrontaná
  //! a fiók és az iskolai felhasználónév közötti kapcsolatot.
  user: {
    changeEmail: { enabled: false },
    deleteUser: { enabled: false },
  },

  account: {
    accountLinking: {
      //! NINCS AUTOMATIKUS FIÓK-ÖSSZEFŰZÉS. Egy felhasználóhoz egy iskolai
      //! azonosság tartozik; az e-mail-cím egyezésére hivatkozó összefűzés
      //! klasszikus fiókátvételi út, és nálunk nincs is rá szükség, mert csak
      //! egyetlen szolgáltató van.
      enabled: false,
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
    //! A PROFIL AZ ISKOLÁÉ, NEM A KLIENSÉ. A Better Auth `/update-user`
    //! végpontja alapból engedi a nevet és a profilképet átírni. Nálunk a név,
    //! az osztály és a tanár-státusz az iskolai válaszból jön, és minden
    //! belépéskor onnan frissül.
    //!
    //! Az osztályt és a tanár-státuszt a bővítmény `input: false` mezői már
    //! védik; ez a horog a maradékot (`name`, `image`) zárja le, hogy a
    //! felületen megjelenő név biztosan az legyen, amit az iskola mond.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/update-user") {
        throw new APIError("FORBIDDEN", {
          message:
            "A profiladatokat az iskolai fiók adja — itt nem módosíthatók.",
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
  ],
});

export type Session = typeof auth.$Infer.Session;
