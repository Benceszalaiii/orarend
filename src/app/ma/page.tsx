import type { Metadata } from "next";
import { MaPage } from "./ma-client";

export const metadata: Metadata = {
  title: "Ma - Órarend",
  description:
    "A Győri SZC Jedlik Ányos technikum órarendje osztályokra, csoportbontásokra és duális hetekre bontva: heti rács teljes képernyőn, vagy a mai nap egyetlen képernyőn.",
};

export default function Page() {
  return <MaPage />;
}
