import "server-only";

import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./auth";
import { isPeerId, type PeerIdentity, sanitizeNickname } from "./webrtc-shared";

//! ═══════════════════════════════════════════════════════════════════════════
//! KI BESZÉL — A NÉV EGYETLEN FORRÁSA
//! ═══════════════════════════════════════════════════════════════════════════
//! MINDEN JELZÉSRE A SZERVER ÜTI RÁ A NEVET. A kliens a törzsben küldhet
//! bármit; ez a modul nem olvassa. Két ág van:
//!
//!   • VAN MUNKAMENET → a név a FIÓKBÓL jön, és `verified: true`. A kliens
//!     ilyenkor hiába ír becenevet: a fiók neve erősebb. Aki belépett, azt a
//!     saját nevén látják, és ezt nem tudja letagadni.
//!   • NINCS MUNKAMENET → a becenév, megtisztítva, `verified: false`. A
//!     felület a kettőt láthatóan megkülönbözteti.
//!
//! MIÉRT ITT, ÉS NEM A KLIENSBEN. Mert a csevegés és a névsor a MEGOSZTÓ
//! gépén fut össze, és a megosztónak nincs miből ellenőriznie, amit egy néző
//! állít magáról. Az egyetlen hitelesítés, amihez hozzáfér, az a SZERVERTŐL
//! ÉRKEZŐ jelzés `from` mezője — a néző adatcsatornáján érkező üzenet nevét
//! ezért a megosztó eldobja, és ezt írja a helyére (lásd `webrtc-host.ts`).
//!
//! A NÉV NEM TITKOS, DE NEM IS SZABAD PRÉDA. Ami ide kimegy, azt a megosztás
//! minden résztvevője látja — ezért csak a megjelenített nevet adjuk tovább:
//! se e-mail, se felhasználónév, se osztály, se azonosító.
//! ═══════════════════════════════════════════════════════════════════════════

//* Egy kérésen belül egyszer. A `POST /api/webrtc/signal` és a jegyzék is
//* kérdezhet — ne legyen belőle két munkamenet-feloldás.
const currentSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

export type ResolvedIdentity =
  | { ok: true; identity: PeerIdentity }
  //* `reason` a kliensnek szól, hogy tudja, mit javítson: rossz azonosító vagy
  //* hiányzó/túl rövid becenév.
  | { ok: false; reason: "bad-peer" | "bad-nickname" };

export async function resolveIdentity(
  peer: unknown,
  nickname: unknown,
): Promise<ResolvedIdentity> {
  if (!isPeerId(peer)) return { ok: false, reason: "bad-peer" };

  const session = await currentSession();
  if (session) {
    //! A NÉV LEHET ÜRES A FIÓKBAN (egy AD-fióknál előfordul) — ilyenkor sem
    //! esünk vissza a becenévre, mert az a HITELESÍTETT jelzést adná egy
    //! kliens által írt szövegnek. Inkább egy semleges szó áll ott.
    const name = session.user.name?.trim();
    return {
      ok: true,
      identity: {
        peer,
        name: name && name.length > 0 ? name.slice(0, 40) : "Belépett diák",
        verified: true,
      },
    };
  }

  const nick = sanitizeNickname(nickname);
  if (!nick) return { ok: false, reason: "bad-nickname" };
  return { ok: true, identity: { peer, name: nick, verified: false } };
}
