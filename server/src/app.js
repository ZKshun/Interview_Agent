import Fastify from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ZodError } from "zod";
import { projectRoot, loadConfig } from "./config.js";
import { LlmClient } from "./shared/llm.js";
import { TaskService } from "./shared/task.js";
import { taskRoutes } from "./routes/tasks.js";
import { uploadRoutes } from "./routes/uploads.js";

export async function buildApp({
  config = loadConfig(),
  llm = new LlmClient(config),
  logger = true,
} = {}) {
  const app = Fastify({
    logger,
    bodyLimit: 2 * 1024 * 1024,
    requestTimeout: 120000,
  });
  const service = await TaskService.open(config, llm);
  app.decorate("service", service);
  app.decorate("sseConnections", new Set());
  app.addHook("preClose", async () => {
    for (const response of app.sseConnections) response.end();
  });
  app.addHook("onClose", async () => {
    await service.waitIdle();
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: error.issues
          .map((issue) => `${issue.path.join(".") || "输入"}: ${issue.message}`)
          .join("；"),
      });
    const status = error.statusCode ?? 500;
    if (status >= 500 && status !== 503) request.log.error(error);
    reply.code(status).send({
      error: status === 500 ? "服务处理失败，请查看服务端日志" : error.message,
    });
  });
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 4 },
  });
  app.get("/api/health", () => ({
    status: "ok",
    llmMode: llm.mode,
    llmReady: llm.ready,
    vectorCount: service.vectors.size,
    vectorBackend: "local-json",
    validationThreshold: config.validationThreshold,
  }));
  await app.register(taskRoutes);
  await app.register(uploadRoutes);
  const webRoot = resolve(projectRoot, "web/dist");
  if (existsSync(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot });
    app.setNotFoundHandler((request, reply) =>
      request.url.startsWith("/api/")
        ? reply.code(404).send({ error: "接口不存在" })
        : reply.sendFile("index.html"),
    );
  } else
    app.setNotFoundHandler((request, reply) =>
      reply
        .code(404)
        .send({ error: "接口不存在；前端开发模式请访问 Vite 地址" }),
    );
  await service.recover();
  return app;
}
