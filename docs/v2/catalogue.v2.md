### 🛠️ 技术选型

| 层级 | 选型 | 一句话理由 |
| :--- | :--- | :--- |
| 前端 | Vue 3 + Vite + Pinia | 标配，Pinia 按模块拆 store 即可 |
| 服务端 | **Fastify**（或 Express） | Fastify 原生好写 SSE 流式；Express 也行 |
| 解析 | `pdf-parse` + `mammoth` | 够用 |
| LLM | LangChain.js + **Zod** | Zod 约束结构化输出，失败重试 |
| 队列 | **p-queue** | 模块二批量生成用，不用上 Redis |
| 向量库 | **Milvus**（先用内存替代） | 模块二 RAG + 去重 |
| 流式 | SSE | 解析页、规划页实时展示 |

---

### 📁 极简项目目录

#### 前端 `web/`
```text
web/
├── src/
│   ├── api/            # axios 封装 + sse 请求
│   ├── stores/         # useParseStore / useInterviewStore / useWrittenStore
│   ├── views/
│   │   ├── UploadPage.vue    # 上传 + 模式选择
│   │   ├── ProcessPage.vue   # 解析/规划流式展示 (MD 渲染)
│   │   └── CardPage.vue      # 题卡列表 + 编辑
│   ├── components/     # MarkdownViewer / QuestionCard
│   └── router/
```

#### 后端 `server/`
```text
server/
├── src/
│   ├── shared/               # 共享层（两模块复用）
│   │   ├── parser.js         # PDF/DOCX/TXT 统一解析
│   │   ├── llm.js            # LangChain 调用 + Zod 重试封装
│   │   ├── sse.js            # SSE 流式输出工具
│   │   └── vector.js         # Milvus 客户端 + embed
│   │
│   ├── modules/
│   │   ├── interview/        # 模块一：面试题
│   │   │   ├── route.js      # 接口路由
│   │   │   ├── plan.js       # 知识点规划 + 原文防幻觉匹配
│   │   │   └── generate.js   # 并行生成 + Validator 评分
│   │   │
│   │   └── written/          # 模块二：笔试题
│   │       ├── route.js
│   │       ├── blueprint.js  # 题目蓝图规划
│   │       ├── prompt.js     # 模板拼装 + RAG few-shot 注入
│   │       ├── batch.js      # p-queue 批量生成
│   │       └── dedup.js      # 题目向量去重入库
│   │
│   ├── prompts/              # Prompt 模板集中放这里
│   ├── app.js                # 入口 + 中间件
│   └── server.js             # 启动服务
```

---

### 💡 简化后的关键点（面试能讲就行）

1. **`shared/` 只有 4 个文件**：解析、LLM、SSE、向量。两模块直接用，不搞复杂抽象。
2. **模块一只留 3 个文件**：路由、规划（含防幻觉）、生成（含评分）。失败重试逻辑写在 `generate.js` 里就行。
3. **模块二留 5 个文件**：把“蓝图 → 拼 Prompt（含 RAG）→ 队列生成 → 去重”串清楚。生成前 RAG 和生成后去重严格分开，这就是面试亮点。
4. **状态机不单独建目录**：用一个 `taskId` + 内存 Map（或数据库一张表）记录状态，放在 `shared/` 下一个 `task.js` 里，20 行代码搞定。前端题卡失败重试直接传 `taskId` 就行。
5. **Prompts 抽离**：放 `prompts/` 目录，改 Prompt 不用动业务代码。

这样目录一眼能看懂，开发时不会迷路，面试时指着 `shared/` 和 `modules/` 两层说“共享层复用、业务层隔离”，就够了。