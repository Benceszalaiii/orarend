import "server-only";

import { createLocalAccountIssuer } from "@better-auth/core/db";
import {
  APIError,
  createAuthEndpoint,
  formCsrfMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { parseSessionOutput, parseUserOutput } from "better-auth/db";
import type { BetterAuthPlugin } from "better-auth/types";
import * as z from "zod";
import {
  AdLoginError,
  adLogin,
  LOGIN_NAME_MAX_LENGTH,
  normalizeLoginName,
} from "./jedlik-ad";

//! ═══════════════════════════════════════════════════════════════════════════
//! A BEJELENTKEZÉS BŐVÍTMÉNYE
//! ═══════════════════════════════════════════════════════════════════════════
//! Egyetlen végpontot ad hozzá: `POST /api/auth/sign-in/jedlik`. Bemenet az
//! iskolai felhasználónév és jelszó, kimenet egy munkamenet-süti.
//!
//! MIÉRT BŐVÍTMÉNY, ÉS NEM SIMA API-ÚTVONAL: mert így a belépés a Better Auth
//! saját gépezetén megy át, és INGYEN megkapja mindazt, amit egy kézzel írt
//! végponton előbb-utóbb elfelejtenénk — az eredet-ellenőrzést (CSRF), a
//! sebességkorlátot, az aláírt és `httpOnly` munkamenet-sütit, a
//! süti-gyorsítótárat és a kijelentkezést. Egy saját `/api/login` mindezt
//! nulláról kérné.
//!
//! ─── AMI ITT NEM TÖRTÉNIK ──────────────────────────────────────────────────
//! Nincs regisztrációs végpont, és nincs is rá szükség: az első sikeres iskolai
//! belépés MAGA hozza létre a helyi fiókot (lásd lentebb). Aki nem tud belépni
//! az iskola rendszerébe, az itt sem tud fiókot csinálni — a kapu az iskoláé.
//! ═══════════════════════════════════════════════════════════════════════════

export const JEDLIK_PROVIDER_ID = "jedlik-ad";

//! A FIÓK-KÖTÉS KULCSA. A Better Auth 1.7 az `(issuer, accountId)` páron
//! tartja nyilván a belépési módokat; a `createLocalAccountIssuer` a HELYI
//! (nem OAuth) módok névterébe teszi a miénket, így egy azonos nevű OAuth
//! szolgáltatóval sem tudna soha ütközni.
const ISSUER = createLocalAccountIssuer(JEDLIK_PROVIDER_ID);

const signInBodySchema = z.object({
  loginName: z
    .string()
    .min(1)
    .max(LOGIN_NAME_MAX_LENGTH)
    .meta({ description: "Iskolai (Jedlikinfo) felhasználónév" }),
  //! A JELSZÓ HOSSZÁT IS KORLÁTOZZUK. Nem a jelszóházirend miatt — azt az
  //! iskola szabja meg —, hanem hogy egy több megabájtos mezővel ne lehessen a
  //! szerverünket (és rajta keresztül az iskola API-ját) dolgoztatni.
  password: z.string().min(1).max(256).meta({ description: "Iskolai jelszó" }),
  rememberMe: z.boolean().optional(),
});

export const jedlikAd = () =>
  ({
    id: "jedlik-ad",

    //! ─── A FELHASZNÁLÓ EXTRA MEZŐI MOSTANTÓL AZ `auth.ts`-BEN ÉLNEK ──────────
    //! Korábban itt álltak, mert kizárólag ehhez a bővítményhez tartoztak.
    //! Mióta a Google-belépés (`auth.ts`, `socialProviders.google`) is ír
    //! `isTeacher`-t, ez már nem igaz — két hely deklarálná ugyanazt a mezőt,
    //! ami a Better Authban ütközés. A mezők tulajdonosa ezért a KÖZÖS
    //! `user.additionalFields` lett, hogy a bővítmény (jedlik-ad) törlésekor —
    //! ami a migráció végén megtörténik — a mezők ne tűnjenek el vele együtt.
    //! Az `input: false` védelem ugyanúgy megvan ott is: a kliens onnan sem
    //! írhatja őket.

    endpoints: {
      signInJedlik: createAuthEndpoint(
        "/sign-in/jedlik",
        {
          method: "POST",
          //! AZ EREDET-ELLENŐRZÉS NEM HAGYHATÓ EL. Enélkül egy idegen oldal a
          //! látogató böngészőjéből POST-olhatna ide. A `formCsrfMiddleware`
          //! ugyanaz a védelem, amit a beépített `/sign-in/email` is használ.
          requireHeaders: true,
          use: [formCsrfMiddleware],
          body: signInBodySchema,
          metadata: {
            openapi: {
              operationId: "signInWithJedlikAd",
              description:
                "Bejelentkezés iskolai felhasználónévvel és jelszóval",
            },
          },
        },
        async (ctx) => {
          const rawLoginName = ctx.body.loginName.trim();
          const username = normalizeLoginName(rawLoginName);
          if (!username) {
            throw new APIError("BAD_REQUEST", {
              code: "INVALID_LOGIN_NAME",
              message: "Hiányzó felhasználónév.",
            });
          }

          //! ─── ÚJ FIÓK MÁR NEM SZÜLETIK ITT ─────────────────────────────────
          //! A MIGRÁCIÓ MÁSODIK SZAKASZA: az iskolai belépés a MEGLÉVŐ
          //! fiókoknak még működik, de újat nem hoz létre — az egyetlen út
          //! innentől a Google-belépés (`auth.ts`, `socialProviders.google`).
          //! Lásd `/valtozasok`.
          //!
          //! EZÉRT A TULAJDONOST MÉG A JELSZÓ ELKÜLDÉSE ELŐTT MEGKÉRDEZZÜK.
          //! Ha nincs helyi fiók ehhez a felhasználónévhez, a kérés itt áll
          //! meg — az iskola rendszeréhez EL SEM MEGY a jelszó. Ez nem csak
          //! gyorsabb: annak a diáknak, aki most próbálna először (helyesen
          //! vagy elgépelve) belépni, a jelszavát feleslegesen relézni felé
          //! az iskolának pont az az érintettség-minimalizálás ellen menne,
          //! amit ez a fájl a nyitó megjegyzésben vállal.
          //!
          //! A HIBAÜZENET NEM KÜLÖNBÖZTETI MEG az elgépelt felhasználónevet az
          //! újonnan próbálkozótól — a kettő a mi oldalunkról nézve UGYANAZ az
          //! állapot (nincs ilyen nevű helyi fiók), és a válasz mindkettőre
          //! ugyanaz a helyes tanács: ha ez egy meglévő fiók, ellenőrizd a
          //! felhasználóneved; ha még sosem léptél be, a Google-gombot
          //! használd.
          const owner = await ctx.context.internalAdapter.findAccountOwnerByKey(
            {
              issuer: ISSUER,
              accountId: username,
            },
          );

          if (!owner) {
            throw new APIError("FORBIDDEN", {
              code: "AD_SIGNUP_DISABLED",
              message:
                "Iskolai jelszóval új fiók már nem hozható létre. Ha még sosem léptél be, a Google-fiókoddal (@jedlik.eu vagy @students.jedlik.eu) tudsz belépni — ha korábban már jártál itt, ellenőrizd a felhasználóneved.",
            });
          }

          //! ─── ITT MEGY ÁT A JELSZÓ, ÉS SEHOL MÁSHOL ────────────────────────
          //! Az `adLogin` a jelszót az iskola API-jának adja, majd elengedi.
          //! Innentől a `password` változóra nincs több hivatkozás — nem
          //! naplózzuk, nem tesszük el, és a válaszba sem kerül vissza.
          let identity: Awaited<ReturnType<typeof adLogin>>;
          try {
            identity = await adLogin(rawLoginName, ctx.body.password);
          } catch (error) {
            if (error instanceof AdLoginError) {
              //! A HIBAÜZENET NEM ÁRULJA EL, LÉTEZIK-E A FIÓK. Az iskolai API
              //! ugyanazt a 401-et adja ismeretlen névre és rossz jelszóra, és
              //! mi sem finomítunk rajta — különben ez a végpont egy kényelmes
              //! felhasználónév-felderítő eszközzé válna.
              throw new APIError(
                error.invalidCredentials ? "UNAUTHORIZED" : "BAD_GATEWAY",
                {
                  code: error.invalidCredentials
                    ? "INVALID_CREDENTIALS"
                    : "SCHOOL_SYSTEM_UNAVAILABLE",
                  message: error.message,
                },
              );
            }
            throw error;
          }

          //* Amit MINDEN belépéskor frissítünk az iskolai válaszból. A
          //* `isTeacher` csak akkor kerül bele, ha az iskola nyilatkozott róla
          //* — hiányzó adatból nem minősítünk vissza senkit (lásd `jedlik-ad.ts`).
          const directoryData = {
            displayUsername: identity.displayName,
            class: identity.class,
            adCheckedAt: new Date(),
            ...(identity.isTeacher !== null
              ? { isTeacher: identity.isTeacher }
              : {}),
          };

          let user: Record<string, unknown> & { id: string };

          if (owner.kind === "owned") {
            //! A MEGLÉVŐ FIÓK ADATAI FRISSÜLNEK. Osztályt váltani tanév közben
            //! is lehet (átsorolás, évismétlés); ha csak a létrehozáskor
            //! olvasnánk ki, a lap örökre a régi osztályt hinné.
            const updated = await ctx.context.internalAdapter.updateUser(
              owner.user.id,
              directoryData,
            );
            user = (updated ?? owner.user) as typeof user;
          } else {
            //! GAZDÁTLAN FIÓK-KÖTÉS — ilyennek nem szabadna léteznie: a séma
            //! `onDelete: Cascade`-je a felhasználóval együtt viszi az
            //! `account` sorát is. Ha mégis előfordul, NEM találgatunk és nem
            //! kötjük hozzá vakon valakihez: az egy fiókátvételi út lenne.
            ctx.context.logger.error(
              `[jedlik-ad] Gazdátlan fiók-kötés: ${username}`,
            );
            throw new APIError("INTERNAL_SERVER_ERROR", {
              code: "ORPHANED_ACCOUNT",
              message:
                "A fiókod hibás állapotban van. Kérjük, jelezd az üzemeltetőnek.",
            });
          }

          const dontRememberMe = ctx.body.rememberMe === false;
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
            dontRememberMe,
          );
          if (!session) {
            throw new APIError("UNAUTHORIZED", {
              code: "FAILED_TO_CREATE_SESSION",
              message: "Nem sikerült létrehozni a munkamenetet.",
            });
          }

          await setSessionCookie(
            ctx,
            { session, user: user as never },
            dontRememberMe,
          );

          return ctx.json({
            token: session.token,
            user: parseUserOutput(ctx.context.options, user as never),
            session: parseSessionOutput(ctx.context.options, session),
          });
        },
      ),
    },

    //! ─── SEBESSÉGKORLÁT — EZ A PROJEKT LEGÉRZÉKENYEBB VÉGPONTJA ─────────────
    //! Bejelentkezés nélkül hívható, és MINDEN hívás egy valódi jelszó-próbát
    //! visz be az iskola rendszerébe, a mi IP-nkről. Korlát nélkül ez egyszerre
    //! volna jelszótörő előtét és egy jó ok arra, hogy az iskola kitiltson
    //! minket.
    //!
    //! FIGYELEM AZ ISKOLAI HÁLÓZATRA: az egész suli EGY publikus IP mögül jön
    //! (NAT). Ez a korlát tehát egy egész iskolára közös lehet, ezért nem szabad
    //! a jelszó-próbálgatásnál szokásos szigorúra húzni — különben egy tanóra
    //! kezdetén, amikor mindenki egyszerre nyitja meg a lapot, a valódi diákok
    //! akadnának el. 10 kísérlet 5 perc alatt: aki elgépelte, kényelmesen
    //! újrapróbálja; aki listát próbál végig, elakad.
    //!
    //! AMI EBBŐL HIÁNYZIK, ÉS AMIT TUDNI KELL: ez IP szerinti vödör. Egy
    //! botnet, ami sok gépről próbálja UGYANAZT a fiókot, ezen átcsúszik. A
    //! fiók szerinti vödörhöz a végpont elé kellene egy saját számláló (a
    //! jedlik-szakkor `rate-limit.ts`-e ezt csinálja); ha ez a bejelentkezés
    //! komolyabb forgalmat kap, ez a következő lépés.
    rateLimit: [
      {
        pathMatcher: (path) => path === "/sign-in/jedlik",
        window: 300,
        max: 10,
      },
    ],
  }) satisfies BetterAuthPlugin;
