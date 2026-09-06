import type { Metadata } from "next";
import { Landing } from "./_components/landing";

//! ─── A NYITÓLAP MEGŐRZÖTT CÍME ─────────────────────────────────────────────
//! A lap törzse a `/`-re költözött (lásd `app/page.tsx`), de ez a cím MARAD:
//! a váltó „Nyitólap" hivatkozása erre mutat, és ez az egyetlen visszaút
//! azoknak, akiket a `/`-ről a süti már továbbküld a saját nézetükbe. Ha a
//! `/home` a `/`-re irányítana, ők soha többé nem látnák a nyitólapot.
//*
//! A KERESŐNEK VISZONT EGY LAP, EGY CÍM: a kanonikus hivatkozás a gyökérre
//! mutat, így a két azonos tartalom nem versenyez egymással.

export const metadata: Metadata = {
  title: "Órarend — a Jedlik hete egy lapon",
  description:
    "A Jedlik órarendje osztályokra, csoportbontásokra és duális hetekre bontva: heti rács teljes képernyőn, vagy a mai nap egyetlen képernyőn, óráról órára.",
  alternates: { canonical: "https://jedlik.info/" },
};

export default function Page() {
  return <Landing />;
}
