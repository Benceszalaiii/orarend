"use client";

import { BadgeCheck, SendHorizonal } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type ChatMessage,
  CLOCK_FMT,
  MAX_CHAT_LENGTH,
  sanitizeChatText,
} from "@/lib/webrtc-shared";

//! ═══════════════════════════════════════════════════════════════════════════
//! A CSEVEGÉS — ÉS AHOL NEM MEGY KERESZTÜL
//! ═══════════════════════════════════════════════════════════════════════════
//! EGYETLEN ÜZENET SEM ÉRINTI A SZERVERÜNKET. A szöveg a megosztó gépéhez megy
//! az adatcsatornán (ugyanazon a titkosított kapcsolaton, amin a kép jön
//! vissza), ő odaírja a küldő hitelesített nevét, és továbbküldi a többieknek.
//! Nincs tárolás, nincs előzmény a szerveren, nincs mit később kikérni: a
//! beszélgetés a megosztás végével megszűnik létezni.
//!
//! AMI EBBŐL KÖVETKEZIK, ÉS AMIT KI IS ÍRUNK A LAP ALJÁN: a megosztó gépe
//! MINDENT lát. Ez nem hiba, hanem a csillag-topológia ára — de a diáknak
//! tudnia kell róla, mielőtt ír.
//! ═══════════════════════════════════════════════════════════════════════════

export function ChatPanel({
  chat,
  onSay,
  disabled,
  mePeer,
  className,
}: {
  chat: ChatMessage[];
  onSay: (text: string) => void;
  disabled: boolean;
  mePeer: string | null;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const inputId = useId();
  const logRef = useRef<HTMLOutputElement>(null);
  const pinned = useRef(true);

  //! CSAK AKKOR GÖRGETÜNK LE, HA A DIÁK AMÚGY IS ALUL VOLT. Aki visszagörgetett,
  //! hogy elolvasson valamit, azt egy új üzenet ne rántsa el onnan — ez a
  //! csevegőfelületek legrégebbi, legbosszantóbb hibája.
  //* A DARABSZÁM A JEL, nem maga a lista: a megosztó csak hozzáfűz, sosem ír
  //* át meglévő üzenetet, tehát új üzenet = nagyobb szám.
  const count = chat.length;
  useEffect(() => {
    const log = logRef.current;
    if (count === 0 || !log || !pinned.current) return;
    log.scrollTop = log.scrollHeight;
  }, [count]);

  const onScroll = () => {
    const log = logRef.current;
    if (!log) return;
    pinned.current = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = sanitizeChatText(draft);
    if (!clean || disabled) return;
    onSay(clean);
    setDraft("");
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <output
        ref={logRef}
        onScroll={onScroll}
        aria-live="polite"
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3 text-sm"
      >
        {chat.length === 0 ? (
          <p className="m-auto text-pretty text-center text-xs text-muted-foreground">
            Még nincs üzenet. Amit ide írsz, csak a megosztás résztvevői látják.
          </p>
        ) : (
          chat.map((message) => (
            <div key={message.id} className="min-w-0">
              <p className="flex items-baseline gap-1.5 text-[11px] text-muted-foreground">
                <span
                  className={cn(
                    "truncate font-medium",
                    message.from.peer === mePeer && "text-primary",
                  )}
                >
                  {message.from.name}
                </span>
                {message.from.verified && (
                  <BadgeCheck
                    className="size-3 shrink-0 self-center text-emerald-600 dark:text-emerald-400"
                    aria-label="A nevét a belépett fiókja igazolja"
                  />
                )}
                <span className="ml-auto shrink-0 tabular-nums">
                  {CLOCK_FMT.format(message.at)}
                </span>
              </p>
              {/*//! A SORTÖRÉST MEGTARTJUK, a HTML-t nem: a szöveg szövegként
                  //! kerül a DOM-ba (React így teszi), a `whitespace-pre-wrap`
                  //! pedig a beillesztett felsorolást is olvashatóan hagyja. */}
              <p className="whitespace-pre-wrap break-words text-foreground">
                {message.text}
              </p>
            </div>
          ))
        )}
      </output>

      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t border-border p-2"
      >
        <label htmlFor={inputId} className="sr-only">
          Üzenet
        </label>
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          maxLength={MAX_CHAT_LENGTH}
          disabled={disabled}
          placeholder={disabled ? "Nincs kapcsolat" : "Írj a többieknek…"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 sm:text-sm dark:bg-input/30"
        />
        <Button
          type="submit"
          size="icon"
          disabled={disabled || sanitizeChatText(draft) === null}
          aria-label="Küldés"
        >
          <SendHorizonal />
        </Button>
      </form>
    </div>
  );
}
