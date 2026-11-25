export const difficulties = { easy: "基础", medium: "进阶", hard: "挑战" };
export const types = {
  concept: "概念理解",
  scenario: "场景分析",
  coding: "编程题",
  short_answer: "简答题",
};
export const statuses = {
  PARSING: "解析中",
  PARSED: "待规划",
  PLANNING: "规划中",
  READY: "待生成",
  GENERATING: "生成中",
  VALIDATING: "校验中",
  DONE: "已完成",
  FAILED: "需处理",
};
export const questionStatuses = {
  pending: "等待生成",
  generating: "生成中",
  validating: "评分中",
  passed: "评分通过",
  needs_retry: "待确认",
  failed: "生成失败",
  duplicate: "疑似重复",
};
export const sourceKinds = {
  resume: "简历",
  jd: "岗位 JD",
  reference: "参考资料",
};
