import type { Metadata } from "next";
import { DesignPage } from "./design-client";

//! A `/ma` KORÁBBI ALAKJA, ÖSSZEHASONLÍTÁSRA. Ugyanaz az adat és ugyanazok a
//! komponensek, egyhasábos elrendezésben — lásd a `design-client.tsx`
//! fejlécét. A nézetváltóban szándékosan nem szerepel: a diákok lapja a `/ma`.
export const metadata: Metadata = {
  title: "Ma (egyhasábos) – Órarend",
  description:
    "A `/ma` korábbi elrendezése: a mai nap egy folyamatos hasábban.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <DesignPage />;
}
