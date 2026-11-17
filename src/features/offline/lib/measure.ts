import type { PackageAsset } from "../../../shared/types";
import { readCached } from "./cache";

export async function measureAsset(asset: PackageAsset): Promise<number | null> {
  if (asset.data !== undefined) {
    asset.size = new TextEncoder().encode(asset.data).length;
    return asset.size;
  }
  const cached = await readCached(asset.cacheKey);
  if (cached) {
    const size = (await cached.clone().blob()).size;
    asset.size = size;
    return size;
  }
  if (!asset.url) return null;
  try {
    const head = await fetch(asset.url, { method: "HEAD", cache: "no-store" });
    if (head.ok) {
      const length = Number(head.headers.get("content-length"));
      if (Number.isFinite(length) && length > 0) {
        asset.size = length;
        return length;
      }
    }
  } catch {
    /* fall through to a range probe */
  }
  try {
    const probe = await fetch(asset.url, {
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
    });
    const range = probe.headers.get("content-range");
    const total = range ? Number(range.split("/")[1]) : NaN;
    if (Number.isFinite(total) && total > 0) {
      asset.size = total;
      return total;
    }
    if (probe.ok) {
      const size = (await probe.blob()).size;
      asset.size = size;
      return size;
    }
  } catch {
    /* size stays unknown */
  }
  return null;
}

export interface StorageEstimate {
  usage: number;
  quota: number;
  available: number;
  supported: boolean;
}

export async function storageEstimate(): Promise<StorageEstimate> {
  try {
    if (!navigator.storage?.estimate)
      return { usage: 0, quota: 0, available: 0, supported: false };
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return {
      usage,
      quota,
      available: Math.max(0, quota - usage),
      supported: true,
    };
  } catch {
    return { usage: 0, quota: 0, available: 0, supported: false };
  }
}
