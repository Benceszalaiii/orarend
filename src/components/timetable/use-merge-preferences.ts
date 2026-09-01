"use client";

import { useCallback, useEffect, useState } from "react";
import {
  hideIdentity,
  loadLocalPreferences,
  type MergePreference,
  removePreference,
  removePreferences,
  saveLocalPreferences,
  upsertPreference,
} from "@/lib/timetable-merge";

export type MergePreferencesApi = {
  prefs: MergePreference[];
  choose: (clusterKey: string, chosen: string) => void;
  //* Egyetlen óra elrejtése ütköző pár nélkül (lásd `hideIdentity`).
  hide: (identity: string) => void;
  undo: (clusterKey: string) => void;
  undoMany: (clusterKeys: string[]) => void;
  reset: () => void;
  count: number;
};

//* ---------------------------------------------------------------------------
//* A DÖNTÉSEK MINDIG EGY OSZTÁLYHOZ TARTOZNAK
//* ---------------------------------------------------------------------------
//! A lista ÖNMAGÁBAN nem elég állapot, mert két pillanatban is üres: mielőtt
//! betöltöttük a tárolóból, és amikor tényleg nincs döntés — a mentés viszont
//! nem tudja megkülönböztetni a kettőt. Amíg a lista mellett nem állt ott, MELYIK
//! osztályé, ebből két valódi hiba lett:
//!
//!  1. MINDEN ÚJRATÖLTÉS TÖRÖLT. Az osztály neve csak az órarend megérkezésekor
//!     áll be; abban a renderben a mentő effekt még a kezdeti ÜRES listát látta,
//!     és azt írta a tárolóba — vagyis a diák összes döntése elveszett, mielőtt
//!     a betöltött érték visszaírhatta volna. A csoportbontás-feloldás így
//!     minden megnyitáskor elölről kezdődött.
//!  2. OSZTÁLYVÁLTÁSKOR ÁTFOLYT. A választó átállításakor egy pillanatra az ÚJ
//!     osztály neve állt a RÉGI osztály döntései mellett — és a mentés ezeket a
//!     döntéseket az új osztály neve alatt rögzítette.
//!
//! Ezért egyben tartjuk a kettőt: a mentés csak akkor ír, ha a listán rajta van
//! annak az osztálynak a neve, amelyiké épp lennie kell.
type PrefsState = { cls: string; prefs: MergePreference[] };

const EMPTY: PrefsState = { cls: "", prefs: [] };

export function useMergePreferences({
  classShort,
}: {
  classShort: string;
}): MergePreferencesApi {
  const [state, setState] = useState<PrefsState>(EMPTY);

  useEffect(() => {
    if (!classShort) return;
    setState({ cls: classShort, prefs: loadLocalPreferences(classShort) });
  }, [classShort]);

  useEffect(() => {
    //* Amíg a betöltés meg nem történt (vagy más osztályé az állapot), NEM írunk.
    if (!classShort || state.cls !== classShort) return;
    saveLocalPreferences(classShort, state.prefs);
  }, [classShort, state]);

  //* Minden módosítás ezen az egy kapun megy át: a saját osztályán kívül nem ír.
  const update = useCallback(
    (next: (current: MergePreference[]) => MergePreference[]) => {
      if (!classShort) return;
      setState((current) =>
        current.cls === classShort
          ? { cls: current.cls, prefs: next(current.prefs) }
          : current,
      );
    },
    [classShort],
  );

  const choose = useCallback(
    (clusterKey: string, chosen: string) => {
      update((current) => upsertPreference(current, { clusterKey, chosen }));
    },
    [update],
  );

  const hide = useCallback(
    (identity: string) => {
      if (!identity) return;
      update((current) => hideIdentity(current, identity));
    },
    [update],
  );

  const undo = useCallback(
    (clusterKey: string) => {
      update((current) => removePreference(current, clusterKey));
    },
    [update],
  );

  const undoMany = useCallback(
    (clusterKeys: string[]) => {
      if (clusterKeys.length === 0) return;
      update((current) => removePreferences(current, clusterKeys));
    },
    [update],
  );

  const reset = useCallback(() => {
    update(() => []);
  }, [update]);

  const prefs = state.cls === classShort ? state.prefs : EMPTY.prefs;

  return { prefs, choose, hide, undo, undoMany, reset, count: prefs.length };
}
