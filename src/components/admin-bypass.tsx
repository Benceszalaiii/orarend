"use client";

import { EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

//! AZ ÜZEMELTETŐ ÁTLÁTHAT A HIBAKÉPERNYŐN. Ha a Jedlikinfo API áll, a diáknak
//! a hibaüzenet a helyes válasz — az üzemeltetőnek viszont épp ilyenkor kell
//! látnia, hogyan viselkedik a felület üres vagy hiányos adattal. A gomb csak
//! az `isAdmin` fióknak jelenik meg; semmit nem old fel, amit a szerver őriz,
//! csak a már letöltött (akár üres) nézetet rajzolja ki a hiba helyett.
export function AdminBypassButton({
  onBypass,
  className,
}: {
  onBypass: () => void;
  className?: string;
}) {
  const { data: session } = useSession();
  if (session?.user.isAdmin !== true) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onBypass}
      className={cn("h-8 touch-target rounded-full px-3 text-xs", className)}
    >
      <EyeOff aria-hidden />
      Megjelenítés így is
    </Button>
  );
}
