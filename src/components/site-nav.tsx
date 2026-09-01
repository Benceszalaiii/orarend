"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

//* A `/ma` és a `/dualis` még nincs kész (WIP), ezért egyelőre nem
//* jelennek meg a navigációban.
//*
//* A `/adatvedelem` szándékosan NINCS benne: az nem egy nézet ugyanarra az
//* adatra, hanem egy lábjegyzet — a helye a lap alján van, nem a váltóban.

const ROUTES = [
  { href: "/orarend", label: "Hét", title: "A teljes heti órarend" },
] as const;

export function SiteNav({ className }: { className?: string }) {
  const pathname = usePathname();

  if (ROUTES.length <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="Nézetek"
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-full border border-input p-0.5 dark:bg-input/30",
        className,
      )}
    >
      {ROUTES.map((route) => {
        const active = pathname === route.href;
        return (
          <Link
            key={route.href}
            href={route.href}
            title={route.title}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
              active
                ? "bg-foreground text-background"
                : "text-muted-strong hover:bg-muted hover:text-foreground",
            )}
          >
            {route.label}
          </Link>
        );
      })}
    </nav>
  );
}
