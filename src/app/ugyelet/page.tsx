import type { Metadata } from "next";
import { UgyeletPage } from "./ugyelet-client";

export const metadata: Metadata = {
  title: "Ügyelet – Órarend",
  description:
    "Folyosóügyelet egy képernyőn: ki ügyel most és hol, mikor jön a következő szünet, és kié a napi vezetői ügyelet.",
};

export default function Page() {
  return <UgyeletPage />;
}
