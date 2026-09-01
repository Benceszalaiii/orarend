import type { MetadataRoute } from "next";

//! ─── TELEPÍTHETŐ LAP ───────────────────────────────────────────────────────
//! A napi nézetet a szünetben nyitják meg, a folyosón, egy kézzel. Egy
//! kezdőképernyőre kitett ikon két koppintással odaér; egy böngészőbe beírt cím
//! nem. Ezért van manifest.
//*
//* `start_url: "/ma"` — a `/` továbbra is a heti rácsra visz (az a lap
//* alapértelmezett nézete), de az IKON a napi nézetet nyitja: aki kiteszi a
//* kezdőképernyőre, az nem a hetet keresi.
//*
//* `theme_color` a `--card` sötét értéke, ugyanaz, ami a `layout.tsx`-ben áll:
//* az álló eszköztár így az alkalmazás folytatása lesz, nem egy fölé rakott sáv.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Órarend — Jedlik",
    short_name: "Órarend",
    description:
      "A mai nap egy képernyőn: mi megy most, mennyi van hátra, és hova mész utána.",
    lang: "hu",
    start_url: "/ma",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#17181c",
    theme_color: "#17181c",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      //* Android a maszkolható ikont a saját alakjára vágja — ebben ezért
      //* nagyobb a margó, hogy a jel a körön belül maradjon.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Mai nap", short_name: "Ma", url: "/ma" },
      { name: "Heti órarend", short_name: "Hét", url: "/orarend" },
    ],
  };
}
