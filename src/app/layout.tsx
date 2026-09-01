import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Órarend",
  description:
    "A Jedlik heti órarendje teljes képernyőn, bejelentkezés nélkül is: válaszd ki az osztályt, vond össze az ütköző csoportbontásokat.",
};

//! A LAP A TELJES KIJELZŐT KÉRI. Fekvő telefonon a rács vízszintesen ér ki a
//! szélekig; `viewport-fit=cover` nélkül a böngésző fekete sávot hagyna a
//! bevágás mellett, és a hét egy oszlopnyival kevesebbet mutatna. Cserébe a
//! biztonságos sávokat NEKÜNK kell kikerülni — ezt a `.tt-safe` teszi meg a
//! rács keretén (lásd globals.css).
//* A `themeColor` a `--card` sötét értéke: a mobil böngésző fejléce így az
//* eszköztár folytatása lesz, nem egy fölé rakott másik felület.
export const viewport: Viewport = {
  themeColor: "#17181c",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="hu"
      className="dark h-full antialiased"
      style={{ colorScheme: "dark" }}
    >
      <body className="min-h-full flex flex-col bg-card print:min-h-0">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
