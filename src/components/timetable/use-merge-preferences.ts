"use client";

import { useCallback, useEffect, useState } from "react";
import {
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
  undo: (clusterKey: string) => void;
  undoMany: (clusterKeys: string[]) => void;
  reset: () => void;
  count: number;
};

export function useMergePreferences({
  classShort,
}: {
  classShort: string;
}): MergePreferencesApi {
  const [prefs, setPrefs] = useState<MergePreference[]>([]);

  useEffect(() => {
    if (!classShort) return;
    setPrefs(loadLocalPreferences(classShort));
  }, [classShort]);

  useEffect(() => {
    if (!classShort) return;
    saveLocalPreferences(classShort, prefs);
  }, [classShort, prefs]);

  const choose = useCallback(
    (clusterKey: string, chosen: string) => {
      if (!classShort) return;
      setPrefs((current) => upsertPreference(current, { clusterKey, chosen }));
    },
    [classShort],
  );

  const undo = useCallback(
    (clusterKey: string) => {
      if (!classShort) return;
      setPrefs((current) => removePreference(current, clusterKey));
    },
    [classShort],
  );

  const undoMany = useCallback(
    (clusterKeys: string[]) => {
      if (!classShort || clusterKeys.length === 0) return;
      setPrefs((current) => removePreferences(current, clusterKeys));
    },
    [classShort],
  );

  const reset = useCallback(() => {
    if (!classShort) return;
    setPrefs([]);
  }, [classShort]);

  return { prefs, choose, undo, undoMany, reset, count: prefs.length };
}
