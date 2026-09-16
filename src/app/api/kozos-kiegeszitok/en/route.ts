import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/classroom-store";

//! ─── MIT ÍRHAT A BELÉPETT FELHASZNÁLÓ ──────────────────────────────────────
//! A felület ebből tudja, mutasson-e szerkesztő gombot. CSAK KÉNYELEM: az írást
//! a szerver minden kérésnél újra ellenőrzi. A böngésző csak tanárnál kérdezi
//! meg (a munkamenet `isTeacher` mezője alapján) — diáknál egy kör sem megy.
export const dynamic = "force-dynamic";

export async function GET() {
  const teacher = await requireTeacher();
  return NextResponse.json(
    { isTeacher: teacher !== null, short: teacher?.short ?? null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
