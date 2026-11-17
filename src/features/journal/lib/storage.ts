import type { Entry } from "../../../shared/types";
const key = "tidal-journal-v1";
export const PRIMARY_FILM_ID = "tidal-stories";
/** The original film keeps the legacy key so existing notes are not lost. */
export function filmStorageKey(filmId: string): string {
  return filmId === PRIMARY_FILM_ID ? key : `${key}:${filmId}`;
}
export function loadEntries(storageKey = key): Entry[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (e): e is Entry =>
        !!e &&
        typeof e.id === "string" &&
        typeof e.hotspotId === "string" &&
        typeof e.chapterId === "string" &&
        Number.isFinite(e.time) &&
        typeof e.title === "string" &&
        typeof e.note === "string" &&
        e.camera &&
        Number.isFinite(e.camera.yaw) &&
        Number.isFinite(e.camera.pitch) &&
        Number.isFinite(e.camera.fov) &&
        Number.isFinite(e.createdAt),
    );
  } catch {
    return [];
  }
}
export function readFilmEntries(filmId: string): Entry[] {
  return loadEntries(filmStorageKey(filmId)).filter(
    (e) => !e.filmId || e.filmId === filmId,
  );
}
export function persist(entries: Entry[], storageKey = key) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}
