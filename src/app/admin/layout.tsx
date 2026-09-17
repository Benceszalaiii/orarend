import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/announcement-store";
import { AccessDenied } from "./_components/access-denied";
import { AdminNav } from "./_components/admin-nav";

export const metadata: Metadata = {
  title: "Üzemeltetés – Órarend",
  robots: { index: false, follow: false },
};

//! AZ ELRENDEZÉS NEM AZ EGYETLEN KAPU. Kliensoldali navigációnál a layout nem
//! fut újra, ezért minden lap és minden action MAGA is meghívja a
//! `requireAdmin`-t — itt csak azért áll, hogy illetéktelennek a fül se
//! látszódjon. A `cache` miatt ez nem jelent dupla lekérdezést.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  if (!(await requireAdmin())) return <AccessDenied next="/admin" />;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:py-10">
      <Link
        href="/orarend"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Vissza az órarendhez
      </Link>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
        Üzemeltetés
      </h1>
      <AdminNav />
      {children}
    </div>
  );
}
