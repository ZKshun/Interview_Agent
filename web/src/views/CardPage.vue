<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { ArrowLeft, Download, RefreshCw, CheckCircle2 } from "lucide-vue-next";
import { useTaskStore } from "../stores/task.js";
import StepBar from "../components/StepBar.vue";
import QuestionCard from "../components/QuestionCard.vue";
const store = useTaskStore(),
  route = useRoute(),
  filter = ref("all");
watch(
  () => route.params.id,
  (id) => store.open(id),
  { immediate: true },
);
onBeforeUnmount(store.close);
const questions = computed(
  () =>
    store.current?.questions.filter(
      (question) => question.status !== "deleted",
    ) ?? [],
);
const passed = computed(
  () =>
    questions.value.filter((question) => question.status === "passed").length,
);
const attention = computed(
  () =>
    questions.value.filter((question) =>
      ["failed", "needs_retry", "duplicate"].includes(question.status),
    ).length,
);
const visible = computed(() =>
  questions.value.filter(
    (question) =>
      filter.value === "all" ||
      (filter.value === "passed"
        ? question.status === "passed"
        : ["failed", "needs_retry", "duplicate"].includes(question.status)),
  ),
);
async function edit(question, content, done) {
  if (await store.action(`/questions/${question.id}`, "PATCH", content)) done();
}
</script>
<template>
  <div class="page cards-page">
    <StepBar :active="2" />
    <div class="page-heading">
      <div>
        <h1>你的题目工作台</h1>
        <p>
          {{ store.current?.title || "加载任务中…" }} ·
          检查、调整，让问题更适合这场面试。
        </p>
      </div>
      <a
        v-if="questions.some((q) => q.content)"
        class="button secondary"
        :href="`/api/tasks/${route.params.id}/export`"
        download
        ><Download :size="16" /> 导出 Markdown</a
      >
    </div>
    <div v-if="store.loading" class="empty-state">正在恢复题目…</div>
    <template v-else-if="store.current">
      <div class="results-summary">
        <div>
          <span class="result-icon"
            ><RefreshCw
              v-if="store.busy"
              :size="22"
              class="spinning" /><CheckCircle2 v-else :size="22" /></span
          ><span
            ><strong>{{
              store.busy
                ? "题目正在生成与校验"
                : store.current.status === "READY"
                  ? "蓝图已就绪，等待生成"
                  : store.current.status === "FAILED"
                    ? "处理遇到问题，可重试未完成题目"
                    : "生成与校验已完成"
            }}</strong
            ><small
              >{{ passed }} 道评分通过，{{ attention }} 道需要处理 · 共
              {{ questions.length }} 道</small
            ></span
          >
        </div>
        <span class="connection-indicator">{{
          store.connected ? "进度已同步" : "连接中断，正在重连…"
        }}</span>
      </div>
      <div class="cards-toolbar">
        <div class="filter-tabs" aria-label="题目筛选">
          <button :class="{ active: filter === 'all' }" @click="filter = 'all'">
            全部 <span>{{ questions.length }}</span></button
          ><button
            :class="{ active: filter === 'passed' }"
            @click="filter = 'passed'"
          >
            已通过 <span>{{ passed }}</span></button
          ><button
            :class="{ active: filter === 'attention' }"
            @click="filter = 'attention'"
          >
            需处理 <span>{{ attention }}</span>
          </button>
        </div>
        <button
          v-if="attention || store.current.status === 'READY'"
          class="text-button"
          :disabled="store.busy"
          @click="store.action('/generate')"
        >
          <RefreshCw :size="14" />{{
            store.current.status === "READY" ? "开始生成" : "重试未通过题目"
          }}
        </button>
      </div>
      <p v-if="store.current.error" class="inline-warning">
        {{ store.current.error }}
      </p>
      <div class="question-list">
        <QuestionCard
          v-for="question in visible"
          :key="question.id"
          :question="question"
          :ordinal="question.index + 1"
          :source="
            store.current.sources.find(
              (source) => source.id === question.blueprint.sourceId,
            )
          "
          :busy="store.busy"
          @edit="(content, done) => edit(question, content, done)"
          @retry="store.action(`/questions/${question.id}/retry`)"
          @validate="store.action(`/questions/${question.id}/validate`)"
          @remove="store.action(`/questions/${question.id}`, 'DELETE')"
        />
      </div>
      <div v-if="!visible.length" class="empty-state">
        <CheckCircle2 :size="30" />
        <h3>
          {{
            filter === "attention" ? "当前没有需要处理的题目" : "这里还没有题目"
          }}
        </h3>
        <p>可以切换筛选条件，或返回规划页检查蓝图。</p>
      </div>
      <RouterLink class="back-link" :to="`/tasks/${route.params.id}/process`"
        ><ArrowLeft :size="15" /> 返回资料与规划</RouterLink
      >
    </template>
    <div v-else class="empty-state">
      <RouterLink to="/">返回新建任务</RouterLink>
    </div>
  </div>
</template>
