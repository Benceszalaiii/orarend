"use client";

import { BadgeCheck, Paperclip, SendHorizonal, X } from "lucide-react";
import {
  type ClipboardEvent,
  type FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type FileSession, formatBytes } from "@/lib/webrtc-files";
import {
  type ChatMessage,
  CLOCK_FMT,
  MAX_CHAT_LENGTH,
  MAX_FILE_BYTES,
  sanitizeChatText,
} from "@/lib/webrtc-shared";
import { AttachmentView } from "./attachment-view";

//! ─── A BEILLESZTETT KÓD NEM ÜZENET, HANEM FÁJL ─────────────────────────────
//! Az üzenetmező egysoros: egy beillesztett SQL-lekérdezés sortörései benne
//! nyom nélkül eltűnnének, és egy olvashatatlan kolbász menne el. Ezért a
//! TÖBBSOROS beillesztés csatolmány lesz — kódként, színezve, másolhatóan
//! érkezik a többiekhez, ahogy a küldő látta.
const SNIPPET_NAME = "kodreszlet.txt";

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
  files,
  disabled,
  mePeer,
  className,
}: {
  chat: ChatMessage[];
  onSay: (text: string) => void;
  files: FileSession;
  disabled: boolean;
  mePeer: string | null;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<File | null>(null);
  const [tooBig, setTooBig] = useState<string | null>(null);
  const inputId = useId();
  const pickerRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const uploading = files.upload !== null && !files.upload.failed;
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

  const attach = (file: File) => {
    //! A KORLÁTOT ITT MONDJUK KI, NEM A MEGOSZTÓNÁL. Ő is elutasítaná, de
    //! addig a diák 5 MB fölött hiába várna egy soha el nem induló feltöltésre.
    if (file.size > MAX_FILE_BYTES) {
      setTooBig(file.name);
      setPending(null);
      return;
    }
    if (file.size === 0) return;
    setTooBig(null);
    setPending(file);
    textRef.current?.focus();
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.files[0];
    if (pasted) {
      event.preventDefault();
      attach(pasted);
      return;
    }
    const text = event.clipboardData.getData("text/plain");
    if (text.includes("\n") && text.trim().length > 0) {
      event.preventDefault();
      attach(new File([text], SNIPPET_NAME, { type: "text/plain" }));
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    const clean = sanitizeChatText(draft);
    if (pending) {
      if (uploading) return;
      files.sendFile(pending, clean ?? "");
      setPending(null);
      setDraft("");
      return;
    }
    if (!clean) return;
    onSay(clean);
    setDraft("");
  };

  const canSend =
    !disabled && (pending ? !uploading : sanitizeChatText(draft) !== null);

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
            Még nincs üzenet. Amit ide írsz vagy csatolsz, csak a megosztás
            résztvevői látják.
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
              {message.text && (
                <p className="whitespace-pre-wrap break-words text-foreground">
                  {message.text}
                </p>
              )}
              {message.attachment && (
                <AttachmentView
                  attachment={message.attachment}
                  body={files.files.get(message.attachment.id)}
                  progress={files.transfers.get(message.attachment.id)}
                  unavailable={files.unavailable.has(message.attachment.id)}
                  onRequest={() =>
                    message.attachment && files.requestFile(message.attachment)
                  }
                />
              )}
            </div>
          ))
        )}
      </output>

      {(files.upload || pending || tooBig) && (
        <div className="space-y-1 border-t border-border px-2 pt-2 text-xs">
          {files.upload && (
            <UploadLine
              name={files.upload.name}
              ratio={files.upload.ratio}
              failed={files.upload.failed}
            />
          )}
          {pending && (
            <div className="flex min-w-0 items-center gap-2 rounded-md bg-muted/60 px-2 py-1">
              <Paperclip
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-foreground">
                {pending.name}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatBytes(pending.size)}
              </span>
              <button
                type="button"
                onClick={() => setPending(null)}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                aria-label="Csatolmány eltávolítása"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
          {tooBig && (
            <p className="text-destructive" role="alert">
              A(z) „{tooBig}" túl nagy — legfeljebb{" "}
              {formatBytes(MAX_FILE_BYTES)} küldhető.
            </p>
          )}
        </div>
      )}

      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t border-border p-2"
      >
        <input
          ref={pickerRef}
          type="file"
          className="hidden"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            //* Kiürítjük, hogy ugyanazt a fájlt másodszor is ki lehessen választani.
            event.target.value = "";
            if (file) attach(file);
          }}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={disabled || uploading}
          onClick={() => pickerRef.current?.click()}
          aria-label="Fájl csatolása"
          title={`Fájl csatolása (legfeljebb ${formatBytes(MAX_FILE_BYTES)})`}
        >
          <Paperclip />
        </Button>
        <label htmlFor={inputId} className="sr-only">
          Üzenet
        </label>
        <input
          ref={textRef}
          id={inputId}
          type="text"
          autoComplete="off"
          maxLength={MAX_CHAT_LENGTH}
          disabled={disabled}
          placeholder={
            disabled
              ? "Nincs kapcsolat"
              : pending
                ? "Írj mellé valamit (nem kötelező)…"
                : "Írj a többieknek…"
          }
          value={draft}
          onPaste={onPaste}
          onChange={(event) => setDraft(event.target.value)}
          className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 sm:text-sm dark:bg-input/30"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!canSend}
          aria-label="Küldés"
        >
          <SendHorizonal />
        </Button>
      </form>
    </div>
  );
}

function UploadLine({
  name,
  ratio,
  failed,
}: {
  name: string;
  ratio: number;
  failed: boolean;
}) {
  if (failed) {
    return (
      <p className="truncate text-destructive" role="alert">
        Nem sikerült elküldeni: {name}
      </p>
    );
  }
  const percent = Math.round(ratio * 100);
  return (
    <div className="min-w-0">
      <p className="flex gap-2 text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">Küldés: {name}</span>
        <span className="shrink-0 tabular-nums">
          {percent >= 100 ? "feldolgozás…" : `${percent}%`}
        </span>
      </p>
      <div
        role="progressbar"
        aria-label={`${name} feltöltése`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-1 h-0.5 overflow-hidden rounded bg-border"
      >
        <div
          className="h-full bg-primary transition-[width] duration-150"
          style={{ width: `${Math.max(4, percent)}%` }}
        />
      </div>
    </div>
  );
}
