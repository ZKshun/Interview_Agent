<script setup>
import { onMounted } from "vue";
import { useRoute } from "vue-router";
import { Plus, Layers3, FileText, CircleHelp, X } from "lucide-vue-next";
import { useTaskStore } from "./stores/task.js";
import { statuses } from "./api/labels.js";
const store = useTaskStore();
const route = useRoute();
onMounted(store.initialize);
</script>
<template>
  <div class="app-shell">
    <aside class="sidebar">
      <RouterLink class="brand" to="/"
        ><span class="brand-icon"><Layers3 :size="23" /></span
        ><span>Interview<span class="brand-sub">STUDIO</span></span></RouterLink
      >
      <RouterLink class="new-task" to="/"
        ><Plus :size="18" /> 新建出题任务
        <span class="key-hint">＋</span></RouterLink
      >
      <div class="sidebar-heading">
        最近任务 <span>{{ store.history.length }}</span>
      </div>
      <div class="history-list">
        <RouterLink
          v-for="task in store.history.slice(0, 20)"
          :key="task.id"
          :to="`/tasks/${task.id}/${['DONE', 'GENERATING', 'VALIDATING'].includes(task.status) ? 'cards' : 'process'}`"
          class="history-item"
          :class="{ selected: route.params.id === task.id }"
        >
          <FileText :size="17" />
          <div>
            <span>{{ task.title }}</span><small
              >{{ task.mode === "interview" ? "面试题" : "笔试题" }} ·
              {{ statuses[task.status] }}</small
            >
          </div>
        </RouterLink>
        <p v-if="!store.history.length" class="history-empty">
          你的出题记录会保存在这里。<br />从第一份资料开始吧。
        </p>
      </div>
      <div class="sidebar-bottom">
        <span class="local-dot"></span> 本地工作空间 <small>v2.0</small>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <span
          >工作空间 <span class="breadcrumb-slash">/</span>
          <strong>智能出题</strong></span
        ><span
          class="service-label"
          :class="{ warning: !store.health?.llmReady }"
          ><span class="local-dot"></span
          >{{
            store.health?.llmMode === "demo"
              ? "离线演示模式"
              : store.health?.llmReady
                ? "LLM 已配置"
                : "LLM 未配置"
          }}</span
        >
      </header>
      <div
        v-if="
          store.current?.providerMode === 'demo' ||
          store.health?.llmMode === 'demo'
        "
        class="demo-banner"
      >
        <CircleHelp :size="16" />
        {{
          store.current?.providerMode === "demo"
            ? "此任务为离线演示，题目与评分仅用于体验流程。"
            : "当前为离线演示模式，题目与评分仅用于体验流程。"
        }}
        配置 LLM 后可新建真实任务。
      </div>
      <div v-if="store.error" class="global-error" role="alert">
        <span>{{ store.error }}</span><button
          class="icon-button"
          aria-label="关闭提示"
          @click="store.error = ''"
        >
          <X :size="17" />
        </button>
      </div>
      <main><RouterView /></main>
      <footer class="page-footer">
        让每一道问题，都有据可依。<span>资料解析 · 证据核验 · 质量评分</span>
      </footer>
    </div>
  </div>
</template>
