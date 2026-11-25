<script setup>
import { computed, onBeforeUnmount, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Clock3,
  RefreshCw,
} from "lucide-vue-next";
import { useTaskStore } from "../stores/task.js";
import { statuses, sourceKinds, difficulties, types } from "../api/labels.js";
import StepBar from "../components/StepBar.vue";
import MarkdownViewer from "../components/MarkdownViewer.vue";
const store = useTaskStore(),
  route = useRoute(),
  router = useRouter();
watch(
  () => route.params.id,
  (id) => store.open(id),
  { immediate: true },
);
onBeforeUnmount(store.close);
const canPlan = computed(
  () =>
    ["PARSED", "FAILED"].includes(store.current?.status) &&
    !store.current?.questions.length,
);
async function generate() {
  if (await store.action("/generate"))
    router.push(`/tasks/${route.params.id}/cards`);
}
</script>
<template>
  <div class="page">
    <StepBar :active="1" />
    <div class="page-heading">
      <div>
        <h1>资料解析与出题规划</h1>
        <p>确认原文与考察方向，让每道题都有清晰的起点。</p>
      </div>
      <span v-if="store.current" class="badge" :class="{ blue: store.busy }">{{
        statuses[store.current.status]
      }}</span>
    </div>
    <div v-if="store.loading" class="empty-state">
      <RefreshCw class="spinning" />正在读取任务…
    </div>
    <template v-else-if="store.current">
      <div class="task-context">
        <FileText :size="16" /><strong>{{ store.current.title }}</strong
        ><span
          >{{ store.current.mode === "interview" ? "面试题" : "笔试题" }} · 期望
          {{ store.current.count }} 道 ·
          {{ difficulties[store.current.difficulty] }}</span
        >
      </div>
      <div v-if="!store.connected" class="inline-warning">
        实时连接已断开，正在重连。已保存的内容不会丢失。
      </div>
      <div class="process-layout">
        <div class="process-content">
          <section class="panel">
            <div class="section-heading">
              <h2>解析后的资料</h2>
              <span class="muted"
                >{{ store.current.sources.length }} 份来源</span
              >
            </div>
            <details
              v-for="source in store.current.sources"
              :key="source.id"
              class="source-detail"
              :open="store.current.sources.length === 1"
            >
              <summary>
                <FileText :size="17" /><strong>{{ source.name }}</strong
                ><span
                  >{{ sourceKinds[source.kind] }} ·
                  {{ source.text.length }} 字符</span
                >
              </summary>
              <MarkdownViewer :text="source.text" />
            </details>
          </section>
          <section
            v-if="store.current.questions.length"
            class="panel blueprint-panel"
          >
            <div class="section-heading">
              <h2>出题蓝图</h2>
              <span class="badge green"
                ><CheckCircle2 :size="13" /> 证据已核验</span
              >
            </div>
            <article
              v-for="(question, index) in store.current.questions"
              :key="question.id"
              class="blueprint-item"
            >
              <div class="blueprint-number">
                {{ String(index + 1).padStart(2, "0") }}
              </div>
              <div>
                <h3>{{ question.blueprint.topic }}</h3>
                <p>
                  {{ types[question.blueprint.type] }} ·
                  {{ difficulties[question.blueprint.difficulty] }} ·
                  {{ question.blueprint.focus }}
                </p>
                <div class="evidence">
                  <span>原文依据</span>
                  <blockquote>{{ question.blueprint.evidence }}</blockquote>
                  <small>{{
                    store.current.sources.find(
                      (source) => source.id === question.blueprint.sourceId,
                    )?.name
                  }}</small>
                </div>
              </div>
            </article>
          </section>
          <div v-else class="planning-placeholder">
            <span class="placeholder-orbit"><CheckCircle2 :size="28" /></span>
            <h3>
              {{
                store.busy
                  ? "正在整理资料与知识点"
                  : "资料已就绪，下一步规划考察方向"
              }}
            </h3>
            <p>规划会提取原文依据，无法找到证据的知识点将被剔除。</p>
          </div>
        </div>
        <aside class="process-rail">
          <section class="panel">
            <div class="section-heading">
              <h2>处理进度</h2>
              <span class="live-status"
                ><span class="local-dot"></span
                >{{ store.connected ? "实时" : "重连中" }}</span
              >
            </div>
            <div
              v-for="node in store.current.nodes"
              :key="node.name"
              class="node-item"
            >
              <span class="node-marker" :class="node.status"
                ><CheckCircle2
                  v-if="node.status === 'done'"
                  :size="17" /><RefreshCw
                  v-else
                  :size="17"
                  :class="{ spinning: node.status === 'running' }"
              /></span>
              <div>
                <strong>{{
                  {
                    PARSING: "资料解析",
                    PLANNING: "知识点规划",
                    GENERATING: "题目生成",
                    VALIDATING: "结果校验",
                  }[node.name]
                }}</strong><small
                  ><Clock3 :size="12" />
                  {{ (node.durationMs / 1000).toFixed(1) }}s · 执行
                  {{ node.attempts }} 次 · 重试 {{ node.retries }} 次</small
                >
              </div>
            </div>
            <div class="event-log" aria-live="polite">
              <div
                v-for="(log, index) in store.current.logs"
                :key="index"
                :class="log.level"
              >
                <time>{{
                  new Date(log.at).toLocaleTimeString("zh-CN", {
                    hour12: false,
                  })
                }}</time><span>{{ log.message }}</span>
              </div>
            </div>
          </section>
          <p v-if="store.current.error" class="inline-warning">
            {{ store.current.error }}
          </p>
          <button
            v-if="canPlan"
            class="button primary full-width"
            :disabled="store.busy || !store.health?.llmReady"
            @click="store.action('/plan')"
          >
            {{ store.current.status === "FAILED" ? "重试规划" : "开始规划"
            }}<ArrowRight :size="16" />
          </button>
          <button
            v-else-if="store.current.status === 'READY'"
            class="button primary full-width"
            :disabled="store.busy"
            @click="generate"
          >
            确认蓝图，生成题目 <ArrowRight :size="16" />
          </button>
          <RouterLink
            v-else-if="store.current.questions.length"
            class="button primary full-width"
            :to="`/tasks/${route.params.id}/cards`"
            >进入题目工作台 <ArrowRight :size="16"
          /></RouterLink>
          <p v-if="!store.health?.llmReady" class="start-hint">
            需要先配置服务端 LLM，重启后继续。
          </p>
        </aside>
      </div>
    </template>
    <div v-else class="empty-state">
      <h2>暂时无法读取任务</h2>
      <RouterLink class="button secondary" to="/">返回新建任务</RouterLink>
    </div>
  </div>
</template>
