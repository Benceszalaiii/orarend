import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { filterKnownClasses, filterKnownTeachers } from "@/lib/known-class";
import { sendPush } from "@/lib/push-send";
import { LEAD_MINUTES, MAX_CLASSES, MAX_TEACHERS } from "@/lib/push-shared";
import {
  type PushSubscription,
  pushStoreReady,
  readSubscription,
  removeSubscription,
  saveSubscription,
} from "@/lib/push-store";

//! ─── FELIRATKOZÁS AZ ÓRAREND-ÉRTESÍTÉSEKRE ─────────────────────────────────
//!
//! EZ A LAP EGYETLEN VÉGPONTJA, AMI KÉSZÜLÉKHEZ KÖTHETŐ ADATOT VESZ ÁT. A
//! push-végpont maga a cím, ahová a jelzés megy — nélküle nincs értesítés,
//! tehát nem „gyűjtés", hanem a funkció működési feltétele. Ezért itt SEM
//! kérünk semmi mást: se nevet, se csoportot, se eszközleírót. A sor annyit
//! tud, hogy erre a címre EZEKRŐL az osztályokról menjen jelzés.
//!
//! A KÉRÉST MINDIG A DIÁK INDÍTJA. A böngésző engedélykérése kizárólag a
//! harang megnyomása után fut le (lásd `components/pwa/notification-menu.tsx`)
//! — ez a végpont csak azt a döntést rögzíti, ami már megszületett.

//* A végpont a push-szolgáltató saját címe (fcm.googleapis.com,
//* web.push.apple.com, updates.push.services.mozilla.com …). Nem soroljuk fel
//* őket: új böngésző új szolgáltatót hozhat, és egy elavult lista némán zárná
//* ki a felhasználóit. Amit megkövetelünk, az a HTTPS és egy józan hossz.
const ENDPOINT_MAX = 1024;
const KEY_MAX = 256;

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > ENDPOINT_MAX) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

//* A böngészőtől kapott két kulcs base64url-ben érkezik; a tartalmukat nem
//* értelmezzük (azt a `web-push` teszi), csak az alakjukat szűrjük.
const KEY_SHAPE = /^[A-Za-z0-9_-]+=*$/;

function validKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= KEY_MAX &&
    KEY_SHAPE.test(value)
  );
}

type Body = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  classes?: unknown;
  teachers?: unknown;
  everyLesson?: unknown;
  replaces?: unknown;
};

//* A lista hosszát a szűrés ELŐTT vágjuk (lásd lentebb): ezer elemű tömbre nem
//* futtatunk ezer ellenőrzést.
function wantedList(raw: unknown, max: number): string[] {
  return Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string").slice(0, max)
    : [];
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

//! ─── A TANÁRI FELIRATKOZÁS AZ EGYETLEN, AMIT IGAZOLNI KELL ─────────────────
//! AZ OSZTÁLY ÓRARENDJE NYILVÁNOS: bárki megnézheti a lapon, tehát az
//! értesítés sem ad hozzá semmit, amihez ne férne hozzá amúgy is. A TANÁRI
//! feliratkozás más — nem azért, mert az adat titkos (az sem az), hanem mert
//! ez a lap EGY EMBER munkanapját küldi el egy készülékre percre pontosan,
//! nap mint nap. Az „hol van most X tanár" kérdésre adott automata válasz
//! akkor is követés, ha minden egyes adata nyilvános.
//!
//! EZÉRT: tanári feliratkozást KIZÁRÓLAG iskolai belépéssel, tanárként
//! igazolt fiók hozhat létre vagy módosíthat (`isTeacher === true`, amit az
//! iskola rendszere mond meg — lásd `jedlik-ad.ts`; a mezőt a kliens nem tudja
//! átírni, `auth.ts`).
//!
//! ÉS AMI EBBŐL KÖVETKEZIK, DE NEM MAGÁTÓL ÉRTETŐDŐ: a MEGÚJÍTÁSHOZ nem kell
//! munkamenet. A feliratkozás 400 napig él, a belépés 30-ig; a lap minden
//! megnyitáskor csendben megújítja a sorát (`refreshPush`), és a böngésző a
//! push-címet is lecserélheti magától (`pushsubscriptionchange`) — ezek
//! egyikéhez sincs élő munkamenet. Ha a megújítás jogosultságot kérne, a
//! tanár értesítései a belépése lejártakor NÉMÁN elhalnának. Ezért a szabály
//! pontosan ez: ÚJ vagy MEGVÁLTOZOTT tanári lista igazolást kér; a MÁR
//! TÁROLTTAL AZONOS lista igazolás nélkül is megmarad.
async function sessionIsTeacher(): Promise<boolean> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user.isTeacher === true;
  } catch {
    //* A munkamenet-lekérés bukása NEM jogosultság: aki nem igazolható, az
    //* nem kap tanári feliratkozást.
    return false;
  }
}

export async function POST(request: Request) {
  if (!pushStoreReady()) {
    //* Tároló nélkül a feliratkozásnak nincs hova kerülnie. Ez az EGYETLEN
    //* hely, ahol a hiányzó Redis nem maradhat néma: a diák épp most kapcsolta
    //* be az értesítéseket, és ha úgy hagynánk, hogy „kész", olyat ígérnénk,
    //* ami sosem jön meg.
    return Response.json(
      { error: "Az értesítések most nem érhetők el." },
      { status: 503 },
    );
  }

  let payload: Body | null;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return new Response(null, { status: 400 });
  }

  const endpoint = payload?.endpoint;
  const p256dh = payload?.keys?.p256dh;
  const auth = payload?.keys?.auth;
  if (!validEndpoint(endpoint) || !validKey(p256dh) || !validKey(auth)) {
    return new Response(null, { status: 400 });
  }

  const replaces =
    typeof payload?.replaces === "string" &&
    payload.replaces.length <= ENDPOINT_MAX
      ? payload.replaces
      : undefined;

  //! A CSERE NEM HOZ MAGÁVAL BEÁLLÍTÁST. Amikor a böngésző magától cseréli le a
  //! push-címet (`pushsubscriptionchange`), a kérést a service worker küldi — az
  //! pedig nem látja a `localStorage`-ot, tehát nem tudja, mely osztályokra
  //! iratkoztak fel. A választás ezért NEM veszhet el: a régi sorból örököljük.
  //! Enélkül a kulcsforgatás némán kikapcsolná valakinek az értesítéseit.
  const inherited = replaces ? await readSubscription(replaces) : null;

  //! A LISTA HOSSZÁT A SZŰRÉS ELŐTT VÁGJUK. Ezer elemű tömbre nem futtatunk
  //! ezer ellenőrzést — a felső korlát a munkára is korlát, nem csak a tárolt
  //! adatra.
  const wantedClasses = wantedList(payload?.classes, MAX_CLASSES);
  const wantedTeachers = wantedList(payload?.teachers, MAX_TEACHERS);

  //* A kliens a KÉT LISTÁT KÜLÖN felületen szerkeszti (a diák „Ma"-ján az
  //* osztályokat, a tanárin a tanárokat), de mindig mindkettőt elküldi — a
  //* hiányzó mező ezért a `replaces`-ből örökölt (vagy a tárolt) listát
  //* jelenti, nem üresítést.
  const classes =
    payload?.classes === undefined
      ? (inherited?.classes ?? [])
      : await filterKnownClasses(wantedClasses);

  const stored = (await readSubscription(endpoint)) ?? inherited;
  const storedTeachers = stored?.teachers ?? [];

  const requestedTeachers =
    payload?.teachers === undefined
      ? storedTeachers
      : await filterKnownTeachers(wantedTeachers);

  //! CSAK AZ VÁLTOZTATHATJA, AKI IGAZOLTAN TANÁR — a megújítás viszont nem
  //! változtatás (lásd `sessionIsTeacher` fölött). A munkamenetet ezért csak
  //! akkor kérdezzük meg, ha a kért lista ELTÉR a tárolttól: egy csendes
  //! frissítés így egyetlen adatbázis-kérést sem indít.
  const teachersChanged = !sameList(requestedTeachers, storedTeachers);
  if (teachersChanged && !(await sessionIsTeacher())) {
    //! 403, NEM NÉMA ELDOBÁS. Ez az egyetlen ág, ahol a kérés alakja hibátlan,
    //! és mégsem teljesítjük — a diáknak (vagy a lejárt munkamenetű tanárnak)
    //! meg kell tudnia, hogy nem a hálózat akadt el, hanem be kell lépnie.
    return Response.json(
      {
        error:
          "Tanári értesítést csak iskolai belépéssel, tanári fiókkal lehet beállítani.",
      },
      { status: 403 },
    );
  }
  const teachers = requestedTeachers;

  //* Feliratkozás legalább egy alanyra: mindkét lista üresen egy olyan sor
  //* keletkezne, amire soha semmi nem megy ki.
  if (classes.length === 0 && teachers.length === 0) {
    return new Response(null, { status: 400 });
  }

  const record: PushSubscription = {
    endpoint,
    p256dh,
    auth,
    classes,
    teachers,
    everyLesson:
      payload?.everyLesson === undefined
        ? (inherited?.everyLesson ?? false)
        : payload.everyLesson === true,
  };

  //* Első feliratkozás-e: ettől függ, kap-e visszaigazoló jelzést (lásd lent).
  //! A CSERE NEM ELSŐ FELIRATKOZÁS. Ha a régi sort örököltük, a diák már rég
  //! bekapcsolta az értesítéseket — egy „Értesítések bekapcsolva" üzenet
  //! ilyenkor a semmiből jönne, ok nélkül.
  const existing = stored;

  try {
    await saveSubscription(record, replaces);
  } catch {
    return Response.json(
      { error: "Az értesítések most nem érhetők el." },
      { status: 503 },
    );
  }

  //! AZ ELSŐ JELZÉS MAGA A BIZONYÍTÉK. A böngésző engedélye és a szerver
  //! kulcsai külön-külön is rendben lehetnek úgy, hogy a lánc mégsem ér össze
  //! (iOS-en némán, hibaüzenet nélkül). Egy azonnali, egyszeri visszaigazolás
  //! az egyetlen módja annak, hogy a diák MOST tudja meg — ne pedig két nap
  //! múlva, amikor kiderül, hogy hiába bízott benne.
  //* Csak új feliratkozáskor: az osztálylista módosítása nem esemény.
  if (!existing) {
    await sendPush([record], {
      kind: "change",
      title: "Értesítések bekapcsolva",
      //* A visszaigazolás azt sorolja fel, amire a feliratkozás TÉNYLEGESEN
      //* szól — a tanárit is, különben a tanár nem tudná meg, hogy a jelzés az
      //* ő órarendjéről szólt-e, vagy az osztályéról.
      body: `${[...classes, ...teachers].join(", ")} — szólunk ${LEAD_MINUTES} perccel az óra előtt és ha változik az órarend.`,
      url: "/ma",
      tag: "orarend-welcome",
    });
  }

  return new Response(null, { status: 204 });
}

//! A LEIRATKOZÁS NEM KÉRDEZ VISSZA. Aki kikapcsolta az értesítést, annak a
//! sora azonnal eltűnik; nincs „szüneteltetés", és nincs megőrzött beállítás,
//! amit egy későbbi bekapcsolásnál elővennénk. Az újra-bekapcsolás úgyis új
//! feliratkozás.
export async function DELETE(request: Request) {
  let payload: Body | null;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!validEndpoint(payload?.endpoint)) {
    return new Response(null, { status: 400 });
  }
  try {
    await removeSubscription(payload.endpoint as string);
  } catch {
    //* A törlés bukása se hagyja a felhasználót elakadva: a böngészőben ő már
    //* leiratkozott, a sor pedig a saját élettartama végén magától eltűnik.
    return new Response(null, { status: 204 });
  }
  return new Response(null, { status: 204 });
}
