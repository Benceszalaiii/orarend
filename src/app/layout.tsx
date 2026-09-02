import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { AddToHomeScreen } from "@/components/pwa/add-to-home-screen";
import { RegisterSW } from "@/components/register-sw";

export const metadata: Metadata = {
  title: "Órarend",
  description:
    "A Jedlik heti órarendje teljes képernyőn: válaszd ki az osztályt, vond össze az ütköző csoportbontásokat.",
  applicationName: "Órarend",
  //* Telepítve iOS-en teljes képernyős alkalmazásként fut; a fekete áttetsző
  //* státuszsáv a `viewport-fit=cover`-rel együtt ér valamit.
  appleWebApp: {
    capable: true,
    title: "Órarend",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
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
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </head>
      <body
        className="min-h-dvh flex flex-col
 bg-card print:min-h-0"
      >
        {/*//! A `/ma` felület irányszerződése. Nem JSX-megjegyzésként, mert azt a
            //! fordító elnyeli: ennek a LEFORDÍTOTT kimenetben kell megmaradnia,
            //! hogy a döntés utólag is visszaolvasható legyen a laprol. */}
            
        {children}
            
        <RegisterSW />
        {/*//* A telepítés tippje csak iOS-en, csak egyszer — a döntést maga a
            //* komponens hozza meg (lásd `lib/a2hs.ts`). */}
        <AddToHomeScreen />
        <Analytics />
      </body>
    </html>
  );
}
