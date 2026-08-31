import type { Metadata } from "next";
import { OrarendPage } from "./orarend-client";

export const metadata: Metadata = {
  title: "Órarend",
  description:
    "A Jedlik heti órarendje teljes képernyőn: válaszd ki az osztályt, vond össze az ütköző csoportbontásokat.",
};

export default function Page() {
  return <OrarendPage />;
}
