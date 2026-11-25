import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskService } from "../src/shared/task.js";

const input = {
  title: "前端开发",
  mode: "interview",
  count: 2,
  difficulty: "medium",
  requirements: "",
  sources: [
    {
      name: "简历",
      kind: "resume",
      text: "熟悉 Vue 组件通信。使用 Redis 缓存优化查询。",
    },
  ],
};
const blueprint = (sourceId) => ({
  topic: "Vue 组件通信",
  type: "scenario",
  difficulty: "medium",
  sourceId,
  evidence: "熟悉 Vue 组件通信",
  focus: "父子组件数据流",
});

function provider(options = {}) {
  return {
    mode: "test",
    ready: true,
    async complete({ kind, input: context, schema }) {
      if (kind === "plan")
        return schema.parse({
          blueprints:
            options.plan?.(context) ??
            Array.from({ length: context.count }, () =>
              blueprint(context.sources[0].id),
            ),
        });
      if (kind === "generate") {
        if (options.fail?.(context)) throw Error("模型暂时不可用");
        return schema.parse({
          stem: options.same
            ? "如何解释 Vue 中的组件通信？"
            : `第 ${context.index + 1} 题：如何解释 Vue 中的组件通信？`,
          answer:
            "通过 props 下传属性，通过 emit 触发事件，避免直接修改父组件数据。",
          followUps: ["如何避免状态混乱？"],
        });
      }
      return schema.parse({
        relevance: options.low ? 4 : 9,
        accuracy: options.low ? 4 : 9,
        clarity: 9,
        feedback: options.low ? "缺少关键说明" : "内容准确且贴合原文",
      });
    },
  };
}

async function fixture(t, llm = provider(), options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "interview-flow-"));
  const config = {
    dataDir,
    concurrency: 2,
    validationThreshold: 6,
    duplicateThreshold: 0.9999,
    ragThreshold: 0,
    ...options,
  };
  const service = await TaskService.open(config, llm);
  t.after(async () => {
    await service.waitIdle();
    await rm(dataDir, { recursive: true, force: true });
  });
  return { service, config };
}

async function planned(service, overrides = {}) {
  const task = await service.create({ ...input, ...overrides });
  await service.waitIdle();
  service.plan(task.id);
  await service.waitIdle();
  return service.get(task.id);
}

test("interview keeps only evidence in the referenced source and records discarded count", async (t) => {
  const { service } = await fixture(
    t,
    provider({
      plan: (context) => [
        blueprint(context.sources[0].id),
        { ...blueprint(context.sources[0].id), evidence: "擅长 Kubernetes" },
      ],
    }),
  );
  const task = await planned(service);
  assert.equal(task.status, "READY");
  assert.equal(task.questions.length, 1);
  assert.match(task.logs.map((log) => log.message).join(" "), /1.*证据/);
  service.generate(task.id);
  await service.waitIdle();
  const result = service.get(task.id);
  assert.equal(result.status, "DONE");
  assert.equal(result.questions[0].status, "passed");
  assert.equal(result.questions[0].validation.score, 9);
  assert.equal(service.vectors.size, 0, "interview does not enter vector bank");
});

test("invented evidence cannot produce a ready plan", async (t) => {
  const { service } = await fixture(
    t,
    provider({
      plan: (context) => [
        { ...blueprint(context.sources[0].id), sourceId: "nonexistent" },
      ],
    }),
  );
  const task = await planned(service);
  assert.equal(task.status, "FAILED");
  assert.equal(task.questions.length, 0);
  assert.match(task.error, /证据/);
});

test("low scores remain visible and never enter written vector bank", async (t) => {
  const { service } = await fixture(t, provider({ low: true }));
  const task = await planned(service, { mode: "written" });
  service.generate(task.id);
  await service.waitIdle();
  assert.equal(service.get(task.id).questions[0].status, "needs_retry");
  assert.equal(service.vectors.size, 0);
});

test("single-card retry does not regenerate successful siblings", async (t) => {
  let fail = true;
  const { service } = await fixture(
    t,
    provider({ fail: (context) => context.index === 1 && fail }),
  );
  const task = await planned(service);
  service.generate(task.id);
  await service.waitIdle();
  let result = service.get(task.id);
  assert.equal(result.questions[1].status, "failed");
  fail = false;
  service.retry(task.id, result.questions[1].id);
  await service.waitIdle();
  result = service.get(task.id);
  assert.deepEqual(
    result.questions.map((q) => q.status),
    ["passed", "passed"],
  );
  assert.deepEqual(
    result.questions.map((q) => q.attempts),
    [1, 2],
  );
});

test("written duplicate gate is atomic and retrieved history is a reference, not a reused result", async (t) => {
  const { service } = await fixture(t, provider({ same: true }));
  const first = await planned(service, { mode: "written" });
  service.generate(first.id);
  await service.waitIdle();
  assert.deepEqual(
    service
      .get(first.id)
      .questions.map((q) => q.status)
      .sort(),
    ["duplicate", "passed"],
  );
  assert.equal(service.vectors.size, 1);
  const next = await planned(service, { mode: "written", count: 1 });
  service.generate(next.id);
  await service.waitIdle();
  const question = service.get(next.id).questions[0];
  assert.equal(question.ragReferences.length, 1);
  assert.equal(question.attempts, 1);
  assert.equal(question.status, "duplicate");
});

test("editing invalidates old grade and removes searchable version, delete stays deleted", async (t) => {
  const { service } = await fixture(t);
  const task = await planned(service, { mode: "written", count: 1 });
  service.generate(task.id);
  await service.waitIdle();
  const question = service.get(task.id).questions[0];
  await service.edit(task.id, question.id, {
    stem: "修改后的题干：如何实现组件通信？",
    answer: question.content.answer,
    followUps: [],
    difficulty: "hard",
  });
  const edited = service.get(task.id).questions[0];
  assert.equal(edited.validation, null);
  assert.equal(edited.status, "needs_retry");
  assert.equal(service.vectors.size, 0);
  service.validate(task.id, question.id);
  await service.waitIdle();
  assert.equal(service.get(task.id).questions[0].status, "passed");
  await service.remove(task.id, question.id);
  assert.equal(service.get(task.id).questions[0].status, "deleted");
  assert.equal(service.vectors.size, 0);
});

test("restart resumes interrupted questions and preserves completed siblings", async (t) => {
  const { service, config } = await fixture(t);
  const task = await planned(service);
  service.generate(task.id);
  await service.waitIdle();
  await service.repository.update(task.id, (current) => {
    current.status = "GENERATING";
    current.questions[1].status = "generating";
    current.questions[1].content = null;
  });
  const reopened = await TaskService.open(config, provider());
  await reopened.recover();
  await reopened.waitIdle();
  const recovered = reopened.get(task.id);
  assert.equal(recovered.status, "DONE");
  assert.equal(recovered.questions[0].attempts, 1);
  assert.equal(recovered.questions[1].attempts, 2);
  assert.equal(recovered.questions[1].status, "passed");
});

test("recovery removes uncommitted vector records before revalidation can fail", async (t) => {
  const { service, config } = await fixture(t);
  const task = await planned(service, { mode: "written", count: 1 });
  service.generate(task.id);
  await service.waitIdle();
  await service.repository.update(task.id, (current) => {
    current.status = "GENERATING";
    current.questions[0].status = "validating";
  });
  const reopened = await TaskService.open(config, provider({ low: true }));
  await reopened.recover();
  await reopened.waitIdle();
  assert.equal(reopened.get(task.id).questions[0].status, "needs_retry");
  assert.equal(reopened.vectors.size, 0);
});

test("queued retry survives restart without rerunning a different low-score sibling", async (t) => {
  const { service, config } = await fixture(t, provider({ low: true }));
  const task = await planned(service);
  service.generate(task.id);
  await service.waitIdle();
  service.queue.pause();
  service.retry(task.id, task.questions[1].id);
  await new Promise((resolve) => service.queue.once("add", resolve));
  const reopened = await TaskService.open(config, provider());
  await reopened.recover();
  await reopened.waitIdle();
  const result = reopened.get(task.id);
  service.queue.start();
  await service.waitIdle();
  assert.equal(result.questions[0].status, "needs_retry");
  assert.equal(result.questions[0].attempts, 1);
  assert.equal(result.questions[1].status, "passed");
  assert.equal(result.questions[1].attempts, 2);
});

test("demo bank is isolated from live retrieval and cross-mode execution is rejected", async (t) => {
  const demo = provider();
  demo.mode = "demo";
  const { service, config } = await fixture(t, demo);
  const task = await planned(service, { mode: "written", count: 1 });
  service.generate(task.id);
  await service.waitIdle();
  assert.equal(service.vectors.size, 1);
  const live = provider();
  live.mode = "live";
  const reopened = await TaskService.open(config, live);
  assert.equal(reopened.vectors.size, 0);
  const unplanned = await service.create(input);
  await service.waitIdle();
  const switched = await TaskService.open(config, live);
  assert.throws(() => switched.plan(unplanned.id), /模式/);
});

test('queued validation resumes as validation without overwriting human edits', async t => {
  const { service, config } = await fixture(t, provider({ low: true }));
  const task = await planned(service, { count: 1 });
  service.generate(task.id); await service.waitIdle();
  const question = service.get(task.id).questions[0];
  await service.edit(task.id, question.id, { ...question.content, stem: '人工编辑的题干：请解释 Vue 单向数据流。', difficulty: 'hard' });
  service.queue.pause();
  service.validate(task.id, question.id);
  await new Promise(resolve => service.queue.once('add', resolve));
  const reopened = await TaskService.open(config, provider());
  await reopened.recover(); await reopened.waitIdle();
  const result = reopened.get(task.id).questions[0];
  service.queue.start(); await service.waitIdle();
  assert.equal(result.status, 'passed');
  assert.equal(result.attempts, 1);
  assert.equal(result.content.stem, '人工编辑的题干：请解释 Vue 单向数据流。');
});
