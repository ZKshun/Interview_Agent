import { JsonStore } from "./json-store.js";

const DIMENSIONS = 512;
const EMBEDDING_VERSION = "local-char-ngram-v1";

/** Deterministic local lexical embedding. No model download or network requests. */
export function embed(text) {
  const normalized = String(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
  const vector = Array(DIMENSIONS).fill(0);
  for (const width of [2, 3]) {
    for (let i = 0; i <= normalized.length - width; i++) {
      let hash = 2166136261;
      for (const char of normalized.slice(i, i + width))
        hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
      vector[(hash >>> 0) % DIMENSIONS]++;
    }
  }
  if (normalized.length === 1)
    vector[normalized.codePointAt(0) % DIMENSIONS] = 1;
  const norm = Math.hypot(...vector);
  return norm ? vector.map((value) => value / norm) : vector;
}

export function cosineSimilarity(a, b) {
  if (
    a.length !== b.length ||
    !a.length ||
    [...a, ...b].some((v) => !Number.isFinite(v))
  ) {
    throw new Error("向量维度或数值无效");
  }
  let product = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    product += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }
  return normA && normB
    ? Math.max(-1, Math.min(1, product / Math.sqrt(normA * normB)))
    : 0;
}

export class VectorStore {
  constructor(store, { duplicateThreshold = 0.92, ragThreshold = 0.15 } = {}) {
    this.store = store;
    this.duplicateThreshold = duplicateThreshold;
    this.ragThreshold = ragThreshold;
  }

  static async open(path, options) {
    const store = await JsonStore.open(path, {
      version: EMBEDDING_VERSION,
      dimensions: DIMENSIONS,
      records: [],
    });
    const data = store.read();
    if (
      data.version !== EMBEDDING_VERSION ||
      data.dimensions !== DIMENSIONS ||
      !Array.isArray(data.records)
    ) {
      throw new Error("向量 JSON 格式或 embedding 版本不匹配");
    }
    for (const record of data.records) {
      if (
        record.vector?.length !== DIMENSIONS ||
        record.promptVector?.length !== DIMENSIONS
      )
        throw new Error("向量 JSON 维度损坏");
      cosineSimilarity(record.vector, record.promptVector);
    }
    return new VectorStore(store, options);
  }

  search(text, limit = 3) {
    const vector = embed(text);
    return this.store
      .read()
      .records.map(({ vector: _, promptVector, ...record }) => ({
        ...record,
        similarity: cosineSimilarity(vector, promptVector),
      }))
      .filter((record) => record.similarity >= this.ragThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async insert(question) {
    const vector = embed(`${question.stem}\n${question.answer}`);
    const promptVector = embed(question.prompt);
    // Check + insert share one transaction, including concurrent batches and retries.
    return this.store.transaction((data) => {
      // Same ID is an update; changed content still passes the duplicate gate.
      data.records = data.records.filter((record) => record.id !== question.id);
      let closest;
      for (const record of data.records) {
        const similarity = cosineSimilarity(vector, record.vector);
        if (!closest || similarity > closest.similarity)
          closest = { duplicateId: record.id, similarity };
      }
      if (closest && closest.similarity >= this.duplicateThreshold)
        return { inserted: false, ...closest };
      data.records.push({ ...question, vector, promptVector });
      return { inserted: true, id: question.id };
    });
  }

  remove(id) {
    return this.store.transaction((data) => {
      data.records = data.records.filter((r) => r.id !== id);
    });
  }
  get size() {
    return this.store.read().records.length;
  }
}
