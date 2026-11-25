import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { LlmClient } from "../src/shared/llm.js";

test("live LangChain adapter uses configured endpoint, model and zero-temperature validator", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let sent;
  globalThis.fetch = async (url, options) => {
    const request = new Request(url, options);
    sent = { url: request.url, body: await request.json() };
    return new Response(
      JSON.stringify({
        id: "fixture",
        object: "chat.completion",
        created: 1,
        model: "fixture-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content: '{"value":7}' },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  };
  const client = new LlmClient({
    llmMode: "live",
    llmApiKey: "fixture-key",
    llmModel: "fixture-model",
    llmBaseUrl: "http://fixture.invalid/v1",
    llmMaxRetries: 0,
  });
  assert.deepEqual(
    await client.complete({
      kind: "validate",
      schema: z.object({ value: z.number() }),
      input: {},
    }),
    { value: 7 },
  );
  assert.equal(sent.url, "http://fixture.invalid/v1/chat/completions");
  assert.equal(sent.body.model, "fixture-model");
  assert.equal(sent.body.temperature, 0);
});

test("malformed and schema-invalid LLM output retries before publishing valid data", async () => {
  const outputs = ["not JSON", '{"value":-1}', '```json\n{"value":7}\n```'];
  const retries = [];
  const client = new LlmClient(
    {
      llmMode: "live",
      llmApiKey: "test",
      llmModel: "test",
      llmMaxRetries: 2,
      retryDelayMs: 0,
    },
    async () => outputs.shift(),
  );
  const result = await client.complete({
    kind: "validate",
    schema: z.object({ value: z.number().positive() }),
    input: {},
    onRetry: (retry) => retries.push(retry),
  });
  assert.deepEqual(result, { value: 7 });
  assert.equal(retries.length, 2);
});

test("live mode without credentials is explicit and never falls back to demo", async () => {
  const client = new LlmClient({ llmMode: "live", llmMaxRetries: 0 });
  await assert.rejects(
    client.complete({ kind: "plan", schema: z.object({}), input: {} }),
    /LLM.*配置/,
  );
});
