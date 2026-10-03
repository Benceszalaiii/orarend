import { jsonUtf8 } from "@/lib/json-response";
import { filterSubjects, findSubject } from "@/lib/subjects";
import { loadSubjectIndex } from "@/lib/subjects-source";

//! ─── KI TANÍTJA, KINEK ─────────────────────────────────────────────────────
//! Ugyanaz a helyzet, mint a `/api/termek`-nél: a válasz a termek sepréséből
//! jön (miért, azt a `lib/subjects.ts` fejléce írja le), és azt a szerver
//! végzi el óránként egyszer, mindenki helyett. A böngésző egy kérést küld.
//*
//* Nyilvános végpont, mint maga az órarend: tantárgy, tanár, osztály — semmi,
//* ami egy diákról szólna.
//*
//* `?tantargy=<név>` — egy tárgy pontos neve (kis-nagybetű, ékezet mindegy).
//* `?kereses=<szöveg>` — a tárgyak, amelyek nevében vagy jelében ez szerepel.

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const index = await loadSubjectIndex();
  if (!index) {
    //* Se friss, se lejárt pillanatkép — a Jedlikinfo nem érhető el, és nem a
    //* látogató hibájából. Az 503 megmondja, hogy érdemes később próbálni.
    return jsonUtf8(
      {
        error: "A Jedlikinfo API-ból most nem sikerült lekérni a tantárgyakat.",
      },
      { status: 503 },
    );
  }

  //! MENNYIRE RÉGI EZ A VÁLASZ — ugyanaz az érv, mint a teremkeresőnél: egy
  //! sikertelen seprés után lejárt példány is kimehet, és ezt ki kell írni.
  const ageMinutes = Math.max(
    0,
    Math.floor((Date.now() - index.fetchedAt) / 60_000),
  );

  const name = params.get("tantargy")?.trim();
  if (name) {
    const subject = findSubject(index.subjects, name);
    if (!subject) {
      return jsonUtf8(
        {
          error:
            "Nincs ilyen nevű tantárgy az e heti és a jövő heti órarendben. A `kereses` paraméterrel vagy paraméter nélkül a teljes lista kérhető.",
        },
        { status: 404 },
      );
    }
    return jsonUtf8({
      weeks: index.weeks,
      fetchedAt: index.fetchedAt,
      ageMinutes,
      unknown: index.unknown,
      subject,
    });
  }

  const query = params.get("kereses") ?? "";
  return jsonUtf8({
    ...index,
    subjects: filterSubjects(index.subjects, query),
    ageMinutes,
  });
}
