import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SignInPanel } from "./sign-in-panel";

export const metadata: Metadata = {
  title: "Belépés - Órarend",
  description:
    "Belépés az iskolai fiókkal, hogy az órarend-beállításaid átjöjjenek a többi eszközödre.",
  //* Ennek a lapnak nincs keresőben helye: se tartalma, se célja azon kívül,
  //* hogy egy gombot mutasson a saját látogatóinknak.
  robots: { index: false, follow: false },
};

export default function BelepesPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-16">
        <Link
          href="/orarend"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Vissza az órarendhez
        </Link>

        <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground">
          Belépés
        </h1>
        <p className="mt-2 text-sm text-muted-strong">
          Nem kötelező — belépve a beállításaid minden eszközödön megmaradnak.
        </p>

        <div className="mt-8">
          {/*//! A `useSearchParams` miatt kell a határ: enélkül a Next az egész
              //! lapot kliensoldali rendelésre kényszerítené. */}
          <Suspense fallback={<div className="h-40" aria-hidden />}>
            <SignInPanel />
          </Suspense>
        </div>

        <p className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          A jelszavadat nem tároljuk.{" "}
          <Link
            href="/adatvedelem"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Adatvédelmi tájékoztató
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
