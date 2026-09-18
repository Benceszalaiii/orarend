"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

//! ═══════════════════════════════════════════════════════════════════════════
//! A SZÍNPAD — EGY `<video>`, ÉS AMI KÖRÜLÖTTE SZÁMÍT
//! ═══════════════════════════════════════════════════════════════════════════
//! A RÉGI NÉZŐ KÉPKOCKÁNKÉNT ÚJ KÉPELEMET RAKOTT KI (lásd `screentask-viewer.tsx`),
//! mert a ScreenTask egyetlen, újra és újra lekért JPEG-et adott. Itt ez az
//! egész gépezet eltűnik: a `<video>` egy folyamatos sávot kap, a böngésző
//! rajzol, mi nem csinálunk semmit. Nincs villanás, nincs időkorlát, nincs
//! újrapróbálkozás — és nincs másodpercenként két HTTP-kérés sem.
//!
//! `muted` ÉS `playsInline`, ÉS MINDKETTŐ KÖTELEZŐ. Hang amúgy sincs a sávon
//! (a megosztó `audio: false`-szal kér), de néma nélkül a böngészők
//! automatikus lejátszási szabálya megállítaná a videót, mielőtt elindulna. A
//! `playsInline` pedig azt akadályozza meg, hogy iPhone-on a kép teljes
//! képernyős lejátszóba ugorjon, KISZAKÍTVA A LAPBÓL — és vele a csevegést is
//! elvinné a képernyőről. A teljes képernyő itt a SZÍNHÁZÉ, nem a videóé
//! (lásd `Theatre`, `webrtc-client.tsx`).
//!
//! A MÉRETET A SZÜLŐ ADJA. Ez az elem `size-full` — hogy ugyanaz a komponens
//! álljon egy 16:9-es dobozban a lapon és a teljes képernyő bal oldalán,
//! a csevegés mellett.
//! ═══════════════════════════════════════════════════════════════════════════

export function Stage({
  screen,
  label,
  overlay,
  className,
}: {
  screen: MediaStream | null;
  label: string;
  /** Állapotüzenet a kép helyén (kapcsolódás, megszakadt, vége). */
  overlay?: React.ReactNode;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  //! A SÁVOT TULAJDONSÁGKÉNT ADJUK ÁT, NEM `src`-KÉNT. A `srcObject` nem
  //! attribútum: JSX-ből nem állítható, csak az elemen. Ezért kell ide effekt.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = screen;
    if (screen) {
      //* Safari néha nem indítja el magától, pedig néma — a `play()` ígéretét
      //* elnyeljük, mert az elutasítás itt nem jelent hibát.
      video.play().catch(() => {});
    }
  }, [screen]);

  return (
    <div className={cn("relative size-full bg-black", className)}>
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        aria-label={label}
        className={cn(
          "size-full object-contain",
          //* Amíg nincs kép, a fekete háttér látszik — nem egy üres videóelem.
          screen ? "opacity-100" : "opacity-0",
        )}
      />

      {/*//! AZ ÜZENET A KÉP FÖLÖTT ÁLL, TEHÁT SAJÁT HÁTTERET KELL VINNIE. Egy
          //! megszakadt kapcsolatnál az UTOLSÓ KÉPKOCKA ott marad a háttérben
          //! (szándékosan — lásd `webrtc-viewer.ts`), és egy világos dián a
          //! fehér betű olvashatatlan lenne. A doboz csak akkor van ott, ha van
          //! mit mondani. */}
      {overlay && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">
          <div className="pointer-events-auto max-w-full rounded-xl bg-black/75 px-4 py-3 ring-1 ring-white/10 backdrop-blur-sm">
            {overlay}
          </div>
        </div>
      )}
    </div>
  );
}

//* A színpad fejlécében álló állapotpont — ugyanaz a nyelv, mint a régi
//* nézőben: zöld él, piros megszakadt, pulzáló szürke kapcsolódik.
export function LinkDot({ tone }: { tone: "live" | "wait" | "lost" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 shrink-0 rounded-full",
        tone === "live" && "bg-emerald-500",
        tone === "lost" && "bg-red-500",
        tone === "wait" && "animate-pulse bg-muted-foreground",
      )}
    />
  );
}
