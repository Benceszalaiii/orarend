"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "./auth-client";
import { newPeerId, sanitizeNickname } from "./webrtc-shared";
import type { Me } from "./webrtc-signal";

//! ═══════════════════════════════════════════════════════════════════════════
//! KI VAGYOK EZEN A LAPON
//! ═══════════════════════════════════════════════════════════════════════════
//! KÉT DOLOGBÓL ÁLL, ÉS A KETTŐ NEM UGYANAZ:
//!
//!   • A POSTALÁDA CÍME (`peer`) — véletlen, lapbetöltésenként új. Ez nem
//!     azonosít senkit: csak annyit mond, hova küldjék a jelzést. Bezárt lap
//!     után a cím soha többé nem kerül elő, és a hozzá tartozó láda lejár.
//!   • A NÉV — a belépettnek a fiókjából, a vendégnek a saját becenevéből. A
//!     kettő közötti különbséget a felület KIÍRJA (lásd `RosterList`).
//!
//! A DÖNTÉST ITT NEM HOZZUK MEG, CSAK ELŐKÉSZÍTJÜK. Hogy melyik név érvényes,
//! azt a SZERVER dönti el minden egyes jelzésnél (`webrtc-identity.ts`): ha van
//! munkamenet, a fiók neve nyer, akkor is, ha a kliens becenevet küld. Ez a
//! horog tehát nem hitelesít — csak megmondja a felületnek, mit írjon ki, és
//! mit kell még bekérnie.
//!
//! A BECENÉV A GÉPEN MARAD, AMÍG A DIÁK NEM TÖRLI. Nem a szerveren tároljuk:
//! minden kérésbe beleírjuk, és a szerver ott helyben használja, majd elfelejti.
//! Nincs vendég-nyilvántartás.
//! ═══════════════════════════════════════════════════════════════════════════

const NICK_KEY = "orarend:webrtc:nick:v1";

export type Identity = {
  /** `null`, amíg a böngészőben le nem futott az első képkocka. */
  me: Me | null;
  /** A név, ahogy a többiek látni fogják. `null`: a vendég még nem adott meg. */
  name: string | null;
  verified: boolean;
  /** Hamis, amíg a vendég be nem írja a becenevét — addig nem lehet csatlakozni. */
  ready: boolean;
  nickname: string;
  setNickname: (value: string) => void;
};

export function useWebrtcIdentity(): Identity {
  const { data: session, isPending } = useSession();
  //! A CÍM CSAK A BÖNGÉSZŐBEN SZÜLETIK MEG. A `crypto.randomUUID()` a
  //! kiszolgálón is lefutna, de MÁS értéket adna, mint a hidratáláskor — a
  //! React ezt eltérésként jelezné. Ezért `null`-ról indulunk, és az első
  //! effektben töltjük fel.
  const [peer, setPeer] = useState<string | null>(null);
  const [nickname, setNicknameState] = useState("");

  useEffect(() => {
    setPeer(newPeerId());
    try {
      setNicknameState(window.localStorage.getItem(NICK_KEY) ?? "");
    } catch {
      /* privát módban nincs tárhely — a becenevet ilyenkor újra be kell írni */
    }
  }, []);

  const setNickname = useCallback((value: string) => {
    setNicknameState(value);
    try {
      const clean = sanitizeNickname(value);
      if (clean) window.localStorage.setItem(NICK_KEY, clean);
      else window.localStorage.removeItem(NICK_KEY);
    } catch {
      /* lásd fent */
    }
  }, []);

  //! ─── A `isPending` CSAK ELŐSZÖR JELENT BIZONYTALANSÁGOT ──────────────────
  //! A `useSession` a lap fókuszba kerülésekor ÚJRA lekérdez, és közben megint
  //! `isPending`-et mond. Ez nem ugyanaz, mint az első betöltés: akkor tényleg
  //! nem tudtuk, ki a felhasználó, most csak frissítünk.
  //!
  //! EZ NEM ELMÉLETI KÜLÖNBSÉG. Amíg nem tettünk különbséget, egy másik lapról
  //! VISSZAVÁLTÁS kidobta a nézőt a becenév-kapura — a felület leszerelte az
  //! élő nézetet, és ezzel BONTOTTA A KAPCSOLATOT, a kép közepén. A reteszt
  //! ezért kell: ami egyszer eldőlt, azt egy frissítés nem nyithatja ki újra.
  const settledRef = useRef(false);
  if (!isPending) settledRef.current = true;
  const settled = settledRef.current;

  const signedIn = settled && session !== null;
  const accountName = session?.user.name?.trim() || null;
  const nick = sanitizeNickname(nickname);

  //* A belépett felhasználó becenevét sosem küldjük: a szerver úgyis eldobná,
  //* és a kérés törzsében csak fölösleges adat lenne.
  const me: Me | null = peer
    ? { peer, nickname: signedIn ? null : nick }
    : null;

  return {
    me,
    name: signedIn ? (accountName ?? "Belépett diák") : nick,
    verified: signedIn,
    //* Az ELSŐ lekérdezés alatt még nem tudjuk, kell-e becenév — addig nem
    //* engedünk csatlakozni, nehogy a vendég-ág villanjon fel a belépettnek.
    ready: peer !== null && settled && (signedIn || nick !== null),
    nickname,
    setNickname,
  };
}
