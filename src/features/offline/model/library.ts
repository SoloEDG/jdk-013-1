import { reactive, ref } from "vue";
import type {
  Entry,
  FilmContent,
  NoteScope,
  OfflinePackage,
  PackageAsset,
} from "../../../shared/types";
import {
  PRIMARY_FILM_ID,
  readFilmEntries,
} from "../../journal/lib/storage";
import {
  assetCacheKey,
  buildPlan,
  captureNotes,
  clone,
  contentVersion,
  freezeContent,
  selectedChapters,
} from "../lib/catalog";
import {
  cachedKeys,
  deleteCached,
  fetchIntoCache,
  isCached,
  isQuotaError,
} from "../lib/cache";
import {
  measureAsset,
  storageEstimate,
  type StorageEstimate,
} from "../lib/measure";

const PACKAGE_KEY = "tidal-offline-packages-v1";
export function packageJournalKey(packageId: string) {
  return `tidal-package-journal-${packageId}`;
}

export type AssetState =
  | "checking"
  | "cached"
  | "pending"
  | "downloading"
  | "done"
  | "failed";

export interface PlannedAsset {
  asset: PackageAsset;
  cached: boolean;
  size: number | null;
  state: AssetState;
  error: string;
}

export interface Preflight {
  chapterIds: string[];
  checking: boolean;
  version: string;
  assets: PlannedAsset[];
  error: string;
  storage: StorageEstimate;
  missingCount: number;
  totalSize: number;
  missingSize: number;
  unknownSize: boolean;
}

export interface JobAsset extends PlannedAsset {
  received: number;
  total: number | null;
}

export type JobStatus =
  | "running"
  | "needs-retry"
  | "awaiting-notes"
  | "cancelled";

export interface ProductionJob {
  id: string;
  filmId: string;
  filmTitle: string;
  contentVersion: string;
  content: FilmContent;
  chapterIds: string[];
  assets: JobAsset[];
  status: JobStatus;
  error: string;
  startedAt: number;
  finishedAt?: number;
  /** Set when re-downloading the missing part of an existing package. */
  repairOf?: string;
  /** Notes scope already confirmed for the package being repaired. */
  noteScope?: NoteScope;
}

interface StoredShape {
  version: 1;
  packages: OfflinePackage[];
}

function loadPackages(): OfflinePackage[] {
  try {
    const raw: unknown = JSON.parse(
      localStorage.getItem(PACKAGE_KEY) || "null",
    );
    if (!raw || typeof raw !== "object") return [];
    const stored = raw as StoredShape;
    if (!Array.isArray(stored.packages)) return [];
    return stored.packages.filter(
      (p): p is OfflinePackage =>
        !!p &&
        typeof p.id === "string" &&
        typeof p.filmId === "string" &&
        typeof p.contentVersion === "string" &&
        Array.isArray(p.chapterIds) &&
        Array.isArray(p.assets) &&
        !!p.content &&
        Array.isArray(p.content.chapters) &&
        (p.status === "ready" || p.status === "incomplete"),
    );
  } catch {
    return [];
  }
}

function persistPackages(packages: OfflinePackage[]) {
  try {
    localStorage.setItem(
      PACKAGE_KEY,
      JSON.stringify({ version: 1, packages } satisfies StoredShape),
    );
    return "";
  } catch {
    return "包清单写入失败：本地空间不足，请先删除不再需要的展映包";
  }
}

export function createOfflineLibrary(options: {
  content: () => FilmContent;
  /** Notes for a given film only — never the film currently on screen. */
  notesFor?: (filmId: string) => Entry[];
}) {
  const notesFor =
    options.notesFor ?? ((filmId: string) => readFilmEntries(filmId));
  const packages = ref<OfflinePackage[]>(loadPackages()),
    jobs = reactive<ProductionJob[]>([]),
    preflight = reactive<Preflight>({
      chapterIds: options.content().chapters.map((c) => c.id),
      checking: false,
      version: contentVersion(options.content()),
      assets: [],
      error: "",
      storage: { usage: 0, quota: 0, available: 0, supported: false },
      missingCount: 0,
      totalSize: 0,
      missingSize: 0,
      unknownSize: false,
    }),
    busy = ref(false),
    notice = ref(""),
    storageWarning = ref(""),
    integrity = reactive<Record<string, string[]>>({});
  let measureToken = 0;

  function filmContent() {
    const source = options.content();
    return source;
  }

  async function refreshPreflight(chapterIds = preflight.chapterIds) {
    const token = ++measureToken;
    const content = filmContent();
    const valid = content.chapters
      .map((c) => c.id)
      .filter((id) => chapterIds.includes(id));
    preflight.chapterIds = valid.length ? valid : [];
    preflight.checking = true;
    preflight.error = "";
    preflight.version = contentVersion(content);
    const assets = buildPlan(content, preflight.chapterIds);
    const initial: PlannedAsset[] = assets.map((asset) => ({
      asset,
      cached: false,
      size: asset.data !== undefined ? asset.size : null,
      state: "checking",
      error: "",
    }));
    preflight.assets = initial;
    const [found, storage] = await Promise.all([
      cachedKeys(assets.map((a) => a.cacheKey)),
      storageEstimate(),
    ]);
    if (token !== measureToken) return;
    preflight.storage = storage;
    const sizes = await Promise.all(
      assets.map((asset) => measureAsset(asset).catch(() => null)),
    );
    if (token !== measureToken) return;
    const missing: string[] = [];
    preflight.assets = assets.map((asset, i) => {
      const cached = found.has(asset.cacheKey);
      if (!cached) missing.push(asset.id);
      return {
        asset,
        cached,
        size: sizes[i] ?? (asset.size || null),
        state: cached ? "cached" : "pending",
        error: "",
      };
    });
    preflight.checking = false;
    preflight.missingCount = missing.length;
    preflight.totalSize = sizes.reduce<number>((sum, s) => sum + (s ?? 0), 0);
    preflight.missingSize = preflight.assets
      .filter((a) => !a.cached)
      .reduce<number>((sum, a) => sum + (a.size ?? 0), 0);
    preflight.unknownSize = preflight.assets.some(
      (a) => a.size === null && !a.asset.data,
    );
  }

  function setChapterIds(ids: string[]) {
    preflight.chapterIds = ids;
    void refreshPreflight(ids);
  }

  /** Checks what is really still in the Cache API for a package. */
  async function verifyPackage(pkg: OfflinePackage) {
    const found = await cachedKeys(pkg.assets.map((a) => a.cacheKey));
    integrity[pkg.id] = pkg.assets
      .filter((a) => !found.has(a.cacheKey))
      .map((a) => a.id);
    return integrity[pkg.id];
  }

  async function verifyAll() {
    await Promise.all(packages.value.map((pkg) => verifyPackage(pkg)));
  }

  /** Ready only if the manifest says so AND every asset is still stored. */
  function effectiveStatus(pkg: OfflinePackage): "ready" | "incomplete" {
    return missingIdsFor(pkg).length ? "incomplete" : pkg.status;
  }

  function missingIdsFor(pkg: OfflinePackage): string[] {
    return Array.from(
      new Set([...(pkg.missingAssetIds || []), ...(integrity[pkg.id] || [])]),
    );
  }

  function evictedIdsFor(pkg: OfflinePackage): string[] {
    return (integrity[pkg.id] || []).filter(
      (id) => !pkg.missingAssetIds.includes(id),
    );
  }

  function startJob(chapterIds = preflight.chapterIds) {
    if (!chapterIds.length) return null;
    storageWarning.value =
      preflight.storage.supported &&
      preflight.missingSize > preflight.storage.available
        ? "本机可用空间小于预计缺失体积，下载可能在中途因空间不足暂停。已有的展映包不会被删除。"
        : "";
    const source = filmContent();
    if (!selectedChapters(source, chapterIds).length) return null;
    // The version is decided now; later catalog edits cannot leak in.
    const version = contentVersion(source);
    const content = freezeContent(clone(source), chapterIds);
    const measured = new Map(
      preflight.assets.map((item) => [item.asset.cacheKey, item.size]),
    );
    const assets = buildPlan(content, chapterIds, version).map<JobAsset>(
      (asset) => {
        const size = asset.data !== undefined ? asset.size : (measured.get(asset.cacheKey) ?? null);
        return {
          asset,
          cached: false,
          size,
          state: "pending",
          error: "",
          received: 0,
          total: size,
        };
      },
    );
    const job: ProductionJob = {
      id: crypto.randomUUID(),
      filmId: content.film.id,
      filmTitle: content.film.title,
      contentVersion: version,
      content,
      chapterIds,
      assets,
      status: "running",
      error: "",
      startedAt: Date.now(),
    };
    jobs.push(job);
    void runJob(job);
    return job;
  }

  async function runJob(job: ProductionJob) {
    busy.value = true;
    job.status = "running";
    job.error = "";
    const found = await cachedKeys(job.assets.map((a) => a.asset.cacheKey));
    for (const state of job.assets) {
      if (found.has(state.asset.cacheKey)) {
        state.state = "cached";
        state.cached = true;
        const size = await measureAsset(state.asset).catch(() => null);
        state.size = size ?? state.size;
        if (state.size !== null) state.asset.size = state.size;
        state.received = state.size ?? 0;
        state.total = state.size;
      } else {
        state.state = "pending";
        state.cached = false;
        state.received = 0;
        state.error = "";
      }
    }
    const queue = job.assets.filter((a) => a.state === "pending");
    let index = 0,
      quotaStop = false;
    const worker = async () => {
      while (!quotaStop && job.status === "running") {
        const state = queue[index++];
        if (!state) return;
        state.state = "downloading";
        try {
          const size = await fetchIntoCache(state.asset, (received, total) => {
            state.received = received;
            state.total = total ?? state.size;
          });
          state.size = size;
          state.asset.size = size;
          state.state = "done";
          state.cached = true;
        } catch (error) {
          state.state = "failed";
          state.error = isQuotaError(error)
            ? "存储空间不足，素材未写入。已有展映包不受影响。"
            : error instanceof Error
              ? error.message
              : "下载失败";
          if (isQuotaError(error)) {
            quotaStop = true;
            storageWarning.value =
              "存储空间不足，制作已暂停。已有可用展映包保持可用；清理空间后可只重试缺失部分。";
            job.error =
              "存储空间不足，制作已暂停。已下载的部分会保留，已有的展映包不会被删除；清理空间后可只重试缺失素材。";
            void verifyAll();
          }
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(2, queue.length) },
        () => worker(),
      ),
    );
    for (const state of job.assets) {
      if (
        state.state !== "failed" &&
        !(await isCached(state.asset.cacheKey))
      ) {
        state.state = "failed";
        state.error = state.error || "素材未完成写入";
      }
    }
    if (job.status === "running") {
      job.status = job.assets.every(
        (a) =>
          a.state !== "failed" &&
          a.state !== "pending" &&
          a.state !== "downloading",
      )
        ? "awaiting-notes"
        : "needs-retry";
      if (!job.error && job.status === "needs-retry")
        job.error = "部分素材下载失败，可只重试缺失部分。";
    }
    job.finishedAt = Date.now();
    if (job.repairOf) {
      // A repair keeps the notes scope already confirmed for the package.
      const result = await finishJob(job.id, job.noteScope ?? "none", true);
      notice.value = result.error
        ? result.error
        : result.package?.status === "ready"
          ? "缺失素材已补齐，展映包恢复为已就绪"
          : "补下载结束，但仍有素材缺失；展映包保持可用，可稍后再次补下载";
    }
    busy.value = jobs.some((j) => j.status === "running");
    // Keep the "already cached" marks in the builder in sync with whatever the
    // job actually stored, including after a cancel.
    void refreshPreflight();
  }

  /**
   * Re-checks a finished job against the real cache. Assets the browser
   * evicted turn into explicit failures so the operator can retry or save the
   * package as incomplete — never as silently complete.
   */
  async function checkJob(jobId: string) {
    const job = jobs.find((j) => j.id === jobId);
    if (!job || job.status === "running") return;
    for (const state of job.assets) {
      const present = await isCached(state.asset.cacheKey);
      if (present) {
        state.state = "done";
        state.cached = true;
        state.received = state.size ?? state.received;
        if (state.size !== null) state.asset.size = state.size;
      } else {
        state.state = "failed";
        state.cached = false;
        state.error = state.error || "素材不在本机缓存中";
      }
    }
    const missing = job.assets.some((a) => a.state === "failed");
    job.status = missing ? "needs-retry" : "awaiting-notes";
    if (missing)
      job.error = job.error || "部分素材不在本机缓存中，可只重试缺失部分。";
  }

  function retryJob(jobId: string) {
    const job = jobs.find((j) => j.id === jobId);
    if (!job || job.status === "running") return;
    for (const state of job.assets) {
      if (state.state === "failed") {
        state.state = "pending";
        state.error = "";
        state.received = 0;
      }
    }
    void runJob(job);
  }

  function cancelJob(jobId: string) {
    const job = jobs.find((j) => j.id === jobId);
    if (!job || job.status !== "running") return;
    job.status = "cancelled";
    job.error = "制作已取消；已下载的素材会保留，可稍后继续。";
    busy.value = jobs.some((j) => j.status === "running");
  }

  async function discardJob(jobId: string) {
    const index = jobs.findIndex((j) => j.id === jobId);
    if (index < 0 || jobs[index]!.status === "running") return;
    const [job] = jobs.splice(index, 1);
    if (!job) return;
    const inUse = new Set(
      packages.value.flatMap((p) => p.assets.map((a) => a.cacheKey)),
    );
    const otherJobs = new Set(
      jobs.flatMap((j) => j.assets.map((a) => a.asset.cacheKey)),
    );
    // Remove only the bytes this abandoned job alone put in the cache.
    for (const state of job.assets) {
      if (!inUse.has(state.asset.cacheKey) && !otherJobs.has(state.asset.cacheKey))
        await deleteCached(state.asset.cacheKey);
    }
  }

  /**
   * Finalises a job into a package. `scope` must be explicitly chosen by the
   * operator; null means "not confirmed yet" and is rejected.
   */
  async function finishJob(
    jobId: string,
    scope: NoteScope | null,
    allowIncomplete = false,
  ): Promise<{ package?: OfflinePackage; error?: string }> {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return { error: "制作任务不存在" };
    if (job.status === "running") return { error: "素材仍在下载，请稍候" };
    if (job.status === "cancelled") return { error: "制作已取消，请重新开始" };
    if (!scope) return { error: "请先确认个人笔记的范围" };
    const stillMissing: PackageAsset[] = [];
    for (const state of job.assets) {
      if (!(await isCached(state.asset.cacheKey))) stillMissing.push(state.asset);
    }
    if (stillMissing.length && !allowIncomplete)
      return {
        error: `仍有 ${stillMissing.length} 项素材缺失，请重试后再完成，或明确保存为不完整包`,
      };

    // Notes come from the film this job was started for, with a scope the
    // operator confirms now — not from whatever film is open later.
    const notes = captureNotes(
      notesFor(job.filmId),
      job.filmId,
      PRIMARY_FILM_ID,
      job.chapterIds,
      scope,
    );
    const missingIds = stillMissing.map((a) => a.id);
    const now = Date.now();
    if (job.repairOf) {
      const target = packages.value.find((p) => p.id === job.repairOf);
      if (!target) return { error: "原展映包已不存在" };
      const updated: OfflinePackage = {
        ...target,
        assets: clone(job.assets.map((a) => a.asset)),
        missingAssetIds: missingIds,
        status: missingIds.length ? "incomplete" : "ready",
        notesScope: target.notesScope,
        completedAt: missingIds.length ? target.completedAt : now,
      };
      const next = packages.value.map((p) => (p.id === target.id ? updated : p));
      const error = persistPackages(next);
      if (error) return { error };
      packages.value = next;
      integrity[target.id] = missingIds;
      const index = jobs.findIndex((j) => j.id === job.id);
      if (index >= 0) jobs.splice(index, 1);
      void refreshPreflight();
      return { package: updated };
    }
    const pkg: OfflinePackage = {
      id: crypto.randomUUID(),
      createdAt: job.startedAt,
      completedAt: now,
      filmId: job.filmId,
      filmTitle: job.filmTitle,
      contentVersion: job.contentVersion,
      chapterIds: [...job.chapterIds],
      content: clone(job.content),
      assets: clone(job.assets.map((a) => a.asset)),
      notes,
      notesScope: scope,
      status: missingIds.length ? "incomplete" : "ready",
      missingAssetIds: missingIds,
    };
    const error = persistPackages([...packages.value, pkg]);
    if (error) return { error };
    packages.value = [...packages.value, pkg];
    integrity[pkg.id] = missingIds;
    const index = jobs.findIndex((j) => j.id === job.id);
    if (index >= 0) jobs.splice(index, 1);
    void refreshPreflight();
    return { package: pkg };
  }

  function retryPackage(packageId: string) {
    const pkg = packages.value.find((p) => p.id === packageId);
    if (!pkg) return null;
    const assets = pkg.assets.map<JobAsset>((asset) => ({
      asset: clone(asset),
      cached: false,
      size: asset.size,
      state: "pending",
      error: "",
      received: 0,
      total: null,
    }));
    const job: ProductionJob = {
      id: crypto.randomUUID(),
      filmId: pkg.filmId,
      filmTitle: pkg.filmTitle,
      contentVersion: pkg.contentVersion,
      content: clone(pkg.content),
      chapterIds: [...pkg.chapterIds],
      assets,
      status: "running",
      error: "",
      startedAt: Date.now(),
      repairOf: pkg.id,
      noteScope: pkg.notesScope,
    };
    jobs.push(job);
    void runJob(job);
    return job;
  }

  async function removePackage(packageId: string) {
    const pkg = packages.value.find((p) => p.id === packageId);
    if (!pkg) return;
    const remaining = packages.value.filter((p) => p.id !== packageId);
    // Persist the list first: a failed write must not leave cache holes.
    const error = persistPackages(remaining);
    if (error) return;
    packages.value = remaining;
    delete integrity[pkg.id];
    // Finished repair jobs for a deleted package can never complete; drop
    // them. A running repair is left alone (its cache keys stay in use) and
    // will report that the original package no longer exists.
    for (let i = jobs.length - 1; i >= 0; i--) {
      const job = jobs[i]!;
      if (job.repairOf === pkg.id && job.status !== "running") jobs.splice(i, 1);
    }
    const inUse = new Set(
      remaining.flatMap((p) => p.assets.map((a) => a.cacheKey)),
    );
    const jobKeys = new Set(
      jobs.flatMap((j) => j.assets.map((a) => a.asset.cacheKey)),
    );
    for (const asset of pkg.assets) {
      if (!inUse.has(asset.cacheKey) && !jobKeys.has(asset.cacheKey))
        await deleteCached(asset.cacheKey);
    }
    try {
      localStorage.removeItem(packageJournalKey(pkg.id));
    } catch {
      /* ignore */
    }
  }

  function sizeOfPackage(pkg: OfflinePackage) {
    return pkg.assets.reduce((sum, a) => sum + (a.size || 0), 0);
  }

  /** Video + panorama decide whether a chapter can actually be screened. */
  function playableChapterIds(pkg: OfflinePackage) {
    const missing = new Set(missingIdsFor(pkg));
    return pkg.content.chapters
      .filter((chapter) =>
        pkg.assets
          .filter(
            (a) =>
              a.chapters.includes(chapter.id) &&
              (a.kind === "video" || a.kind === "panorama"),
          )
          .every((a) => !missing.has(a.id)),
      )
      .map((c) => c.id);
  }

  function missingFor(pkg: OfflinePackage) {
    const missing = new Set(missingIdsFor(pkg));
    return pkg.assets.filter((a) => missing.has(a.id));
  }

  return {
    packages,
    jobs,
    preflight,
    busy,
    notice,
    storageWarning,
    refreshPreflight,
    setChapterIds,
    startJob,
    retryJob,
    cancelJob,
    discardJob,
    checkJob,
    finishJob,
    retryPackage,
    removePackage,
    sizeOfPackage,
    playableChapterIds,
    missingFor,
    verifyPackage,
    verifyAll,
    missingIdsFor,
    effectiveStatus,
    evictedIdsFor,
    integrity,
    notesFor,
  };
}

export type OfflineLibrary = ReturnType<typeof createOfflineLibrary>;
