import { computed, reactive } from "vue";
import type { Chapter } from "../../../shared/types";
import { seekTime } from "../lib/timeline";
export function createPlayback(source: Chapter[]) {
  const list = source,
    state = reactive({
      chapterId: list[0]?.id ?? "",
      time: 0,
      playing: false,
      muted: true,
      rate: 1,
      ready: false,
      error: "",
    });
  const chapter = computed(() => list.find((c) => c.id === state.chapterId)!);
  function select(id: string) {
    if (!list.some((c) => c.id === id)) return;
    state.chapterId = id;
    state.time = 0;
    state.playing = false;
    state.error = "";
  }
  return {
    state,
    chapter,
    select,
    seek: (time: number) => {
      if (!chapter.value) return;
      state.time = seekTime(chapter.value, time);
    },
    toggle: () => {
      if (!chapter.value) return;
      if (state.time >= chapter.value.duration) state.time = 0;
      state.playing = !state.playing;
    },
    tick: (time: number) => {
      if (!chapter.value) return;
      state.time = seekTime(chapter.value, time);
    },
    finish: () => {
      if (!chapter.value) return;
      state.playing = false;
      state.time = chapter.value.duration;
    },
  };
}
export type Playback = ReturnType<typeof createPlayback>;
