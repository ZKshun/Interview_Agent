<script setup>
import { Check } from "lucide-vue-next";
defineProps({ active: { type: Number, default: 0 } });
const steps = ["准备资料", "解析与规划", "题目工作台"];
</script>
<template>
  <nav class="step-bar" aria-label="出题步骤">
    <div
      v-for="(step, index) in steps"
      :key="step"
      class="step"
      :class="{ active: active === index, complete: active > index }"
      :aria-current="active === index ? 'step' : undefined"
    >
      <span class="step-number"
        ><Check v-if="active > index" :size="14" /><template v-else>{{
          index + 1
        }}</template></span
      ><span>{{ step }}</span>
    </div>
  </nav>
</template>
