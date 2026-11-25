import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

/** Single-process JSON store. Transactions publish only after atomic disk replacement. */
export class JsonStore {
  #state;
  #tail = Promise.resolve();

  constructor(path, state) {
    this.path = path;
    this.#state = state;
  }

  static async open(path, initial) {
    await mkdir(dirname(path), { recursive: true });
    let state;
    try {
      state = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT")
        throw new Error(`JSON 文件损坏或不可读：${path}`, { cause: error });
      state = structuredClone(initial);
    }
    return new JsonStore(path, state);
  }

  read() {
    return structuredClone(this.#state);
  }

  transaction(update) {
    const operation = this.#tail.then(async () => {
      const next = structuredClone(this.#state);
      const result = await update(next);
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(next, null, 2), {
          encoding: "utf8",
          flush: true,
        });
        await rename(temporary, this.path);
      } finally {
        await rm(temporary, { force: true });
      }
      this.#state = next;
      return structuredClone(result);
    });
    this.#tail = operation.catch(() => {});
    return operation;
  }
}
