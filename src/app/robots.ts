import type { MetadataRoute } from "next";
import {
  DISALLOWED_AI_ROBOTS_TOKENS,
  LLM_DOC_PATH,
  LLM_OPEN_PATHS,
  USER_TRIGGERED_AI_AGENTS,
} from "@/lib/ai-bots";

//! ─── A KIÍRT SZABÁLY ───────────────────────────────────────────────────────
//! Három csoport (mindenki; az ember indította AI-asszisztens; a többi
//! AI-robot), és a sorrendjük nem számít: a robot mindig a RÁ NÉZVE
//! legpontosabb blokkot követi, a `*` csak az marad, akit senki más nem
//! nevezett meg.
//*
//! Ez a lap NEM zár ki minden robotot — a keresőt kifejezetten várjuk. Aki
//! találatot ad, az embert hoz ide; aki tanítóanyagot gyűjt vagy kész választ
//! épít a tartalomból, az csak elvisz. A névsor és az indoklás a
//! `lib/ai-bots.ts`-ben van, mert ugyanabból a listából dolgozik a `proxy.ts`
//! is — a kiírt szabály és a betartatás nem csúszhat szét.
//*
//! A ROBOTS.TXT KÉRÉS, NEM ZÁR. Aki betartja, el se jut a kapuig; aki nem, azt
//! a `proxy.ts` fogadja 403-mal. Ettől még ki kell írni: a Google-Extended és
//! az Applebot-Extended mögött nincs külön robot, amit el lehetne kapni — ott
//! ez az egyetlen létező eszköz.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/orarend"],
        //! A NAPTÁR-FEED CÍME SENKI KERESŐJÉBEN NINCS KERESNIVALÓJA. Nem ez
        //! védi (a védelem a kitalálhatatlan jegy, lásd `/api/naptar`), de egy
        //! véletlenül kiírt vagy megosztott linket egy kereső sem kell hogy
        //! indexeljen. A válasz maga is `X-Robots-Tag: noindex`-et visel.
        disallow: ["/api/naptar/"],
      },
      //! AZ EMBER INDÍTOTTA ASSZISZTENS A JSON-VÉGPONTOKAT IS ELÉRI (lásd
      //! `LLM_OPEN_PATHS`). Külön blokk, mert a robot a RÁ NÉZVE legpontosabb
      //! blokkot követi — ha a lenti közösben is benne volna, ez nem érvényesülne.
      {
        userAgent: [...USER_TRIGGERED_AI_AGENTS],
        allow: [LLM_DOC_PATH, ...LLM_OPEN_PATHS],
        disallow: ["/"],
      },
      //* A `/llms.txt` nekik is olvasható: csak leírás, és a leghosszabb
      //* egyezés szabálya szerint felülírja a `/` tiltását.
      {
        userAgent: DISALLOWED_AI_ROBOTS_TOKENS.filter(
          (token) => !USER_TRIGGERED_AI_AGENTS.includes(token),
        ),
        allow: [LLM_DOC_PATH],
        disallow: ["/"],
      },
    ],
    sitemap: "https://jedlik.info/sitemap.xml",
  };
}
