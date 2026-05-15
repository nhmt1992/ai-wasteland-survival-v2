# MVP Roadmap v2

## 1. 开发原则

v2 从第一天开始按多主播 SaaS 设计，但 MVP 只实现一个默认主播租户。

```text
架构多租户。
功能先单租户。
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
package.json
backend skeleton
frontend/streamer skeleton
frontend/overlay skeleton
frontend/viewer skeleton
supabase/schema.sql
```

验收：

```text
仓库结构完整。
Codex 能按任务继续开发。
```

## Phase 1：多租户数据库与种子数据

交付：

```text
tenants
streamers
streamer_subscriptions
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

## Phase 4：Streamer Console MVP

交付：

```text
默认主播 Dashboard
世界列表
当前 live session
礼物连接状态
NPC 危机榜
Overlay 链接
用户创建链接
```

验收：

```text
主播能看到自己的世界。
主播能复制 Overlay URL。
主播能复制用户创建链接。
主播能看到 NPC 危机榜。
```

## Phase 5：Overlay MVP

交付：

```text
1920×1080 OBS 页面
2.5D 世界占位渲染
NPC 显示
NPC 状态条
事件日志
礼物特效占位
世界时间
生存者数量
```

验收：

```text
OBS Browser Source 可打开。
主播直播画面能看懂 NPC 状态和事件。
```

## Phase 6：Viewer / Creator MVP

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

## Phase 7：模拟礼物闭环

交付：

```text
DevMockGiftAdapter
ManualGiftAdapter 基础
GiftEvent 标准化
ResourceGrant 生成
补给箱投放
NPC 自主拾取
Overlay 礼物事件显示
```

验收：

```text
模拟礼物能进入正确主播世界。
礼物能找到对应 TikTok ID 的 NPC。
资源箱能生成并被 NPC 拾取。
Overlay 显示支援事件。
```

## Phase 8：首次主播演示

配置：

```text
1 默认主播
1 默认世界
5-10 NPC
1 OBS Overlay
1 Viewer / Creator 链接
模拟礼物
1 小时运行
```

验收：

```text
系统 1 小时不崩。
主播能讲故事。
用户端流程可用。
礼物支援反馈清晰。
```

## 暂不开发

```text
真实 Stripe 收费
真实 TikTok 礼物接入
多个正式主播注册
公共大世界
复杂部落政治
移动 App
AWS 生产部署
```
