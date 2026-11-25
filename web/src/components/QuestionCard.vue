<script setup>
import { reactive, ref } from "vue";
import {
  Pencil,
  Trash2,
  RefreshCw,
  Check,
  Quote,
  History,
  ChevronDown,
} from "lucide-vue-next";
import MarkdownViewer from "./MarkdownViewer.vue";
import { difficulties, questionStatuses, types } from "../api/labels.js";
const props = defineProps({
  question: { type: Object, required: true },
  source: Object,
  busy: Boolean,
  ordinal: Number,
});
const emit = defineEmits(["edit", "remove", "retry", "validate"]);
const editing = ref(false),
  expanded = ref(true);
const draft = reactive({
  stem: "",
  answer: "",
  followUps: "",
  difficulty: "medium",
});
function beginEdit() {
  Object.assign(draft, {
    ...props.question.content,
    followUps: props.question.content.followUps.join("\n"),
    difficulty: props.question.blueprint.difficulty,
  });
  editing.value = true;
}
function save() {
  emit(
    "edit",
    {
      stem: draft.stem,
      answer: draft.answer,
      followUps: draft.followUps
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      difficulty: draft.difficulty,
    },
    () => {
      editing.value = false;
    },
  );
}
</script>
<template>
  <article class="question-card" :class="question.status">
    <header class="question-header">
      <span class="question-number">{{
        String(ordinal).padStart(2, "0")
      }}</span>
      <div class="question-meta">
        <span>{{ types[question.blueprint.type] }}</span><span
          class="meta-divider"
          >/</span
        ><span>{{ difficulties[question.blueprint.difficulty] }}</span>
      </div>
      <span
        class="badge"
        :class="{
          green: question.status === 'passed',
          amber: ['needs_retry', 'duplicate'].includes(question.status),
          red: question.status === 'failed',
          blue: ['generating', 'validating'].includes(question.status),
        }"
        >{{ questionStatuses[question.status] }}</span
      >
    </header>
    <div v-if="editing" class="question-edit">
      <form @submit.prevent="save">
        <label :for="`stem-${question.id}`">题干</label
        ><textarea
          :id="`stem-${question.id}`"
          v-model="draft.stem"
          required
          minlength="5"
          maxlength="10000"
          rows="4"
        ></textarea>
        <label :for="`answer-${question.id}`" class="spaced-label"
          >参考答案</label
        ><textarea
          :id="`answer-${question.id}`"
          v-model="draft.answer"
          required
          minlength="5"
          maxlength="15000"
          rows="6"
        ></textarea>
        <label :for="`follow-${question.id}`" class="spaced-label"
          >追问方向（每行一条，最多 5 条）</label
        ><textarea
          :id="`follow-${question.id}`"
          v-model="draft.followUps"
          rows="2"
        ></textarea>
        <label :for="`difficulty-${question.id}`" class="spaced-label"
          >难度</label
        ><select :id="`difficulty-${question.id}`" v-model="draft.difficulty">
          <option
            v-for="(label, value) in difficulties"
            :key="value"
            :value="value"
          >
            {{ label }}
          </option>
        </select>
        <p class="field-help">保存后旧评分失效，可重新评分或重新生成。</p>
        <div class="button-row">
          <button class="button primary small" :disabled="busy" type="submit">
            保存修改</button
          ><button
            class="button secondary small"
            type="button"
            @click="editing = false"
          >
            取消
          </button>
        </div>
      </form>
    </div>
    <template v-else>
      <div class="question-body">
        <h3>{{ question.blueprint.topic }}</h3>
        <MarkdownViewer v-if="question.content" :text="question.content.stem" />
        <div v-else class="question-pending">
          <RefreshCw
            :size="16"
            :class="{
              spinning: ['generating', 'validating'].includes(question.status),
            }"
          />{{ question.error || "题目正在等待生成，请稍候…" }}
        </div>
        <template v-if="question.content"
          ><button class="answer-toggle" @click="expanded = !expanded">
            参考答案与追问
            <ChevronDown :size="15" :class="{ rotated: !expanded }" />
          </button>
          <div v-if="expanded" class="answer-content">
            <MarkdownViewer :text="question.content.answer" />
            <div v-if="question.content.followUps.length" class="follow-ups">
              <strong>进一步追问</strong>
              <ul>
                <li
                  v-for="followUp in question.content.followUps"
                  :key="followUp"
                >
                  {{ followUp }}
                </li>
              </ul>
            </div>
          </div></template
        >
        <div class="evidence question-evidence">
          <span><Quote :size="13" /> 原文依据 · {{ source?.name }}</span>
          <blockquote>{{ question.blueprint.evidence }}</blockquote>
        </div>
        <div v-if="question.ragReferences.length" class="rag-reference">
          <History :size="14" /> 参考了
          {{ question.ragReferences.length }} 道历史题库题目
          <details>
            <summary>查看溯源</summary>
            <p v-for="reference in question.ragReferences" :key="reference.id">
              {{ reference.topic }} · 相似度
              {{ (reference.similarity * 100).toFixed(1) }}%<small>{{
                reference.id
              }}</small>
            </p>
          </details>
        </div>
        <div v-if="question.validation" class="validation-result">
          <div>
            <span class="score-number"
              >{{ question.validation.score }}<small>/ 10</small></span
            ><span
              >相关性 {{ question.validation.relevance }} · 准确性
              {{ question.validation.accuracy }} · 清晰度
              {{ question.validation.clarity }}</span
            >
          </div>
          <p>{{ question.validation.feedback }}</p>
        </div>
        <p v-if="question.duplicate" class="inline-warning">
          与题库中的题目相似度为
          {{
            (question.duplicate.similarity * 100).toFixed(1)
          }}%，已拦截入库。可编辑后评分或重新生成。
        </p>
        <p v-if="question.error && question.content" class="inline-warning">
          {{ question.error }}
        </p>
      </div>
      <footer class="question-footer">
        <span class="muted"
          >生成 {{ question.attempts }} 次 · 重试 {{ question.retries }} 次 ·
          {{ (question.durationMs / 1000).toFixed(1) }}s</span
        >
        <div class="card-actions">
          <button
            v-if="question.content"
            class="text-button"
            :disabled="busy"
            @click="beginEdit"
          >
            <Pencil :size="14" /> 编辑
          </button>
          <button
            v-if="question.status === 'needs_retry' && question.content"
            class="text-button"
            :disabled="busy"
            @click="emit('validate')"
          >
            <Check :size="14" /> 重新评分
          </button>
          <button
            v-if="
              ['failed', 'needs_retry', 'duplicate'].includes(question.status)
            "
            class="text-button"
            :disabled="busy"
            @click="emit('retry')"
          >
            <RefreshCw :size="14" /> 重新生成
          </button>
          <button
            class="text-button danger-text"
            :disabled="busy"
            @click="emit('remove')"
          >
            <Trash2 :size="14" /> 删除
          </button>
        </div>
      </footer>
    </template>
  </article>
</template>
