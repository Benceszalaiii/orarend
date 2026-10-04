import type { Metadata } from "next";
import { TantargyakPage } from "./tantargyak-client";

export const metadata: Metadata = {
  title: "Tantárgyak - Jedlik Info",
  description:
    "Tantárgyanként: ki tanítja, és melyik osztálynak — a tanári és az osztály órarendjére vezető linkekkel.",
};

export default function Page() {
  return <TantargyakPage />;
}
