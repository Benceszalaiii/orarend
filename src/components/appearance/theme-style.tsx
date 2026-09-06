import { headers } from "next/headers";
import { cache } from "react";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getThemePresetCss } from "@/lib/theme-presets";

//* Kérésenként egyszer fut le, akárhányszor kérdezik — a React `cache()` a
//* renderelésen belül deduplikál. Két hívója van (ez a `<style>` és a
//* választó szerver-burka, ami a kijelölést mutatja), és ettől sincs második
//* adatbázis-kör.
export const getViewerPresetSlug = cache(async (): Promise<string> => {
  //! EZ A LEKÉRDEZÉS A GYÖKÉRELRENDEZÉSBEN FUT, TEHÁT A LAP MINDEN OLDALÁN. Ami
  //! itt kivételt dob, az nem egy hiányzó palettát okoz, hanem 500-at az EGÉSZ
  //! alkalmazásra — a heti rácsra, a mai napra, a belépésre is. Egy dísz nem
  //! dönthet így az egész lap sorsáról.
  //*
  //! A KÉT VALÓS ESET, AMIÉRT EZ NEM ELMÉLETI: (1) a `themePreset` oszlop még
  //! nincs kint az adatbázisban (`bun run db:push` elmaradt egy telepítésnél),
  //! (2) az adatbázis épp nem elérhető. Mindkettőnél a helyes válasz ugyanaz:
  //! a beépített paletta, némán.
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return "";

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { themePreset: true },
    });

    return me?.themePreset ?? "";
  } catch {
    return "";
  }
});

//! ═══════════════════════════════════════════════════════════════════════════
//! A VÁLASZTOTT PRESET, A HTML-BE ÁGYAZVA
//! ═══════════════════════════════════════════════════════════════════════════
//! MIÉRT SZERVEROLDALON, AMIKOR A TÉMA ÉS A PALETTA A BÖNGÉSZŐBEN LAKIK? Mert
//! ez a CSS harmadik féltől jön, és a szűrője nem kerülhet a kliensre (lásd
//! `lib/theme-presets.ts`). Ha a lap kliensoldalon töltené be, két baj lenne:
//!   1. VILLANÁS: a csere mindig az alap-paletta felvillanása UTÁN érkezne.
//!   2. HIDRATÁLÁS: ami a szerveren és a kliensen máshogy renderel, azt a
//!      React eldobja és újrarendereli.
//!
//! //! AZ ÁRA, KIMONDVA: ez a komponens munkamenetet olvas (`headers()`), tehát
//! //! a GYÖKÉRELRENDEZÉS kérésenként rendereldik — a lap egyetlen oldala sem
//! //! marad statikusan előre gyártott. Ezt tudatosan vállaltuk, cserébe azért,
//! //! hogy a preset villanás nélkül és biztonságosan szűrve érkezzen. A
//! //! világos/sötét és a tantárgyszínek NEM ezen az úton járnak: azok a festés
//! //! előtti szkriptből jönnek (`appearance-script.tsx`), és belépés nélkül,
//! //! offline is működnek.
//!
//! A GYORSÍTÓTÁR A DRÁGA RÉSZEN ÜL: a tweakcn-hívás a Next adat-gyorsítótárában
//! pihen (napi újratöltés + címke), tehát preset-enként egyszer megy ki kérés,
//! nem felhasználónként. A beágyazott CSS ~2 kB.
//! A `<style>` a `<body>` elején áll, mert a Next a `<head>`-et maga kezeli; a
//! kaszkádban így is a `globals.css` UTÁN van, ami a lényeg.
//! ═══════════════════════════════════════════════════════════════════════════
export async function ThemeStyle() {
  const slug = await getViewerPresetSlug();
  if (!slug) return null;

  const css = await getThemePresetCss(slug);
  if (!css) return null;

  return (
    <style
      data-theme-preset={slug}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: a CSS csak nyers szövegként adható ki; a tartalom tokennév- és érték-szinten szűrve van (src/lib/theme-presets.ts)
      dangerouslySetInnerHTML={{ __html: css }}
    />
  );
}
