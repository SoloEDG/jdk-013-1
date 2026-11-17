<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import {
  X,
  BookOpen,
  MapPin,
  MousePointer2,
  WifiOff,
  AlertTriangle,
} from "lucide-vue-next";
import { PanoramaView } from "../../panorama";
import { MediaPlayer, Transport } from "../../chapters";
import { HotspotDetail, HotspotLayer } from "../../hotspots";
import { InterviewPanel } from "../../interviews";
import { JournalPanel } from "../../journal";
import type { Journal } from "../../journal";
import type { OfflinePackage } from "../../../shared/types";
import type { Workspace } from "../../../app/workspace";
import { readCached } from "../lib/cache";

const props = defineProps<{
  pkg: OfflinePackage;
  workspace: Workspace;
  journal: Journal;
  missingInterviews: string[];
  missingAssetIds: string[];
  droppedChapters: string[];
  objectUrls: string[];
}>();
defineEmits<{ close: [] }>();
const w = props.workspace;
const journalOpen = ref(false);
const stageHost = ref<HTMLElement>();
const fullError = ref("");
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await stageHost.value?.requestFullscreen();
  } catch {
    fullError.value = "当前浏览器不支持全屏";
  }
}
const effectiveStatus = computed(() =>
  props.missingAssetIds.length || props.droppedChapters.length
    ? "incomplete"
    : props.pkg.status,
);
const shortMissing = computed(() => {
  const missing = new Set(props.missingAssetIds);
  return props.pkg.assets.filter(
    (a) => missing.has(a.id) && (a.kind === "interview" || a.kind === "text"),
  );
});
const droppedTitles = computed(() =>
  props.droppedChapters.map(
    (id) => props.pkg.content.chapters.find((c) => c.id === id)?.title ?? id,
  ),
);
const interviewBlocked = ref(false);
function openHotspot(id: string) {
  w.dispatch({ type: "hotspot", id });
  interviewBlocked.value = false;
}
function enterInterview() {
  const personId = w.discovery.detail.value?.personId;
  if (!personId) return;
  if (props.missingInterviews.includes(personId)) {
    interviewBlocked.value = true;
    return;
  }
  interviewBlocked.value = false;
  w.enterPerson(personId);
}
onBeforeUnmount(() => {
  for (const url of props.objectUrls) URL.revokeObjectURL(url);
});
</script>
<template>
  <div class="offline-theatre" role="dialog" aria-modal="true" aria-label="离线展映">
    <header class="theatre-head">
      <div class="theatre-title">
        <span class="offline-dot"><WifiOff :size="14" /></span>
        <div>
          <small>OFFLINE SCREENING · {{ pkg.contentVersion }}</small>
          <h2>{{ pkg.filmTitle }}</h2>
        </div>
        <em :class="['package-badge', effectiveStatus]">{{
          effectiveStatus === "ready" ? "可离线放映" : "不完整包"
        }}</em>
      </div>
      <div class="theatre-actions">
        <button class="text-button" @click="journalOpen = !journalOpen">
          <BookOpen :size="15" /> 探索手记
          {{ w.journal.entries.value.length }}
        </button>
        <button class="text-button" @click="$emit('close')">
          <X :size="16" /> 退出展映
        </button>
      </div>
    </header>
    <div
      v-if="shortMissing.length || droppedChapters.length"
      class="theatre-notice"
      role="status"
    >
      <AlertTriangle :size="15" />
      <span>
        {{
          droppedChapters.length
            ? `本机缓存中缺少 ${droppedTitles.join("、")} 的素材，这些章节已隐藏；其余章节仍可放映。`
            : ""
        }}
        {{
          shortMissing.length
            ? `缺少 ${shortMissing.map((a) => a.label).join("、")}，可继续观看和记笔记，重新下载后才能进入对应访谈。`
            : ""
        }}
      </span>
    </div>
    <nav class="theatre-chapter-strip" aria-label="展映章节">
      <button
        v-for="(chapter, i) in w.content.chapters"
        :key="chapter.id"
        :class="{ active: w.playback.state.chapterId === chapter.id }"
        @click="w.dispatch({ type: 'chapter', id: chapter.id })"
      >
        0{{ i + 1 }} {{ chapter.title }}
      </button>
    </nav>
    <div class="theatre-body">
      <section ref="stageHost" class="theatre-stage">
        <PanoramaView
          :controller="w.camera"
          :source="w.playback.chapter.value.panorama"
        >
          <MediaPlayer :playback="w.playback" :branch="!!w.branch.personId.value" />
          <div class="stage-shade" />
          <div class="stage-top">
            <span class="scene-badge"><span /> 离线全景现场</span>
            <span class="location"
              ><MapPin :size="13" />
              {{ w.playback.chapter.value.location }}</span
            >
          </div>
          <HotspotLayer
            :items="w.discovery.visible.value"
            :camera="w.camera.camera"
            :enabled="w.discovery.enabled.value && !w.branch.personId.value"
            @open="openHotspot"
          />
          <div class="scene-caption">
            <small>OFFLINE · {{ pkg.contentVersion }}</small>
            <h2>{{ w.playback.chapter.value.title }}</h2>
            <p>{{ w.playback.chapter.value.description }}</p>
          </div>
          <div class="drag-hint"><MousePointer2 :size="14" /> 按住拖动，环顾四周</div>
        </PanoramaView>
        <HotspotDetail
          v-if="w.discovery.detail.value && !w.branch.personId.value"
          :hotspot="w.discovery.detail.value"
          :saved="w.journal.has(w.discovery.detail.value.id)"
          :interview-available="
            !w.discovery.detail.value.personId ||
            !missingInterviews.includes(w.discovery.detail.value.personId)
          "
          @close="w.discovery.close()"
          @save="w.save()"
          @interview="enterInterview"
        />
        <p v-if="interviewBlocked" class="media-warning" role="status">
          该访谈素材未随此包下载，请退出展映后重新下载缺失部分。
        </p>
        <InterviewPanel
          :branch="w.branch"
          :artwork="w.playback.chapter.value?.panorama"
          @back="w.dispatch({ type: 'return' })"
        />
        <p v-if="fullError" class="media-warning" role="status">{{ fullError }}</p>
        <Transport
          :playback="w.playback"
          :disabled="!!w.branch.personId.value"
          @reset="w.camera.reset()"
          @fullscreen="fullscreen"
        />
      </section>
      <aside class="theatre-side">
        <div class="section-heading">
          <h2>本包章节</h2>
          <span>OFFLINE</span>
        </div>
        <p class="sidebar-copy">只包含随包下载的章节与素材。</p>
        <div class="chapter-list compact">
          <button
            v-for="(chapter, i) in w.content.chapters"
            :key="chapter.id"
            :class="{ active: w.playback.state.chapterId === chapter.id }"
            @click="w.dispatch({ type: 'chapter', id: chapter.id })"
          >
            <div
              class="chapter-thumb"
              :style="{ backgroundImage: `url(${chapter.panorama})` }"
            >
              <span>0{{ i + 1 }}</span>
            </div>
            <div>
              <small>CHAPTER 0{{ i + 1 }}</small>
              <h3>{{ chapter.title }}</h3>
              <p>{{ chapter.subtitle }}</p>
            </div>
            <b>{{ w.playback.state.chapterId === chapter.id ? "正在放映" : "↗" }}</b>
          </button>
        </div>
        <div class="theatre-note">
          <WifiOff :size="16" />
          <span
            >断网状态下手记只保存在本机，可在退出前导出手记 JSON。</span
          >
        </div>
      </aside>
    </div>
    <div v-if="journalOpen" class="theatre-journal">
      <JournalPanel
        :journal="journal"
        @revisit="
          (entry) => {
            w.dispatch({ type: 'revisit', entry });
            journalOpen = false;
          }
        "
      />
    </div>
  </div>
</template>
