"use client";

import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  SHEET_POPOVER,
  SheetItemBody,
  sheetItem,
} from "@/components/chrome/chrome-sheet";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  PALETTE_ACCENT,
  PALETTE_META,
  PALETTES,
  type Palette as PaletteName,
  type Theme,
} from "@/lib/appearance";
import type { ThemePreset } from "@/lib/theme-presets";
import { cn } from "@/lib/utils";
import {
  getThemePresetsAction,
  getThemePreviewCssAction,
  getViewerPresetAction,
  setThemePresetAction,
} from "./actions";
import { useAppearance } from "./use-appearance";

//! ═══════════════════════════════════════════════════════════════════════════
//! A MEGJELENÉS LAPJA — HÁROM KÉRDÉS, EGY HELYEN
//! ═══════════════════════════════════════════════════════════════════════════
//! A SORREND ITT IS GYAKORISÁG SZERINTI, ahogy a lap többi szakaszában (lásd
//! `chrome/chrome-sheet.tsx`): elöl a világos/sötét (ezt tényleg váltogatják,
//! akár naponta), utána a tantárgyszínek (félévente egyszer), végül a
//! tweakcn-paletta (a legtöbben soha).
//!
//! //! MINDEN VÁLASZTÁS AZONNAL ÉRVÉNYES, NINCS „MENTÉS" GOMB. Egy megjelenési
//! //! beállításnál a visszajelzés MAGA a lap: aki koppint, azonnal látja, mit
//! //! kapott, és ha nem tetszik, visszakoppint. Egy mentés-gomb itt csak egy
//! //! fölösleges lépés lenne két olyan állapot között, amelyek közül
//! //! mindkettő érvényes.
//! ═══════════════════════════════════════════════════════════════════════════

const THEME_OPTIONS: {
  value: Theme;
  label: string;
  icon: typeof Monitor;
}[] = [
  { value: "system", label: "Rendszer", icon: Monitor },
  { value: "light", label: "Világos", icon: Sun },
  { value: "dark", label: "Sötét", icon: Moon },
];

//! A MINTA VALÓDI TANTÁRGYRÖVIDÍTÉSEKBŐL KÉSZÜL, nem kitalált színsorból. Egy
//! absztrakt szivárvány nem árulná el, amit a diák tudni akar: hogy AZ Ő
//! órarendjében mennyire válik el egymástól két tantárgy. Ezek a magok
//! ugyanazon a képleten mennek át, mint az éles kártyák.
const SAMPLE_SEEDS = ["mat", "magy", "info", "tesi", "tört"];

function themeLabel(theme: Theme): string {
  return THEME_OPTIONS.find((o) => o.value === theme)?.label ?? "Rendszer";
}

//* A pöttyök a menüben KÖZVETLENÜL `oklch()`-t kapnak, nem az `--acc-h`
//* rendszert: itt egyszerre kell látszania mind az öt palettának, tehát
//* egyik sem lehet „az aktuális".
//*
//! A KÉPLET UGYANAZ, MINT A `.acc-dot`-É, a szorzóval és az eltolással együtt.
//! Ha a minta csak a fokot venné át, az `alkony` és a `nyar` a menüben MÁSNAK
//! látszana, mint a rácson — és pont az a dolga, hogy előre megmutassa.
function swatchColor(palette: PaletteName, seed: string, dark: boolean) {
  const { h, c, l } = PALETTE_ACCENT[palette](seed);
  const lightness = (dark ? 0.74 : 0.62) + l;
  const chroma = (dark ? 0.15 : 0.18) * c;
  return `oklch(${lightness} ${chroma} ${h})`;
}

function PaletteSwatch({
  palette,
  dark,
}: {
  palette: PaletteName;
  dark: boolean;
}) {
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-1">
      {SAMPLE_SEEDS.map((seed) => (
        <span
          key={seed}
          className="size-2.5 rounded-full"
          style={{ backgroundColor: swatchColor(palette, seed, dark) }}
        />
      ))}
    </span>
  );
}

//* A lapba ágyazott, MENTETT preset blokkja (`theme-style.tsx`). Az előnézet
//* idejére kikapcsoljuk; modulszintű függvény, hogy ne kelljen horog-függőségnek
//* felvenni.
const savedPresetStyle = () =>
  document.querySelector<HTMLStyleElement>("style[data-theme-preset]");

//! ─── A PRESET-VÁLASZTÓ ─────────────────────────────────────────────────────
//! Belépéshez kötött, és ez nem korlátozás, hanem következmény: a preset CSS-e
//! harmadik féltől jön, a szűrője a szerveren él, és a választás a
//! felhasználó sorába kerül (lásd `lib/theme-presets.ts`). Aki nincs belépve,
//! annak ez a szakasz meg sem jelenik — egy letiltott lista, ami csak
//! magyarázni tud, rosszabb a semminél.
function PresetPicker() {
  const [presets, setPresets] = useState<ThemePreset[] | null>(null);
  const [current, setCurrent] = useState<string>("");
  const [pending, setPending] = useState(false);
  //* A `null` azt jelenti: még nem tudjuk, be van-e lépve. Amíg így áll, a
  //* szakasz nem rajzol semmit.
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [list, slug] = await Promise.all([
        getThemePresetsAction(),
        getViewerPresetAction(),
      ]);
      if (!alive) return;
      //* Üres lista = vagy nincs belépve, vagy a tweakcn nem válaszolt.
      //* Mindkét esetben ugyanaz a helyes viselkedés: nem kínáljuk fel.
      setAvailable(list.length > 0);
      setPresets(list);
      setCurrent(slug);
    })();
    return () => {
      alive = false;
    };
  }, []);

  //! ─── AZ ELŐNÉZET ────────────────────────────────────────────────────────
  //! AMÍG A LISTÁN LÉPKEDSZ, A LAP MÁR ÚGY NÉZ KI. Egy paletta nevéből és négy
  //! pöttyéből nem lehet megítélni, milyen lesz vele EGY ÓRARENDET olvasni —
  //! azt csak a lap tudja megmutatni, önmagán.
  //*
  //* Két dolog kell hozzá, és mindkettő a súlyról szól: a beszúrt blokk
  //* duplázott szelektorral jön (`:root:root`), ÉS a mentett blokkot közben
  //* kikapcsoljuk — így egyetlen token sem szivárog át arról a presetről,
  //* amit épp nem néz.
  const previewRef = useRef<HTMLStyleElement | null>(null);
  const tokenRef = useRef(0);

  const stopPreview = useCallback(() => {
    tokenRef.current++;
    previewRef.current?.remove();
    previewRef.current = null;
    const saved = savedPresetStyle();
    if (saved) saved.disabled = false;
  }, []);

  const startPreview = useCallback(async (slug: string) => {
    const token = ++tokenRef.current;
    const saved = savedPresetStyle();
    if (saved) saved.disabled = true;

    //* A beépített palettának nincs felülírása: a mentett blokk kikapcsolása
    //* ÖNMAGÁBAN az előnézete.
    const css = slug ? await getThemePreviewCssAction(slug) : "";
    //! Közben elléphetett a mutató egy másik sorra (vagy be is csukhatta a
    //! lapot): a lassabb válasz nem írhatja felül a frissebb szándékot.
    if (token !== tokenRef.current) return;

    if (!previewRef.current) {
      previewRef.current = document.createElement("style");
      document.head.append(previewRef.current);
    }
    previewRef.current.textContent = css;
  }, []);

  //* Elnavigálás vagy leszerelés esetén se maradjon ott az előnézet.
  useEffect(() => stopPreview, [stopPreview]);

  const choose = useCallback(
    async (slug: string) => {
      setPending(true);
      try {
        await setThemePresetAction(slug || null);
        setCurrent(slug);
      } finally {
        //! AZ ELŐNÉZET LEBONTÁSA A MENTÉS UTÁN JÖN. Fordítva egy pillanatra
        //! visszaugrana a régi paletta, mielőtt a szerver válasza megérkezik.
        stopPreview();
        setPending(false);
      }
    },
    [stopPreview],
  );

  if (available !== true || !presets) return null;

  const rows = [
    { slug: "", title: "Órarend", description: "A beépített paletta" },
    ...presets,
  ];

  return (
    <section className="border-t border-border px-1.5 py-2">
      <h3 className="px-1.5 pb-1 text-[11px] font-semibold text-muted-foreground">
        Felület
      </h3>
      {/*//* A lista magassága korlátos: a tweakcn regiszterében több tucat
          //* preset van, és egy buborék nem nőhet a képernyő fölé. */}
      <div className="max-h-56 overflow-y-auto">
        {rows.map((preset) => {
          const active = current === preset.slug;
          return (
            <button
              key={preset.slug || "__default"}
              type="button"
              disabled={pending}
              onClick={() => void choose(preset.slug)}
              onPointerEnter={() => void startPreview(preset.slug)}
              onFocus={() => void startPreview(preset.slug)}
              onPointerLeave={stopPreview}
              onBlur={stopPreview}
              className={cn(
                "flex w-full min-h-9 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left",
                "hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                "disabled:opacity-60",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {preset.title}
              </span>
              {active && (
                <Check className="size-4 shrink-0 text-primary" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function AppearanceMenu({ className }: { className?: string }) {
  const { theme, palette, setTheme, setPalette, ready } = useAppearance();
  const [open, setOpen] = useState(false);

  //! A PÖTTYÖK VILÁGOSSÁGA A LÁTHATÓ TÉMÁHOZ IGAZODIK, nem a választotthoz.
  //! Ugyanaz a szabály, mint a `.acc-dot`-nál: sötét alapon fényesebb, világoson
  //! sötétebb. Aki „Rendszer"-en áll, annál ez a rendszer állásától függ —
  //! ezért kell a médialekérdezés, és nem elég a `theme`.
  //*
  //* Az induló érték szándékosan `true` (sötét): a szerveren nincs
  //* `matchMedia`, és a lap eddig is sötétben indult. A valódi érték a
  //* felcsatoláskor jön, a buborék megnyitása előtt.
  const [systemDark, setSystemDark] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystemDark(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const dark = theme === "system" ? systemDark : theme === "dark";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" data-key="m" className={sheetItem(className)}>
          <Palette
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <SheetItemBody
            label="Megjelenés"
            hint={
              ready
                ? `${themeLabel(theme)} · ${PALETTE_META[palette].label}`
                : "Világos vagy sötét, és a tantárgyak színe"
            }
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        {...SHEET_POPOVER}
        className="w-[min(20rem,calc(100vw-1.5rem))] p-0"
      >
        {/*//! ─── A LAP FELÜLETE ───────────────────────────────────────────── */}
        <section className="px-1.5 py-2">
          <h3 className="px-1.5 pb-1.5 text-[11px] font-semibold text-muted-foreground">
            A lap
          </h3>
          {/*//! HÁROM PIRULA EGY SORBAN, NEM KAPCSOLÓ. Egy kapcsoló csak két
              //! állapotot ismer, itt viszont három van — és a harmadik
              //! („Rendszer") nem a másik kettő közötti középút, hanem az, hogy
              //! NEM MI döntünk. Ezt egy kapcsoló nem tudja kimondani. */}
          {/* biome-ignore lint/a11y/useSemanticElements: kapcsológombok csoportja, nem űrlapmezőké — ugyanaz az érv, mint a nézetváltónál (`chrome/standing-line.tsx`) */}
          <div
            role="group"
            aria-label="A lap felülete"
            className="flex items-center gap-1 rounded-lg bg-muted/60 p-1"
          >
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = ready && theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    "flex min-h-9 flex-1 touch-target items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>

        {/*//! ─── A TANTÁRGYAK SZÍNE ───────────────────────────────────────── */}
        <section className="border-t border-border px-1.5 py-2">
          <h3 className="px-1.5 pb-1 text-[11px] font-semibold text-muted-foreground">
            Tantárgyszínek
          </h3>
          {/* biome-ignore lint/a11y/useSemanticElements: ugyanaz — öt kapcsológomb, nem rádiómezők */}
          <div
            role="group"
            aria-label="Tantárgyszínek"
            className="flex flex-col gap-0.5"
          >
            {PALETTES.map((name) => {
              const active = ready && palette === name;
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPalette(name)}
                  className={cn(
                    "flex w-full min-h-11 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors",
                    "hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
                    active && "bg-muted",
                  )}
                >
                  <PaletteSwatch palette={name} dark={dark} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {PALETTE_META[name].label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {PALETTE_META[name].hint}
                    </span>
                  </span>
                  {active && (
                    <Check
                      className="size-4 shrink-0 text-primary"
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <PresetPicker />
      </PopoverContent>
    </Popover>
  );
}
