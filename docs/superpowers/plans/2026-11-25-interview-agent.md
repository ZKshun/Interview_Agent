# Interview Agent v2 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 根据 docs/v2 实现可本地运行的双模式出题系统。

**Architecture:** Vue 3 前端与 Fastify 服务端通过 REST / SSE 通信。共享解析、LLM、状态与 JSON 存储层；面试、笔试逻辑分模块。只允许 LLM 网络调用，向量使用本地特征哈希、内存数组、余弦检索与 JSON 文件。

**Tech Stack:** Node.js >=22.13、npm workspaces、Vue 3、Vite、Pinia、Fastify、LangChain ChatOpenAI、Zod、p-queue、pdf-parse、mammoth、node:test。

**Spec:** docs/v2/prd.v2.md、docs/v2/design.v2.md、docs/v2/catalogue.v2.md，交互细节参考 docs/v1.md。

## Global Constraints

- 无 Milvus / Redis / 数据库 / 云存储 / 外部 embedding / 遥测服务。
- LLM 配置仅服务端持有；未配置返回明确错误，不自动伪造结果。显式 demo 模式用于离线验收。
- 本地 JSON 单进程运行；原子替换与串行写入；损坏文件拒绝启动，不能覆盖。
- 每道题与节点状态即时持久化，重启恢复中断节点；成功题不重新生成。
- 前端采用文档的上传、解析规划、题卡流程，界面以简洁中文工具台呈现。

## Review Focus

1. 并发生成相同题目：去重检查和写入必须同一临界区。
2. 崩溃发生在入库与题卡保存之间：以稳定 questionId 幂等恢复。
3. 证据来自错误来源、为空或伪造：拒绝该蓝图并告知用户。
4. 已评分题被编辑：旧评分失效，需重新评分；删除或低分不得留在可检索题库。
5. 页面刷新、SSE 重连与服务重启：快照恢复，不重复生成成功题。

## Task 1: 本地存储与解析

Files: server/src/shared/{json-store,vector,parser,schemas}.js、server/test/storage.test.js。
Interfaces: JsonStore.read()/transaction(fn), VectorStore.search(text,limit)/insert(question)/remove(id), parseFile(name,buffer)。
- [x] 先写持久化、损坏文件、余弦、并发去重、文件解析测试，运行得到缺失实现失败。
- [x] 实现原子 JSON 事务、确定性本地向量和带来源的文本解析。
- [x] npm test：上述用例通过。

## Task 2: LLM 与两条状态机链路

Files: server/src/shared/{llm,task,sse}.js、server/src/prompts/*.js、server/src/modules/{interview,written}/*.js、server/test/workflow.test.js。
Interfaces: llm.complete({kind,schema,input,onRetry}), TaskService.create/plan/generate/retry/edit/remove/recover/waitIdle。
- [x] 先写证据过滤、低分、单题重试、RAG、去重、断点恢复、编辑失效测试。
- [x] 实现结构化输出重试，评分温度 0；状态持久化、受限并发、单题操作锁。
- [x] npm test：两条链路端到端通过，完成题恢复不重复调用。

## Task 3: HTTP 与前端

Files: server/src/{app,server,config}.js、server/src/routes/*.js、web/src/{api,stores,views,components,router}/*。
Interfaces: /api/tasks、/:id/plan、/:id/generate、/:id/events、/:id/questions/:qid、/api/uploads、/api/health。
- [x] 写 API 校验与解析上传集成测试，运行失败。
- [x] 实现上传、任务历史、分步确认、SSE 快照、评分与溯源、在线编辑/删除/重试、Markdown 导出。
- [x] npm test 与 npm run build 通过。
- [x] 浏览器验证上传→解析→规划→生成→编辑→删除→刷新恢复，检查手机布局。

## Task 4: 交付

- [x] README 记录启动命令、目录职责、状态流转、接口、配置、本地向量局限与服务扩展点。
- [x] 全套测试、生产构建与独立代码审查，修复实质问题。

## Execution ledger

- Ruling: 当前目录不是 Git 仓库，直接在用户指定目录实施，不创建 worktree 或提交。
- Ruling: 用户已指定 v2 设计并要求实现，沿用该设计，流程审批不另行阻塞。
- Ruling: 本地向量采用字符 n-gram 特征哈希，不下载模型；阈值是可配置启发式，不能声称语义去重达到 95%。
- Ruling: 源资料按简历/JD/参考资料标记；PDF 仅文本层，无 OCR 服务。


## Completion evidence

- Task 1: complete — JSON 原子事务、损坏文件保护、并发去重、真实 PDF/DOCX 文本层解析测试通过。
- Task 2: complete — 原文证据、低分拦截、RAG、单题重试、编辑失效、恢复执行均有回归用例。
- Task 3: complete — Vue 页面、REST/SSE、题卡编辑/删除/评分/导出已接通；无头 Edge 验证 1440×1000 桌面与 390×844 手机宽度。
- Task 4: complete — npm test 26/26；npm run test:e2e 2/2；npm run build 成功；控制台错误为 0。
- Final review: 独立只读审查指出的 3 项实质问题全部修复，并补充失败→通过的回归测试：恢复中索引撤下、排队操作持久化、demo/live 题库隔离。另补充同 ID 内容更新与 SSE 大快照背压测试。
- QA: 页面身份、非空内容、无框架错误覆盖层、控制台、截图、交互流程均通过。使用 Playwright + 已安装 Edge（未安装 Browser 插件），未使用远程素材或字体。
- Limit: 未提供真实 LLM 凭证，真实供应商请求/输出质量未做线上验收；使用真实 LangChain 适配器 + 模拟 HTTP 响应验证配置与请求格式。
- Ruling: SSE 采用节点/题卡快照，不是逐 token 模型输出；本地 JSON 为单进程存储；这些约束已写入 README。
- Ruling: demo 使用独立向量文件并禁止跨模式继续生成；历史内容保持明确标识。
