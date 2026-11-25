import { basename } from "node:path";
import { parseFile } from "../shared/parser.js";
import { httpError } from "../shared/task-repository.js";

export async function uploadRoutes(app) {
  app.post("/api/uploads", async (request) => {
    const part = await request.file();
    if (!part) throw httpError(400, "请选择文件");
    const name = basename(part.filename.replace(/\\/g, "/"));
    const buffer = await part.toBuffer();
    try {
      return { name, text: await parseFile(name, buffer) };
    } catch (error) {
      throw httpError(400, `文件解析失败：${error.message}`);
    }
  });
}
