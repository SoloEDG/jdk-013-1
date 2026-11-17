export interface Camera {
  yaw: number;
  pitch: number;
  fov: number;
}
export interface Chapter {
  id: string;
  title: string;
  subtitle: string;
  duration: number;
  panorama: string;
  video: string;
  location: string;
  description: string;
}
export interface Hotspot {
  id: string;
  chapterId: string;
  title: string;
  kind: "person" | "archive" | "sound";
  start: number;
  end: number;
  yaw: number;
  pitch: number;
  summary: string;
  personId?: string;
}
export interface Person {
  id: string;
  name: string;
  role: string;
  quote: string;
  paragraphs: string[];
}
export interface FilmMeta {
  id: string;
  title: string;
  subtitle: string;
  volume: string;
  version: string;
}
/** A frozen, self-contained description of the film (or the selected part of it). */
export interface FilmContent {
  film: FilmMeta;
  chapters: Chapter[];
  hotspots: Hotspot[];
  people: Person[];
}
export interface Position {
  chapterId: string;
  time: number;
  camera: Camera;
  playing: boolean;
}
export interface Entry {
  id: string;
  hotspotId: string;
  chapterId: string;
  time: number;
  camera: Camera;
  title: string;
  note: string;
  createdAt: number;
  /** Film an entry belongs to. Older entries did not record one. */
  filmId?: string;
}
export type Command =
  | { type: "chapter"; id: string }
  | { type: "seek"; time: number }
  | { type: "hotspot"; id: string }
  | { type: "return" }
  | { type: "revisit"; entry: Entry };

export type AssetKind = "video" | "panorama" | "interview" | "text";

/** One downloadable unit. Media shared by chapters appears only once. */
export interface PackageAsset {
  id: string;
  kind: AssetKind;
  label: string;
  /** Versioned Cache API key. */
  cacheKey: string;
  /** Original media URL, used to resolve playback sources offline. */
  url?: string;
  /** Inline JSON payload for text/interview assets. */
  data?: string;
  chapters: string[];
  size: number;
}

export type NoteScope = "selected" | "all" | "none";

export interface OfflinePackage {
  id: string;
  createdAt: number;
  completedAt: number;
  filmId: string;
  filmTitle: string;
  /** The content version that was current when production started. */
  contentVersion: string;
  chapterIds: string[];
  /** Frozen film snapshot; playback never consults the live catalog. */
  content: FilmContent;
  assets: PackageAsset[];
  notes: Entry[];
  notesScope: NoteScope;
  status: "ready" | "incomplete";
  missingAssetIds: string[];
}
