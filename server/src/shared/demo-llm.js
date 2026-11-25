/** Explicit offline fixtures for exercising the UI, never a live-call fallback. */
export function demoResponse(kind, input) {
  if (kind === "plan") {
    const candidates = input.sources.flatMap((source) =>
      source.text
        .split(/[。\n.!?！？]/)
        .map((text) => text.trim())
        .filter((text) => text.length >= 2)
        .map((evidence) => ({ source, evidence })),
    );
    if (!candidates.length)
      throw new Error("演示资料至少需要一段 2 字以上的文本");
    return {
      blueprints: Array.from({ length: input.count }, (_, index) => {
        const { source, evidence } = candidates[index % candidates.length];
        return {
          topic: evidence.slice(0, 28),
          type: index % 2 ? "scenario" : "concept",
          difficulty: input.difficulty,
          sourceId: source.id,
          evidence: evidence.slice(0, 100),
          focus: index % 2 ? "设计取舍与实际应用" : "核心原理与边界条件",
        };
      }),
    };
  }
  if (kind === "generate") {
    return {
      stem: `【演示题 ${input.index + 1}】围绕「${input.blueprint.topic}」，${input.blueprint.type === "scenario" ? "设计一个实际应用场景，并解释方案选择与失败处理方式。" : "说明核心原理、适用条件，以及一个常见误区。"}`,
      answer: `> 离线演示内容，仅用于验证流程，不是经过专业校验的参考答案。\n\n1. 结合原文「${input.blueprint.evidence}」解释核心概念。\n2. 从${input.blueprint.focus}角度说明实现步骤。\n3. 讨论边界条件、验证方法和替代方案。`,
      followUps: [
        "约束条件改变后，方案需要如何调整？",
        "你会如何验证该方案的效果？",
      ],
    };
  }
  return {
    relevance: 8,
    accuracy: 8,
    clarity: 8,
    feedback: "离线演示评分：仅用于展示状态流转，真实质量需接入 LLM 后验证。",
  };
}
