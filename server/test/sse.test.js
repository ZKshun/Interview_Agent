import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { streamTask } from "../src/shared/sse.js";

test("SSE coalesces snapshots under backpressure instead of closing large-document streams", (t) => {
  const repository = new EventEmitter();
  repository.get = () => ({
    id: "task",
    revision: 1,
    sources: [{ text: "a".repeat(100000) }],
  });
  const response = new EventEmitter();
  let ended = false;
  const writes = [];
  response.writeHead = () => {};
  response.write = (chunk) => {
    writes.push(chunk);
    return writes.length !== 1;
  };
  response.end = () => {
    ended = true;
    response.emit("close");
  };
  const connections = new Set();
  t.after(() => response.emit("close"));
  streamTask(
    {},
    { hijack() {}, raw: response },
    repository,
    "task",
    connections,
  );
  repository.emit("task", { id: "task", revision: 2 });
  repository.emit("task", { id: "task", revision: 3 });
  assert.equal(ended, false);
  assert.equal(writes.length, 1);
  response.emit("drain");
  assert.equal(writes.length, 2);
  assert.match(writes[1], /"revision":3/);
  response.emit("close");
  assert.equal(connections.size, 0);
  assert.equal(repository.listenerCount("task"), 0);
});
