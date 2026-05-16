# CODEX_TASKS.md

本文件指导 Codex 按先上线闭环推进开发。

## 当前总原则

```text
架构保留 tenant / streamer / world 上下文。
首发先做单主播可用闭环，不先做完整多主播 SaaS。
MVP 使用默认主播 matt 和默认世界。
所有核心 API 必须带 streamer / world 上下文。
真实 TikTok 和 Stripe 后置。
先做模拟礼物、game-client 和 1 小时世界运行。
```

---

## Phase 0：项目骨架验证

- [x] README.md
- [x] docs 核心文档
- [x] supabase/schema.sql
- [x] AGENTS.md
- [ ] package.json workspaces
- [ ] .gitignore
- [ ] .env.example
- [ ] docker-compose.yml
- [ ] backend/package.json
- [ ] game-client/package.json
- [ ] frontend/viewer/package.json

验收：

```text
npm install 成功。
docker compose up 成功。
backend /health 成功。
game-client 可启动。
viewer dev server 可启动。
```

---

## Phase 1：数据库与种子数据

- [ ] 执行 `supabase/schema.sql`。
- [ ] 验证 default tenant 存在。
- [ ] 验证 default streamer `matt` 存在。
- [ ] 验证 default world 存在。
- [ ] 增加 5 个初始 NPC seed。
- [ ] 生成 64×64 world_tiles。
- [ ] 生成基础 tile_resources。

---

## Phase 2：Backend API MVP

- [ ] `GET /health`
- [ ] `GET /api/streamers/:handle`
- [ ] `GET /api/streamers/:handle/worlds`
- [ ] `POST /api/streamers/:handle/live-sessions`
- [ ] `GET /api/worlds/:worldId/snapshot`
- [ ] `POST /api/viewer/npcs`
- [ ] `GET /api/viewer/my-npc?tiktokId=&streamerHandle=`
- [ ] `POST /api/dev/gift-events`
- [ ] `POST /api/dev/tick`

要求：

```text
所有输入用 zod 校验。
所有查询必须检查 tenant / streamer / world 归属。
```

---

## Phase 3：World Tick Engine

- [ ] Tick Scheduler。
- [ ] 手动 Tick。
- [ ] 读取 live / active world。
- [ ] 读取 alive NPC。
- [ ] water / food / stamina 衰减。
- [ ] hp 归零死亡。
- [ ] seek_water。
- [ ] seek_food。
- [ ] eat / drink。
- [ ] rest。
- [ ] move。
- [ ] world_events 写入。
- [ ] world_snapshot 生成。

禁止：

```text
不要接 LLM。
不要做复杂部落。
不要做真实 TikTok。
```

---

## Phase 4：Gift Adapter MVP

- [ ] 定义 GiftAdapter interface。
- [ ] 实现 DevMockGiftAdapter。
- [ ] 实现 ManualGiftAdapter 基础。
- [ ] gift_events 去重。
- [ ] 根据 streamerHandle 找 live_session。
- [ ] 根据 tiktokId 找 viewer_user / npc。
- [ ] 生成 resource_grants。
- [ ] NPC 可拾取 resource_grants。

---

## Phase 5：game-client MVP

- [ ] 主播窗口游戏画面。
- [ ] 世界快照渲染。
- [ ] NPC 显示。
- [ ] 礼物反馈显示。
- [ ] 危机事件显示。
- [ ] 世界时间显示。
- [ ] 窗口采集说明。

UI：日文。

---

## Phase 6：Viewer / Creator MVP

- [ ] `/s/:streamerHandle/create`
- [ ] TikTok ID 输入。
- [ ] NPC Prompt 输入。
- [ ] 创建 NPC。
- [ ] `/s/:streamerHandle/my-npc`
- [ ] 查看自己的 NPC。
- [ ] 查看背包。
- [ ] 查看最近事件。
- [ ] 死亡记录。

UI：日文。

---

## Phase 7：模拟礼物闭环

- [ ] DevMockGiftAdapter 流程打通。
- [ ] ManualGiftAdapter 流程打通。
- [ ] GiftEvent 标准化。
- [ ] ResourceGrant 生成。
- [ ] 补给箱投放。
- [ ] NPC 自主拾取。
- [ ] game-client 显示支援事件。

验收：

```text
模拟礼物能进入正确主播世界。
礼物能找到对应 TikTok ID 的 NPC。
资源箱能生成并被 NPC 拾取。
game-client 显示支援事件。
```

---

## Phase 8：首次演示

配置：

```text
1 默认主播
1 默认世界
5-10 NPC
模拟礼物
1 小时运行
game-client 可展示
用户端可创建 NPC
```

验收：

```text
系统 1 小时不崩。
主播能看懂世界。
观众端流程可用。
礼物支援反馈清晰。
```
