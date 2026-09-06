import type { MetadataRoute } from "next";

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
  ];
}
