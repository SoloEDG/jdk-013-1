<script setup lang="ts">
import { computed, ref } from "vue";
import {
  WifiOff,
  Play,
  RefreshCw,
  AlertTriangle,
  Trash2,
  HardDriveDownload,
} from "lucide-vue-next";
import type { OfflinePackage } from "../../../shared/types";
import type { OfflineLibrary } from "../model/library";
import { formatBytes } from "../lib/catalog";

const props = defineProps<{
  library: OfflineLibrary;
  online: boolean;
}>();
const emit = defineEmits<{
  open: [pkg: OfflinePackage];
  build: [];
  delete: [id: string];
  retry: [id: string];
}>();
const lib = props.library;
const confirmDelete = ref<string | null>(null);
const sorted = computed(() =>
  [...lib.packages.value].sort((a, b) => b.completedAt - a.completedAt),
);
</script>
<template>
  <section class="offline-entry">
    <div class="entry-banner" :class="{ offline: !online }">
      <WifiOff :size="22" />
      <div>
        <small>OFFLINE SCREENING</small>
        <h2>{{ online ? "离线展映包" : "当前没有网络连接" }}</h2>
        <p>
          {{
            online
              ? "这里的展映包已经保存在本机，可以断网放映。"
              : "已为你切换到离线展映入口。已完成的展映包无需网络即可播放、进入访谈并保存探索手记。"
          }}
        </p>
      </div>
    </div>

    <div class="section-heading builder-heading">
      <h2>可用的展映包</h2>
      <span>{{ sorted.length }}</span>
    </div>
    <div v-if="!sorted.length" class="builder-empty">
      本机还没有展映包。{{ online ? "请联网制作后再带到展厅。" : "请联网并制作一个展映包。" }}
    </div>
    <article
      v-for="pkg in sorted"
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
          {{ pkg.chapterIds.length }} 个章节 ·
          {{ formatBytes(lib.sizeOfPackage(pkg)) }} · 版本
          {{ pkg.contentVersion }}
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
          }}
          · 可放映 {{ lib.playableChapterIds(pkg).length }} /
          {{ pkg.content.chapters.length }} 章节
        </p>
        <div
          v-if="lib.effectiveStatus(pkg) === 'incomplete'"
          class="package-missing"
        >
          <AlertTriangle :size="15" />
          <div>
            <b>{{
              lib.evictedIdsFor(pkg).length
                ? "本机缓存被清理，以下素材需要重新下载："
                : "缺少以下素材，需重新下载后才能使用对应访谈："
            }}</b>
            <ul>
              <li v-for="asset in lib.missingFor(pkg)" :key="asset.id">
                {{ asset.label }}
              </li>
            </ul>
            <p v-if="!online" class="hint">
              当前断网，无法重新下载；已下载的章节仍可正常放映。
            </p>
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
          :disabled="!online"
          :title="online ? '' : '需要联网才能重新下载'"
          @click="emit('retry', pkg.id)"
        >
          <RefreshCw :size="14" /> 重新下载缺失部分
        </button>
        <button
          v-if="online"
          class="text-button danger"
          @click="confirmDelete = pkg.id"
        >
          <Trash2 :size="14" /> 删除
        </button>
      </div>
      <div v-if="confirmDelete === pkg.id" class="delete-confirm" role="alertdialog">
        <p>删除这个展映包及其独占素材？其他展映包共用的素材会保留。</p>
        <button
          class="text-button danger"
          @click="
            confirmDelete = null;
            emit('delete', pkg.id);
          "
        >
          确认删除
        </button>
        <button class="text-button" @click="confirmDelete = null">取消</button>
      </div>
    </article>

    <div v-if="online" class="entry-build">
      <HardDriveDownload :size="17" />
      <div>
        <b>想带走更多章节？</b>
        <p>选择章节、检查缺失素材与体积，再开始制作。</p>
      </div>
      <button class="text-button" @click="emit('build')">
        制作新的展映包 ↗
      </button>
    </div>
    <div v-else class="offline-help">
      <WifiOff :size="17" />
      <p>
        断网时可正常播放展映包、进入热点访谈，并在展映内保存探索手记。
        手记只保存在本机，请在退出前导出。
      </p>
    </div>
  </section>
</template>
