# MVP Roadmap v2

## 1. 开发原则

首发版本先把一个主播的上线闭环做出来。

```text
底层保留 tenant / streamer / world 上下文。
功能先单主播可用。
代码不写死单主播。
数据表必须有 tenant / streamer / world 上下文。
```

## Phase 0：仓库初始化

交付：

```text
README
核心 docs
AGENTS.md
CODEX_TASKS.md
.env.example
docker-compose.yml
backend skeleton
game-client skeleton
frontend/viewer skeleton
supabase/schema.sql
```

验收：

```text
npm install 成功。
docker compose up 成功。
backend /health 成功。
game-client 可启动。
viewer 可启动。
```

## Phase 1：单主播数据库与种子数据

交付：

```text
tenants
streamers
worlds
live_sessions
viewer_users
npcs
npc_states
item_definitions
npc_inventory
gift_events
resource_grants
world_events
```

种子数据：

```text
default tenant
default streamer
default world
5 default NPC
basic items
basic resource packs
```

验收：

```text
执行 schema.sql 成功。
默认主播和默认世界存在。
5 个 NPC 被创建。
```

## Phase 2：Backend API MVP

交付：

```text
GET /health
GET /api/streamers/:handle
GET /api/streamers/:handle/worlds
POST /api/streamers/:handle/live-sessions
GET /api/worlds/:worldId/snapshot
POST /api/viewer/npcs
GET /api/viewer/my-npc?tiktokId=&streamerHandle=
POST /api/dev/gift-events
POST /api/dev/tick
```

验收：

```text
可以查询默认主播。
可以查询默认世界 snapshot。
可以创建用户 NPC。
可以发送模拟礼物。
可以手动触发 Tick。
```

## Phase 3：World Tick Engine

交付：

```text
每 60 秒 Tick
手动 Tick
NPC 基础消耗
移动
找水
找食物
休息
喝水
进食
死亡
事件日志
```

验收：

```text
默认世界运行 1 小时。
5 个 NPC 会自主行动。
NPC 可能陷入危险或死亡。
事件日志可解释行为。
```

## Phase 4：Streamer Game Client MVP

交付：

```text
主播窗口游戏画面
世界快照渲染
NPC 显示
礼物反馈显示
危机事件显示
世界时间
窗口采集建议
```

验收：

```text
主播能打开 game-client。
主播能看到自己的世界。
主播能看到模拟礼物反馈。
主播能围绕 NPC 事件讲故事。
```

## Phase 5：Viewer / Creator MVP

交付：

```text
/s/:streamerHandle/create
/s/:streamerHandle/my-npc
/s/:streamerHandle/watch/:npcId
TikTok ID 输入
Prompt 输入
NPC 创建
查看自己的 NPC
查看事件和背包
```

验收：

```text
观众能通过主播链接创建 NPC。
NPC 自动进入主播世界。
用户只能查看自己的 NPC。
```

## Phase 6：模拟礼物闭环

交付：

```text
DevMockGiftAdapter
ManualGiftAdapter 基础
GiftEvent 标准化
ResourceGrant 生成
补给箱投放
NPC 自主拾取
礼物反馈显示
```

验收：

```text
模拟礼物能进入正确主播世界。
礼物能找到对应 TikTok ID 的 NPC。
资源箱能生成并被 NPC 拾取。
```

## Phase 7：首发演示

配置：

```text
1 默认主播
1 默认世界
5-10 NPC
1 game-client
1 Viewer / Creator 链接
模拟礼物
1 小时运行
```

验收：

```text
系统 1 小时不崩。
主播能看懂世界。
观众端流程可用。
礼物支援反馈清晰。
```

## Phase 8：后续再做

```text
Streamer Console
OBS Overlay
Admin Console
订阅与套餐
多主播注册
团队权限
更完整的数据分析
```
