import type { MetadataRoute } from "next";
import { clubsLaunched } from "@/lib/club-access";

//! A GYÖKÉR MOST MÁR ÖNÁLLÓ LAP, EZÉRT ITT A HELYE. Amíg a `/` egy
//! kliensoldali átirányítás volt, semmi értelme nem lett volna felvenni: a
//! robot egy üres vázat talált rajta. Ma a nyitólap áll a címen (lásd
//! `app/page.tsx`), és ez a lap mondja el, mit tud az oldal — a keresésből
//! érkezőnek ez az első képernyő.
//*
//! A `/home` SZÁNDÉKOSAN NINCS ITT: ugyanaz a tartalom, és a kanonikus
//! hivatkozása a gyökérre mutat. Kétszer beküldeni ugyanazt a lapot csak
//! önmagunkkal versenyeztetné.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://jedlik.info/",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: "https://jedlik.info/orarend",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: "https://jedlik.info/tanari",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    //* Az iskolai lapok (lásd `chrome/places.ts`). A kivetítés nincs itt: az
    //* termenkénti link, és a lapja `noindex`.
    {
      url: "https://jedlik.info/ugyelet",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.6,
    },
    {
      url: "https://jedlik.info/teremkereso",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.6,
    },
    {
      url: "https://jedlik.info/tantargyak",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    //! A SZAKKÖRÖK ÉS A VERSENYEK CSAK A BEVEZETÉS UTÁN. Előtte a robot 404-et
    //! kapna rájuk (lásd `canBrowseClubs`) — egy beküldött, de nem létező lap
    //! a keresőnek hibának számít. Az egyes szakkörök lapjai nincsenek itt: a
    //! listából mind elérhető, és a lista frissebb, mint egy napi sitemap.
    ...(clubsLaunched()
      ? ([
          {
            url: "https://jedlik.info/szakkorok",
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 0.6,
          },
          {
            url: "https://jedlik.info/versenyek",
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 0.6,
          },
        ] satisfies MetadataRoute.Sitemap)
      : []),
  ];
}
