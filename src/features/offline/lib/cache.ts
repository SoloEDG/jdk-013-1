import type { PackageAsset } from "../../../shared/types";

export const ASSET_CACHE = "tidal-offline-assets-v1";

function requestFor(cacheKey: string) {
  return new Request(cacheKey, { method: "GET" });
}

async function openCache() {
  if (typeof caches === "undefined")
    throw new Error("当前浏览器不支持离线缓存");
  return caches.open(ASSET_CACHE);
}

export async function readCached(
  cacheKey: string,
): Promise<Response | undefined> {
  try {
    const cache = await openCache();
    return await cache.match(requestFor(cacheKey));
  } catch {
    return undefined;
  }
}

export async function isCached(cacheKey: string): Promise<boolean> {
  return !!(await readCached(cacheKey));
}

export async function cachedKeys(keys: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const key of keys) if (await isCached(key)) found.add(key);
  return found;
}

export async function putData(cacheKey: string, data: string) {
  const cache = await openCache();
  await cache.put(
    requestFor(cacheKey),
    new Response(data, {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }),
  );
}

export async function fetchIntoCache(
  asset: PackageAsset,
  onProgress: (received: number, total: number | null) => void,
): Promise<number> {
  if (asset.data !== undefined) {
    await putData(asset.cacheKey, asset.data);
    const size = new TextEncoder().encode(asset.data).length;
    onProgress(size, size);
    return size;
  }
  if (!asset.url) throw new Error("缺少素材地址");
  const response = await fetch(asset.url, { cache: "no-store" });
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`);
  const total = Number(response.headers.get("content-length")) || null;
  const cache = await openCache();
  const copy = response.clone();
  const store = cache.put(requestFor(asset.cacheKey), copy);
  if (!response.body) {
    await store;
    const size = (await response.blob()).size;
    onProgress(size, size);
    return size;
  }
  const reader = response.body.getReader();
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      onProgress(received, total);
    }
    await store;
  } catch (error) {
    // A failed transfer must not leave a partial asset that looks complete.
    store.catch(() => {});
    await deleteCached(asset.cacheKey);
    throw error;
  }
  return received;
}

export async function deleteCached(cacheKey: string) {
  try {
    const cache = await openCache();
    await cache.delete(requestFor(cacheKey));
  } catch {
    /* cache may be unavailable */
  }
}

export async function cacheUsage(keys: string[]): Promise<number> {
  let total = 0;
  for (const key of keys) {
    const response = await readCached(key);
    if (!response) continue;
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > 0) total += length;
    else total += (await response.clone().blob()).size;
  }
  return total;
}

export function isQuotaError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}
