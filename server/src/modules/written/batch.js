import PQueue from "p-queue";

/** One global queue bounds LLM concurrency across tasks, not just within a batch. */
export function createGenerationQueue(concurrency) {
  return new PQueue({ concurrency });
}
export async function runBatch(queue, questions, worker) {
  return Promise.allSettled(
    questions.map((question) => queue.add(() => worker(question))),
  );
}
