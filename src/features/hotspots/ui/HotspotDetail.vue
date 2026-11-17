<script setup lang="ts">
import { X, ArrowUpRight } from "lucide-vue-next";
import type { Hotspot } from "../../../shared/types";
import { kindLabel } from "../lib/visibility";
defineProps<{
  hotspot: Hotspot;
  saved: boolean;
  interviewAvailable?: boolean;
}>();
defineEmits<{ close: []; interview: []; save: [] }>();
</script>
<template>
  <aside class="detail-card">
    <button class="close" aria-label="关闭热点" @click="$emit('close')">
      <X /></button
    ><small>{{ kindLabel(hotspot.kind) }} / FIELD NOTES</small>
    <h2>{{ hotspot.title }}</h2>
    <p>{{ hotspot.summary }}</p>
    <button
      v-if="hotspot.personId"
      class="primary"
      :disabled="interviewAvailable === false"
      @click="$emit('interview')"
    >
      {{
        interviewAvailable === false
          ? "访谈素材未随包下载"
          : "进入人物访谈"
      }}
      <ArrowUpRight v-if="interviewAvailable !== false" :size="16" />
    </button>
    <p v-if="hotspot.personId && interviewAvailable === false" class="detail-warning">
      该访谈文字未随此展映包下载，重新下载缺失部分后即可进入。
    </p><button class="text-button" @click="$emit('save')">
      {{ saved ? "已加入探索记录" : "＋ 收藏这个发现" }}
    </button>
  </aside>
</template>
