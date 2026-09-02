import webpush from "web-push";
import type { PushPayload } from "./push-shared";
import type { PushSubscription } from "./push-store";
import { removeSubscription } from "./push-store";

import "server-only";

//* ---------------------------------------------------------------------------
//* A KIKÜLDÉS
//* ---------------------------------------------------------------------------
//! VAPID: A KÜLDŐ ALÁÍRÁSA, NEM A CÍMZETT AZONOSÍTÁSA. A push-szolgáltató
//! (Google, Apple, Mozilla) csak akkor fogadja el a kérést, ha az ugyanazzal a
//! kulcspárral van aláírva, amivel a böngésző feliratkozott. A NYILVÁNOS fele
//! ezért a kliensbe is bekerül (`NEXT_PUBLIC_…`) — az nem titok, az a
//! feliratkozás egyik bemenete. A PRIVÁT fele viszont a küldés joga: aki
//! megszerzi, a mi nevünkben tud üzenetet tenni a diákok telefonjára.
//*
//* Kulcspárt generálni: `bunx web-push generate-vapid-keys`.
const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
//* A szolgáltatók elvárnak egy elérhetőséget, hogy baj esetén legyen kit
//* megkeresni. `mailto:` vagy a lap címe.
const subject = process.env.VAPID_SUBJECT ?? "mailto:orarend@example.com";

//! A HIÁNYZÓ KULCS NEM HIBA, HANEM NÉMASÁG — ugyanaz a döntés, mint a Redisnél
//! (`usage-store.ts`). Egy friss klón `.env.local` nélkül is elindul és
//! kirajzolja az órarendet; csak értesítést nem küld. Ha itt dobnánk, egy
//! elfelejtett env-változó elvinné az egész lapot.
const configured = Boolean(publicKey && privateKey);
if (configured) {
  webpush.setVapidDetails(subject, publicKey as string, privateKey as string);
}

export function pushSendReady(): boolean {
  return configured;
}

//! A LEJÁRT FELIRATKOZÁS NEM HIBA, HANEM TAKARÍTANIVALÓ. A 404 és a 410
//! ugyanazt jelenti: ezt a végpontot a böngésző eldobta (törölték az appot,
//! visszavonták az engedélyt, kiürült a tárhely). Ha nem törölnénk, a
//! háttérfeladat minden percben újra próbálná — a sor pedig örökre ott
//! maradna a tárolóban, holott már senkihez sem tartozik.
const GONE = new Set([404, 410]);

export type SendResult = { sent: number; dropped: number };

export async function sendPush(
  subscriptions: readonly PushSubscription[],
  payload: PushPayload,
): Promise<SendResult> {
  if (!configured || subscriptions.length === 0) {
    return { sent: 0, dropped: 0 };
  }

  let sent = 0;
  let dropped = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
          //! `TTL`: meddig őrizze a szolgáltató, ha a készülék offline. Az
          //! órarend-értesítés ROMLANDÓ — egy „10 perc múlva matek" két órával
          //! később nem késés, hanem félrevezetés. Fél óra után inkább vesszen el.
          { TTL: 30 * 60, urgency: "normal" },
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status && GONE.has(status)) {
          await removeSubscription(sub.endpoint);
          dropped++;
          return;
        }
        //! EGY ROSSZ VÉGPONT NEM VIHETI EL A TÖBBIT. A `Promise.all` egyetlen
        //! elutasítást is továbbdobna, és a háttérfeladat félbeszakadna — a
        //! sorban következő osztályok diákjai kapnának semmit egy idegen
        //! szolgáltató átmeneti hibája miatt.
      }
    }),
  );

  return { sent, dropped };
}
