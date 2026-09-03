//* ---------------------------------------------------------------------------
//* ÉRTESÍTÉSEK — A KÖZÖS SZERZŐDÉS
//* ---------------------------------------------------------------------------
//! HÁROM FÉL OLVASSA UGYANEZT: a lap (feliratkozás), a szerver (kiküldés) és a
//! service worker (megjelenítés). A `sw.js` nem tud importálni — ott a
//! `PushPayload` mezőnevei KÉZZEL vannak leírva. Ha itt mező nevet vált, a
//! `public/sw.js`-t is át kell írni; ezért van minden, amit a worker olvas,
//! ebben az EGY típusban, és semmi más.

//! TÍZ PERC. Nem paraméter, hanem a funkció maga: ennyi idő alatt lehet
//! átérni a suli egyik szárnyából a másikba, és ennyivel előbb még van értelme
//! szólni. Kevesebb már késő, több pedig olyankor jönne, amikor a diák épp az
//! ELŐZŐ órán ül — ott egy rezgés nem segítség, hanem büntetés.
export const LEAD_MINUTES = 10;

//! MENNYI CSÚSZÁST NYELÜNK EL. Az ütemező nem percpontos (a sorban állás, a
//! hidegindítás és a push-szolgáltató is késhet), és nem is fut percenként:
//! a napi üzenetkeret miatt 5 percenként hívjuk (lásd a READMÉ-t). EZ AZ
//! ABLAK TEHÁT A TICK SŰRŰSÉGÉNEK A FELSŐ KORLÁTJA IS: ha az ütemezés ennél
//! ritkább lesz, az emlékeztetők egy része némán elmarad. Ha egy tick
//! kimarad, az emlékeztető NE vesszen el — ezért nem
//! egy pillanatot, hanem egy ablakot nézünk. Cserébe egy kimaradás után a
//! jelzés pár perccel később ér oda; ezt vállaljuk, mert a néma elmaradás
//! rosszabb: a diák megbízna benne, és nem kapna semmit.
export const LEAD_WINDOW_MINUTES = 6;

//! HÁNY OSZTÁLYRA LEHET FELIRATKOZNI. Az órarendjét egy diák egy osztályban
//! tölti, de nyelvi csoport, duális pár vagy testvér miatt kettő-három is
//! értelmes. A korlát nem kényelmi kérdés: minden feliratkozott osztály egy
//! újabb lekérés a suli szerverétől ÉS egy újabb csatorna, amin a készülék
//! rezeghet. Öt fölött már nem értesítés, hanem hírfolyam.
export const MAX_CLASSES = 5;

//* Egy feliratkozás beállításai. Ennyit tud rólunk a szerver — és ennél többet
//* nem is akarunk, hogy tudjon (lásd `/adatvedelem`).
export type PushPrefs = {
  /** Mely osztályok órarendjéről jöjjön jelzés. Legalább egy, legfeljebb `MAX_CLASSES`. */
  classes: string[];
  //! KÉT SŰRŰSÉG, EGY KAPCSOLÓ. Alapból csak a nap ELSŐ órája előtt szólunk, és
  //! minden olyan óra előtt, ami szünet vagy lyukasóra UTÁN kezdődik — vagyis
  //! amikor a diák nincs is az iskolában, vagy nem ott van, ahol lennie kell.
  //! Egy sima 10 perces szünet előtt-után nem szólunk: nyolc rezgés naponta
  //! nem emlékeztető, hanem az, amitől az értesítéseket kikapcsolják.
  //* Aki mégis mindent kér (pl. sok teremcsere), az `everyLesson`-nel kapja.
  everyLesson: boolean;
};

export const DEFAULT_PREFS: PushPrefs = { classes: [], everyLesson: false };

//! AMIT A SERVICE WORKER MEGKAP. Szándékosan KÉSZ szöveg: a worker nem számol
//! és nem formáz, csak megjelenít. Ha a fogalmazás a workerben élne, minden
//! szövegjavításhoz meg kellene VÁRNI, amíg a régi worker mindenkinél lecserélődik
//! — az napokig tarthat.
export type PushPayload = {
  /** `lesson` = óra előtti emlékeztető, `change` = megváltozott az órarend. */
  kind: "lesson" | "change";
  title: string;
  body: string;
  /** Melyik lapot nyissa meg a koppintás. */
  url: string;
  //! A `tag` ÖSSZEVONÁS, NEM AZONOSÍTÓ. Azonos címkéjű értesítésből egyszerre
  //! csak egy áll a rendszersávban: az újabb LECSERÉLI a régit. Így egy
  //! késleltetett újraküldés nem rak ki két egyforma sort, és a tegnapi
  //! emlékeztető sem marad ott a mai mellett.
  tag: string;
};
