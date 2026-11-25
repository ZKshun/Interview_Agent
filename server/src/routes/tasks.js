import { streamTask } from "../shared/sse.js";

export async function taskRoutes(app) {
  const { service } = app;
  app.get("/api/tasks", () => service.list());
  app.post("/api/tasks", async (request, reply) =>
    reply.code(201).send(await service.create(request.body)),
  );
  app.get("/api/tasks/:id", (request) => service.get(request.params.id));
  app.get("/api/tasks/:id/events", (request, reply) =>
    streamTask(
      request,
      reply,
      service.repository,
      request.params.id,
      app.sseConnections,
    ),
  );
  for (const action of ["plan", "generate"]) {
    app.post(`/api/tasks/:id/${action}`, (request, reply) =>
      reply.code(202).send(service[action](request.params.id)),
    );
  }
  for (const action of ["retry", "validate"]) {
    app.post(
      `/api/tasks/:id/questions/:questionId/${action}`,
      (request, reply) =>
        reply
          .code(202)
          .send(service[action](request.params.id, request.params.questionId)),
    );
  }
  app.patch("/api/tasks/:id/questions/:questionId", (request) =>
    service.edit(request.params.id, request.params.questionId, request.body),
  );
  app.delete("/api/tasks/:id/questions/:questionId", (request) =>
    service.remove(request.params.id, request.params.questionId),
  );
  app.get("/api/tasks/:id/export", (request, reply) => {
    const task = service.get(request.params.id);
    const sections = task.questions
      .filter((q) => q.content && q.status !== "deleted")
      .map((question, index) => {
        const source = task.sources.find(
          (source) => source.id === question.blueprint.sourceId,
        );
        return `## ${index + 1}. ${question.blueprint.topic}\n\n状态：${question.status} · 难度：${question.blueprint.difficulty} · 评分：${question.validation?.score ?? "未评分"}/10\n\n${question.content.stem}\n\n### 参考答案\n\n${question.content.answer}\n\n### 追问方向\n\n${question.content.followUps.map((text) => `- ${text}`).join("\n")}\n\n来源：${source?.name ?? ""}\n\n> ${question.blueprint.evidence}`;
      });
    reply.header(
      "Content-Disposition",
      `attachment; filename="questions-${task.id}.md"`,
    );
    return reply
      .type("text/markdown; charset=utf-8")
      .send(
        `# ${task.title}\n\n${task.providerMode === "demo" ? "> 离线演示内容与评分，仅用于验证流程。\n\n" : ""}${sections.join("\n\n---\n\n")}\n`,
      );
  });
}
