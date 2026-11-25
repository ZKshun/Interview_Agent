import { planSchema } from "../../shared/schemas.js";

export function guardEvidence(blueprints, sources) {
  return blueprints.filter((blueprint) => {
    const source = sources.find((item) => item.id === blueprint.sourceId);
    return (
      source &&
      blueprint.evidence.trim().length >= 2 &&
      source.text.includes(blueprint.evidence)
    );
  });
}

export async function planInterview(llm, task, onRetry) {
  let discarded = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = planSchema.parse(
      await llm.complete({
        kind: "plan",
        schema: planSchema,
        input: task,
        onRetry,
      }),
    );
    const accepted = guardEvidence(result.blueprints, task.sources).slice(
      0,
      task.count,
    );
    discarded += result.blueprints.length - accepted.length;
    if (accepted.length) return { blueprints: accepted, discarded };
    if (!attempt) await onRetry(1);
  }
  throw new Error("规划中的原文证据均无法匹配，请补充资料后重试规划");
}
