# AGENTS.md

本文件定义 AI 开发 Agent 在本仓库中的工作规则。

## 1. 项目定位

本仓库是 AI Wasteland Survival v2：多主播 SaaS 版 AI-NPC 荒土生存直播平台。

开发时必须牢记：

```text
这不是单主播直播工具。
这是面向多个 TikTok 主播的 SaaS 平台。
```

## 2. 语言规则

```text
开发沟通：中文
代码注释：中文
主播端 UI：日文
用户端 UI：日文
数据库字段：英文 snake_case
TypeScript 类型：英文 PascalCase / camelCase
```

## 3. 架构规则

必须遵守：

```text
所有核心数据必须支持 tenant / streamer / world 上下文。
服务端负责世界状态，前端只负责展示和提交请求。
礼物接入必须通过 Gift Adapter。
NPC 基础行为使用规则 AI。
LLM 只能低频用于人格生成、事件总结、直播旁白。
```

禁止：

```text
写死单主播。
写死单世界。
每 NPC 每 Tick 调 LLM。
把 TikTok 接入写死到某个非官方库。
让礼物直接控制 NPC。
让礼物直接原地复活 NPC。
浏览器端暴露 service role key。
```

## 4. 目录约定

```text
backend/              服务端
frontend/streamer     主播控制台
frontend/overlay      OBS Overlay
frontend/viewer       用户端 / 创建端
game-client/          主播窗口游戏客户端
supabase/schema.sql   数据库 Schema
docs/                 设计与规格文档
```

## 5. 必读文档

开发前必须阅读：

```text
docs/PRODUCT_STRATEGY.md
docs/SAAS_ARCHITECTURE.md
docs/MULTI_TENANT_MODEL.md
docs/THREE_CLIENTS_SPEC.md
docs/STREAMER_CONSOLE_SPEC.md
docs/GIFT_ADAPTER_SPEC.md
docs/AI_NPC_ENGINE_SPEC.md
docs/MVP_ROADMAP.md
docs/DATABASE_SCHEMA.md
CODEX_TASKS.md
```

## 6. 开发优先级

当前优先：

```text
多租户数据库
默认主播 / 默认世界种子数据
Backend API MVP
World Tick Engine
Streamer Console MVP
Overlay MVP
Viewer / Creator MVP
模拟礼物闭环
```

当前不做：

```text
真实 Stripe
真实 TikTok 深度接入
多主播正式注册
公共大世界
复杂分账
移动 App
AWS 生产部署
```

## 7. 代码质量

```text
TypeScript strict mode。
API 输入必须用 zod 校验。
数据库访问必须通过 repository / service 层。
所有异步函数必须处理错误。
WebSocket 消息必须有 type 字段。
所有世界状态写入必须经过后端。
```
