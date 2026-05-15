# SaaS Architecture v2

## 1. 架构目标

v2 目标是从单主播工具升级为多主播 SaaS 平台。

```text
一个平台服务端
多个主播账号
多个主播世界
多个直播会话
多个观众用户
多个 Overlay 链接
统一计费与权限隔离
```

## 2. 高层架构

```text
Viewer / Creator / Streamer Console / OBS Overlay
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
| Auth Service | 平台管理员、主播、观众身份认证 |
| Billing Service | 主播订阅状态、套餐限制、过期处理 |
| Tenant Service | 多租户隔离，主播空间管理 |
| Streamer Service | 主播资料、直播配置、Overlay 链接 |
| World Manager | 世界创建、状态、归档、容量限制 |
| Tick Scheduler | 多世界 Tick 调度 |
| NPC Service | NPC 创建、状态、背包、死亡、记忆 |
| Gift Adapter Manager | 礼物来源连接和标准化 |
| Live Session Manager | 主播开播场次、礼物统计、事件统计 |
| Overlay Gateway | 主播 OBS 画面实时推送 |
| Viewer Gateway | 用户端实时推送 |
| Admin Console | 平台管理后台 |

## 4. 多租户原则

每个主播是一个 tenant。

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

MVP 采用每个主播独立世界。

```text
Streamer A → World A
Streamer B → World B
Streamer C → World C
```

不在 MVP 阶段做所有主播共享大世界。

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
→ open overlay
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
→ Overlay WebSocket
```

## 9. Overlay 链接

每个主播应有自己的 Overlay URL。

```text
/overlay/:streamerHandle/:worldId
```

OBS 只能看到该主播授权范围内的世界。

## 10. 用户链接

用户从主播链接进入。

```text
/s/:streamerHandle/create
/s/:streamerHandle/my-npc
/s/:streamerHandle/watch/:npcId
```

用户创建的 NPC 自动绑定到该主播租户和世界。

## 11. 订阅限制

套餐会影响：

```text
max_worlds
max_npcs_per_world
max_live_sessions_per_month
overlay_branding
custom_gift_mapping
ai_narration_quota
world_archive_days
```

过期处理：

```text
subscription expired
→ streamer console restricted
→ live worlds paused
→ existing viewer links read-only or disabled
→ payment restored
→ worlds can resume
```

## 12. MVP 架构

MVP 只实现伪多主播：

```text
1 个默认 streamer
1 个 tenant
1 个 world
1 个 live session
但所有表和 API 必须带 tenant / streamer / world 上下文
```

这样后续扩展时不需要重构核心数据库。
