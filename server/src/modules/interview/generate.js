import { questionSchema, validationSchema } from "../../shared/schemas.js";

export async function generateQuestion(llm, input, onRetry) {
  return questionSchema.parse(
    await llm.complete({
      kind: "generate",
      schema: questionSchema,
      input,
      onRetry,
    }),
  );
}

export async function validateQuestion(llm, input, onRetry) {
  const result = validationSchema.parse(
    await llm.complete({
      kind: "validate",
      schema: validationSchema,
      input,
      onRetry,
    }),
  );
  // A severe factual/relevance/clarity defect cannot be hidden by averaging.
  return {
    ...result,
    score: Math.min(result.relevance, result.accuracy, result.clarity),
    evaluatedAt: new Date().toISOString(),
  };
}
