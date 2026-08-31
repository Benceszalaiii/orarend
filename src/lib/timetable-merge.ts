import type { TimetableLesson } from "./timetable";

export const MERGE_GAP_MAX_MIN = 25;

export const MERGE_PREFS_STORAGE_KEY = "orarend:merge-prefs:v1";

const FIELD_SEP = "|";
const CLUSTER_SEP = "+";

export function lessonIdentity(lesson: LessonLike): string {
  return [
    safe(lesson.subjectShort || lesson.subject),
    safe(lesson.group),
    safe(lesson.teacherShort || lesson.teacher),
  ].join(FIELD_SEP);
}

export type LessonLike = Pick<
  TimetableLesson,
  "subject" | "subjectShort" | "teacher" | "teacherShort" | "group"
>;

function safe(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/[|+]/g, "/");
}

export type IdentityParts = {
  subject: string;
  group: string;
  teacher: string;
};

export function identityParts(identity: string): IdentityParts {
  const [subject = "", group = "", teacher = ""] = identity.split(FIELD_SEP);
  return { subject, group: prettyGroup(group), teacher };
}

export function prettyGroup(group: string): string {
  const dash = group.indexOf("-");
  if (dash < 0) return group.trim();
  const head = group.slice(0, dash);
  let rest = group.slice(dash + 1);
  if (head && rest.startsWith(head)) rest = rest.slice(head.length);
  return rest.trim() || group.trim();
}

export function groupLabel(group: string, subject: string): string {
  const base = prettyGroup(group);
  const prefix = subject.trim();
  if (!prefix || base.length <= prefix.length) return base;
  if (base.toLocaleLowerCase("hu").startsWith(prefix.toLocaleLowerCase("hu"))) {
    return base.slice(prefix.length).trim() || base;
  }
  return base;
}

export type MergePreference = {
  clusterKey: string;
  chosen: string;
};

export function chosenIdentities(chosen: string): string[] {
  return clusterIdentities(chosen);
}

export function clusterKeyOf(identities: string[]): string {
  return [...new Set(identities)].sort().join(CLUSTER_SEP);
}

export function clusterIdentities(clusterKey: string): string[] {
  return clusterKey.split(CLUSTER_SEP).filter(Boolean);
}

export function suppressedIdentities(prefs: MergePreference[]): Set<string> {
  const out = new Set<string>();
  for (const pref of prefs) {
    const kept = new Set(chosenIdentities(pref.chosen));
    for (const id of clusterIdentities(pref.clusterKey)) {
      if (!kept.has(id)) out.add(id);
    }
  }
  return out;
}

export function upsertPreference(
  prefs: MergePreference[],
  next: MergePreference,
): MergePreference[] {
  return [next, ...prefs.filter((p) => p.clusterKey !== next.clusterKey)];
}

export function removePreference(
  prefs: MergePreference[],
  clusterKey: string,
): MergePreference[] {
  return prefs.filter((p) => p.clusterKey !== clusterKey);
}

export function preferencesHiding(
  prefs: MergePreference[],
  identities: string[],
): string[] {
  const wanted = new Set(identities);
  return prefs
    .filter((pref) => {
      const kept = new Set(chosenIdentities(pref.chosen));
      return clusterIdentities(pref.clusterKey).some(
        (id) => !kept.has(id) && wanted.has(id),
      );
    })
    .map((pref) => pref.clusterKey);
}

export function removePreferences(
  prefs: MergePreference[],
  clusterKeys: string[],
): MergePreference[] {
  const drop = new Set(clusterKeys);
  return prefs.filter((p) => !drop.has(p.clusterKey));
}

export type ClusterOption = {
  identity: string;
  lesson: TimetableLesson;
  count: number;
};

export type ClusterChoice = {
  key: string;
  options: ClusterOption[];
};

export type ConflictCluster = {
  key: string;
  startMin: number;
  endMin: number;
  options: ClusterOption[];
  choices: ClusterChoice[];
  visible: string[];
  hidden: string[];
  decided: boolean;
};

const MAX_CLUSTER_IDENTITIES = 8;

function conflictGraph(
  options: ClusterOption[],
  lessonsByIdentity: Map<string, TimetableLesson[]>,
): Map<string, Set<string>> {
  const compatible = new Map<string, Set<string>>();
  for (const a of options) compatible.set(a.identity, new Set());
  for (const a of options) {
    for (const b of options) {
      if (a.identity === b.identity) continue;
      const overlaps = (lessonsByIdentity.get(a.identity) ?? []).some((la) =>
        (lessonsByIdentity.get(b.identity) ?? []).some(
          (lb) => la.startMin < lb.endMin && lb.startMin < la.endMin,
        ),
      );
      if (!overlaps) compatible.get(a.identity)?.add(b.identity);
    }
  }
  return compatible;
}

function maximalCombinations(
  options: ClusterOption[],
  lessonsByIdentity: Map<string, TimetableLesson[]>,
): ClusterChoice[] {
  const byIdentity = new Map(options.map((o) => [o.identity, o] as const));
  if (options.length > MAX_CLUSTER_IDENTITIES) {
    return options.map((o) => ({ key: o.identity, options: [o] }));
  }
  const compatible = conflictGraph(options, lessonsByIdentity);
  const sets: string[][] = [];

  const expand = (r: string[], p: string[], x: string[]) => {
    if (p.length === 0 && x.length === 0) {
      if (r.length > 0) sets.push([...r]);
      return;
    }
    let pool = [...p];
    let excluded = [...x];
    for (const v of [...pool]) {
      const neighbours = compatible.get(v) ?? new Set<string>();
      expand(
        [...r, v],
        pool.filter((u) => neighbours.has(u)),
        excluded.filter((u) => neighbours.has(u)),
      );
      pool = pool.filter((u) => u !== v);
      excluded = [...excluded, v];
    }
  };
  expand(
    [],
    options.map((o) => o.identity),
    [],
  );

  return sets
    .map((ids) => {
      const sorted = [...ids].sort();
      return {
        key: sorted.join(CLUSTER_SEP),
        options: sorted
          .map((id) => byIdentity.get(id))
          .filter((o): o is ClusterOption => Boolean(o))
          .sort((a, b) => a.lesson.startMin - b.lesson.startMin),
      };
    })
    .sort(
      (a, b) =>
        b.options.length - a.options.length ||
        a.options[0].lesson.groupColumn - b.options[0].lesson.groupColumn ||
        a.key.localeCompare(b.key, "hu"),
    );
}

function overlapClusters(lessons: TimetableLesson[]): TimetableLesson[][] {
  const sorted = [...lessons].sort(
    (a, b) => a.startMin - b.startMin || a.endMin - b.endMin,
  );
  const out: TimetableLesson[][] = [];
  let current: TimetableLesson[] = [];
  let currentEnd = -1;
  for (const lesson of sorted) {
    if (current.length > 0 && lesson.startMin >= currentEnd) {
      out.push(current);
      current = [];
    }
    current.push(lesson);
    currentEnd = Math.max(currentEnd, lesson.endMin);
  }
  if (current.length > 0) out.push(current);
  return out;
}

export type PeriodLike = { startMin: number; endMin: number };

function breaksWithin(
  startMin: number,
  endMin: number,
  segments: { startMin: number; endMin: number }[],
  periods: PeriodLike[],
): { startMin: number; endMin: number }[] {
  const covering = periods
    .filter((p) => p.startMin < endMin && p.endMin > startMin)
    .map((p) => ({
      startMin: Math.max(p.startMin, startMin),
      endMin: Math.min(p.endMin, endMin),
    }));
  const covered = covering.length > 0 ? covering : segments;

  const merged: { startMin: number; endMin: number }[] = [];
  for (const span of [...covered].sort((a, b) => a.startMin - b.startMin)) {
    const last = merged[merged.length - 1];
    if (last && span.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, span.endMin);
      continue;
    }
    merged.push({ ...span });
  }

  const gaps: { startMin: number; endMin: number }[] = [];
  let cursor = startMin;
  for (const span of merged) {
    if (span.startMin > cursor) {
      gaps.push({ startMin: cursor, endMin: span.startMin });
    }
    cursor = Math.max(cursor, span.endMin);
  }
  return gaps.filter((g) => g.endMin - g.startMin >= 1);
}

function chainConflicts(clusters: ConflictCluster[]): ConflictCluster[] {
  const byKey = new Map<string, ConflictCluster[]>();
  for (const cluster of clusters) {
    byKey.set(cluster.key, [...(byKey.get(cluster.key) ?? []), cluster]);
  }
  const out: ConflictCluster[] = [];
  for (const group of byKey.values()) {
    const sorted = [...group].sort((a, b) => a.startMin - b.startMin);
    let index = -1;
    for (const cluster of sorted) {
      const current = index >= 0 ? out[index] : null;
      if (current && cluster.startMin - current.endMin <= MERGE_GAP_MAX_MIN) {
        out[index] = {
          ...current,
          endMin: Math.max(current.endMin, cluster.endMin),
        };
        continue;
      }
      out.push({ ...cluster });
      index = out.length - 1;
    }
  }
  return out.sort((a, b) => a.startMin - b.startMin);
}

export type LessonRun = {
  key: string;
  identity: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  segments: { startMin: number; endMin: number; room: string }[];
  lessonCount: number;
  breaks: { startMin: number; endMin: number }[];
  lesson: TimetableLesson;
  rooms: string[];
  hidden: ClusterOption[];
  clusterKeys: string[];
};

export type GhostBlock = {
  key: string;
  clusterKey: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  hidden: ClusterOption[];
};

export type ResolvedDay = {
  runs: LessonRun[];
  ghosts: GhostBlock[];
  conflicts: ConflictCluster[];
};

export function resolveDay(
  dayLessons: TimetableLesson[],
  prefs: MergePreference[],
  periods: PeriodLike[] = [],
): ResolvedDay {
  const byKey = new Map(prefs.map((p) => [p.clusterKey, p.chosen] as const));
  const suppressed = suppressedIdentities(prefs);

  const clusters: ConflictCluster[] = [];
  const ghosts: GhostBlock[] = [];
  const visibleLessons: TimetableLesson[] = [];
  const hiddenByCluster = new Map<string, ClusterOption[]>();

  for (const group of overlapClusters(dayLessons)) {
    const options = toOptions(group);
    const identities = options.map((o) => o.identity);
    const key = clusterKeyOf(identities);

    const lessonsByIdentity = new Map<string, TimetableLesson[]>();
    for (const lesson of group) {
      const id = lessonIdentity(lesson);
      lessonsByIdentity.set(id, [...(lessonsByIdentity.get(id) ?? []), lesson]);
    }
    const choices = maximalCombinations(options, lessonsByIdentity);

    let visible = identities;
    let decided = false;

    const chosen = byKey.get(key);
    const chosenSet = chosen ? chosenIdentities(chosen) : [];
    if (
      chosenSet.length > 0 &&
      chosenSet.every((id) => identities.includes(id))
    ) {
      visible = chosenSet;
      decided = true;
    } else {
      const kept = identities.filter((id) => !suppressed.has(id));
      visible = kept;
      decided = kept.length !== identities.length;
    }

    const hidden = identities.filter((id) => !visible.includes(id));
    const hiddenOptions = options.filter((o) => hidden.includes(o.identity));
    const startMin = Math.min(...group.map((l) => l.startMin));
    const endMin = Math.max(...group.map((l) => l.endMin));

    if (visible.length === 0) {
      ghosts.push({
        key: `ghost-${group[0].dayOfWeek}-${startMin}-${key}`,
        clusterKey: key,
        dayOfWeek: group[0].dayOfWeek,
        startMin,
        endMin,
        hidden: hiddenOptions,
      });
      continue;
    }

    const openChoices = maximalCombinations(
      options.filter((o) => visible.includes(o.identity)),
      lessonsByIdentity,
    );
    if (openChoices.length > 1) {
      clusters.push({
        key,
        startMin,
        endMin,
        options,
        choices: openChoices,
        visible,
        hidden,
        decided,
      });
    }

    for (const lesson of group) {
      if (!visible.includes(lessonIdentity(lesson))) continue;
      visibleLessons.push(lesson);
    }
    if (hiddenOptions.length > 0) {
      for (const id of visible) {
        hiddenByCluster.set(id, [
          ...(hiddenByCluster.get(id) ?? []),
          ...hiddenOptions,
        ]);
      }
    }
  }

  const keyOfCluster = new Map<string, string>();
  for (const cluster of clusters) {
    for (const id of cluster.visible) {
      if (cluster.hidden.length > 0) keyOfCluster.set(id, cluster.key);
    }
  }

  return {
    runs: buildRuns(visibleLessons, hiddenByCluster, keyOfCluster, periods),
    ghosts,
    conflicts: chainConflicts(clusters),
  };
}

function toOptions(lessons: TimetableLesson[]): ClusterOption[] {
  const map = new Map<string, ClusterOption>();
  for (const lesson of lessons) {
    const identity = lessonIdentity(lesson);
    const existing = map.get(identity);
    if (existing) existing.count += 1;
    else map.set(identity, { identity, lesson, count: 1 });
  }
  return [...map.values()].sort(
    (a, b) =>
      a.lesson.groupColumn - b.lesson.groupColumn ||
      a.identity.localeCompare(b.identity, "hu"),
  );
}

function buildRuns(
  lessons: TimetableLesson[],
  hiddenByCluster: Map<string, ClusterOption[]>,
  keyOfCluster: Map<string, string>,
  periods: PeriodLike[],
): LessonRun[] {
  const byIdentity = new Map<string, TimetableLesson[]>();
  for (const lesson of lessons) {
    const identity = lessonIdentity(lesson);
    byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), lesson]);
  }

  const runs: LessonRun[] = [];
  for (const [identity, group] of byIdentity) {
    const sorted = [...group].sort((a, b) => a.startMin - b.startMin);
    let chain: TimetableLesson[] = [];
    const flush = () => {
      if (chain.length === 0) return;
      const hidden = dedupeOptions(hiddenByCluster.get(identity) ?? []);
      const clusterKey = keyOfCluster.get(identity);
      runs.push({
        key: `run-${chain[0].dayOfWeek}-${identity}-${chain[0].startMin}`,
        identity,
        dayOfWeek: chain[0].dayOfWeek,
        startMin: chain[0].startMin,
        endMin: chain[chain.length - 1].endMin,
        segments: chain.map((l) => ({
          startMin: l.startMin,
          endMin: l.endMin,
          room: l.room,
        })),
        breaks: breaksWithin(
          chain[0].startMin,
          chain[chain.length - 1].endMin,
          chain,
          periods,
        ),
        lessonCount: countPeriods(
          chain[0].startMin,
          chain[chain.length - 1].endMin,
          chain.length,
          periods,
        ),
        lesson: chain[0],
        rooms: [...new Set(chain.map((l) => l.room).filter(Boolean))],
        hidden,
        clusterKeys: clusterKey ? [clusterKey] : [],
      });
      chain = [];
    };

    for (const lesson of sorted) {
      const prev = chain[chain.length - 1];
      if (prev && lesson.startMin - prev.endMin > MERGE_GAP_MAX_MIN) flush();
      if (prev && lesson.startMin < prev.endMin) continue;
      chain.push(lesson);
    }
    flush();
  }

  return runs.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}

function countPeriods(
  startMin: number,
  endMin: number,
  fallback: number,
  periods: PeriodLike[],
): number {
  const covering = periods.filter(
    (p) => p.startMin < endMin && p.endMin > startMin,
  );
  return covering.length > 0 ? covering.length : fallback;
}

function dedupeOptions(options: ClusterOption[]): ClusterOption[] {
  const map = new Map<string, ClusterOption>();
  for (const option of options) {
    if (!map.has(option.identity)) map.set(option.identity, option);
  }
  return [...map.values()];
}

export type PreferenceRow = {
  clusterKey: string;
  chosen: IdentityParts[];
  hidden: IdentityParts[];
  active: boolean;
};

export function preferenceRows(
  prefs: MergePreference[],
  lessons: TimetableLesson[],
): PreferenceRow[] {
  const present = new Set(lessons.map(lessonIdentity));
  return prefs.map((pref) => {
    const identities = clusterIdentities(pref.clusterKey);
    const kept = new Set(chosenIdentities(pref.chosen));
    return {
      clusterKey: pref.clusterKey,
      chosen: [...kept].map((id) => identityParts(id)),
      hidden: identities
        .filter((id) => !kept.has(id))
        .map((id) => identityParts(id)),
      active: identities.some((id) => present.has(id)),
    };
  });
}

type StoredPrefs = Record<string, MergePreference[]>;

function readStore(): StoredPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MERGE_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as StoredPrefs;
  } catch {
    return {};
  }
}

export function loadLocalPreferences(classShort: string): MergePreference[] {
  const store = readStore();
  const list = store[classShort];
  return Array.isArray(list) ? list.filter(isPreference) : [];
}

export function loadAllLocalPreferences(): StoredPrefs {
  return readStore();
}

export function saveLocalPreferences(
  classShort: string,
  prefs: MergePreference[],
): void {
  if (typeof window === "undefined") return;
  try {
    const store = readStore();
    if (prefs.length === 0) delete store[classShort];
    else store[classShort] = prefs;
    window.localStorage.setItem(MERGE_PREFS_STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

export function clearAllLocalPreferences(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(MERGE_PREFS_STORAGE_KEY);
  } catch {}
}

function isPreference(value: unknown): value is MergePreference {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MergePreference).clusterKey === "string" &&
    typeof (value as MergePreference).chosen === "string"
  );
}
