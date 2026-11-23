import type { Metadata } from "next";
import { TeremPage } from "./terem-client";

export const metadata: Metadata = {
  title: "Terem - Jedlik Info",
  description:
    "Egy terem heti órarendje teljes képernyőn: mikor, melyik osztály és melyik tanár van benne.",
};

export default function Page() {
  return <TeremPage />;
}
