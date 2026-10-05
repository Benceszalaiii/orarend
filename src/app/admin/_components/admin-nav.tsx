"use client";

import { BarChart3, Megaphone, Shapes, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "Felhasználók", icon: Users },
  { href: "/admin/statisztika", label: "Statisztika", icon: BarChart3 },
  { href: "/admin/kozlemenyek", label: "Közlemények", icon: Megaphone },
  { href: "/admin/szakkorok", label: "Szakkörök", icon: Shapes },
  { href: "/admin/versenyek", label: "Versenyek", icon: Trophy },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Üzemeltetői pult"
      className="-mx-5 mt-5 flex gap-1 overflow-x-auto border-b border-border px-5"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/admin"
            ? pathname === "/admin"
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors motion-reduce:transition-none",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
