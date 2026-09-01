import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { RegisterSW } from "@/components/register-sw";

export const metadata: Metadata = {
  title: "Órarend",
  description:
    "A Jedlik heti órarendje teljes képernyőn, bejelentkezés nélkül is: válaszd ki az osztályt, vond össze az ütköző csoportbontásokat.",
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

const DIRECTION_CONTRACT = `<!--
IMPECCABLE DIRECTION CONTRACT — surface: /ma („Ma”) — seed efeae273

THESIS: The day answers itself — a live panel over a scrubbable strip. Refuses
the scrolling agenda list every timetable app ships.
OWN-WORLD: The jedlik-szakkor personal-home grammar. Crest light-field over the
page ground; translucent hero blocks; SectionRow headings over divide-y list
groups; tabular numerals. The twelve subject hues are dots and text only, never
fills. Red is reserved for live and action.
STORY: A student on a ten-minute break sees what is running, its room, the time
left, where they go next, and whether anything moved — then, beside it, which
day of the week is heavy and what moved anywhere in it.
FIRST VIEWPORT: Controls, date, day facts; a hero block where the time is the
largest element, over subject, room and teacher as icon rows. Below: the day as
a neutral proportional ribbon over a list of its lessons, with the week's
panels alongside from lg up.
FORM: Dashboard over the day — replaced the dealt "Most + Utána" at the user's
direction; seed efeae273.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
-->`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="hu"
      className="dark h-full antialiased"
      style={{ colorScheme: "dark" }}
    >
      <body className="min-h-full flex flex-col bg-card print:min-h-0">
        {/*//! A `/ma` felület irányszerződése. Nem JSX-megjegyzésként, mert azt a
            //! fordító elnyeli: ennek a LEFORDÍTOTT kimenetben kell megmaradnia,
            //! hogy a döntés utólag is visszaolvasható legyen a laprol. */}
        <div
          hidden
          // biome-ignore lint/security/noDangerouslySetInnerHtml: állandó szöveg, kizárólag HTML-megjegyzés.
          dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }}
        />
        {children}
        <RegisterSW />
        <Analytics />
      </body>
    </html>
  );
}
