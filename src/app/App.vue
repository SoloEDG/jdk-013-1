<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import {
  Waves,
  ArrowUpRight,
  MapPin,
  MousePointer2,
  Eye,
  Headphones,
  BookOpen,
  Compass,
  ChevronRight,
  X,
  WifiOff,
} from "lucide-vue-next";
import { PanoramaView } from "../features/panorama";
import { ChapterList, MediaPlayer, Transport } from "../features/chapters";
import { HotspotLayer, HotspotDetail } from "../features/hotspots";
import { InterviewPanel, PeopleList } from "../features/interviews";
import { createJournal, filmStorageKey, JournalPanel } from "../features/journal";
import {
  createOfflineLibrary,
  materializePackage,
  packageJournalKey,
  OfflineEntry,
  OfflinePanel,
  OfflineTheatre,
  registerOfflineShell,
} from "../features/offline";
import type { Materialized } from "../features/offline/lib/materialize";
import { currentContent } from "../shared/content";
import { createWorkspace } from "./workspace";
import type { OfflinePackage } from "../shared/types";
registerOfflineShell();

const content = currentContent(),
  online = ref(navigator.onLine),
  about = ref(false),
  stage = ref<HTMLElement>(),
  fullError = ref(""),
  w = createWorkspace(
    content,
    createJournal(content.film.id, filmStorageKey(content.film.id)),
  );

/* Offline packages keep their own frozen film. Notes are always read from the
   film a package was made for, so another film opened later cannot leak in. */
const offline = createOfflineLibrary({ content: () => currentContent() });
// Decide the first screen before mount: with no network we must not render
// live media that can only fail.
if (!navigator.onLine && offline.packages.value.length)
  w.tab.value = "offline";

const activePackage = ref<OfflinePackage | null>(null),
  theatre = shallowRef<Materialized | null>(null),
  theatreJournal = shallowRef<ReturnType<typeof createJournal> | null>(null),
  theatreWorkspace = shallowRef<ReturnType<typeof createWorkspace> | null>(
    null,
  ),
  theatreError = ref("");

async function openPackage(pkg: OfflinePackage) {
  theatreError.value = "";
  await offline.verifyPackage(pkg);
  // Resolve every chapter first; materialize drops the ones whose media is
  // really missing so the theatre shows exactly what can play offline.
  const result = await materializePackage(
    pkg,
    pkg.content.chapters.map((c) => c.id),
    offline.missingIdsFor(pkg),
  );
  if (!result.content.chapters.length) {
    const missing = offline
      .missingFor(pkg)
      .map((a) => a.label)
      .join("、");
    theatreError.value = `此包没有可放映的章节：${missing || "章节影像或全景缺失"}。请联网后在展映包上「重新下载缺失部分」。`;
    return;
  }
  closeTheatre();
  theatre.value = result;
  activePackage.value = pkg;
  const journal = createJournal(pkg.filmId, packageJournalKey(pkg.id), pkg.notes);
  theatreJournal.value = journal;
  theatreWorkspace.value = createWorkspace(result.content, journal);
}
function closeTheatre() {
  if (theatre.value) for (const url of theatre.value.objectUrls) URL.revokeObjectURL(url);
  theatre.value = null;
  activePackage.value = null;
  theatreWorkspace.value = null;
  theatreJournal.value = null;
}
const offlineBuilder = ref(false);
const needsAttention = () =>
  offline.jobs.some((job) => job.status !== "running");
function retryPackage(id: string) {
  if (!navigator.onLine) {
    theatreError.value = "当前断网，请联网后再重新下载缺失素材。";
    return;
  }
  offline.retryPackage(id);
  offlineBuilder.value = true;
  w.tab.value = "offline";
}
function updateOnline() {
  online.value = navigator.onLine;
}
onMounted(() => {
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);
  // Detect assets the browser evicted so the entry never promises more than
  // what is really stored.
  void offline.verifyAll();
});
onBeforeUnmount(() => {
  window.removeEventListener("online", updateOnline);
  window.removeEventListener("offline", updateOnline);
  closeTheatre();
});
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await stage.value?.requestFullscreen();
  } catch {
    fullError.value = "当前浏览器不支持全屏";
  }
}
</script>
<template>
  <div class="site-shell">
    <header class="site-header">
      <a
        class="brand"
        href="#"
        @click.prevent="w.tab.value = 'story'"
        ><span class="brand-icon"><Waves /></span
        ><b>岸线 <i>SHORELINE</i></b></a
      >
      <nav aria-label="主导航">
        <button
          :class="{ active: w.tab.value === 'story' }"
          @click="w.tab.value = 'story'"
        >
          互动纪录片</button
        ><button
          :class="{ active: w.tab.value === 'journal' }"
          @click="w.tab.value = 'journal'"
        >
          探索手记 <span>{{ w.journal.entries.value.length }}</span></button
        ><button
          :class="{ active: w.tab.value === 'offline' }"
          @click="w.tab.value = 'offline'"
        >
          离线展映
          <span :class="{ alert: needsAttention() }">{{
            offline.packages.value.length
          }}</span>
          <i
            v-if="needsAttention()"
            class="nav-dot"
            aria-label="有制作任务待确认"
          /> </button
        ><button @click="about = true">
          关于本片 <ArrowUpRight :size="13" />
        </button>
      </nav>
      <div class="edition">
        <button
          v-if="offline.packages.value.length"
          class="edition-offline"
          @click="w.tab.value = 'offline'"
        >
          <WifiOff :size="12" /> {{ offline.packages.value.length }} 个展映包
        </button>
        一座海港的记忆 <span>VOL. 001</span>
      </div>
    </header>
    <main>
      <div class="intro">
        <div>
          <p class="eyebrow"><span /> AN IMMERSIVE DOCUMENTARY</p>
          <h1>潮汐之间<span>Between the Tides</span></h1>
          <p class="intro-copy">把目光交给远方，把时间留给故事。</p>
        </div>
        <div class="intro-meta">
          <span>中国 · 东南沿海</span>
          <p>3 个章节 <i>/</i> 360° 自由探索 <i>/</i> 3 位讲述者</p>
        </div>
      </div>
      <template v-if="w.tab.value === 'offline'">
        <template v-if="!offlineBuilder">
          <OfflineEntry
            :library="offline"
            :online="online"
            @open="openPackage"
            @build="offlineBuilder = true"
            @retry="retryPackage"
            @delete="offline.removePackage($event)"
          />
          <p v-if="theatreError" class="hint warning" role="status">
            {{ theatreError }}
          </p>
        </template>
        <template v-else>
          <button class="text-button back-button" @click="offlineBuilder = false">
            ← 返回离线展映入口
          </button>
          <OfflinePanel
            :library="offline"
            :chapters="content.chapters"
            @open="openPackage"
          />
        </template>
      </template>
      <template v-else-if="w.tab.value === 'story'"
        ><div class="workspace">
          <section ref="stage" class="stage">
            <PanoramaView
              :controller="w.camera"
              :source="w.playback.chapter.value.panorama"
              ><MediaPlayer
                :playback="w.playback"
                :branch="!!w.branch.personId.value"
              />
              <div class="stage-shade" />
              <div class="stage-top">
                <span class="scene-badge"><span /> 360° 全景现场</span
                ><span class="location"
                  ><MapPin :size="13" />
                  {{ w.playback.chapter.value.location }}</span
                >
              </div>
              <HotspotLayer
                :items="w.discovery.visible.value"
                :camera="w.camera.camera"
                :enabled="w.discovery.enabled.value && !w.branch.personId.value"
                @open="w.dispatch({ type: 'hotspot', id: $event })"
              />
              <div class="scene-caption">
                <small
                  >CHAPTER 0{{
                    ["dawn", "craft", "night"].indexOf(
                      w.playback.state.chapterId,
                    ) + 1
                  }}</small
                >
                <h2>{{ w.playback.chapter.value.title }}</h2>
                <p>{{ w.playback.chapter.value.description }}</p>
              </div>
              <div class="drag-hint">
                <MousePointer2 :size="14" /> 按住拖动，环顾四周
              </div></PanoramaView
            ><HotspotDetail
              v-if="w.discovery.detail.value && !w.branch.personId.value"
              :hotspot="w.discovery.detail.value"
              :saved="w.journal.has(w.discovery.detail.value.id)"
              @close="w.discovery.close()"
              @save="w.save()"
              @interview="
                w.enterPerson(w.discovery.detail.value?.personId || '')
              "
            /><InterviewPanel
              :branch="w.branch"
              @back="w.dispatch({ type: 'return' })"
            /><Transport
              :playback="w.playback"
              :disabled="!!w.branch.personId.value"
              @reset="w.camera.reset()"
              @fullscreen="fullscreen"
            />
            <p v-if="fullError" role="status">{{ fullError }}</p>
          </section>
          <aside class="sidebar">
            <div class="section-heading">
              <h2>故事章节</h2>
              <span>CHAPTERS</span>
            </div>
            <p class="sidebar-copy">循着潮水，走进他们的日常。</p>
            <ChapterList
              :active="w.playback.state.chapterId"
              :chapters="content.chapters"
              @select="w.dispatch({ type: 'chapter', id: $event })"
            />
            <div class="chapter-foot">
              <Headphones :size="15" /><span>建议佩戴耳机，沉浸聆听</span>
            </div>
            <div class="explore-toggle">
              <span><Eye :size="17" /> 场景探索热点</span
              ><button
                role="switch"
                aria-label="显示热点"
                :aria-checked="w.discovery.enabled.value"
                :class="{ on: w.discovery.enabled.value }"
                @click="w.discovery.enabled.value = !w.discovery.enabled.value"
              >
                <i />
              </button>
            </div>
            <div class="discovery-count">
              <span>已收集的故事</span
              ><b
                >{{
                  w.journal.entries.value.length.toString().padStart(2, "0")
                }}
                <em>/ 06</em></b
              >
            </div>
            <button class="journal-link" @click="w.tab.value = 'journal'">
              <BookOpen :size="15" /> 打开我的探索手记
              <ChevronRight :size="15" />
            </button>
          </aside>
        </div>
        <section class="below">
          <div class="field-note">
            <small><Compass :size="14" /> EXPLORER'S NOTE</small>
            <h2>故事，不止一个方向。</h2>
            <p>
              试着转动视角，寻找画面里的微光。<br />每个热点都通向一段值得停留的时光。
            </p>
          </div>
          <div class="voices">
            <div class="section-heading">
              <h2>听见他们的故事</h2>
              <span>THE VOICES</span>
            </div>
            <PeopleList :people="content.people" @open="w.enterPerson($event)" />
          </div></section></template
      ><JournalPanel
        v-else
        :journal="w.journal"
        @revisit="w.dispatch({ type: 'revisit', entry: $event })"
      />
      <footer>
        <span>SHORELINE ORIGINALS <i>© 2026</i></span
        ><span>让每一段平凡的生活，被看见。 <Waves :size="18" /></span>
      </footer>
    </main>
    <OfflineTheatre
      v-if="activePackage && theatre && theatreWorkspace && theatreJournal"
      :pkg="activePackage"
      :workspace="theatreWorkspace"
      :journal="theatreJournal"
      :missing-interviews="theatre.missingInterviews"
      :missing-asset-ids="offline.missingIdsFor(activePackage)"
      :dropped-chapters="theatre.droppedChapters"
      :object-urls="theatre.objectUrls"
      @close="closeTheatre"
    />
    <div v-if="about" class="modal-backdrop" @click.self="about = false">
      <section
        class="about"
        role="dialog"
        aria-modal="true"
        aria-label="关于本片"
      >
        <button class="close" aria-label="关闭关于" @click="about = false">
          <X /></button
        ><small>ABOUT THE FILM</small>
        <h2>潮汐之间</h2>
        <p>
          以海港、木船与灯塔为线索的互动纪录片演示。全景为原创程序绘制示意场景，章节影像为本地生成的潮汐动画；人物与口述内容均为虚构，用于体验非线性叙事。
        </p>
        <p>
          拖动环顾四周，滚轮调整视角；点击热点发现支线，返回主线继续观看。探索记录仅保存在此浏览器中。
        </p>
        <button class="primary" @click="about = false">开始探索 ↗</button>
      </section>
    </div>
  </div>
</template>
