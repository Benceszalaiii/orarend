import type { Metadata } from "next";
import { KivetitesIndex } from "./kivetites-client";

export const metadata: Metadata = {
  title: "Kivetítés",
  description:
    "A termek kivetítői egy helyen: a tanár egyszer beállítja, a diák egy koppintással nézi.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <KivetitesIndex />;
}
