import type { Metadata } from "next";
import { WebrtcPage } from "./webrtc-client";

//! PRÓBALAP, EZÉRT `noindex`. Nem azért, mert titok — hanem mert a keresőből
//! ide érkező látogatónak semmit nem ad: a lap tartalma az, ami ÉPP megy a
//! suliban, és az kereséssel nem található meg. Ugyanez az elv, mint a
//! `/kivetites`-nél.
export const metadata: Metadata = {
  title: "Képernyőmegosztás - Órarend",
  description:
    "Képernyőmegosztás böngészőből, telepítés nélkül: a kép közvetlenül a két gép között megy, a szerver csak a kapcsolatot ismerteti össze.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <WebrtcPage />;
}
