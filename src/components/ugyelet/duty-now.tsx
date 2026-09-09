"use client";

import { CalendarDays, Clock3, ShieldCheck } from "lucide-react";
import { DrainBar } from "@/components/timetable/drain-bar";
import { countdownLabel, spanFraction } from "@/components/timetable/now";
import { minLabel, rangeLabel } from "@/components/timetable/shared";
import type { Clock } from "@/components/timetable/use-clock";
import { accentStyle } from "@/lib/accent";
import type { HallDutyBreakModel, HallDutyNow } from "@/lib/hall-duty";
import { cn } from "@/lib/utils";

//* ---------------------------------------------------------------------------
//* A HERO — KI ÁLL KINT MOST, ÉS HOL
//* ---------------------------------------------------------------------------
//! UGYANAZ A DOBOZ, MINT A `/ma`-N (`components/ma/now-block.tsx`), ugyanazzal
//! a szótárral: áttetsző blokk, nagy `tabular-nums` idő, alatta az adatsor,
//! alul a merülő haladás-sáv. Aki a napi nézet „most” dobozát érti, ezt is
//! érti — és pont ezért nem kap saját formanyelvet.
//!
//! AMI MÁS: A HERO ITT NEM EGY TÉTELT MUTAT, HANEM ÖTÖT. A napi nézetben egy
//! óra megy egyszerre; a szünetben viszont MIND AZ ÖT terület egyszerre él, és
//! a kérdés nem az, „melyik az enyém”, hanem „ki hol áll”. A teljes lista
//! ezért a hero-ban van, nem egy koppintás mögött: öt sor, ennyi az egész
//! válasz.
//!
//! PIROS CSAK ÉLŐ SZEREPBEN. A „Most” jelvény és a haladás-sáv viseli — semmi
//! más, pontosan úgy, mint a napi nézetben.

const block =
  "group relative block overflow-hidden rounded-2xl border border-hero-foreground/15 bg-hero-foreground/[0.06] p-5 sm:p-6";

export function DutyNowBlock({
  now,
  clock,
  epoch,
  leader,
}: {
  now: HallDutyNow | null;
  clock: Clock | null;
  epoch: number;
  leader: string | null;
}) {
  //! HIDRATÁLÁS ELŐTT NEM TALÁLUNK KI IDŐPONTOT. A blokk a szerveren teljes
  //! magassággal, de üresen renderel — így nincs elugró elrendezés.
  if (!now || !clock) {
    return <div className={cn(block, "h-56")} aria-hidden />;
  }

  if (now.phase === "none") {
    return (
      <Quiet
        title="Nincs időzíthető ügyelet"
        detail="Erre a napra nem érkezett csengetési rend, ezért a beosztás időpontok nélkül látszik."
        leader={leader}
      />
    );
  }

  if (now.phase === "done") {
    return (
      <Quiet
        title="Mára vége"
        detail="A nap utolsó ügyelete is véget ért."
        leader={leader}
      />
    );
  }

  const running = now.phase === "duty";
  const slot = running ? now.current : now.next;
  const { span } = now;
  const remainingSec = Math.max(0, span.toMin * 60 - clock.sec);
  const countdown = countdownLabel(remainingSec);

  return (
    <section className={block} aria-label={running ? "Most" : "Következik"}>
      {/*//! EGY MONDAT A KÉPERNYŐOLVASÓNAK. A visszaszámláló nem élő régió —
          //! másodpercenként felolvasva használhatatlan lenne. */}
      <p className="sr-only">
        {running ? "Most ügyelnek: " : "Következő ügyelet: "}
        {slot.startMin !== null && slot.endMin !== null
          ? rangeLabel(slot.startMin, slot.endMin)
          : slot.name}
        . {slot.posts.map((post) => `${post.area}: ${post.teacher}`).join(". ")}
        .
      </p>

      <p className="text-sm font-medium text-hero-foreground/70">
        {running ? "Most ügyelnek" : "Következő ügyelet"}
      </p>

      <div className="mt-3 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          {running ? (
            //* Piros csak élő szerepben.
            <span className="rounded-full bg-brand px-2.5 py-1 text-sm font-bold text-brand-foreground">
              Most
            </span>
          ) : null}
          {/*//! AZ IDŐ A LEGNAGYOBB ELEM, ÉS ITT A SZÜNET KEZDETE AZ. Aki a
              //! lapot megnyitja, tudja, hogy szünet lesz — azt akarja tudni,
              //! MIKOR, és onnantól kinek kell kiállnia. */}
          {slot.startMin !== null && (
            <time
              dateTime={minLabel(slot.startMin)}
              className="text-4xl font-bold tracking-tight tabular-nums sm:text-5xl"
            >
              {minLabel(slot.startMin)}
            </time>
          )}
          <span className="text-lg font-semibold text-hero-foreground/70">
            {slot.name}
          </span>
        </div>
      </div>

      {slot.startMin !== null && slot.endMin !== null && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-hero-foreground/70">
          <Clock3 className="size-3.5" aria-hidden />
          <span className="tabular-nums">
            {rangeLabel(slot.startMin, slot.endMin)}
          </span>
        </p>
      )}

      <PostList posts={slot.posts} className="mt-4" />

      <p className="mt-3 text-sm text-hero-foreground/70">
        <span className="font-semibold tabular-nums text-hero-foreground">
          {countdown.value}
          {countdown.unit ? ` ${countdown.unit}` : ""}
        </span>{" "}
        {running ? "van hátra" : "múlva kezdődik"}
      </p>

      {leader && <LeaderLine leader={leader} className="mt-3" />}

      {/*//* A blokk alsó élén futó haladás-sáv: a szakasz eltelt része. */}
      {span.toMin > span.fromMin && (
        <DrainBar
          //! ÚJ SZAKASZ = ÚJ ELEM. Egy futó animáció fázisát nem lehet
          //! visszaállítani, csak újraindítani.
          key={`${epoch}-${span.fromMin}-${span.toMin}`}
          span={span}
          fraction={spanFraction(span, clock.min)}
          accentSeed={slot.name}
          //* Élő szakasz = márkapiros, a lap többi „most” jelzésével egy nyelven.
          className="h-1 !bg-brand"
        />
      )}
    </section>
  );
}

//! ─── AZ ÖT POSZT ───────────────────────────────────────────────────────────
//! A TERÜLET KAP SZÍNT, NEM A TANÁR. A tizenkét árnyalat máshol a TANTÁRGYAT
//! azonosítja (`lib/accent.ts`) — ezen a lapon viszont egyetlen tantárgy sincs,
//! tehát a két jelentés soha nem kerül egy képernyőre. Cserébe a szín itt
//! ugyanazt a munkát végzi, mint a rácson: a beosztást FÜGGŐLEGESEN olvassák
//! („hol van a 2. emelet a következő szünetben”), és a visszatérő pötty ezt
//! egy pillantásra megadja. Dísz nélkül, információként.
export function PostList({
  posts,
  className,
  compact,
}: {
  posts: { area: string; teacher: string }[];
  className?: string;
  compact?: boolean;
}) {
  if (posts.length === 0) return null;
  return (
    <ul
      className={cn("flex flex-col", compact ? "gap-1" : "gap-1.5", className)}
    >
      {posts.map((post) => (
        <li
          key={post.area}
          className="flex items-baseline gap-2 text-sm leading-snug"
        >
          <span
            className="mt-[0.45em] size-2 shrink-0 rounded-full acc-dot"
            style={accentStyle(post.area)}
            aria-hidden
          />
          {/*//! A TERÜLET A CÍMKE, A TANÁR A VÁLASZ. A területnév rögzített
              //! szélességű oszlopban áll, hogy a nevek egy vonalban
              //! kezdődjenek — öt sort így egyetlen pillantással végig lehet
              //! futni. Szűk kijelzőn a rács enged: a név a saját sorába
              //! kerül, nem csonkul. */}
          <span className="w-0 min-w-[8.5rem] shrink-0 grow basis-34 text-hero-foreground/65 sm:grow-0">
            {post.area}
          </span>
          <span className="min-w-0 flex-1 font-semibold text-hero-foreground">
            {post.teacher}
          </span>
        </li>
      ))}
    </ul>
  );
}

//! A VEZETŐI ÜGYELET NEM A SZÜNETÉ, HANEM A NAPÉ — ezért külön sor, halványabb
//! súllyal: nem versenyez az öt poszttal, de ott van, ahol keresik.
function LeaderLine({
  leader,
  className,
}: {
  leader: string;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-sm text-hero-foreground/70",
        className,
      )}
    >
      <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
      <span>
        Vezetői ügyelet:{" "}
        <span className="font-medium text-hero-foreground">{leader}</span>
      </span>
    </p>
  );
}

function Quiet({
  title,
  detail,
  leader,
}: {
  title: string;
  detail: string;
  leader: string | null;
}) {
  return (
    <section className={block}>
      <CalendarDays className="size-5 text-hero-foreground/50" aria-hidden />
      <h2 className="mt-3 text-2xl font-bold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-pretty text-hero-foreground/70">
        {detail}
      </p>
      {leader && <LeaderLine leader={leader} className="mt-3" />}
    </section>
  );
}

/** A szünet állapota a mai naphoz képest — a lista ebből festi a sorait. */
export function breakPhase(
  slot: HallDutyBreakModel,
  nowMin: number | null,
): "past" | "now" | "future" {
  if (nowMin === null || slot.startMin === null || slot.endMin === null) {
    return "future";
  }
  if (nowMin >= slot.endMin) return "past";
  if (nowMin >= slot.startMin) return "now";
  return "future";
}
