# AI Wasteland Survival v2

AI Wasteland Survival v2 先做的是一个可上线的 AI-NPC 荒土生存直播闭环。

这不是只做演示页的单机玩具。
首发版本先围绕一个主播、一张世界、一套观众创建 NPC 的闭环上线；底层仍保留 `tenant / streamer / world` 上下文，方便后续再扩成多主播 SaaS。

## 当前状态

- 数据层已经预留多租户上下文，但首发只跑默认主播和默认世界。
- Backend、World Tick、礼物 Adapter、Viewer 创建链路、`game-client` 主播画面是当前重点。
- `game-client/` 已完成首版 workspace，定位为主播窗口里的 2.5D 游戏画面和礼物反馈界面。
- 现在优先保证“能上线、能直播、能创建、能观看”的闭环，而不是把 SaaS 账单、团队和多主播权限先做完。

## 一句话定位

```text
给 TikTok 主播使用的 AI-NPC 生存直播互动系统。
```

## 产品边界

### 要做

- 可上线的单主播数据模型
- 默认主播 / 默认世界种子数据
- Backend API MVP
- World Tick Engine
- `game-client` 主播窗口游戏画面
- Viewer / Creator MVP
- 模拟礼物闭环
- `run/launcher` 图形化窗口启动器

### 不做

- 真实 Stripe
- 真实 TikTok 深度接入
- 多主播正式注册
- 公共大世界
- 复杂分账
- 移动 App
- AWS 生产部署
- 先做完整 SaaS 套餐和团队权限

## 架构原则

```text
所有核心数据必须支持 tenant / streamer / world 上下文。
服务端负责世界状态，前端只负责展示和提交请求。
礼物接入必须通过 Gift Adapter。
NPC 基础行为使用规则 AI。
LLM 只能低频用于人格生成、事件总结、直播旁白。
```

### 禁止事项

```text
写死单主播。
写死单世界。
每 NPC 每 Tick 调 LLM。
把 TikTok 接入写死到某个非官方库。
让礼物直接控制 NPC。
让礼物直接原地复活 NPC。
浏览器端暴露 service role key。
```

## 目录结构

```text
backend/              服务端
frontend/streamer     主播控制台
frontend/overlay      OBS Overlay
frontend/viewer       用户端 / 创建端
frontend/admin        平台管理端
game-client/          主播窗口游戏客户端
supabase/schema.sql   数据库 Schema
docs/                 设计与规格文档
```

## 已交付能力

- 默认主播 / 默认世界数据
- 主播登录与 HttpOnly session
- 真实 PostgreSQL API
- World Tick Engine
- Viewer / Creator
- 观众公开观看页 `/s/:streamerHandle/watch/:npcId`
- 模拟礼物 Adapter
- Cloudflare Quick Tunnel 演示
- `game-client` WebGL 画面客户端

## game-client

`game-client` 是主播窗口里的游戏画面客户端，不是后台管理面板。

### 作用

- 读取后端世界快照并渲染 2.5D 荒土场景。
- 监听 realtime 事件并刷新礼物、Tick、危机状态。
- 在 `stress` 模式下生成本地合成世界，用于视觉和性能验证。
- 为主播窗口提供更接近正式游戏的画面，而不是字幕式信息页。

### 路由

```text
/game/:streamerHandle/:worldId
```

### 查询参数

- `mode=live`：读取后端 snapshot + realtime。
- `mode=stress`：本地合成 1000 NPC 的压力测试世界。
- `npcCount=1..1000`：stress 模式 NPC 数量。
- `debug=1`：显示调试信息。

### 交互

- 拖拽：平移镜头
- 滚轮：缩放镜头
- 画面会随 focus NPC 自动跟随

### 当前视觉方向

- 等距荒土地表
- 2.5D 体积感背景
- NPC 多层合成角色轮廓
- 统一暖色末日 palette
- 低 chrome 的游戏式 HUD

### 主播使用

1. 启动后端与 `game-client`：

```bash
npm run dev:backend
npm run dev:game
```

2. 打开窗口地址：

```text
http://localhost:5177/game/matt/00000000-0000-0000-0000-000000000101?mode=live
```

3. 如果要做性能和画面验证，使用 stress 模式：

```text
http://localhost:5177/game/matt/00000000-0000-0000-0000-000000000101?mode=stress&npcCount=1000&debug=1
```

4. 直播采集时建议：

- 用 OBS 的 Window Capture 采集 `game-client` 窗口。
- 全屏前先确认窗口尺寸是 1920 x 1080 或主播常用采集分辨率。
- 使用 `debug=1` 只做开发验收，正式直播时关闭。
- 需要移动视角时可拖拽，滚轮缩放。

### 生产构建

```bash
npm --workspace game-client run build
```

构建产物输出在 `game-client/dist/`，用于本地静态预览或后续封装。

## 技术栈

| 模块 | 技术 |
|---|---|
| Monorepo | npm workspaces |
| 后端 | Node.js + Fastify + TypeScript |
| 数据库 | PostgreSQL / Supabase-style Schema |
| 实时通信 | WebSocket |
| 前端 | Vite + React + TypeScript |
| 2.5D 渲染 | PixiJS 8 |
| 主播窗口游戏客户端 | Vite + TypeScript + PixiJS 8 |
| 状态管理 | Zustand |
| 管理端 | Vite + React + TypeScript |
| 订阅收费 | 后置 |
| 本地演示 | Docker Compose + Cloudflare Tunnel |

## 本地启动

```bash
cp .env.example .env
npm install
docker compose up
npm run dev:backend
npm run dev:game
npm run dev:viewer
```

## Beta 演示

```bash
npm run beta:demo
```

这个脚本会重置数据库、启动 backend / game-client / viewer、拉起 Cloudflare Quick Tunnel，并打印可直接演示的外网地址。
如果本机 `3000` 被占用，它会自动选择可用后端端口并同步调整前端代理目标。流程说明见 [docs/BETA_RUNBOOK.md](docs/BETA_RUNBOOK.md)。

## 验证命令

建议在回归前先跑：

```bash
npm run typecheck
npm run build
npm run db:verify
npm run phase10:verify
npm run phase11:verify
npm run phase12:verify
npm run phase13:verify
npm run phase15:verify
npm run verify:tick-transaction
npm run verify:viewer-watch
```

其中 `npm run verify:tick-transaction` 用来覆盖礼物补给箱拾取与 Tick 事务回滚的关键闭环，`npm run verify:viewer-watch` 用来覆盖按 `npcId` 的公开观看页与跨租户隔离。

## Cloudflare Tunnel 本地外网测试

```text
1. 先启动 backend 与当前要上线的前端 dev server。
2. 将 `.env` 里的 `PUBLIC_VIEWER_BASE_URL` 和 `PUBLIC_GAME_CLIENT_BASE_URL` 改成对应外网地址。
3. 先执行 `npm run tunnel:viewer`，`game-client` 继续用本地窗口或单独外网地址验收。
4. 外网浏览器访问 tunnel URL，前端会通过同源 `/api` 代理读取本地后端。
```

## 文档入口

- [docs/PRODUCT_STRATEGY.md](docs/PRODUCT_STRATEGY.md)：产品与商业模式
- [docs/SAAS_ARCHITECTURE.md](docs/SAAS_ARCHITECTURE.md)：先上线架构与未来多主播扩展
- [docs/MULTI_TENANT_MODEL.md](docs/MULTI_TENANT_MODEL.md)：多租户模型
- [docs/THREE_CLIENTS_SPEC.md](docs/THREE_CLIENTS_SPEC.md)：服务端、主播画面端、用户端职责
- [docs/STREAMER_CONSOLE_SPEC.md](docs/STREAMER_CONSOLE_SPEC.md)：主播控制台后续功能规划
- [docs/GIFT_ADAPTER_SPEC.md](docs/GIFT_ADAPTER_SPEC.md)：礼物接入 Adapter 规范
- [docs/AI_NPC_ENGINE_SPEC.md](docs/AI_NPC_ENGINE_SPEC.md)：AI-NPC 行为系统
- [docs/MVP_ROADMAP.md](docs/MVP_ROADMAP.md)：开发路线图
- [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)：数据库说明
- [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md)：Overlay 美术方向
- [docs/ASSET_PIPELINE.md](docs/ASSET_PIPELINE.md)：素材尺寸与命名规范
- [docs/OVERLAY_VISUAL_SPEC.md](docs/OVERLAY_VISUAL_SPEC.md)：OBS Overlay 视觉规格
- [docs/GAME_CLIENT_DEVELOPMENT_PLAN.md](docs/GAME_CLIENT_DEVELOPMENT_PLAN.md)：主播窗口游戏客户端开发计划
- [docs/GAME_CLIENT_USER_MANUAL_CN.md](docs/GAME_CLIENT_USER_MANUAL_CN.md)：`game-client` 中文使用说明书
- [run/README.md](run/README.md)：窗口启动器使用说明
- [docs/BETA_RUNBOOK.md](docs/BETA_RUNBOOK.md)：Beta 演示启动与恢复流程
- [supabase/schema.sql](supabase/schema.sql)：PostgreSQL 初始化 SQL
- [AGENTS.md](AGENTS.md)：AI 开发 Agent 规则
- [CODEX_TASKS.md](CODEX_TASKS.md)：Codex 任务顺序

## 开发语言规则

- 开发沟通：中文
- 代码注释：中文
- 主播端 UI：日文
- 用户端 UI：日文
- 数据库字段：英文 snake_case
- TypeScript 类型：英文 PascalCase / camelCase

## 当前阶段

```text
Phase 2 / Backend + game-client + Viewer Launch Track
```

当前正在持续推进后端闭环、`game-client` 主播画面和观众创建 / 观看链路。
