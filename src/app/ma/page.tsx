import type { Metadata } from "next";
import { MaPage } from "./ma-client";

export const metadata: Metadata = {
  title: "Ma – Órarend",
  description:
    "A mai nap egy képernyőn: mi megy most, mennyi van hátra, hova mész utána, és mozdult-e valami.",
};

export default function Page() {
  return <MaPage />;
}
