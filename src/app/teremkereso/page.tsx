import type { Metadata } from "next";
import { TeremkeresoPage } from "./teremkereso-client";

export const metadata: Metadata = {
  title: "Teremkereső",
  description:
    "Melyik terem üres most: szabad termek óránkénti bontásban, azzal együtt, hogy meddig maradnak azok.",
};

export default function Page() {
  return <TeremkeresoPage />;
}
