# Interview Studio

根据 `docs/v2` 实现的本地智能出题系统。支持面试题与笔试题两条链路，Vue 3 前端负责资料准备、过程查看、题卡编辑，Fastify 服务端负责解析、规划、评分与去重。

**运行时唯一可配置的外部服务是 LLM。** 不需要 Milvus、Redis、数据库、对象存储、外部 embedding 或追踪服务。任务与向量分别保存在本地 JSON 中。

## 快速启动

环境：Node.js **22.13 或更新版本**、npm。所有命令在项目根目录执行。

```sh
npm install
npm run dev:demo
```

打开 <http://127.0.0.1:5173>。点击“填入示例”，按 **解析 → 规划 → 确认蓝图 → 生成 → 编辑** 完成流程。

`dev:demo` 是显式离线演示模式，生成内容与评分均标注为演示数据，不调用任何模型。真实模式调用失败不会自动退回演示结果。

演示向量保存在独立的 `vectors.demo.json`，不会参与真实模式的检索和去重。历史演示任务始终显示演示标识；任务只允许在创建时的模式继续生成/评分，切换模式后请新建任务或切回原模式。

### 配置真实 LLM

将根目录 `.env.example` 复制为 `.env`，填写支持 Chat Completions 的模型接口：

```dotenv
LLM_MODE=live
LLM_BASE_URL=https://your-provider.example/v1
LLM_API_KEY=你的密钥
LLM_MODEL=你的模型名称
```

```sh
npm run dev
```

配置仅由服务端读取，**不要创建 `VITE_LLM_API_KEY`**。修改 `.env` 后重启服务。模型需支持 `temperature`（评分使用 0）、`max_tokens` 和 JSON 文本输出；特殊推理模型或非兼容接口需调整 `shared/llm.js`。不使用供应商专属工具调用。未配置时允许上传解析，规划时显示配置提示。

真实模式会把选定的资料文本、出题要求和相关历史题发送到配置的 LLM。上传原始文件只在内存中解析，不保存原始二进制；解析文本会保存在本地任务文件。

### 生产构建

```sh
npm run build
npm start
```

打开 <http://127.0.0.1:3001>，Fastify 同时提供编译后的前端和 API。开发时 Vite 代理 `/api` 到 3001。若修改后端端口，同时设置 `VITE_API_TARGET=http://127.0.0.1:新端口`。

## 目录与职责

```text
Interview_Agent/
├── docs/
│   ├── v2/                       # 原始需求、架构与目录参考，保留不改
│   └── superpowers/plans/        # 实施计划与关键取舍
├── server/
│   ├── src/
│   │   ├── app.js                # Fastify 装配、错误处理、静态文件
│   │   ├── server.js             # 启动与优雅退出
│   │   ├── config.js             # 环境变量校验、禁用遥测
│   │   ├── routes/
│   │   │   ├── tasks.js          # 任务、题卡、导出、SSE 接口
│   │   │   └── uploads.js        # 文件上传与解析
│   │   ├── shared/
│   │   │   ├── parser.js         # PDF / DOCX / UTF-8 文本解析
│   │   │   ├── llm.js            # LangChain 调用、JSON/Zod 校验、退避重试
│   │   │   ├── demo-llm.js       # 显式离线演示内容
│   │   │   ├── schemas.js        # 输入、蓝图、题目、评分结构
│   │   │   ├── task.js           # 状态机、节点执行、恢复与单题操作
│   │   │   ├── task-repository.js# 任务持久化与状态事件
│   │   │   ├── json-store.js     # 串行事务、原子文件替换
│   │   │   ├── vector.js         # 本地向量、余弦检索、原子去重
│   │   │   └── sse.js            # 任务快照推送、心跳与重连
│   │   ├── modules/
│   │   │   ├── interview/
│   │   │   │   ├── plan.js       # 规划 + 指定来源的原文证据匹配
│   │   │   │   └── generate.js   # 题目生成 + 独立 Validator 评分
│   │   │   └── written/
│   │   │       ├── blueprint.js # 笔试蓝图，复用证据校验契约
│   │   │       ├── prompt.js    # 确定性检索文本与 few-shot 示例
│   │   │       ├── batch.js     # 跨任务共享的 p-queue 并发限制
│   │   │       └── dedup.js     # 合格题入库闸门
│   │   └── prompts/              # 规划、生成、评分的集中提示词
│   └── test/                     # 存储、LLM、业务链路、API 回归测试
├── web/
│   ├── src/
│   │   ├── api/                  # REST、SSE、状态标签
│   │   ├── stores/task.js        # Pinia 状态、快照与任务历史
│   │   ├── views/                # UploadPage / ProcessPage / CardPage
│   │   ├── components/           # StepBar / MarkdownViewer / QuestionCard
│   │   ├── router/               # 可刷新、可分享的本地任务路由
│   │   └── styles.css            # 统一视觉样式与响应式规则
│   └── e2e/                      # 浏览器完整操作流
├── data/                         # 运行时生成，不提交
│   ├── tasks.json                # 来源、蓝图、题卡、评分、节点与日志
│   ├── vectors.json              # 真实模式的题目数据与向量
│   └── vectors.demo.json         # 隔离的离线演示题库
├── .env.example
├── package.json                  # npm workspaces 与统一命令
└── package-lock.json             # 可重现依赖版本
```

## 业务流程

### 面试题：有据可依，质量优先

1. 上传 PDF、DOCX、TXT、Markdown 或粘贴文本，为来源标记“简历 / 岗位 JD / 参考资料”。
2. 查看解析结果，手动开始规划。规划要求 `topic/type/difficulty/sourceId/evidence/focus`。
3. Zod 校验结构，再检查 `evidence` 是否逐字存在于对应 `sourceId` 原文。证据不足的蓝图剔除并提示；全部不合格时自动重新规划一次，仍失败则保留可重试状态。
4. 确认蓝图后，在有并发上限的队列中生成，使用 `Promise.allSettled` 隔离单题失败。
5. Validator 使用同一 LLM、温度 0，分别评估相关性、准确性、清晰度。**总分取三项最低值**，防止错误答案被其他高分掩盖。默认门槛 6 分。
6. 低分标记为“待确认”，失败卡可单独重试。面试题不进入向量题库。

### 笔试题：历史参考，生成后去重

1. 规划带题型、难度、考察点与原文依据的结构化蓝图。
2. 代码将蓝图字段拼成检索文本，检索最多 3 道已入库的合格历史题。
3. 历史题仅作为 few-shot 参考，始终调用 LLM 生成当前题目；不会直接返回历史题。
4. 每题先做 Validator 评分；低分不会入库。
5. 对“题干 + 参考答案”向量化，检查相似度。达到阈值则显示“疑似重复”，保留题卡供修改，但不入库。
6. 检查重复与写入是同一串行事务，防止并发批次重复插入。题卡显示评分、原文和历史参考题 ID。

### 编辑、删除与导出

- 修改题干、答案、追问或难度后，旧评分失效，并从向量题库撤下；可以“重新评分”保留修改，也可以“重新生成”。
- 删除采用任务内软删除，并从向量题库移除；刷新和重启不会使删除的题目重新出现。
- Markdown 导出包含当前未删除的题目、答案、追问、状态、难度、评分与原文来源；低分和重复题不会被悄悄标为可用。
- Markdown 在前端经 DOMPurify 清洗，不加载资料中的远程图片。

## 状态与恢复

```text
PARSING → PARSED ──用户确认──> PLANNING → READY
READY ──用户确认──> GENERATING → VALIDATING → DONE
节点失败 → FAILED → 重试对应阶段

题卡：pending → generating → validating → passed / needs_retry / duplicate
                         └─失败─────────> failed
人工删除 → deleted
```

`DONE` 表示该轮处理已结束，**不表示所有题目都合格**。前端单独显示通过数与待处理数。节点保存执行次数、LLM 重试次数和耗时，题卡保存生成次数和自身耗时。

每次状态变化先写入 `tasks.json` 再发送 SSE 快照。SSE 是**节点/题卡级实时进度**，不是模型逐 token 输出；浏览器断线后自动重连，立即获得最新完整快照，不依赖丢失的事件。

服务启动会恢复中断的解析、规划和生成任务；已通过、已删除、已处理的低分/重复题不会自动重跑。停在评分中的题复用已持久化题干。入库使用稳定的 `questionId` 实现幂等，重启先核对编辑/删除状态与向量记录。

## 本地向量与 JSON

- `embed(text)`：规范化文本，提取字符二元组/三元组，哈希到 512 维并归一化。纯本地函数，不下载模型。
- `cosineSimilarity(a, b)`：检查维度和有限值；零向量相似度为 0。
- `VectorStore.search(text, limit)`：对内存数组计算余弦相似度、过滤与排序。
- 每条记录保存 `promptVector`（检索参考）和 `vector`（完整题目去重），与配置版本一起写入 `vectors.json`。
- JSON 写入采用临时文件 + flush + rename，并串行执行读改写；损坏文件会拒绝启动，不会被静默清空。

这是**词面特征检索**，不是语义 embedding。中文近义表达、完全改写的重复题可能漏检；共享答案模板也可能提高相似度。`0.92` 是可调启发式阈值，本项目没有宣称 95% 去重率。以后可在 `shared/vector.js` 替换 embedding / 存储实现；更换模型必须重建全部向量，不能混用维度与算法版本。

当前面向本机、单用户、单服务进程。**不要让两个服务进程同时使用同一个 `DATA_DIR`**；不同进程应使用独立目录。数据存放明文，备份时停止服务后复制整个目录。JSON 全量重写与线性检索适合演示和小型题库，不适合大规模并发部署。

## 主要配置

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `HOST` / `PORT` | `127.0.0.1` / `3001` | 默认仅监听本机 |
| `LLM_MODE` | `live` | `demo` 才启用离线演示 |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | Chat Completions 兼容地址 |
| `LLM_API_KEY` / `LLM_MODEL` | 空 | 由服务端读取 |
| `LLM_TIMEOUT_MS` | `60000` | 单次模型请求超时 |
| `LLM_MAX_RETRIES` | `2` | 单次调用最多再试两次，401/403 不重试 |
| `GENERATION_CONCURRENCY` | `3` | 跨任务共享的生成并发上限 |
| `VALIDATION_THRESHOLD` | `6` | 三个评分维度都需达到门槛 |
| `VECTOR_DUPLICATE_THRESHOLD` | `0.92` | 达到即拦截入库 |
| `VECTOR_RAG_THRESHOLD` | `0.15` | 历史参考题最低相似度 |
| `DATA_DIR` | `./data` | 相对项目根目录解析 |

单文件最多 10 MB，单份解析文本最多 60,000 字符，任务总文本最多 100,000 字符，最多 30 道题。文本文件使用 UTF-8；PDF 仅解析文本层，不启用 OCR。模型实际上下文限制可能更低，较长资料请先精简。

## HTTP API

| 方法 | 路径 | 行为 |
|---|---|---|
| GET | `/api/health` | 模式、LLM 就绪状态、本地题库数量，不返回密钥 |
| POST | `/api/uploads` | multipart 单文件解析，返回 `{name,text}` |
| GET / POST | `/api/tasks` | 任务历史 / 创建并解析任务 |
| GET | `/api/tasks/:id` | 完整任务快照 |
| GET | `/api/tasks/:id/events` | SSE，事件类型 `snapshot`，含 revision |
| POST | `/api/tasks/:id/plan` | 规划或重试失败的规划 |
| POST | `/api/tasks/:id/generate` | 生成待处理题，不重跑通过题 |
| POST | `/api/tasks/:id/questions/:qid/retry` | 重新生成指定失败/低分/重复题 |
| POST | `/api/tasks/:id/questions/:qid/validate` | 保留题干重新评分 |
| PATCH | `/api/tasks/:id/questions/:qid` | 修改内容与难度，清除旧评分 |
| DELETE | `/api/tasks/:id/questions/:qid` | 软删除并撤下题库记录 |
| GET | `/api/tasks/:id/export` | 下载 Markdown |

创建请求示例：

```json
{
  "title": "前端工程师",
  "mode": "interview",
  "count": 6,
  "difficulty": "medium",
  "requirements": "关注场景分析",
  "sources": [{ "name": "简历", "kind": "resume", "text": "熟悉 Vue 3 与 TypeScript，负责组件设计。" }]
}
```

后台动作返回 202，通过快照读取最终结果。输入不合法返回 400，不存在返回 404，同任务正在执行或状态不适合操作返回 409，缺少 LLM 配置返回 503。

## 开发与验证

```sh
npm test                 # Node 内置测试：本地存储 / 业务 / API
npm run build            # Vue 生产构建
npm run test:e2e          # Playwright 完整浏览器流程，独立临时数据目录
npm run format           # 统一格式化源代码
```

浏览器测试默认在 Windows 使用已安装的 Edge。其他环境先执行 `npx playwright install chromium`；也可通过 `PLAYWRIGHT_CHANNEL` 指定已安装的浏览器。测试端口为 3011 / 5174，不连接生产数据，不调用真实模型。浏览器测试结果保存在系统临时目录。

依赖接口参考：[Fastify](https://fastify.dev/docs/latest/Reference/Server/)、[LangChain ChatOpenAI](https://reference.langchain.com/javascript/langchain-openai/ChatOpenAI)、[pdf-parse](https://www.npmjs.com/package/pdf-parse)。
