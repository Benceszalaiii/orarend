import type { Metadata } from "next";
import { TanariPage } from "./tanari-client";

export const metadata: Metadata = {
  title: "Tanári órarend",
  description:
    "Egy tanár heti órarendje teljes képernyőn: melyik osztályhoz, melyik terembe és mikor kell menni.",
};

export default function Page() {
  return <TanariPage />;
}
