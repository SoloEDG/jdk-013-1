<script setup lang="ts">
import { computed, ref } from "vue";
import { X, FileText, AlertTriangle } from "lucide-vue-next";
import type { Entry, NoteScope } from "../../../shared/types";
import type { ProductionJob } from "../model/library";

const props = defineProps<{
  job: ProductionJob;
  notes: Entry[];
  missing: { id: string; label: string }[];
  notesScope?: NoteScope;
  repair?: boolean;
}>();
const emit = defineEmits<{
  close: [];
  confirm: [scope: NoteScope, allowIncomplete: boolean];
}>();
const scope = ref<NoteScope | null>(props.notesScope ?? null),
  allowIncomplete = ref(false);
const selectedCount = computed(
  () =>
    props.notes.filter((e) => props.job.chapterIds.includes(e.chapterId))
      .length,
);
const allCount = computed(() => props.notes.length);
const preview = computed(() =>
  props.notes
    .filter(
      (e) => scope.value === "all" || props.job.chapterIds.includes(e.chapterId),
    )
    .slice(0, 4),
);
function confirm() {
  if (!scope.value && !props.repair) return;
  emit(
    "confirm",
    props.repair ? (props.job.noteScope ?? "none") : scope.value!,
    allowIncomplete.value,
  );
}
</script>
<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <section
      class="completion-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="完成离线展映包"
    >
      <button class="close" aria-label="关闭" @click="$emit('close')">
        <X />
      </button>
      <small>FINISH PACKAGE</small>
      <h2>完成《{{ job.filmTitle }}》展映包</h2>
      <p class="completion-meta">
        内容版本 <b>{{ job.contentVersion }}</b> ·
        {{ job.chapterIds.length }} 个章节 · {{ job.assets.length }} 项素材
      </p>

      <div v-if="missing.length" class="incomplete-warning" role="alert">
        <AlertTriangle :size="17" />
        <div>
          <b>还有 {{ missing.length }} 项素材缺失，验收未通过</b>
          <p>
            缺少：{{ missing.map((m) => m.label).join("、") }}。<br />
            这样的包可以播放已有章节，但必须标记为“不完整”，不能显示成已完成。
          </p>
          <label class="allow-incomplete"
            ><input v-model="allowIncomplete" type="checkbox" />
            仍保存为不完整包（可稍后重新下载缺失部分）</label
          >
        </div>
      </div>

      <div v-if="repair" class="scope-fixed">
        <FileText :size="15" />
        <p>
          补下载不改变展映包当时确认的笔记范围：{{
            job.noteScope === "none"
              ? "未包含笔记"
              : job.noteScope === "all"
                ? "本部全部笔记"
                : "所选章节笔记"
          }}，笔记保持完成时的快照。
        </p>
      </div>
      <fieldset v-else class="scope-picker">
        <legend><FileText :size="15" /> 个人探索手记范围</legend>
        <p>
          手记会在完成的这一刻按你确认的范围复制进包内。制作期间你可以继续观看和写笔记，但之后新增的内容不会自动混入。
        </p>
        <label :class="{ chosen: scope === 'selected' }">
          <input v-model="scope" type="radio" value="selected" />
          <span
            ><b>仅所选章节</b
            ><small
              >《{{ job.filmTitle }}》中所选章节的 {{ selectedCount }}
              条笔记</small
            ></span
          >
        </label>
        <label :class="{ chosen: scope === 'all' }">
          <input v-model="scope" type="radio" value="all" />
          <span
            ><b>本部片子的全部笔记</b
            ><small
              >《{{ job.filmTitle }}》共 {{ allCount }} 条，不包含其他片子</small
            ></span
          >
        </label>
        <label :class="{ chosen: scope === 'none' }">
          <input v-model="scope" type="radio" value="none" />
          <span><b>不带笔记</b><small>展映包中只有影片素材</small></span>
        </label>
      </fieldset>

      <div v-if="!repair && preview.length" class="note-preview">
        <small>将随包带走的笔记</small>
        <ul>
          <li v-for="e in preview" :key="e.id">
            {{ e.title }}<em>{{ e.chapterId }}</em>
          </li>
        </ul>
      </div>

      <div class="dialog-actions">
        <button class="text-button" @click="$emit('close')">稍后再说</button>
        <button
          class="primary"
          :disabled="(!scope && !repair) || (missing.length > 0 && !allowIncomplete)"
          @click="confirm"
        >
          {{ repair ? "完成补下载" : "确认范围并完成制作" }}
        </button>
      </div>
    </section>
  </div>
</template>
