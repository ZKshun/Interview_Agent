import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";

const config = loadConfig();
const app = await buildApp({ config });
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
try {
  await app.listen({ host: config.host, port: config.port });
  if (!app.service.llm.ready)
    app.log.warn("LLM 未配置：可以解析资料，请配置 .env 后开始规划");
  if (config.llmMode === "demo")
    app.log.warn("离线演示模式：题目与评分为演示数据");
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exit(1);
}
