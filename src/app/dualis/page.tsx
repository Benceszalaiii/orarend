import type { Metadata } from "next";
import { DualisPage } from "./dualis-client";

export const metadata: Metadata = {
  title: "Duális képzés – Órarend",
  description: "Mutatja, hogy ma duális képzés vagy iskolai nap van-e.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <DualisPage />;
}
