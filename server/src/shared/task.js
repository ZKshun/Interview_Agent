import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { TaskRepository, addLog, httpError } from "./task-repository.js";
import { VectorStore } from "./vector.js";
import { createTaskSchema, editQuestionSchema } from "./schemas.js";
import { cleanText } from "./parser.js";
import { planInterview } from "../modules/interview/plan.js";
import {
  generateQuestion,
  validateQuestion,
} from "../modules/interview/generate.js";
import { planWritten } from "../modules/written/blueprint.js";
import { retrieveExamples } from "../modules/written/prompt.js";
import { admitQuestion } from "../modules/written/dedup.js";
import { createGenerationQueue, runBatch } from "../modules/written/batch.js";

const activeStages = ["PARSING", "PLANNING", "GENERATING", "VALIDATING"];
const retryable = [
  "pending",
  "failed",
  "needs_retry",
  "duplicate",
  "generating",
  "validating",
];

export class TaskService {
  #operations = new Map();
  constructor(config, llm, repository, vectors) {
    Object.assign(this, { config, llm, repository, vectors });
    this.queue = createGenerationQueue(config.concurrency ?? 3);
  }
  static async open(config, llm) {
    const repository = await TaskRepository.open(
      join(config.dataDir, "tasks.json"),
    );
    const vectors = await VectorStore.open(
      join(
        config.dataDir,
        llm.mode === "demo" ? "vectors.demo.json" : "vectors.json",
      ),
      config,
    );
    return new TaskService(config, llm, repository, vectors);
  }
  get(id) {
    return this.repository.get(id);
  }
  list() {
    return this.repository
      .list()
      .map(({ sources, questions, logs, ...task }) => ({
        ...task,
        total: questions.filter((q) => q.status !== "deleted").length,
        passed: questions.filter((q) => q.status === "passed").length,
        sourceCount: sources.length,
      }));
  }
  async waitIdle() {
    while (this.#operations.size)
      await Promise.allSettled([...this.#operations.values()]);
  }

  #available(id) {
    this.get(id);
    if (this.#operations.has(id))
      throw httpError(409, "任务正在处理中，请等待当前步骤完成");
  }
  #modelReady(id) {
    if (id && this.get(id).providerMode !== this.llm.mode)
      throw httpError(
        409,
        "任务与当前 LLM 模式不同，请切回原模式继续，或新建任务",
      );
    if (!this.llm.ready)
      throw httpError(503, "LLM 未配置，请设置服务端 .env 或使用显式演示模式");
  }

  // Reserve synchronously before returning 202, preventing duplicate clicks from spawning work.
  #launch(id, action) {
    this.#available(id);
    const operation = Promise.resolve()
      .then(action)
      .catch(async (error) => {
        await this.repository.update(id, (task) => {
          task.status = "FAILED";
          task.error = error.message;
          const running = task.nodes.find((node) => node.status === "running");
          if (running) {
            running.status = "failed";
            running.durationMs = Date.now() - Date.parse(running.startedAt);
          }
          addLog(task, error.message, "error");
        });
      })
      .finally(() => this.#operations.delete(id));
    // Observe even persistence errors; waitIdle/close will still wait for the original promise.
    operation.catch((error) => {
      this.lastBackgroundError = error;
    });
    this.#operations.set(id, operation);
    return this.get(id);
  }

  async create(raw) {
    const input = createTaskSchema.parse(raw);
    const now = new Date().toISOString();
    const task = {
      ...input,
      id: randomUUID(),
      status: "PARSING",
      providerMode: this.llm.mode,
      sources: input.sources.map((source) => ({ ...source, id: randomUUID() })),
      questions: [],
      nodes: [],
      logs: [],
      error: null,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.create(task);
    this.#launch(task.id, () => this.#parse(task.id));
    return this.get(task.id);
  }

  async #startNode(id, name, prepare = () => {}) {
    await this.repository.update(id, (task) => {
      task.status = name;
      task.error = null;
      let node = task.nodes.find((item) => item.name === name);
      if (!node) {
        node = { name, attempts: 0, retries: 0 };
        task.nodes.push(node);
      }
      Object.assign(node, {
        status: "running",
        startedAt: new Date().toISOString(),
        durationMs: 0,
        attempts: node.attempts + 1,
      });
      addLog(task, `开始 ${name}`);
      prepare(task);
    });
  }
  async #finishNode(id, name, status) {
    await this.repository.update(id, (task) => {
      const node = task.nodes.find((item) => item.name === name);
      Object.assign(node, {
        status: "done",
        durationMs: Date.now() - Date.parse(node.startedAt),
      });
      task.status = status;
      if (status === "DONE") task.activeRun = null;
      addLog(task, `完成 ${name}`);
    });
  }
  async #parse(id) {
    await this.#startNode(id, "PARSING");
    await this.repository.update(id, (task) => {
      task.sources = task.sources.map((source) => ({
        ...source,
        text: cleanText(source.text),
      }));
      for (const source of task.sources)
        addLog(task, `已解析「${source.name}」：${source.text.length} 字符`);
    });
    await this.#finishNode(id, "PARSING", "PARSED");
  }

  plan(id) {
    this.#available(id);
    this.#modelReady(id);
    const task = this.get(id);
    if (!["PARSED", "FAILED"].includes(task.status) || task.questions.length)
      throw httpError(409, "当前状态无法重新规划");
    return this.#launch(id, () => this.#plan(id));
  }
  async #plan(id) {
    await this.#startNode(id, "PLANNING");
    const task = this.get(id);
    const onRetry = () =>
      this.repository.update(id, (current) => {
        current.nodes.find((node) => node.name === "PLANNING").retries++;
        addLog(current, "规划输出不合格，正在重试", "warning");
      });
    const planner = task.mode === "interview" ? planInterview : planWritten;
    const { blueprints, discarded } = await planner(this.llm, task, onRetry);
    await this.repository.update(id, (current) => {
      current.questions = blueprints.map((blueprint, index) => ({
        id: randomUUID(),
        index,
        blueprint,
        status: "pending",
        content: null,
        validation: null,
        attempts: 0,
        retries: 0,
        durationMs: 0,
        ragReferences: [],
        error: null,
      }));
      if (discarded)
        addLog(
          current,
          `${discarded} 个蓝图因证据不足或超出数量被剔除`,
          "warning",
        );
      addLog(current, `已规划 ${blueprints.length} 道题，原文证据已核验`);
    });
    await this.#finishNode(id, "PLANNING", "READY");
  }

  generate(id) {
    this.#available(id);
    this.#modelReady(id);
    const task = this.get(id);
    if (!["READY", "DONE", "FAILED"].includes(task.status))
      throw httpError(409, "请先完成规划");
    const selected = task.questions.filter((q) => retryable.includes(q.status));
    if (!selected.length) throw httpError(409, "没有待生成或待重试的题目");
    return this.#launch(id, () => this.#generate(id, selected));
  }
  retry(id, questionId) {
    this.#available(id);
    this.#modelReady(id);
    const question = this.#question(id, questionId);
    if (!["failed", "needs_retry", "duplicate"].includes(question.status))
      throw httpError(409, "该题不需要重试");
    return this.#launch(id, () => this.#generate(id, [question]));
  }
  validate(id, questionId) {
    this.#available(id);
    this.#modelReady(id);
    const question = this.#question(id, questionId);
    if (!question.content || question.status !== "needs_retry")
      throw httpError(409, "该题不需要重新评分");
    return this.#launch(id, () => this.#generate(id, [question], true));
  }

  #question(id, questionId) {
    const question = this.get(id).questions.find(
      (q) => q.id === questionId && q.status !== "deleted",
    );
    if (!question) throw httpError(404, "题目不存在");
    return question;
  }
  #updateQuestion(id, questionId, update) {
    return this.repository.update(id, (task) =>
      update(
        task.questions.find((q) => q.id === questionId),
        task,
      ),
    );
  }

  async #generate(id, selected, validationOnly = false) {
    // Persist accepted selection and pending actions before any queue wait.
    await this.#startNode(id, "GENERATING", (task) => {
      task.activeRun = {
        questionIds: selected.map((q) => q.id),
        validationOnly,
      };
      for (const q of task.questions) {
        if (!task.activeRun.questionIds.includes(q.id)) continue;
        q.status =
          validationOnly || (q.status === "validating" && q.content)
            ? "validating"
            : "pending";
      }
    });
    const results = await runBatch(this.queue, selected, (question) =>
      this.#runQuestion(id, question.id, validationOnly),
    );
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected) throw rejected.reason;
    await this.#finishNode(id, "GENERATING", "VALIDATING");
    await this.#startNode(id, "VALIDATING");
    await this.repository.update(id, (task) => {
      const needsAttention = task.questions.filter((q) =>
        ["failed", "needs_retry", "duplicate"].includes(q.status),
      ).length;
      addLog(task, `本轮处理结束，${needsAttention} 道题需要处理`);
    });
    await this.#finishNode(id, "VALIDATING", "DONE");
  }

  async #runQuestion(id, questionId, validationOnly) {
    const started = Date.now();
    const task = this.get(id);
    let question = this.#question(id, questionId);
    // Reuse persisted content if a process stopped in the validator.
    const reuseContent =
      validationOnly || (question.status === "validating" && question.content);
    const onRetry = () =>
      this.#updateQuestion(id, questionId, (q) => {
        q.retries++;
      });
    try {
      // A retry must not leave a previous/uncommitted version searchable.
      if (task.mode === "written") await this.vectors.remove(questionId);
      if (!reuseContent) {
        const retrieval =
          task.mode === "written"
            ? retrieveExamples(
                this.vectors,
                question.blueprint,
                task.requirements,
              )
            : { prompt: "", references: [], examples: [] };
        await this.#updateQuestion(id, questionId, (q) => {
          q.status = "generating";
          q.attempts++;
          q.error = null;
          q.ragReferences = retrieval.references.map(
            ({ id, topic, similarity }) => ({ id, topic, similarity }),
          );
          q.retrievalPrompt = retrieval.prompt;
          q.duplicate = null;
        });
        const content = await generateQuestion(
          this.llm,
          {
            ...task,
            blueprint: question.blueprint,
            index: question.index,
            examples: retrieval.examples,
            previousFeedback: question.validation?.feedback,
          },
          onRetry,
        );
        await this.#updateQuestion(id, questionId, (q) => {
          q.content = content;
          q.validation = null;
          q.status = "validating";
        });
      } else {
        await this.#updateQuestion(id, questionId, (q) => {
          q.status = "validating";
          q.error = null;
        });
      }
      question = this.#question(id, questionId);
      const validation = await validateQuestion(
        this.llm,
        {
          blueprint: question.blueprint,
          content: question.content,
          sources: task.sources,
        },
        onRetry,
      );
      await this.#updateQuestion(id, questionId, (q) => {
        q.validation = validation;
      });
      let status =
        validation.score >= this.config.validationThreshold
          ? "passed"
          : "needs_retry";
      let duplicate = null;
      if (status === "passed" && task.mode === "written") {
        const result = await admitQuestion(
          this.vectors,
          task,
          this.#question(id, questionId),
        );
        if (!result.inserted) {
          status = "duplicate";
          duplicate = result;
        }
      }
      await this.#updateQuestion(id, questionId, (q, current) => {
        Object.assign(q, {
          status,
          duplicate,
          durationMs: Date.now() - started,
        });
        addLog(
          current,
          `第 ${q.index + 1} 题：${status}，评分 ${validation.score}/10`,
        );
      });
    } catch (error) {
      if (task.mode === "written") await this.vectors.remove(questionId);
      await this.#updateQuestion(id, questionId, (q, current) => {
        Object.assign(q, {
          status: "failed",
          error: error.message,
          durationMs: Date.now() - started,
        });
        addLog(current, `第 ${q.index + 1} 题失败：${error.message}`, "error");
      });
    }
  }

  async edit(id, questionId, raw) {
    const content = editQuestionSchema.parse(raw);
    this.#available(id);
    this.#question(id, questionId);
    const operation = (async () => {
      // Persist invalidation first. Recovery reconciles stale vector records after a crash.
      await this.#updateQuestion(id, questionId, (q, task) => {
        q.content = {
          stem: content.stem,
          answer: content.answer,
          followUps: content.followUps,
        };
        q.blueprint.difficulty = content.difficulty;
        q.validation = null;
        q.status = "needs_retry";
        q.duplicate = null;
        q.error = null;
        addLog(task, `第 ${q.index + 1} 题已编辑，需重新评分`);
      });
      await this.vectors.remove(questionId);
      return this.get(id);
    })().finally(() => this.#operations.delete(id));
    this.#operations.set(id, operation);
    return operation;
  }
  async remove(id, questionId) {
    this.#available(id);
    this.#question(id, questionId);
    const operation = (async () => {
      await this.#updateQuestion(id, questionId, (q, task) => {
        q.status = "deleted";
        addLog(task, `第 ${q.index + 1} 题已删除`);
      });
      await this.vectors.remove(questionId);
      return this.get(id);
    })().finally(() => this.#operations.delete(id));
    this.#operations.set(id, operation);
    return operation;
  }

  async recover() {
    // Reconcile edit/delete invalidations and partial writes before serving searches.
    for (const record of this.vectors.store.read().records) {
      const task = this.repository.list().find((t) => t.id === record.taskId);
      const question = task?.questions.find((q) => q.id === record.id);
      if (
        !question ||
        question.status !== "passed" ||
        task.providerMode !== this.llm.mode
      )
        await this.vectors.remove(record.id);
    }
    for (const task of this.repository.list()) {
      if (!activeStages.includes(task.status)) continue;
      await this.repository.update(task.id, (current) =>
        addLog(current, "检测到中断任务，正在恢复未完成节点", "warning"),
      );
      this.#launch(task.id, async () => {
        if (task.status === "PARSING") return this.#parse(task.id);
        this.#modelReady(task.id);
        if (task.status === "PLANNING") return this.#plan(task.id);
        return this.#generate(
          task.id,
          task.questions.filter(
            (q) =>
              retryable.includes(q.status) &&
              !["needs_retry", "duplicate"].includes(q.status) &&
              (!task.activeRun || task.activeRun.questionIds.includes(q.id)),
          ),
          task.activeRun?.validationOnly ?? false,
        );
      });
    }
  }
}
