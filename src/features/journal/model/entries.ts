import { ref } from "vue";
import type { Entry, Hotspot, Position } from "../../../shared/types";
import { loadEntries, persist } from "../lib/storage";
export function createJournal(
  filmId: string,
  storageKey?: string,
  initial: Entry[] = [],
) {
  const stored = loadEntries(storageKey).filter(
    (e) => !e.filmId || e.filmId === filmId,
  );
  const entries = ref<Entry[]>(
      stored.length ? stored : initial.map((e) => JSON.parse(JSON.stringify(e)) as Entry),
    ),
    error = ref("");
  if (!stored.length && entries.value.length) persist(entries.value, storageKey);
  function commit(next: Entry[]) {
    if (!persist(next, storageKey)) {
      error.value = "本地空间不足，记录未保存，请先导出手记";
      return;
    }
    entries.value = next;
    error.value = "";
  }
  return {
    entries,
    error,
    has: (id: string) => entries.value.some((e) => e.hotspotId === id),
    save: (hotspot: Hotspot, position: Position) => {
      if (entries.value.some((e) => e.hotspotId === hotspot.id)) return;
      commit([
        ...entries.value,
        {
          id: crypto.randomUUID(),
          hotspotId: hotspot.id,
          chapterId: position.chapterId,
          time: position.time,
          camera: { ...position.camera },
          title: hotspot.title,
          note: "",
          createdAt: Date.now(),
          filmId,
        },
      ]);
    },
    remove: (id: string) => commit(entries.value.filter((e) => e.id !== id)),
    note: (id: string, note: string) =>
      commit(
        entries.value.map((e) =>
          e.id === id ? { ...e, note: note.slice(0, 500) } : e,
        ),
      ),
  };
}
export type Journal = ReturnType<typeof createJournal>;
