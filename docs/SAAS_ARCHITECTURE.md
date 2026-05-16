# Launch Architecture v0

## 1. 架构目标

首发目标不是完整多主播 SaaS，而是先把一个主播的上线闭环做出来。

```text
一个平台服务端
一个默认主播
一个默认世界
一个直播会话
一个观众创建 / 观看链路
一个 game-client 主播窗口
```

底层仍保留 `tenant / streamer / world` 上下文，方便后续再扩成多主播 SaaS。

## 2. 高层架构

```text
Viewer / Creator / game-client
        ↓ HTTP / WebSocket
Platform API Server
        ↓
PostgreSQL
        ↑
Tick Scheduler
        ↑
World Engine / Gift Adapter / AI Helper
```

## 3. 服务模块

| 模块 | 职责 |
|---|---|
| Auth Service | 主播和观众身份认证 |
| World Manager | 世界创建、状态、归档、容量 |
| Tick Scheduler | 世界 Tick 调度 |
| NPC Service | NPC 创建、状态、背包、死亡、记忆 |
| Gift Adapter Manager | 礼物来源连接和标准化 |
| Live Session Manager | 开播场次、礼物统计、事件统计 |
| Viewer Gateway | 用户端实时推送 |
| Game Client Gateway | 主播窗口实时数据 |
| Admin Console | 后续扩展 |
| Billing Service | 后续扩展 |
| Tenant Service | 后续扩展 |

## 4. 多租户原则

首发阶段只跑默认数据，但核心数据模型必须继续保留上下文字段。

```text
tenant_id = streamer workspace id
```

所有核心业务数据必须可追溯到：

```text
tenant_id
streamer_id
world_id
live_session_id
```

## 5. 世界归属

首发采用每个主播独立世界，但默认只有一个主播和一个世界。

```text
Default Streamer → Default World
```

不在首发阶段做所有主播共享大世界。

## 6. Tick Scheduler

不能为每个世界开永久高频循环。必须按世界状态调度。

| 世界状态 | Tick 策略 |
|---|---|
| live | 每 60 秒 Tick |
| active | 每 5-10 分钟 Tick |
| paused | 不 Tick |
| archived | 不 Tick |

世界状态：

```text
inactive
active
live
paused
archived
```

## 7. 直播会话

主播每次开播创建一个 live_session。

```text
streamer starts live session
→ select world
→ connect gift source
→ open game-client
→ receive gift events
→ end live session
→ write session stats
```

## 8. 礼物事件流

```text
TikTok / Manual / DevMock
→ Gift Adapter
→ Normalized GiftEvent
→ live_session_id / streamer_id / world_id 归属
→ ResourceGrant
→ World Event
→ WebSocket push
```

## 9. 主播窗口

首发阶段主播窗口由 `game-client` 承担。

```text
/game/:streamerHandle/:worldId
```

主播窗口只展示当前世界快照、礼物反馈、NPC 状态和运行中的危机信息。

## 10. 用户链接

用户从主播链接进入。

```text
/s/:streamerHandle/create
/s/:streamerHandle/my-npc
/s/:streamerHandle/watch/:npcId
```

用户创建的 NPC 自动绑定到该主播租户和世界。

## 11. 订阅限制

首发阶段不做完整套餐计费，但模型保留扩展位：

```text
max_worlds
max_npcs_per_world
max_live_sessions_per_month
overlay_branding
custom_gift_mapping
ai_narration_quota
world_archive_days
```

## 12. MVP 架构

首发 MVP 只实现伪多主播：

```text
1 个默认 streamer
1 个 tenant
1 个 world
1 个 live session
1 个 game-client
1 条 viewer 创建 / 观看链路
```

这样后续扩展时不需要重构核心数据库。
