import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  MAX_PREFS_BYTES,
  type PrefsEnvelope,
  sanitizePrefs,
} from "@/lib/prefs-shared";
import prisma from "@/lib/prisma";

//! ═══════════════════════════════════════════════════════════════════════════
//! A BEÁLLÍTÁS-SZINKRON VÉGPONTJA
//! ═══════════════════════════════════════════════════════════════════════════
//! Két művelet, és mindkettő KIZÁRÓLAG a bejelentkezett felhasználó SAJÁT
//! sorára vonatkozik. A felhasználó azonosítója SOHA nem a kérésből jön, hanem
//! a munkamenetből — a kliens nem tud más nevében írni vagy olvasni, mert nincs
//! olyan paraméter, amivel megpróbálhatná.
//!
//! MIT NEM CSINÁL EZ A VÉGPONT: nem naplóz beállítást, nem vezet előzményt, és
//! nem néz bele az adatba. A tárolt csomag a diáké; nekünk elég annyit tudni
//! róla, hogy érvényes alakú és nem túl nagy.
//! ═══════════════════════════════════════════════════════════════════════════

async function currentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

//! A NEM BEJELENTKEZETT HÍVÓ NEM HIBA, HANEM A NORMÁLIS ESET. A lap többsége
//! fiók nélkül használja az oldalt; a szinkron kliense mégis megkérdezheti ezt
//! a végpontot (pl. épp lejárt a munkamenet). Ezért 401-et adunk vissza csendes,
//! gépi alakban — a kliens ebből tudja, hogy egyszerűen ne szinkronizáljon.
function unauthorized() {
  return NextResponse.json(
    { error: "unauthenticated" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

//! A VÁLASZ SOHA NEM GYORSÍTÓTÁRAZHATÓ. Ez felhasználóra szabott, magánjellegű
//! adat: egy közbenső gyorsítótár (vagy a böngésző bfcache-e) egyik diák
//! beállítását adhatná oda a másiknak. A `no-store` ezért minden ágon ott van.
function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const row = await prisma.preference.findUnique({ where: { userId } });

  const envelope: PrefsEnvelope = row
    ? {
        //! A TÁROLT ADATOT IS ÁTENGEDJÜK AZ ELLENŐRZÉSEN. Elvileg csak olyan
        //! kerülhetett be, ami már átment rajta — de a szabályok szigorodhatnak
        //! (új korlát, szűkebb osztálynév-alak), és egy régen beírt sor emiatt
        //! mára érvénytelen lehet. Így a kliens sosem kap olyat, amit ő maga
        //! nem tudna visszaküldeni.
        prefs: sanitizePrefs(row.data),
        revision: row.revision,
        updatedAt: row.updatedAt.toISOString(),
      }
    : //* Nincs sor: a felhasználó még sosem szinkronizált. Nem hiba — üres
      //* csomag, nulladik verzió.
      { prefs: sanitizePrefs(null), revision: 0, updatedAt: null };

  return json(envelope);
}

export async function PUT(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  //! ELŐBB A MÉRET, AZTÁN AZ ELEMZÉS. Egy óriási törzs JSON-elemzése önmagában
  //! is munka; a `Content-Length` alapján a legolcsóbban dobjuk el. Ez csak az
  //! első szűrő — a fejléc hiányozhat vagy hazudhat, ezért a tényleges szöveget
  //! is megmérjük alább.
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_PREFS_BYTES) {
    return json({ error: "too-large" }, 413);
  }

  const raw = await req.text();
  //* A `Blob` a tényleges BÁJTHOSSZT adja (nem a karakterszámot) — az ékezetes
  //* osztálynevek miatt a kettő nem ugyanaz.
  if (new Blob([raw]).size > MAX_PREFS_BYTES) {
    return json({ error: "too-large" }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid-json" }, 400);
  }

  const payload = body as { prefs?: unknown; baseRevision?: unknown } | null;
  //! A `baseRevision` KÖTELEZŐ, és nem helyettesíthető alapértelmezéssel. Ez
  //! mondja meg, melyik szerver-verzióra épül a feltöltés; ha hiányozhatna,
  //! minden kliens „0"-ról írna, és a konfliktusvédelem néma módon kikapcsolna.
  if (typeof payload?.baseRevision !== "number") {
    return json({ error: "missing-base-revision" }, 400);
  }
  const baseRevision = payload.baseRevision;

  //* Az ÚJRAÉPÍTÉS itt történik: innentől nem a kliens objektumával dolgozunk,
  //* hanem egy általunk összerakott, ismert alakú csomaggal.
  const prefs = sanitizePrefs(payload.prefs);

  const existing = await prisma.preference.findUnique({ where: { userId } });

  //! ─── A KONFLIKTUS ─────────────────────────────────────────────────────────
  //! Ha a szerver sora már továbblépett ahhoz képest, amire a kliens épített,
  //! NEM írunk. Visszaadjuk a jelenlegi állapotot, és a kliens dolga
  //! összefésülni, majd újra próbálkozni (lásd `prefs-sync.ts`). Enélkül a
  //! lassabb készülék némán felülírná a frissebb beállítást — pont azt a hibát
  //! okozva, ami miatt az egész szinkron készült.
  if (existing && existing.revision !== baseRevision) {
    return json(
      {
        error: "conflict",
        current: {
          prefs: sanitizePrefs(existing.data),
          revision: existing.revision,
          updatedAt: existing.updatedAt.toISOString(),
        } satisfies PrefsEnvelope,
      },
      409,
    );
  }

  //* Ha nincs sor, csak `baseRevision: 0`-val szabad létrehozni: így egy régi,
  //* nagyobb verziószámot cipelő kliens sem tud „visszaugrasztani" minket.
  if (!existing && baseRevision !== 0) {
    return json(
      {
        error: "conflict",
        current: {
          prefs: sanitizePrefs(null),
          revision: 0,
          updatedAt: null,
        } satisfies PrefsEnvelope,
      },
      409,
    );
  }

  const nextRevision = baseRevision + 1;

  //! AZ `upsert` FELTÉTELE A VERZIÓ IS. A fenti ellenőrzés és ez az írás között
  //! elvben befér egy másik készülék írása (két párhuzamos kérés ugyanattól a
  //! diáktól). Az `update` ezért a `revision`-re is szűr: ha időközben
  //! megváltozott, nem talál sort, és kivételt kapunk a néma felülírás helyett.
  const row = existing
    ? await prisma.preference
        .update({
          where: { userId, revision: baseRevision },
          data: { data: prefs, revision: nextRevision },
        })
        .catch(() => null)
    : await prisma.preference
        .create({
          data: { userId, data: prefs, revision: nextRevision },
        })
        .catch(() => null);

  if (!row) {
    //* A versenyhelyzet vesztese ugyanazt kapja, mint a konfliktus: töltse le
    //* az újat, fésülje össze, próbálja újra.
    const current = await prisma.preference.findUnique({ where: { userId } });
    return json(
      {
        error: "conflict",
        current: {
          prefs: sanitizePrefs(current?.data ?? null),
          revision: current?.revision ?? 0,
          updatedAt: current?.updatedAt.toISOString() ?? null,
        } satisfies PrefsEnvelope,
      },
      409,
    );
  }

  return json({
    prefs,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
  } satisfies PrefsEnvelope);
}
