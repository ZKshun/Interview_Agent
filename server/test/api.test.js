import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";

async function fixture(t, extra = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "interview-api-"));
  const app = await buildApp({
    config: {
      dataDir,
      llmMode: "demo",
      concurrency: 2,
      validationThreshold: 6,
      duplicateThreshold: 0.92,
      ragThreshold: 0.15,
      ...extra,
    },
    logger: false,
  });
  t.after(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return app;
}
const payload = {
  title: "前端岗位",
  mode: "interview",
  count: 2,
  sources: [
    {
      name: "resume.txt",
      kind: "resume",
      text: "熟悉 Vue 组件通信。使用 TypeScript 开发前端项目。",
    },
  ],
};

test("API rejects invalid input and provides full parse/plan/generate/edit workflow", async (t) => {
  const app = await fixture(t);
  assert.equal(
    (await app.inject({ method: "POST", url: "/api/tasks", payload: {} }))
      .statusCode,
    400,
  );
  assert.equal((await app.inject("/api/tasks/no-such-id")).statusCode, 404);
  const created = await app.inject({
    method: "POST",
    url: "/api/tasks",
    payload,
  });
  assert.equal(created.statusCode, 201);
  const { id } = created.json();
  await app.service.waitIdle();
  assert.equal((await app.inject(`/api/tasks/${id}`)).json().status, "PARSED");
  assert.equal(
    (await app.inject({ method: "POST", url: `/api/tasks/${id}/plan` }))
      .statusCode,
    202,
  );
  assert.equal(
    (await app.inject({ method: "POST", url: `/api/tasks/${id}/plan` }))
      .statusCode,
    409,
  );
  await app.service.waitIdle();
  assert.equal(
    (await app.inject({ method: "POST", url: `/api/tasks/${id}/generate` }))
      .statusCode,
    202,
  );
  await app.service.waitIdle();
  const task = (await app.inject(`/api/tasks/${id}`)).json();
  assert.equal(task.status, "DONE");
  assert.equal(task.questions.length, 2);
  const question = task.questions[0];
  const response = await app.inject({
    method: "PATCH",
    url: `/api/tasks/${id}/questions/${question.id}`,
    payload: {
      ...question.content,
      stem: "修改题干，解释组件之间如何通信？",
      difficulty: "hard",
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().questions[0].validation, null);
  const exported = await app.inject(`/api/tasks/${id}/export`);
  assert.match(exported.headers["content-type"], /text\/markdown/);
  assert.match(exported.body, /修改题干/);
});

test("multipart text upload is parsed locally, unsupported formats return 400", async (t) => {
  const app = await fixture(t);
  const upload = (filename) =>
    app.inject({
      method: "POST",
      url: "/api/uploads",
      headers: {
        "content-type": "multipart/form-data; boundary=upload-boundary",
      },
      payload: Buffer.from(
        `--upload-boundary\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/plain\r\n\r\nVue 3 resume\r\n--upload-boundary--\r\n`,
      ),
    });
  assert.equal((await upload("resume.txt")).json().text, "Vue 3 resume");
  assert.equal((await upload("resume.exe")).statusCode, 400);
});

test("missing live credentials are reported without leaking config", async (t) => {
  const app = await fixture(t, {
    llmMode: "live",
    llmApiKey: "",
    llmModel: "",
  });
  const health = (await app.inject("/api/health")).json();
  assert.equal(health.llmReady, false);
  assert.equal("llmApiKey" in health, false);
  const { id } = (
    await app.inject({ method: "POST", url: "/api/tasks", payload })
  ).json();
  await app.service.waitIdle();
  assert.equal(
    (await app.inject({ method: "POST", url: `/api/tasks/${id}/plan` }))
      .statusCode,
    503,
  );
});
