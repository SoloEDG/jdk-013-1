<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  Download,
  WifiOff,
  RefreshCw,
  Trash2,
  Play,
  Check,
  AlertTriangle,
  HardDrive,
  X,
} from "lucide-vue-next";
import type { Chapter, NoteScope, OfflinePackage } from "../../../shared/types";
import type { OfflineLibrary, ProductionJob } from "../model/library";
import { assetKindLabel, formatBytes } from "../lib/catalog";
import CompletionDialog from "./CompletionDialog.vue";

const props = defineProps<{
  library: OfflineLibrary;
  chapters: Chapter[];
}>();
const emit = defineEmits<{
  open: [pkg: OfflinePackage];
}>();
const lib = props.library;
const selected = ref<string[]>(props.chapters.map((c) => c.id)),
  completionJob = ref<string | null>(null),
  message = ref(""),
  confirmDelete = ref<string | null>(null);

const completionTarget = computed(
  () => lib.jobs.find((j) => j.id === completionJob.value) ?? null,
);
const jobMissing = computed(() =>
  completionTarget.value
    ? completionTarget.value.assets
        .filter((a) => a.state === "failed")
        .map((a) => ({ id: a.asset.id, label: a.asset.label }))
    : [],
);
const preflight = lib.preflight;

function toggle(id: string) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((c) => c !== id)
    : [...selected.value, id];
  lib.setChapterIds(selected.value);
}
async function refresh() {
  message.value = "";
  await lib.refreshPreflight(selected.value);
}
async function start() {
  message.value = "";
  if (!selected.value.length) {
    message.value = "请至少选择一个章节";
    return;
  }
  const job = lib.startJob(selected.value);
  if (!job) {
    message.value = "无法开始制作，请检查所选章节";
    return;
  }
}
async function finish(scope: NoteScope, allowIncomplete: boolean) {
  if (!completionTarget.value) return;
  const result = await lib.finishJob(
    completionTarget.value.id,
    scope,
    allowIncomplete,
  );
  if (result.error) {
    message.value = result.error;
    return;
  }
  completionJob.value = null;
  message.value = result.package
    ? result.package.status === "ready"
      ? "展映包制作完成，可断网放映"
      : "已保存为不完整包，缺失部分可稍后重试"
    : "";
}
async function remove(id: string) {
  await lib.removePackage(id);
  confirmDelete.value = null;
  message.value = "已删除展映包及其独占素材";
}
function packagesScope(job: ProductionJob): NoteScope | undefined {
  const pkg = lib.packages.value.find((p) => p.id === job.repairOf);
  return pkg?.notesScope;
}
async function openCompletion(job: ProductionJob) {
  message.value = "";
  if (job.status === "cancelled") {
    message.value = "制作已取消，请重新开始制作";
    return;
  }
  await lib.checkJob(job.id);
  completionJob.value = job.id;
}
const statusText: Record<ProductionJob["status"], string> = {
  running: "正在下载素材",
  "needs-retry": "部分素材失败",
  "awaiting-notes": "等待确认笔记范围",
  cancelled: "已取消",
};
function jobProgress(job: ProductionJob) {
  const done = job.assets.filter(
    (a) => a.state === "cached" || a.state === "done",
  ).length;
  return { done, total: job.assets.length };
}
const missingInterviews = (pkg: OfflinePackage) =>
  pkg.assets
    .filter(
      (a) => a.kind === "interview" && pkg.missingAssetIds.includes(a.id),
    )
    .map((a) => a.id.replace(/^interview:/, ""));

onMounted(() => {
  void lib.refreshPreflight(selected.value);
  void lib.verifyAll();
});
</script>
<template>
  <section class="offline-panel">
    <div class="panel-heading">
      <div>
        <small>OFFLINE SCREENING KIT</small>
        <h2>离线展映包</h2>
      </div>
      <span class="panel-version">内容版本 {{ lib.preflight.version }}</span>
    </div>
    <p class="offline-intro">
      选择要带走的章节，先检查缺失素材与预计体积，再制作。制作期间可以照常观看影片和写笔记。
    </p>

    <div class="offline-grid">
      <div class="offline-builder">
        <div class="section-heading builder-heading">
          <h2>1. 选择章节</h2>
          <span>可多选</span>
        </div>
        <div class="offline-chapters">
          <label
            v-for="chapter in chapters"
            :key="chapter.id"
            :class="{ chosen: selected.includes(chapter.id) }"
          >
            <input
              type="checkbox"
              :checked="selected.includes(chapter.id)"
              @change="toggle(chapter.id)"
            />
            <div
              class="chapter-thumb"
              :style="{ backgroundImage: `url(${chapter.panorama})` }"
            />
            <div>
              <b>{{ chapter.title }}</b>
              <small>{{ chapter.location }}</small>
            </div>
          </label>
        </div>

        <div class="section-heading builder-heading">
          <h2>2. 检查素材</h2>
          <button class="text-button" :disabled="preflight.checking" @click="refresh">
            <RefreshCw :size="14" /> 重新检查
          </button>
        </div>
        <div v-if="!selected.length" class="builder-empty">
          至少选择一个章节后才会统计下载内容。
        </div>
        <div v-else class="preflight">
          <div class="preflight-summary">
            <div>
              <small>需要下载</small>
              <b>{{ preflight.missingCount }} 项</b>
            </div>
            <div>
              <small>缺失素材体积</small>
              <b>{{ formatBytes(preflight.missingSize) }}</b>
            </div>
            <div>
              <small>整包体积</small>
              <b>{{ formatBytes(preflight.totalSize) }}</b>
            </div>
            <div>
              <small>本机可用空间</small>
              <b>
                {{
                  preflight.storage.supported
                    ? formatBytes(preflight.storage.available)
                    : "未知"
                }}
              </b>
            </div>
          </div>
          <p v-if="preflight.unknownSize" class="hint">
            部分素材无法预知大小，实际体积可能更大；完成后会以真实大小记录。
          </p>
          <ul class="preflight-list">
            <li
              v-for="item in preflight.assets"
              :key="item.asset.id"
              :class="{ cached: item.cached, missing: !item.cached }"
            >
              <span class="asset-kind">{{ assetKindLabel(item.asset.kind) }}</span>
              <span class="asset-label">{{ item.asset.label }}</span>
              <span class="asset-size">{{
                formatBytes(item.size)
              }}</span>
              <span class="asset-status" :class="item.state">{{
                item.state === "checking"
                  ? "检查中"
                  : item.cached
                    ? "已有缓存"
                    : "缺失，需下载"
              }}</span>
            </li>
          </ul>
          <p
            v-if="
              preflight.storage.supported &&
              preflight.missingSize > preflight.storage.available
            "
            class="hint warning"
          >
            预计体积超过本机可用空间。已有展映包不会被删除；请缩小选择范围或清理空间。
          </p>
          <p v-if="lib.storageWarning.value" class="hint warning" role="status">
            {{ lib.storageWarning.value }}
          </p>
        </div>

        <div class="builder-actions">
          <button
            class="primary"
            :disabled="lib.busy.value || !selected.length || preflight.checking"
            @click="start"
          >
            <Download :size="16" /> 开始制作（{{ selected.length }} 个章节）
          </button>
          <span v-if="lib.busy.value" class="hint">制作期间仍可观看与记笔记</span>
        </div>
        <p v-if="message" class="hint" role="status">{{ message }}</p>
        <p v-if="lib.notice.value" class="hint warning" role="status">
          {{ lib.notice.value }}
        </p>
      </div>

      <aside class="offline-jobs">
        <div class="section-heading builder-heading">
          <h2>制作任务</h2>
          <span>{{ lib.jobs.length }}</span>
        </div>
        <div v-if="!lib.jobs.length" class="builder-empty">
          还没有制作任务。制作时可离开此页继续观看。
        </div>
        <article v-for="job in lib.jobs" :key="job.id" class="job-card">
          <header>
            <b>{{ job.filmTitle }}</b>
            <span :class="['job-status', job.status]">{{
              statusText[job.status]
            }}</span>
          </header>
          <small
            >{{ jobProgress(job).done }} / {{ jobProgress(job).total }} 项素材 ·
            版本 {{ job.contentVersion }}</small
          >
          <div class="job-bar">
            <i
              :style="{
                width:
                  (jobProgress(job).done / Math.max(1, jobProgress(job).total)) *
                    100 +
                  '%',
              }"
            />
          </div>
          <ul v-if="job.error" class="job-error">
            <li>{{ job.error }}</li>
          </ul>
          <ul
            v-if="job.status === 'needs-retry'"
            class="job-missing-list"
          >
            <li
              v-for="item in job.assets.filter((a) => a.state === 'failed')"
              :key="item.asset.id"
            >
              待重新下载：{{ item.asset.label }}（{{ formatBytes(item.size) }}）
            </li>
          </ul>
          <div class="job-actions">
            <button
              v-if="job.status === 'needs-retry'"
              class="text-button"
              @click="lib.retryJob(job.id)"
            >
              <RefreshCw :size="14" /> 只重试缺失部分
            </button>
            <button
              v-if="job.status !== 'running' && job.status !== 'cancelled'"
              class="text-button"
              @click="openCompletion(job)"
            >
              {{ job.status === "needs-retry" ? "查看缺失" : "确认笔记范围" }}
            </button>
            <button
              v-if="job.status === 'running'"
              class="text-button"
              @click="lib.cancelJob(job.id)"
            >
              <X :size="14" /> 取消
            </button>
            <button
              v-if="job.status === 'cancelled'"
              class="text-button"
              @click="lib.discardJob(job.id)"
            >
              丢弃任务
            </button>
          </div>
        </article>
      </aside>
    </div>

    <div class="packages">
      <div class="section-heading builder-heading">
        <h2>已制作的展映包</h2>
        <span>{{ lib.packages.value.length }}</span>
      </div>
      <div v-if="!lib.packages.value.length" class="builder-empty">
        还没有可放映的展映包。
      </div>
      <article
        v-for="pkg in lib.packages.value"
        :key="pkg.id"
        class="package-card"
        :class="lib.effectiveStatus(pkg)"
      >
        <div class="package-main">
          <div class="package-title">
            <h3>{{ pkg.filmTitle }}</h3>
            <span :class="['package-badge', lib.effectiveStatus(pkg)]">
              {{
                lib.effectiveStatus(pkg) === "ready"
                  ? "已就绪 · 可断网放映"
                  : "不完整 · 缺少素材"
              }}
            </span>
          </div>
          <small>
            {{ pkg.chapterIds.length }} 个章节 · {{ formatBytes(lib.sizeOfPackage(pkg)) }}
            · 完成于 {{ new Date(pkg.completedAt).toLocaleString("zh-CN") }}
            · 版本 {{ pkg.contentVersion }}
          </small>
          <p class="package-chapters">
            {{ pkg.content.chapters.map((c) => c.title).join(" / ") }}
          </p>
          <p class="package-notes">
            笔记：{{
              pkg.notesScope === "none"
                ? "未包含"
                : pkg.notesScope === "all"
                  ? `本部全部 ${pkg.notes.length} 条`
                  : `所选章节 ${pkg.notes.length} 条`
            }} · 可放映章节：
            {{ lib.playableChapterIds(pkg).length }} / {{ pkg.content.chapters.length }}
          </p>
          <div
            v-if="lib.effectiveStatus(pkg) === 'incomplete'"
            class="package-missing"
          >
            <AlertTriangle :size="15" />
            <div>
              <b>缺少以下素材，需重新下载后才能进入对应访谈：</b>
              <ul>
                <li v-for="asset in lib.missingFor(pkg)" :key="asset.id">
                  {{ asset.label }}
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div class="package-actions">
          <button
            class="primary"
            :disabled="!lib.playableChapterIds(pkg).length"
            @click="emit('open', pkg)"
          >
            <Play :size="15" /> 进入离线展映
          </button>
          <button
            v-if="lib.effectiveStatus(pkg) === 'incomplete'"
            class="text-button"
            @click="lib.retryPackage(pkg.id)"
          >
            <RefreshCw :size="14" /> 重新下载缺失部分
          </button>
          <button
            class="text-button danger"
            @click="confirmDelete = pkg.id"
          >
            <Trash2 :size="14" /> 删除
          </button>
        </div>
        <div v-if="confirmDelete === pkg.id" class="delete-confirm" role="alertdialog">
          <p>删除这个展映包及其独占素材？其他展映包共用的素材会保留。</p>
          <button class="text-button danger" @click="remove(pkg.id)">确认删除</button>
          <button class="text-button" @click="confirmDelete = null">取消</button>
        </div>
      </article>
    </div>

    <div class="offline-help">
      <WifiOff :size="17" />
      <p>
        断网后重新打开本站，会进入离线展映入口；展映包按制作开始时的内容版本保存，
        个人笔记按完成时确认的范围打包，不会混入后来打开的其他片子。
      </p>
    </div>

    <CompletionDialog
      v-if="completionTarget"
      :job="completionTarget"
      :notes="lib.notesFor(completionTarget.filmId)"
      :missing="jobMissing"
      :notes-scope="packagesScope(completionTarget)"
      :repair="!!completionTarget.repairOf"
      @close="completionJob = null"
      @confirm="finish"
    />
  </section>
</template>
