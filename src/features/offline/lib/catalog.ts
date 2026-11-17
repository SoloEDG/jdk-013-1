import type {
  FilmContent,
  NoteScope,
  PackageAsset,
  Entry,
} from "../../../shared/types";

const encoder = new TextEncoder();

/** JSON deep copy — safe for Vue reactive proxies, unlike structuredClone. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function bytes(text: string) {
  return encoder.encode(text).length;
}

function cacheOrigin() {
  return typeof location === "undefined" ? "http://localhost" : location.origin;
}

export function contentFingerprint(content: FilmContent): string {
  const raw = JSON.stringify(content);
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Freezes only the chapters being packed, with their hotspots and people. */
export function freezeContent(
  content: FilmContent,
  chapterIds: string[],
): FilmContent {
  const keep = new Set(chapterIds);
  const chapters = content.chapters.filter((c) => keep.has(c.id));
  const hotspots = content.hotspots.filter((h) => keep.has(h.chapterId));
  const peopleIds = new Set(
    hotspots.map((h) => h.personId).filter((id): id is string => !!id),
  );
  return {
    film: { ...content.film },
    chapters,
    hotspots,
    people: content.people.filter((p) => peopleIds.has(p.id)),
  };
}

export function contentVersion(content: FilmContent): string {
  return `${content.film.version}.${contentFingerprint(content)}`;
}

export function assetCacheKey(
  content: FilmContent,
  assetId: string,
  version = contentVersion(content),
): string {
  return new URL(
    `/__offline/${encodeURIComponent(content.film.id)}/${encodeURIComponent(
      version,
    )}/${encodeURIComponent(assetId)}`,
    cacheOrigin(),
  ).href;
}

export function selectedChapters(content: FilmContent, chapterIds: string[]) {
  const wanted = new Set(chapterIds);
  return content.chapters.filter((c) => wanted.has(c.id));
}

/**
 * Assets are deduplicated by media URL: the same film / panorama used by
 * several selected chapters is downloaded and stored once.
 */
export function buildPlan(
  content: FilmContent,
  chapterIds: string[],
  version = contentVersion(content),
): PackageAsset[] {
  const chapters = selectedChapters(content, chapterIds);
  const assets: PackageAsset[] = [];
  const videoByUrl = new Map<string, PackageAsset>();
  const panoramaByUrl = new Map<string, PackageAsset>();
  const interviewByPerson = new Map<string, PackageAsset>();

  for (const chapter of chapters) {
    const chapterHotspots = content.hotspots.filter(
      (h) => h.chapterId === chapter.id,
    );
    const chapterText = JSON.stringify({
      chapter,
      hotspots: chapterHotspots,
    });
    assets.push({
      id: `text:${chapter.id}`,
      kind: "text",
      label: `${chapter.title} · 章节文字与热点说明`,
      cacheKey: assetCacheKey(content, `text:${chapter.id}`, version),
      data: chapterText,
      chapters: [chapter.id],
      size: bytes(chapterText),
    });

    const existingPanorama = panoramaByUrl.get(chapter.panorama);
    if (existingPanorama) {
      if (!existingPanorama.chapters.includes(chapter.id))
        existingPanorama.chapters.push(chapter.id);
    } else {
      const panoramaId = `panorama:${chapter.panorama}`;
      const panorama: PackageAsset = {
        id: panoramaId,
        kind: "panorama",
        label: `${chapter.title} · 360° 全景`,
        cacheKey: assetCacheKey(content, panoramaId, version),
        url: chapter.panorama,
        chapters: [chapter.id],
        size: 0,
      };
      panoramaByUrl.set(chapter.panorama, panorama);
      assets.push(panorama);
    }

    const existingVideo = videoByUrl.get(chapter.video);
    if (existingVideo) {
      if (!existingVideo.chapters.includes(chapter.id))
        existingVideo.chapters.push(chapter.id);
    } else {
      const video: PackageAsset = {
        id: `video:${chapter.video}`,
        kind: "video",
        label: "章节影像",
        cacheKey: assetCacheKey(content, `video:${chapter.video}`, version),
        url: chapter.video,
        chapters: [chapter.id],
        size: 0,
      };
      videoByUrl.set(chapter.video, video);
      assets.push(video);
    }

    for (const hotspot of chapterHotspots) {
      if (!hotspot.personId) continue;
      const person = content.people.find((p) => p.id === hotspot.personId);
      if (!person) continue;
      const existing = interviewByPerson.get(person.id);
      if (existing) {
        if (!existing.chapters.includes(chapter.id))
          existing.chapters.push(chapter.id);
        continue;
      }
      const data = JSON.stringify(person);
      const asset: PackageAsset = {
        id: `interview:${person.id}`,
        kind: "interview",
        label: `${person.name} · 人物访谈文字`,
        cacheKey: assetCacheKey(content, `interview:${person.id}`, version),
        data,
        chapters: [chapter.id],
        size: bytes(data),
      };
      interviewByPerson.set(person.id, asset);
      assets.push(asset);
    }
  }

  return assets;
}

export function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return "大小未知";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024)
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function assetKindLabel(kind: PackageAsset["kind"]) {
  return {
    video: "影像",
    panorama: "全景",
    interview: "访谈",
    text: "文字",
  }[kind];
}

/**
 * Notes are captured at completion only. Entries belonging to another film
 * are never included, even if such a film is opened while the package builds.
 * Legacy entries without a film id belong to the original film only.
 */
export function captureNotes(
  entries: Entry[],
  filmId: string,
  primaryFilmId: string,
  chapterIds: string[],
  scope: NoteScope,
): Entry[] {
  if (scope === "none") return [];
  const allowedChapters = new Set(chapterIds);
  return entries
    .filter(
      (e) =>
        e.filmId === filmId ||
        (e.filmId === undefined && filmId === primaryFilmId),
    )
    .filter((e) => scope === "all" || allowedChapters.has(e.chapterId))
    .map((e) => clone(e));
}
