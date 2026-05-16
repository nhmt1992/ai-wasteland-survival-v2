# AI Wasteland Survival v2

多主播 SaaS 版 AI-NPC 荒土生存直播平台。

本项目不是单主播直播工具，而是面向多个 TikTok 主播的 SaaS 平台：平台提供服务端、主播直播端、观众用户端、平台管理端和 AI-NPC 世界运行系统；主播按月付费开通账号，用自己的 TikTok 账号直播并获得礼物收益；观众创建自己的 AI-NPC，并在主播直播间通过礼物间接支援 NPC。

当前状态：

- Phase 1-15 已完成并可运行。
- 已支持多租户、主播登录、HttpOnly session、世界 Tick、礼物 Adapter、套餐限制、Admin Console、Billing Mock。
- Overlay 已完成首轮视觉升级，进入“荒土末日 × 2.5D 等距 × 高清像素风 × 直播强化 UI”方向。

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

## 四端结构

| 端 | 使用者 | 作用 |
|---|---|---|
| 服务端 Platform Server | 平台方 | 账号、订阅、多租户世界、NPC Tick、礼物事件、权限、数据 |
| 直播端 Streamer Console | 主播 | 登录、连接直播间、管理世界、打开 OBS Overlay、查看礼物和 NPC 状态 |
| 用户端 Viewer / Creator | 观众 | 创建自己的 NPC、绑定 TikTok ID、观看自己的 NPC |
| 管理端 Admin Console | 平台方 | 查看所有主播、租户、世界、直播会话、礼物事件、系统状态 |

## v2 核心原则

```text
多主播优先。
多租户优先。
每个主播一个或多个独立世界。
平台向主播收费，不直接依赖观众打赏。
礼物接入必须 Adapter 化。
NPC 基础行为使用规则 AI，LLM 低频增强叙事。
代码结构必须支持 tenant / streamer / world 上下文。
礼物、订阅、直播会话都必须经过服务端校验。
```

## 当前已交付能力

```text
多租户数据库与默认种子数据
主播登录与 HttpOnly session
真实 PostgreSQL API
World Tick Engine
Streamer Console
OBS Overlay
Viewer / Creator
Admin Console
模拟礼物 Adapter
套餐限制系统
Billing Mock
Cloudflare Quick Tunnel 演示
Overlay 视觉升级轨
```

## 当前不做

```text
不直接做公共大世界。
不让所有主播共享同一个世界。
不每 NPC 每 Tick 调 LLM。
不把 TikTok 接入写死到某个非官方库。
不做付费原地复活。
不在 MVP 阶段上复杂云原生架构。
不接真实 Stripe。
不接真实 TikTok。
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
| 管理端 | Vite + React + TypeScript |
| 订阅收费 | Stripe Billing Mock / 预留真实接入 |
| 部署 MVP | 旧笔记本 / VPS + Docker Compose + Cloudflare Tunnel |
| 后续云部署 | AWS / RDS / ECS or EC2 / CloudFront |

## 当前可交付目标

当前版本已经具备 SaaS MVP 和 Beta 演示能力。

```text
多租户数据库
主播登录与 HttpOnly session
默认主播与测试主播种子数据
真实 PostgreSQL API
World Tick Engine
Streamer Console
OBS Overlay
Viewer / Creator
Admin Console
模拟礼物 Adapter
套餐限制系统
Billing Mock
Cloudflare Quick Tunnel 演示
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
- `docs/ART_DIRECTION.md`：Overlay 美术方向。
- `docs/ASSET_PIPELINE.md`：素材尺寸与命名规范。
- `docs/OVERLAY_VISUAL_SPEC.md`：OBS Overlay 视觉规格。
- `docs/BETA_RUNBOOK.md`：Beta 演示启动与恢复流程。
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

## 本地启动

```bash
cp .env.example .env
npm install
docker compose up
npm run dev:backend
npm run dev:streamer
npm run dev:overlay
npm run dev:viewer
npm run dev:admin
```

## Beta 演示一键启动

```bash
npm run beta:demo
```

这个脚本会重置数据库、启动 backend / streamer / overlay / viewer / admin、拉起 Cloudflare Quick Tunnel，并打印可直接演示的外网地址。流程说明见 [docs/BETA_RUNBOOK.md](docs/BETA_RUNBOOK.md)。

## Cloudflare Tunnel 本地外网测试

```text
1. 先启动 backend 与前端 dev server。
2. 将 `.env` 里的 `PUBLIC_STREAMER_BASE_URL` / `PUBLIC_OVERLAY_BASE_URL` / `PUBLIC_VIEWER_BASE_URL` / `PUBLIC_ADMIN_BASE_URL` 改成对应的外网地址。
3. 分别执行 `npm run tunnel:streamer`、`npm run tunnel:overlay`、`npm run tunnel:viewer`、`npm run tunnel:admin`。脚本会优先使用系统里的 `cloudflared`，Windows 下找不到时会自动下载临时二进制。
4. 外网浏览器访问 tunnel URL，前端会通过同源 `/api` 代理读取本地后端。
```

## 当前阶段

```text
v2 / Phase 15：Billing Mock + Visual Upgrade Track。
```
