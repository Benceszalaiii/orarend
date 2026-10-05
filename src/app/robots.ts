import type { MetadataRoute } from "next";
import {
  DISALLOWED_AI_ROBOTS_TOKENS,
  LLM_CLOSED_PREFIX,
  LLM_DOC_PATH,
  LLM_OPEN_PREFIX,
  USER_TRIGGERED_ROBOTS_TOKENS,
} from "@/lib/ai-bots";

//! ─── A KIÍRT SZABÁLY ───────────────────────────────────────────────────────
//! Három csoport (mindenki; az AI-robotok; az ember indította asszisztensek), és a sorrendjük nem számít: a robot
//! mindig a RÁ NÉZVE legpontosabb blokkot követi, a `*` csak az marad, akit
//! senki más nem nevezett meg.
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
      //! AZ AI-ROBOT A GÉPNEK SZÁNT AJTÓN JÖHET BE, MÁSHOL NEM. A `/llms.txt`
      //! és az `/api` nyitva, a naptár-feed és a lapok zárva. A leghosszabb
      //! egyezés dönt: az `/api/naptar` tiltása hosszabb az `/api/` engedélyénél,
      //! az pedig a `/` tiltásánál.
      {
        userAgent: [...DISALLOWED_AI_ROBOTS_TOKENS],
        allow: [LLM_DOC_PATH, LLM_OPEN_PREFIX],
        disallow: ["/", LLM_CLOSED_PREFIX],
      },
      //! AZ EMBER INDÍTOTTA ASSZISZTENS BEJÖHET A LAPOKRA IS. Ha a `/` tiltva
      //! van neki, a nyitólapnál megáll, és azt mondja, hogy „a robots.txt
      //! blokkol" — a JSON-ig el sem jut. A lap HTML-jét így sem kapja meg: a
      //! `proxy.ts` a lap gépi párjára küldi tovább (lásd `lib/ai-bots.ts`).
      {
        userAgent: [...USER_TRIGGERED_ROBOTS_TOKENS],
        allow: ["/"],
        disallow: [LLM_CLOSED_PREFIX],
      },
    ],
    sitemap: "https://jedlik.info/sitemap.xml",
  };
}
