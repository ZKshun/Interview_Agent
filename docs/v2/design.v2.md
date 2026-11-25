# 四层架构

全局共享层、模块一（面试题）、模块二（笔试题）、前端交互

```mermaid
graph TD
    %% 样式定义
    classDef frontend fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef shared fill:#fff3e0,stroke:#e65100,stroke-width:2px;
    classDef module1 fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px;
    classDef module2 fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px;
    classDef db fill:#ffebee,stroke:#c62828,stroke-width:2px;
    classDef infra fill:#eceff1,stroke:#455a64,stroke-width:2px,stroke-dasharray: 5 5;

    %% 前端层
    subgraph Frontend [Vue 3 前端 (轻量化)]
        direction LR
        F1[资料上传 & 模式选择]:::frontend
        F2[解析/规划流式展示页]:::frontend
        F3[题卡列表与在线编辑]:::frontend
    end

    %% 共享层
    subgraph Shared [Node.js 服务端 - 共享基础设施层]
        direction LR
        S1[多格式解析器<br/>PDF/DOCX/Text]:::shared
        S2[LLM 调用封装<br/>重试/Zod拦截]:::shared
        S3[SSE 流式输出通道]:::shared
        S4[Task 状态管理器<br/>状态机/断点续跑]:::shared
    end

    %% 模块一
    subgraph Module1 [模块一：面试题生成链路 (质量优先)]
        direction TB
        M1_Plan[1. 知识点规划]:::module1
        M1_Guard[2. Zod校验 + 原文防幻觉拦截]:::module1
        M1_Gen[3. 并行生成题目 (Promise.allSettled)]:::module1
        M1_Valid[4. Validator Agent 评分闭环 (温度=0)]:::module1
        M1_Retry{评分 >= 阈值?}:::module1
    end

    %% 模块二
    subgraph Module2 [模块二：笔试题生成链路 (批量去重)]
        direction TB
        M2_Plan[1. 结构化题目蓝图规划]:::module2
        M2_Prompt[2. 代码模板拼装 Prompt]:::module2
        M2_RAG[3. RAG 检索注入 few-shot 参考]:::module2
        M2_Gen[4. 异步队列批量生成 (p-queue/BullMQ)]:::module2
        M2_Dedup[5. 题目向量去重 (相似度 > 阈值丢弃)]:::module2
    end

    %% 存储与外部服务
    subgraph Infra [外部服务与存储]
        DB_Milvus[(Milvus<br/>向量知识库)]:::db
        DB_Task[(任务状态持久化)]:::db
        LLM[LLM 模型服务]:::infra
    end

    %% 前端交互连线
    F1 -->|上传文件/文本| S1
    S3 -->|SSE 流式输出| F2
    F2 -->|点击进入生成| Module1
    F2 -->|点击进入生成| Module2
    Module1 -->|生成完成| F3
    Module2 -->|生成完成| F3
    F3 -.->|单卡失败重试| S4

    %% 共享层内部流转
    S1 -->|解析文本 & 来源标签| M1_Plan
    S1 -->|解析文本 & 来源标签| M2_Plan
    S2 -.->|统一调用| LLM
    S4 -.->|记录节点状态| DB_Task

    %% 模块一内部流转
    M1_Plan --> M1_Guard
    M1_Guard -->|证据匹配通过| M1_Gen
    M1_Gen --> M1_Valid
    M1_Valid --> M1_Retry
    M1_Retry -->|Yes: 打上通过标| F3
    M1_Retry -->|No: 打上待确认标| F3

    %% 模块二内部流转
    M2_Plan --> M2_Prompt
    M2_Prompt --> M2_RAG
    M2_RAG <-->|向量检索获取优质题| DB_Milvus
    M2_RAG --> M2_Gen
    M2_Gen --> M2_Dedup
    M2_Dedup <-->|向量比对| DB_Milvus
    M2_Dedup -->|未超阈值入库| DB_Milvus
    M2_Dedup -->|生成成功| F3

```

### 共享底座

- 无论是面试题还是笔试题，都要经过 多格式解析器 统一转化为带标签的文本。

- Task 状态管理器 是本次改造的灵魂（状态机思想），它让前端具备了“单点重试”和“断点续跑”的能力，不再是一锤子买卖。

## 模块一（面试题 - 质量优先闭环）：

- 核心在于图中绿色的 Guard（防幻觉拦截）和 Validator（评分闭环）。

- 流程图明确展示了：即使生成了，也要经过 Validator 判断。如果低于阈值，题目依然会流向前端，但会被打上“待确认/低分”的标签，由人类做最终裁决。这就是多 Agent 思想的落地。

## 模块二（笔试题 - 批量去重闭环）：

- 核心在于紫色的 RAG 检索注入和 题目向量去重。

- 图中清晰地表达了修正后的逻辑：生成前去 Milvus 检索是为了拿 few-shot 参考；生成后再去 Milvus 比对是为了做入库拦截。

- 异步队列批量生成 保证了批量处理时的稳定性和吞吐量。


# 三种工程化思想

状态机、评分闭环、RAG