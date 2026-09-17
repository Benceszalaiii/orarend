"use client";

import {
  Cast,
  ChevronLeft,
  ExternalLink,
  Maximize2,
  Minimize2,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { CrestField, PAGE_CHROME } from "@/components/chrome/page-field";
import { SITE_BAR_MAX, StandingLine } from "@/components/chrome/standing-line";
import { SiteFooter } from "@/components/site-footer";
import { ScreenForm } from "@/components/timetable/lesson-extras";
import {
  canViewInPage,
  feedStatusText,
  Unreachable,
  useScreenTaskFeed,
} from "@/components/timetable/screentask-viewer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/auth-client";
import {
  formatScreenAddress,
  screenTaskPageUrl,
  sharedScreenFor,
} from "@/lib/lesson-extras";
import {
  refreshSharedExtras,
  saveRoomScreen,
  useSharedExtras,
  useTeacherSelf,
} from "@/lib/shared-extras-store";
import { cn } from "@/lib/utils";

//! ═══════════════════════════════════════════════════════════════════════════
//! KIVETÍTÉS — A TEREM KÉPERNYŐJE, SAJÁT LAPON
//! ═══════════════════════════════════════════════════════════════════════════
//! A CÍM A TEREMÉ, NEM A DIÁKÉ. `/kivetites/218` mindig a 218-as terem tanári
//! gépét mutatja — ezt a linket ki lehet tenni a terem ajtajára QR-kódként,
//! könyvjelzőbe lehet tenni, és soha senkinek nem kell IP-címet gépelnie. Ha a
//! gép új címet kap, EGY tanár átírja, és a nyitva hagyott lapok is átállnak
//! (megszakadt kapcsolatnál percenként újraolvassuk a terem címét).
//! ═══════════════════════════════════════════════════════════════════════════

//* Megszakadt kapcsolatnál ilyen sűrűn nézzük meg, nem írta-e át egy tanár.
const LOST_RECHECK_MS = 60_000;

const DARK_BUTTON =
  "text-white/80 hover:bg-white/10 hover:text-white dark:hover:bg-white/10";

export function KivetitesRoom({ room }: { room: string }) {
  const { data: session } = useSession();
  const self = useTeacherSelf(
    session?.user.id ?? null,
    session?.user.isTeacher === true,
  );
  const { status, shared } = useSharedExtras();
  const screen = sharedScreenFor(shared, room);
  const [editing, setEditing] = useState(false);

  const host = screen?.host ?? null;
  const [inPage, setInPage] = useState(false);
  useEffect(() => {
    setInPage(host !== null && canViewInPage(host));
  }, [host]);

  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const showStage = screen !== null && inPage && !editing;
  const { link, hasFrame } = useScreenTaskFeed(
    showStage ? screen : null,
    frameRef,
  );

  //! A NYITVA HAGYOTT LAP IS ÁTÁLL. Ha a kép elérhetetlen, lehet, hogy a gép
  //! új címet kapott, és egy tanár már átírta — ezt a lap magától észreveszi.
  useEffect(() => {
    if (link !== "lost") return;
    const id = setInterval(
      () => void refreshSharedExtras(true),
      LOST_RECHECK_MS,
    );
    return () => clearInterval(id);
  }, [link]);

  const [canFullscreen, setCanFullscreen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    setCanFullscreen(document.fullscreenEnabled === true);
    const onChange = () =>
      setFullscreen(
        stageRef.current !== null &&
          document.fullscreenElement === stageRef.current,
      );
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen().catch(() => {});
  };

  return (
    <main className="flex h-dvh flex-col bg-black text-white">
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 pt-[max(0.5rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-2 pl-[max(0.5rem,env(safe-area-inset-left))]">
        <Button asChild size="icon-sm" variant="ghost" className={DARK_BUTTON}>
          <Link href="/kivetites" aria-label="Minden terem">
            <ChevronLeft />
          </Link>
        </Button>
        {showStage && (
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              link === "live" && "bg-emerald-400",
              link === "lost" && "bg-red-400",
              link === "connecting" && "animate-pulse bg-white/50",
            )}
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">Kivetítés · {room}</h1>
          <p className="truncate text-[11px] text-white/60">
            {screen ? (
              <>
                <span className="font-mono">{formatScreenAddress(screen)}</span>
                {showStage && (
                  <>
                    {" · "}
                    <span aria-live="polite">
                      {feedStatusText(link, hasFrame)}
                    </span>
                  </>
                )}
              </>
            ) : status === "loading" ? (
              "betöltés…"
            ) : (
              "nincs beállítva"
            )}
          </p>
        </div>
        {self.isTeacher && screen && !editing && (
          <Button
            size="icon-sm"
            variant="ghost"
            className={DARK_BUTTON}
            aria-label="A terem címének módosítása"
            title="A terem címének módosítása"
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
        )}
        {showStage && canFullscreen && hasFrame && (
          <Button
            size="icon-sm"
            variant="ghost"
            className={DARK_BUTTON}
            aria-label={
              fullscreen ? "Kilépés a teljes képernyőből" : "Teljes képernyő"
            }
            onClick={toggleFullscreen}
          >
            {fullscreen ? <Minimize2 /> : <Maximize2 />}
          </Button>
        )}
        {screen && (
          <Button
            asChild
            size="icon-sm"
            variant="ghost"
            className={DARK_BUTTON}
          >
            <a
              href={screenTaskPageUrl(screen)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Megnyitás a ScreenTask saját oldalán"
              title="Megnyitás a ScreenTask saját oldalán"
            >
              <ExternalLink />
            </a>
          </Button>
        )}
      </header>

      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 items-center justify-center bg-black"
      >
        {showStage && (
          <>
            {/*//! A képkockákat a hurok teszi ide (`replaceChildren`) — ennek
                //! az elemnek szándékosan nincs React-gyereke. */}
            <div
              ref={frameRef}
              className="flex size-full items-center justify-center"
            />
            {!hasFrame &&
              (link === "lost" ? (
                <Unreachable screen={screen} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-white/70">
                  <Spinner className="size-5" />
                  Kapcsolódás a tanári géphez…
                </div>
              ))}
            {hasFrame && link === "lost" && (
              <output className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-3 py-1.5 text-xs text-white ring-1 ring-white/15">
                Megszakadt a kapcsolat — újrapróbálom…
              </output>
            )}
          </>
        )}

        {!showStage && (
          <div className="size-full overflow-y-auto p-4">
            <div className="mx-auto mt-[10vh] max-w-md rounded-2xl bg-background p-5 text-foreground">
              {status === "loading" && !screen ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner className="size-4" /> A terem címének betöltése…
                </p>
              ) : editing || (!screen && self.isTeacher) ? (
                <>
                  <h2 className="text-base font-semibold">
                    A {room} terem kivetítője
                  </h2>
                  <p className="mt-1 text-pretty text-sm text-muted-foreground">
                    Egyszer kell megadni: onnantól mindenki ezt a címet kapja
                    ebben a teremben, amíg egy tanár át nem írja.
                  </p>
                  <div className="-ml-7">
                    <ScreenForm
                      initial={screen ? formatScreenAddress(screen) : ""}
                      hint="A ScreenTask ablakában látható. Port nélkül 7070."
                      onCancel={() => setEditing(false)}
                      onSubmit={async (address) => {
                        const result = await saveRoomScreen(room, address);
                        if (result.ok) setEditing(false);
                        return result;
                      }}
                    />
                  </div>
                </>
              ) : !screen ? (
                <>
                  <h2 className="text-base font-semibold">
                    Ebben a teremben még nincs beállítva kivetítő
                  </h2>
                  <p className="mt-1 text-pretty text-sm text-muted-foreground">
                    Egy tanárnak egyszer meg kell adnia a tanári gép címét —
                    utána ez a lap magától működik mindenkinek. Ha tanár vagy,
                    lépj be.
                  </p>
                  <Button asChild className="mt-4 rounded-full px-4">
                    <Link
                      href={`/belepes?tovabb=${encodeURIComponent(`/kivetites/${room}`)}`}
                    >
                      Belépés
                    </Link>
                  </Button>
                </>
              ) : (
                //! A BÖNGÉSZŐ NEM ENGEDI A LAPBA ÁGYAZNI (Safari, Firefox,
                //! `.local` név) — lásd `canViewInPage`. A ScreenTask saját
                //! oldala önálló `http` lap, az mindenhol megnyílik.
                <>
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    <Cast className="size-4" aria-hidden />A tanár képernyője
                  </h2>
                  <p className="mt-1 text-pretty text-sm text-muted-foreground">
                    Ez a böngésző nem engedi, hogy a képet ezen a lapon
                    mutassuk. A ScreenTask saját oldala új lapon nyílik —
                    ugyanarról a wifiről.
                  </p>
                  <Button asChild className="mt-4 gap-1.5 rounded-full px-4">
                    <a
                      href={screenTaskPageUrl(screen)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Kivetítés megnyitása
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

//* ---------------------------------------------------------------------------
//* A termek listája
//* ---------------------------------------------------------------------------
export function KivetitesIndex() {
  const router = useRouter();
  const inputId = useId();
  const { status, shared } = useSharedExtras();
  const [room, setRoom] = useState("");

  const go = (event: FormEvent) => {
    event.preventDefault();
    const value = room.trim();
    if (value) router.push(`/kivetites/${encodeURIComponent(value)}`);
  };

  const rooms = [...shared.screens].sort((a, b) =>
    a.room.localeCompare(b.room, "hu", { numeric: true }),
  );

  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-background tt-safe">
      <CrestField />

      {/*//! A KIVETÍTÉS IS A VÁLTÓ ALÁ KERÜL. Eddig egy „‹ Órarend" hivatkozás
          //! volt az egyetlen út ki innen; a váltó ugyanazt tudja (Hét, Ma), és
          //! mellé kimondja, hogy a Helyek közül itt állsz. A teremnézet
          //! (`/kivetites/[terem]`) szándékosan NEM kapja meg: az egy
          //! osztályterem kivetítőjén fut, ott minden fejléc zaj. */}
      <div className={PAGE_CHROME}>
        <div className={cn("mx-auto w-full", SITE_BAR_MAX)}>
          <StandingLine
            line={{
              subject: "Kivetítés",
              context:
                status === "loading" ? undefined : `${rooms.length} terem`,
            }}
          />
        </div>
      </div>
      <div className="relative z-10 mx-auto w-full max-w-xl grow px-5 pt-6 pb-10">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Kivetítés
        </h1>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          Tanár által konfigurált linkek.
        </p>

        <form onSubmit={go} className="mt-6 flex gap-2">
          <label htmlFor={inputId} className="sr-only">
            Terem
          </label>
          <input
            id={inputId}
            type="text"
            autoComplete="off"
            placeholder="Terem, pl. 218"
            className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-sm dark:bg-input/30"
            value={room}
            onChange={(event) => setRoom(event.target.value)}
          />
          <Button
            type="submit"
            className="rounded-full px-4"
            disabled={!room.trim()}
          >
            Megnyitás
          </Button>
        </form>

        <h2 className="mt-8 text-xs font-medium text-muted-strong">
          Beállított termek
        </h2>
        {status === "loading" ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Betöltés…
          </p>
        ) : rooms.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {status === "error"
              ? "Most nem sikerült betölteni a termeket."
              : "Még egyik teremhez sem adott meg címet tanár."}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {rooms.map((screen) => (
              <li key={screen.room}>
                <Link
                  href={`/kivetites/${encodeURIComponent(screen.room)}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50"
                >
                  <Cast
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="flex-1 text-sm font-semibold uppercase tabular-nums text-foreground">
                    {screen.room}
                  </span>
                  <span className="font-mono text-xs text-muted-strong">
                    {formatScreenAddress(screen)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <SiteFooter className="relative z-10" />
    </main>
  );
}
