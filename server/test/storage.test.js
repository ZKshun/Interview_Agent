import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../src/shared/json-store.js";
import { VectorStore, cosineSimilarity, embed } from "../src/shared/vector.js";
import { parseFile } from "../src/shared/parser.js";

test("PDF and DOCX binaries extract usable source text without external services", async () => {
  const pdf = await readFile(new URL("./fixtures/resume.pdf", import.meta.url));
  const docx = await readFile(
    new URL("./fixtures/resume.docx", import.meta.url),
  );
  assert.match(await parseFile("resume.pdf", pdf), /Vue 3 and TypeScript/);
  assert.match(
    await parseFile("resume.docx", docx),
    /熟悉 Vue 3 与 TypeScript/,
  );
});

async function directory(t) {
  const dir = await mkdtemp(join(tmpdir(), "interview-storage-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("JSON transactions serialize concurrent writes and survive reopening", async (t) => {
  const path = join(await directory(t), "state.json");
  const store = await JsonStore.open(path, { count: 0 });
  await Promise.all(
    Array.from({ length: 20 }, () =>
      store.transaction((s) => {
        s.count++;
      }),
    ),
  );
  assert.equal((await JsonStore.open(path, {})).read().count, 20);
  const copy = store.read();
  copy.count = -1;
  assert.equal(store.read().count, 20);
  await assert.rejects(
    store.transaction((s) => {
      s.count = -1;
      throw Error("rollback");
    }),
  );
  assert.equal(store.read().count, 20);
});

test("corrupt JSON is not replaced with empty data", async (t) => {
  const path = join(await directory(t), "state.json");
  await writeFile(path, "{broken");
  await assert.rejects(JsonStore.open(path, {}), /JSON|损坏/);
  assert.equal(await readFile(path, "utf8"), "{broken");
});

test("cosine handles zero vectors, rejects dimensions and nonfinite values", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 0]), 0);
  assert.throws(() => cosineSimilarity([1], [1, 2]));
  assert.throws(() => cosineSimilarity([NaN], [1]));
  assert.deepEqual(embed("Vue 组件"), embed("Vue 组件"));
});

test("concurrent identical questions admit one record, stable ID is idempotent", async (t) => {
  const path = join(await directory(t), "vectors.json");
  const store = await VectorStore.open(path, {
    duplicateThreshold: 0.92,
    ragThreshold: 0,
  });
  const question = {
    id: "q1",
    prompt: "Vue 组件通信",
    stem: "解释 Vue 的父子组件通信",
    answer: "通过 props 和 emit 传递数据",
    score: 9,
  };
  const results = await Promise.all([
    store.insert(question),
    store.insert({ ...question, id: "q2" }),
  ]);
  assert.equal(results.filter((r) => r.inserted).length, 1);
  assert.equal(results.find((r) => !r.inserted).duplicateId, "q1");
  assert.equal((await store.insert(question)).inserted, true);
  const reopened = await VectorStore.open(path, { ragThreshold: 0 });
  assert.equal(reopened.search("Vue 组件通信", 3)[0].id, "q1");
  await reopened.remove("q1");
  assert.equal(reopened.search("Vue", 3).length, 0);
});

test("text parser preserves content and rejects unsupported and empty files", async () => {
  assert.equal(
    await parseFile(
      "resume.txt",
      Buffer.from("\uFEFF熟悉 Vue 3\r\n有项目经验"),
    ),
    "熟悉 Vue 3\n有项目经验",
  );
  await assert.rejects(parseFile("script.exe", Buffer.from("abc")), /格式/);
  await assert.rejects(parseFile("empty.txt", Buffer.from("  ")), /文本/);
});

test("reusing an ID with edited content replaces the vector and never hides a duplicate", async (t) => {
  const store = await VectorStore.open(
    join(await directory(t), "vectors.json"),
    { duplicateThreshold: 0.99, ragThreshold: 0 },
  );
  const original = {
    id: "q1",
    prompt: "Vue",
    stem: "Vue 如何实现响应式原理",
    answer: "通过代理拦截属性访问并追踪依赖",
    score: 8,
  };
  await store.insert(original);
  await store.insert({
    id: "q2",
    prompt: "Redis",
    stem: "Redis 持久化有哪些策略",
    answer: "支持快照文件与追加日志持久化策略",
    score: 9,
  });
  const updated = {
    ...original,
    prompt: "HTTP",
    stem: "HTTP 缓存如何工作",
    answer: "通过响应头和条件请求实现缓存复用",
  };
  await store.insert(updated);
  assert.equal(
    store.search("HTTP", 2).find((q) => q.id === "q1").stem,
    "HTTP 缓存如何工作",
  );
  const duplicate = await store.insert({
    ...original,
    stem: "Redis 持久化有哪些策略",
    answer: "支持快照文件与追加日志持久化策略",
  });
  assert.equal(duplicate.inserted, false);
  assert.equal(store.size, 1);
});
