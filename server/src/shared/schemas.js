import { z } from "zod";

export const difficultySchema = z.enum(["easy", "medium", "hard"]);
export const sourceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["resume", "jd", "reference"]),
  text: z.string().trim().min(1).max(60000),
});
export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    mode: z.enum(["interview", "written"]),
    count: z.number().int().min(1).max(30).default(6),
    difficulty: difficultySchema.default("medium"),
    requirements: z.string().trim().max(4000).default(""),
    sources: z.array(sourceSchema).min(1).max(8),
  })
  .refine(
    (value) =>
      value.sources.reduce((sum, source) => sum + source.text.length, 0) <=
      100000,
    "资料总长度不能超过 100,000 字符",
  );

export const blueprintSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  type: z.enum(["concept", "scenario", "coding", "short_answer"]),
  difficulty: difficultySchema,
  sourceId: z.string().min(1),
  evidence: z.string().trim().min(2).max(2000),
  focus: z.string().trim().min(1).max(500),
});
export const planSchema = z.object({
  blueprints: z.array(blueprintSchema).min(1).max(30),
});
export const questionSchema = z.object({
  stem: z.string().trim().min(5).max(10000),
  answer: z.string().trim().min(5).max(15000),
  followUps: z.array(z.string().trim().min(1).max(1000)).max(5).default([]),
});
export const validationSchema = z.object({
  relevance: z.number().min(1).max(10),
  accuracy: z.number().min(1).max(10),
  clarity: z.number().min(1).max(10),
  feedback: z.string().trim().min(1).max(3000),
});
export const editQuestionSchema = questionSchema.extend({
  difficulty: difficultySchema,
});
