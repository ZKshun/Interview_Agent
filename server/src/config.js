import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

export function loadConfig() {
  dotenv.config({ path: resolve(projectRoot, ".env"), quiet: true });
  // No tracing / telemetry service is enabled by this project.
  process.env.LANGCHAIN_TRACING_V2 = "false";
  process.env.LANGCHAIN_TRACING = "false";
  process.env.LANGSMITH_TRACING = "false";
  const env = z
    .object({
      HOST: z.string().default("127.0.0.1"),
      PORT: z.coerce.number().int().min(1).max(65535).default(3001),
      LLM_MODE: z.enum(["live", "demo"]).default("live"),
      LLM_BASE_URL: z.url().default("https://api.openai.com/v1"),
      LLM_API_KEY: z.string().default(""),
      LLM_MODEL: z.string().default(""),
      LLM_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .min(1000)
        .max(300000)
        .default(60000),
      LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
      GENERATION_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),
      VALIDATION_THRESHOLD: z.coerce.number().min(1).max(10).default(6),
      VECTOR_DUPLICATE_THRESHOLD: z.coerce
        .number()
        .min(0.1)
        .max(1)
        .default(0.92),
      VECTOR_RAG_THRESHOLD: z.coerce.number().min(0).max(1).default(0.15),
      DATA_DIR: z.string().default("./data"),
    })
    .parse(process.env);
  return {
    host: env.HOST,
    port: env.PORT,
    llmMode: env.LLM_MODE,
    llmBaseUrl: env.LLM_BASE_URL,
    llmApiKey: env.LLM_API_KEY,
    llmModel: env.LLM_MODEL,
    llmTimeoutMs: env.LLM_TIMEOUT_MS,
    llmMaxRetries: env.LLM_MAX_RETRIES,
    concurrency: env.GENERATION_CONCURRENCY,
    validationThreshold: env.VALIDATION_THRESHOLD,
    duplicateThreshold: env.VECTOR_DUPLICATE_THRESHOLD,
    ragThreshold: env.VECTOR_RAG_THRESHOLD,
    dataDir: resolve(projectRoot, env.DATA_DIR),
  };
}
