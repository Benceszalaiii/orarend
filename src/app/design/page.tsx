import type { Metadata } from "next";
import { DesignPage } from "./design-client";

//! A `/ma` ÁTRENDEZETT ALAKJA — kapcsolóra váró kísérlet. Ugyanaz az adat,
//! ugyanazok a komponensek; ami más, az a lap szerkezete (lásd a
//! `design-client.tsx` fejlécét). A nézetváltóban szándékosan NEM szerepel:
//! ez még nem a diákok lapja, hanem a következő `/ma` próbája.
export const metadata: Metadata = {
  title: "Ma (átrendezve) – Órarend",
  description:
    "A mai nap egy képernyőn — lapozható napokkal és állandó „most” sorral.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <DesignPage />;
}
