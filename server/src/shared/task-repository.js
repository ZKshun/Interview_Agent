import { EventEmitter } from "node:events";
import { JsonStore } from "./json-store.js";

export function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}
export function addLog(task, message, level = "info") {
  task.logs.push({ at: new Date().toISOString(), message, level });
  task.logs = task.logs.slice(-150);
}

export class TaskRepository extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.setMaxListeners(0);
  }
  static async open(path) {
    const store = await JsonStore.open(path, { version: 1, tasks: {} });
    const data = store.read();
    if (data.version !== 1 || !data.tasks || Array.isArray(data.tasks))
      throw new Error("任务 JSON 格式不兼容");
    return new TaskRepository(store);
  }
  get(id) {
    const task = this.store.read().tasks[id];
    if (!task) throw httpError(404, "任务不存在");
    return task;
  }
  list() {
    return Object.values(this.store.read().tasks).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
  async create(task) {
    await this.store.transaction((data) => {
      data.tasks[task.id] = task;
    });
    this.emit(task.id, this.get(task.id));
  }
  async update(id, update) {
    const task = await this.store.transaction((data) => {
      if (!data.tasks[id]) throw httpError(404, "任务不存在");
      update(data.tasks[id]);
      data.tasks[id].updatedAt = new Date().toISOString();
      data.tasks[id].revision++;
      return data.tasks[id];
    });
    this.emit(id, task);
    return task;
  }
}
