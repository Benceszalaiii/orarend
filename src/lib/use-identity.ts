"use client";

import { useEffect, useState } from "react";
import { DEFAULT_IDENTITY, type Identity, loadIdentity } from "./identity";
import { onPrefsChanged } from "./prefs-events";

//! A TÁROLT ALANY, ÚTVONAL NÉLKÜL. A `chrome/standing-line.tsx` saját
//! `useIdentity`-je ELŐSZÖR az útvonalat kérdezi (`/orarend` → diák,
//! `/tanari` → tanár), és csak utána a tárolót — neki a sáv MINDEN lapon
//! helyes cellát kell mutasson. A `/ma` viszont EGY útvonal mindkét alanynak:
//! ott az útvonal nem mond semmit, és a tárolt érték az egyetlen forrás.
//! Ezért ez a horog nem a másiknak a másolata, hanem a másik fele.
//*
//* Kiszolgálón és az első képkockán az alapértelmezés fut — így a hidratálás
//* nem talál eltérést. A `null` (még sosem járt alanyt író lapon) ugyanaz,
//* mint az alapértelmezés: a `/ma` a diákét mutatja.
export function useStoredIdentity(): Identity {
  const [identity, setIdentity] = useState<Identity>(DEFAULT_IDENTITY);

  useEffect(() => {
    const sync = () => setIdentity(loadIdentity() ?? DEFAULT_IDENTITY);
    sync();
    //* A sáv mátrixa `saveIdentity`-vel ír, az pedig `notifyPrefsChanged`-et
    //* jelez: a lap így ugyanabban a képkockában vált alanyt, ahogy a cella.
    return onPrefsChanged(sync);
  }, []);

  return identity;
}
