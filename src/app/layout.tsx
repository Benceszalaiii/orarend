import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { PrefsSync } from "@/components/prefs-sync";
import { AddToHomeScreen } from "@/components/pwa/add-to-home-screen";
import { RegisterSW } from "@/components/register-sw";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});


//* A DEKORÁCIÓS BETŰ. Csak ott szólal meg, ahol a `font-script` osztály
//* kimondja — a törzsszöveg marad a rendszerbetűn.
//! NINCS ELŐTÖLTVE: 166 kB-os TTF, és a lap nagy részén egy betű sem íródik
//! vele. `preload: false` mellett a böngésző csak akkor tölti le, ha tényleg
//! rajzol vele; a `swap` addig a `cursive` tartalékkal ír.
const petitFormalScript = localFont({
  src: "../../public/PetitFormalScript-Regular.ttf",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: false,
  fallback: ["cursive"],
  variable: "--font-petit-formal-script",
});

const jakartaSans = localFont({
  src: "../../public/Lexend-VariableFont_wght.ttf",
  weight: "100 700",
  style: "normal",
  display: "swap",
  preload: false,
  fallback: ["sans-serif"],
  variable: "--font-jakarta-sans",
});

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
      className={cn("dark", "h-full", "antialiased", petitFormalScript.variable, jakartaSans.variable, "font-sans", geist.variable)}
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
        {/*//! A BEÁLLÍTÁS-SZINKRON MOTORJA. Nem rajzol semmit; azért ül a
            //! gyökérben, mert a lap MINDEN nézetéből lehet beállítást
            //! módosítani, és mindegyiket ugyanaz a kör kell hogy felvigye.
            //*
            //! ÁRA EGY KÉRÉS OLDALBETÖLTÉSENKÉNT: a munkamenet lekérdezése
            //! (`/api/auth/get-session`) a be nem jelentkezett látogatónál is
            //! lefut egyszer. A fiókgombbal KÖZÖS ez az egy kérés (a Better Auth
            //! kliense összevonja őket), és pár száz bájt — ezért fér bele.
            //! Aki nincs bejelentkezve, annál ezen az egy kérésen túl semmi nem
            //! történik: se szinkron, se további hálózati forgalom. */}
        <PrefsSync />
        {/*//* A telepítés tippje csak iOS-en, csak egyszer — a döntést maga a
            //* komponens hozza meg (lásd `lib/a2hs.ts`). */}
        <AddToHomeScreen />
        <Analytics />
      </body>
    </html>
  );
}
