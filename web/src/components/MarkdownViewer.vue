<script setup>
import { computed } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
const props = defineProps({ text: { type: String, default: "" } });
const html = computed(() =>
  DOMPurify.sanitize(marked.parse(props.text, { breaks: true }), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["img", "iframe", "video", "audio", "form", "input", "style"],
    FORBID_ATTR: ["style"],
  }),
);
</script>
<template><div class="markdown" v-html="html"></div></template>
