"use client";

import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { DeadlineItem } from "@/app/api/versenyek/hataridok/route";
import { accentStyle } from "@/lib/accent";
import { clubsVisibleHere } from "@/lib/club-events";
import { loadFollowedContests } from "@/lib/club-follow";
import { deadlineLabel, formatWhen } from "@/lib/competitions";
import { cn } from "@/lib/utils";
import { listGroup, rowBase, Section } from "./week-panels";

//! A HATÁRIDŐ OTT, AHOL A DIÁK AMÚGY IS NÉZ. A versenylista akkor segít, ha
//! valaki megnyitja; a `/ma`-t viszont minden szünetben megnyitják. Ide csak
//! az kerül, amire az osztály NEVEZHET (vagy amit a diák követ), és csak ha
//! van ilyen — egy üres „Határidők" panel minden nap zaj volna.
//!
//! SOHA NEM DOB ÉS NEM VÁRAKOZTAT: a panel saját kéréssel jön, a nap nélküle is
//! kirajzolódik.
export function ContestDeadlines({ className }: { className: string | null }) {
  const [data, setData] = useState<{ now: Date; items: DeadlineItem[] } | null>(
    null,
  );

  useEffect(() => {
    if (!clubsVisibleHere()) return;
    const params = new URLSearchParams();
    if (className) params.set("osztaly", className);
    const followed = loadFollowedContests() ?? [];
    if (followed.length > 0) params.set("versenyek", followed.join(","));
    let alive = true;
    fetch(`/api/versenyek/hataridok?${params}`, {
      signal: AbortSignal.timeout(3_000),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { now: string; items: DeadlineItem[] } | null) => {
        if (alive && body && Array.isArray(body.items)) {
          setData({ now: new Date(body.now), items: body.items });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [className]);

  if (!data || data.items.length === 0) return null;

  return (
    <Section
      id="deadlines-heading"
      title="Nevezési határidők"
      aside={
        <Link
          href="/versenyek"
          prefetch={false}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Versenyek
        </Link>
      }
    >
      <ul className={listGroup}>
        {data.items.map((item) => {
          const deadline = new Date(item.deadline);
          const soon = deadline.getTime() - data.now.getTime() < 3 * 86_400_000;
          return (
            <li key={item.slug} style={accentStyle(item.slug)}>
              <Link
                href={`/versenyek/${item.slug}`}
                prefetch={false}
                className={rowBase}
              >
                <CalendarClock
                  className={cn(
                    "size-4 shrink-0",
                    soon ? "text-brand" : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {item.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-strong">
                    {formatWhen(deadline)}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    soon
                      ? "font-semibold text-foreground"
                      : "text-muted-strong",
                  )}
                >
                  {deadlineLabel(deadline, data.now)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
