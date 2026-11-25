<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  ArrowRight,
  UploadCloud,
  MessagesSquare,
  ClipboardList,
  FileText,
  X,
  Check,
  Sparkles,
} from "lucide-vue-next";
import { request } from "../api/client.js";
import { useTaskStore } from "../stores/task.js";
import { sourceKinds } from "../api/labels.js";
import StepBar from "../components/StepBar.vue";
const store = useTaskStore(),
  router = useRouter();
const mode = ref("interview"),
  title = ref(""),
  text = ref(""),
  jd = ref(""),
  kind = ref("resume");
const count = ref(6),
  difficulty = ref("medium"),
  requirements = ref(""),
  files = ref([]),
  uploading = ref(false),
  dragging = ref(false);
onMounted(() => {
  store.close();
  store.refreshHistory().catch(() => {});
});
const ready = computed(
  () =>
    title.value.trim() &&
    (text.value.trim() || jd.value.trim() || files.value.length) &&
    !uploading.value &&
    !store.acting,
);
async function upload(list) {
  if (!list?.length || uploading.value) return;
  uploading.value = true;
  store.error = "";
  try {
    for (const file of list) {
      if (files.value.length >= 6) throw Error("最多上传 6 份文件");
      if (file.size > 10 * 1024 * 1024) throw Error("单文件不能超过 10 MB");
      const body = new FormData();
      body.append("file", file);
      const result = await request("/uploads", { method: "POST", body });
      files.value.push({
        ...result,
        kind: kind.value,
        key: crypto.randomUUID(),
      });
    }
  } catch (error) {
    store.error = error.message;
  } finally {
    uploading.value = false;
  }
}
function example() {
  title.value = "前端工程师 · Vue 方向";
  text.value =
    "熟悉 Vue 3 的响应式原理与组件通信，使用 Pinia 管理应用状态。\n负责管理后台的性能优化，通过路由懒加载减少首屏资源体积。\n使用 TypeScript 设计类型安全的业务接口，编写单元测试保障关键流程。";
  jd.value =
    "招聘前端工程师：熟悉 Vue 3、TypeScript，具备组件设计、性能优化与工程化经验。";
}
async function submit() {
  if (!ready.value) return;
  const sources = files.value.map(({ name, kind, text }) => ({
    name,
    kind,
    text,
  }));
  if (text.value.trim())
    sources.push({
      name: `${sourceKinds[kind.value]} · 粘贴文本`,
      kind: kind.value,
      text: text.value,
    });
  if (jd.value.trim())
    sources.push({ name: "岗位 JD", kind: "jd", text: jd.value });
  try {
    const task = await store.create({
      title: title.value,
      mode: mode.value,
      count: Number(count.value),
      difficulty: difficulty.value,
      requirements: requirements.value,
      sources,
    });
    await router.push(`/tasks/${task.id}/process`);
  } catch {
    /* error is displayed by the shared store */
  }
}
</script>
<template>
  <div class="page upload-page">
    <StepBar :active="0" />
    <div class="page-heading">
      <div>
        <h1>从资料到好问题<span class="heading-dot">.</span></h1>
        <p>提供候选人资料，生成有依据、有深度的面试与笔试题。</p>
      </div>
      <span class="heading-decoration"><Sparkles :size="28" /></span>
    </div>
    <form @submit.prevent="submit">
      <div class="mode-selector" aria-label="生成模式">
        <button
          type="button"
          class="mode-option"
          :class="{ chosen: mode === 'interview' }"
          @click="mode = 'interview'"
        >
          <span class="mode-icon"><MessagesSquare :size="23" /></span
          ><span
            ><strong>面试题</strong
            ><small>围绕经历深入提问，关注思考过程</small></span
          ><span class="radio-mark"
            ><Check v-if="mode === 'interview'" :size="12"
          /></span>
        </button>
        <button
          type="button"
          class="mode-option"
          :class="{ chosen: mode === 'written' }"
          @click="mode = 'written'"
        >
          <span class="mode-icon"><ClipboardList :size="23" /></span
          ><span
            ><strong>笔试题</strong
            ><small>批量考察专业能力，自动拦截重复题</small></span
          ><span class="radio-mark"
            ><Check v-if="mode === 'written'" :size="12"
          /></span>
        </button>
      </div>
      <div class="upload-layout">
        <section class="panel source-panel">
          <div class="section-heading">
            <h2><span class="section-number">01</span> 准备出题资料</h2>
            <button type="button" class="text-button" @click="example">
              填入示例 <ArrowRight :size="14" />
            </button>
          </div>
          <label for="task-title"
            >任务名称 <span class="required">*</span></label
          ><input
            id="task-title"
            v-model="title"
            required
            maxlength="100"
            placeholder="例如：前端工程师 · Vue 方向"
          />
          <div class="source-label-row">
            <label for="source-kind">资料类型</label
            ><select id="source-kind" v-model="kind">
              <option
                v-for="(label, value) in sourceKinds"
                :value="value"
                :key="value"
              >
                {{ label }}
              </option>
            </select>
          </div>
          <label
            class="upload-zone"
            :class="{ dragging, uploading }"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="
              dragging = false;
              upload($event.dataTransfer.files);
            "
          >
            <input
              type="file"
              class="sr-only"
              aria-label="上传资料文件"
              accept=".pdf,.docx,.txt,.md"
              multiple
              :disabled="uploading"
              @change="
                upload($event.target.files);
                $event.target.value = '';
              "
            />
            <span class="upload-symbol"><UploadCloud :size="27" /></span
            ><strong>{{
              uploading ? "正在提取文件文本…" : "点击上传，或将文件拖放到这里"
            }}</strong
            ><small>支持 PDF、DOCX、TXT、Markdown · 单文件不超过 10 MB</small>
          </label>
          <div v-for="file in files" :key="file.key" class="file-row">
            <FileText :size="17" /><span
              >{{ file.name
              }}<small
                >{{ sourceKinds[file.kind] }} ·
                {{ file.text.length.toLocaleString() }} 字符</small
              ></span
            ><button
              type="button"
              class="icon-button"
              :aria-label="`移除 ${file.name}`"
              @click="files = files.filter((item) => item.key !== file.key)"
            >
              <X :size="16" />
            </button>
          </div>
          <div class="divider-label"><span>或直接粘贴文本</span></div>
          <textarea
            v-model="text"
            aria-label="资料文本"
            rows="7"
            maxlength="60000"
            placeholder="粘贴简历、项目经历或参考资料…&#10;&#10;具体的技术栈、项目难点和实践经验，能帮助生成更有针对性的问题。"
          ></textarea>
          <div class="input-footnote">
            <span>原文将作为每道题的证据来源</span
            ><span>{{ text.length.toLocaleString() }} / 60,000</span>
          </div>
          <label for="job-description" class="spaced-label"
            >岗位描述 <span class="optional">选填</span></label
          ><textarea
            id="job-description"
            v-model="jd"
            rows="3"
            maxlength="20000"
            placeholder="补充岗位 JD，让问题更贴合岗位要求…"
          ></textarea>
        </section>
        <aside class="settings-column">
          <section class="panel settings-panel">
            <div class="section-heading">
              <h2><span class="section-number">02</span> 设置出题偏好</h2>
            </div>
            <label for="question-count">题目数量</label>
            <div class="input-unit">
              <input
                id="question-count"
                v-model="count"
                type="number"
                min="1"
                max="30"
                required
              /><span>道</span>
            </div>
            <p class="field-help">每次支持 1–30 道题</p>
            <label for="difficulty">目标难度</label
            ><select id="difficulty" v-model="difficulty">
              <option value="easy">基础 · 核心概念</option>
              <option value="medium">进阶 · 实际应用</option>
              <option value="hard">挑战 · 深度与取舍</option>
            </select>
            <label for="requirements" class="spaced-label"
              >补充要求 <span class="optional">选填</span></label
            ><textarea
              id="requirements"
              v-model="requirements"
              maxlength="4000"
              rows="4"
              placeholder="例如：侧重场景分析，关注性能优化，避免死记硬背…"
            ></textarea>
          </section>
          <div class="flow-note">
            <span class="note-icon"><FileText :size="22" /></span>
            <h3>质量，从依据开始</h3>
            <p>
              先检查原文与出题蓝图，再生成题目。每道题都经过独立评分，保留来源，支持单独重试。
            </p>
            <div><Check :size="14" /> 资料保存在当前工作空间</div>
            <div><Check :size="14" /> 仅在生成时调用配置的 LLM</div>
          </div>
          <button
            class="button primary start-button"
            type="submit"
            :disabled="!ready"
          >
            {{ store.acting ? "正在创建任务…" : "开始解析资料"
            }}<ArrowRight :size="17" />
          </button>
          <p class="start-hint">下一步：检查解析结果与出题规划</p>
        </aside>
      </div>
    </form>
  </div>
</template>
