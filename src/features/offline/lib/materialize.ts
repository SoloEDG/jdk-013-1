import type { FilmContent, OfflinePackage, PackageAsset } from "../../../shared/types";
import { readCached } from "./cache";
import { clone } from "./catalog";

export interface Materialized {
  content: FilmContent;
  objectUrls: string[];
  droppedChapters: string[];
  missingInterviews: string[];
  missingAssets: PackageAsset[];
}

/**
 * Resolves a package's frozen content against the Cache API only — no
 * network. Chapters whose panorama or video is missing are left out so an
 * incomplete package can never pretend to be complete.
 */
export async function materializePackage(
  pkg: OfflinePackage,
  chapterIds: string[],
  missingIds: string[] = pkg.missingAssetIds,
): Promise<Materialized> {
  const missingSet = new Set(missingIds);
  const content = clone(pkg.content);
  const wanted = new Set(chapterIds);
  const byUrl = new Map<string, PackageAsset>();
  for (const asset of pkg.assets) if (asset.url) byUrl.set(asset.url, asset);
  const objectUrls: string[] = [];
  const missingAssets: PackageAsset[] = [];
  const dropped: string[] = [];
  const chapters = [];
  for (const chapter of content.chapters) {
    if (!wanted.has(chapter.id)) continue;
    let resolved = true;
    const copy = { ...chapter };
    for (const field of ["panorama", "video"] as const) {
      const asset = byUrl.get(chapter[field]);
      const response = asset ? await readCached(asset.cacheKey) : undefined;
      if (!asset || !response) {
        resolved = false;
        if (asset) missingAssets.push(asset);
        continue;
      }
      const url = URL.createObjectURL(await response.blob());
      objectUrls.push(url);
      copy[field] = url;
    }
    if (resolved) chapters.push(copy);
    else dropped.push(chapter.id);
  }
  const kept = new Set(chapters.map((c) => c.id));
  const hotspots = content.hotspots.filter((h) => kept.has(h.chapterId));
  const peopleIds = new Set(
    hotspots.map((h) => h.personId).filter((id): id is string => !!id),
  );
  const missingInterviews = [...peopleIds].filter((personId) =>
    missingSet.has(`interview:${personId}`),
  );
  return {
    content: {
      film: content.film,
      chapters,
      hotspots,
      people: content.people.filter((p) => peopleIds.has(p.id)),
    },
    objectUrls,
    droppedChapters: dropped,
    missingInterviews,
    missingAssets,
  };
}
