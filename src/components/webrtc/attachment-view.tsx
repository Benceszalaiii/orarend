"use client";

import {
  Check,
  Copy,
  Download,
  FileCode2,
  File as FileIcon,
  ImageIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { highlightCode, languageFor } from "@/lib/code-highlight";
import { cn } from "@/lib/utils";
import { type FileBody, fileExtension, formatBytes } from "@/lib/webrtc-files";
import type { ChatAttachment } from "@/lib/webrtc-shared";

//! ═══════════════════════════════════════════════════════════════════════════
//! EGY CSATOLMÁNY A CSEVEGÉSBEN
//! ═══════════════════════════════════════════════════════════════════════════
//! A FÁJL IDEGEN, ÉS A LAP SOHA NEM FUTTATJA. Három dolgot tehet vele:
//!   • KÓD: a tartalmát SZÖVEGKÉNT mutatja (React szövegcsomópont, vagy a
//!     `highlight.js` kódolt kimenete — lásd `code-highlight.ts`);
//!   • KÉP: `<img>`-be teszi, ahol egy SVG szkriptje sem fut le;
//!   • BÁRMI: letölthetővé teszi, `download` attribútummal.
//!
//! AMIT SZÁNDÉKOSAN NEM: új lapon megnyitni. Egy `blob:` cím a MI
//! eredetünket örökli — egy feltöltött HTML vagy SVG új fülön a mi
//! nevünkben futna, a belépett diák sütijeivel együtt. Ezért nincs „Megnyitás
//! új lapon", és ezért nincs `target="_blank"` sehol ebben a fájlban.
//! ═══════════════════════════════════════════════════════════════════════════

//! A NAGY SZÖVEGFÁJLT NEM RAJZOLJUK KI EGÉSZBEN. Egy 5 MB-os naplófájl
//! színezve másodpercekre megfogná a lapot, és a csevegőpanel úgyis csak pár
//! tucat sort mutat. Ami efölött van, az a letöltésben megvan.
const PREVIEW_CHARS = 64 * 1024;

export function AttachmentView({
  attachment,
  body,
  progress,
  unavailable,
  onRequest,
}: {
  attachment: ChatAttachment;
  body: FileBody | undefined;
  /** 0…1, ha épp jön. */
  progress: number | undefined;
  unavailable: boolean;
  onRequest: () => void;
}) {
  const { name, size, kind } = attachment;
  const Icon =
    kind === "code" ? FileCode2 : kind === "image" ? ImageIcon : FileIcon;

  return (
    <div className="mt-1 min-w-0 overflow-hidden rounded-md border border-border bg-muted/40">
      <div className="flex min-w-0 items-center gap-2 px-2 py-1.5">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {name}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {formatBytes(size)}
        </span>
        {body ? (
          <a
            href={body.url}
            download={name}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={`${name} letöltése`}
            title="Letöltés"
          >
            <Download className="size-3.5" />
          </a>
        ) : progress !== undefined ? null : unavailable ? null : (
          <button
            type="button"
            onClick={onRequest}
            className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            {kind === "other" ? "Letöltés" : "Megnyitás"}
          </button>
        )}
      </div>

      {!body && progress !== undefined && (
        <div
          role="progressbar"
          aria-label={`${name} érkezik`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="h-0.5 bg-border"
        >
          <div
            className="h-full bg-primary transition-[width] duration-150"
            style={{ width: `${Math.max(4, progress * 100)}%` }}
          />
        </div>
      )}

      {!body && unavailable && (
        <p className="border-t border-border px-2 py-1 text-[11px] text-muted-foreground">
          Ez a fájl már nem érhető el — a megosztó gépe csak a legutóbbiakat
          tartja meg.
        </p>
      )}

      {body && kind === "image" && (
        //* Egy helyben készült `blob:` kép — a Next képoptimalizálója itt
        //* nem segítene (nincs mit a szerveren átméretezni).
        // biome-ignore lint/performance/noImgElement: blob: cím, nincs mit optimalizálni
        <img
          src={body.url}
          alt={name}
          className="max-h-56 w-full border-t border-border bg-background object-contain"
        />
      )}

      {body && kind === "code" && <CodePreview body={body} name={name} />}
    </div>
  );
}

function CodePreview({ body, name }: { body: FileBody; name: string }) {
  const [text, setText] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [cut, setCut] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    setHtml(null);
    void body.blob.text().then(async (full) => {
      if (!live) return;
      const shown = full.length > PREVIEW_CHARS;
      const visible = shown ? full.slice(0, PREVIEW_CHARS) : full;
      setText(visible);
      setCut(shown);
      const language = languageFor(fileExtension(name));
      if (!language) return;
      const colored = await highlightCode(visible, language);
      if (live) setHtml(colored);
    });
    return () => {
      live = false;
    };
  }, [body, name]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (text === null) return null;

  const copy = async () => {
    try {
      //* A TELJES fájlt másoljuk, nem csak a látható részt.
      await navigator.clipboard.writeText(await body.blob.text());
      setCopied(true);
    } catch {
      /* nincs vágólap-engedély — a letöltés ettől még megvan */
    }
  };

  return (
    <div className="group relative border-t border-border bg-background">
      <pre className="code-view max-h-64 overflow-auto p-2 text-[11px] leading-relaxed">
        {html === null ? (
          <code>{text}</code>
        ) : (
          //! A `highlight.js` kódolt kimenete — lásd `code-highlight.ts`.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a highlight.js kimenete kódolt
          <code dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </pre>
      {cut && (
        <p className="border-t border-border px-2 py-1 text-[11px] text-muted-foreground">
          Csak az eleje látszik — a teljes fájl a letöltésben van.
        </p>
      )}
      <button
        type="button"
        onClick={copy}
        className={cn(
          "absolute top-1 right-1 inline-flex size-6 items-center justify-center rounded border border-border bg-background/90 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring group-hover:opacity-100 [@media(hover:none)]:opacity-100",
          copied && "opacity-100",
        )}
        aria-label={copied ? "Kimásolva" : "Kód másolása"}
        title={copied ? "Kimásolva" : "Másolás"}
      >
        {copied ? (
          <Check className="size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    </div>
  );
}
