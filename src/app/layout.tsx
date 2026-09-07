import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { Geist } from "next/font/google";
import { AppearanceScript } from "@/components/appearance/appearance-script";
import { ThemeStyle } from "@/components/appearance/theme-style";
import { PrefsSync } from "@/components/prefs-sync";
import { AddToHomeScreen } from "@/components/pwa/add-to-home-screen";
import { RegisterSW } from "@/components/register-sw";
import { cn } from "@/lib/utils";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

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
  variable: "--font-lexend",
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
//*
//! A `themeColor` MINDKÉT TÉMÁRA MEGVAN, mert a mobil böngésző fejléce nem
//! követi a lapot magától. Amíg az Órarend csak sötét volt, egyetlen fix érték
//! is helyes volt; világos módban ugyanaz a sötét sáv egy fehér lap fölött ülne
//! — pont az a „fölé rakott másik felület", amit el akarunk kerülni. A két
//! érték a `--card` világos, illetve sötét változata.
//*
//! EZT A BÖNGÉSZŐ A MÉDIALEKÉRDEZÉSBŐL DÖNTI EL, NEM A MI VÁLASZTÁSUNKBÓL —
//! vagyis aki a rendszerével szemben állít témát, annál a sáv a rendszert
//! követi. Nincs jobb: a `theme-color` meta a HTML-ben áll, a választás pedig
//! a `localStorage`-ban, amit a `<meta>` nem lát. Ez egy sáv színe egyetlen
//! ellentmondó beállítás mellett — nem éri meg érte kérésenként rendereltetni
//! a lapot.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9f9" },
    { media: "(prefers-color-scheme: dark)", color: "#17181c" },
  ],
  colorScheme: "light dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    //! A `dark` OSZTÁLY ÉS A `colorScheme` INNEN KIKERÜLT, ÉS EZ A VÁLTOZÁS
    //! LÉNYEGE. Amíg itt álltak, a lapnak nem volt világos módja — a `:root`
    //! világos paletta ott ült a `globals.css`-ben, csak sosem szólalt meg.
    //! Mindkettőt a festés előtti szkript írja most (`AppearanceScript`), a
    //! felhasználó választása szerint.
    //*
    //! `suppressHydrationWarning`: a szkript MEGVÁLTOZTATJA ezt az elemet,
    //! mielőtt a React megnézné. Enélkül a React eltérést jelentene, és a lap
    //! egy darabját újrarenderelné — épp azt a villanást hozva vissza, ami
    //! elől a szkript idekerült.
    <html
      lang="hu"
      suppressHydrationWarning
      className={cn(
        "h-full",
        "antialiased",
        petitFormalScript.variable,
        jakartaSans.variable,
        "font-sans",
        geist.variable,
      )}
    >
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        {/*//! A LEGELSŐ DOLOG A `<head>`-BEN, ÉS EZ NEM ÍZLÉS: ami fölé kerülne,
            //! az már az alapállapotú lappal festhetne. */}
        <AppearanceScript />
      </head>
      <body
        className="min-h-dvh flex flex-col
 bg-card print:min-h-0"
      >
        {/*//! A `/ma` felület irányszerződése. Nem JSX-megjegyzésként, mert azt a
            //! fordító elnyeli: ennek a LEFORDÍTOTT kimenetben kell megmaradnia,
            //! hogy a döntés utólag is visszaolvasható legyen a laprol. */}

        {/*//! A BELÉPETT FELHASZNÁLÓ tweakcn-PALETTÁJA. Szerveroldalon dől el,
            //! mert harmadik féltől jövő CSS-t kell hozzá szűrni — a
            //! világos/sötét és a tantárgyszínek NEM ezen az úton járnak (lásd
            //! `components/appearance/theme-style.tsx`). Aki nem választott,
            //! annál ez `null`-t ad: se lekérés, se beágyazott stílus. */}
        <ThemeStyle />

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
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
