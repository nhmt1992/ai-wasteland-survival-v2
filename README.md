# AI Wasteland Survival v2

多主播 SaaS 版 AI-NPC 荒土生存直播平台。

本项目不是单主播直播工具，而是面向多个 TikTok 主播的 SaaS 平台：平台提供服务端、主播直播端、观众用户端和 AI-NPC 世界运行系统；主播按月付费开通账号，用自己的 TikTok 账号直播并获得礼物收益；观众创建自己的 AI-NPC，并在主播直播间通过礼物间接支援 NPC。

## 一句话定位

```text
给 TikTok 主播使用的 AI-NPC 生存直播互动 SaaS。
```

## 商业模式

```text
平台向主播收取月费 / 套餐费 / 增值服务费。
主播使用自己的 TikTok 账号直播并获得礼物收益。
观众通过主播链接创建 AI-NPC，并通过直播礼物支援 NPC。
```

## 三端结构

| 端 | 使用者 | 作用 |
|---|---|---|
| 服务端 Platform Server | 平台方 | 账号、订阅、多租户世界、NPC Tick、礼物事件、权限、数据 |
| 直播端 Streamer Console | 主播 | 登录、连接直播间、管理世界、打开 OBS Overlay、查看礼物和 NPC 状态 |
| 用户端 Viewer / Creator | 观众 | 创建自己的 NPC、绑定 TikTok ID、观看自己的 NPC |

## v2 核心原则

```text
多主播优先。
多租户优先。
每个主播一个或多个独立世界。
平台向主播收费，不直接依赖观众打赏。
礼物接入必须 Adapter 化。
NPC 基础行为使用规则 AI，LLM 低频增强叙事。
MVP 先支持单主播默认租户，但代码结构必须可升级到多主播。
```

## 当前不做

```text
不直接做公共大世界。
不让所有主播共享同一个世界。
不每 NPC 每 Tick 调 LLM。
不把 TikTok 接入写死到某个非官方库。
不做付费原地复活。
不在 MVP 阶段上复杂云原生架构。
```

## 技术方向

| 模块 | 技术 |
|---|---|
| Monorepo | npm workspaces |
| 后端 | Node.js + Fastify + TypeScript |
| 数据库 | PostgreSQL / Supabase-style Schema |
| 实时通信 | WebSocket |
| 前端 | Vite + React + TypeScript |
| 2.5D 渲染 | PixiJS 8 |
| 状态管理 | Zustand |
| 部署 MVP | 旧笔记本 / VPS + Docker Compose + Cloudflare Tunnel |
| 后续云部署 | AWS / RDS / ECS or EC2 / CloudFront |
| 订阅收费 | Stripe Billing 预留 |

## MVP 目标

MVP 不是完整 SaaS，而是“伪多主播架构”的第一版。

```text
1 个默认平台管理员
1 个默认主播租户
1 个主播世界
5 个初始 NPC
1 个 Streamer Console
1 个 OBS Overlay
1 个 Viewer / Creator 用户端
模拟礼物 Adapter
Tick Engine 可运行 1 小时
```

## 文档入口

- `docs/PRODUCT_STRATEGY.md`：产品与商业模式。
- `docs/SAAS_ARCHITECTURE.md`：多主播 SaaS 架构。
- `docs/MULTI_TENANT_MODEL.md`：多租户模型。
- `docs/THREE_CLIENTS_SPEC.md`：服务端、直播端、用户端职责。
- `docs/STREAMER_CONSOLE_SPEC.md`：主播端功能规划。
- `docs/GIFT_ADAPTER_SPEC.md`：礼物接入 Adapter 规范。
- `docs/AI_NPC_ENGINE_SPEC.md`：AI-NPC 行为系统。
- `docs/MVP_ROADMAP.md`：开发路线图。
- `docs/DATABASE_SCHEMA.md`：数据库说明。
- `supabase/schema.sql`：PostgreSQL 初始化 SQL。
- `AGENTS.md`：AI 开发 Agent 规则。
- `CODEX_TASKS.md`：Codex 任务顺序。

## 开发语言规则

- 开发沟通：中文。
- 代码注释：中文。
- 主播端 UI：日文。
- 用户端 UI：日文。
- 平台内部字段：英文 snake_case。
- TypeScript 类型：英文 PascalCase / camelCase。

## 本地启动目标

```bash
cp .env.example .env
npm install
docker compose up
npm run dev:backend
npm run dev:streamer
npm run dev:overlay
npm run dev:viewer
```

## 当前阶段

```text
v2 / Phase 0：多主播 SaaS 版仓库初始化。
```
