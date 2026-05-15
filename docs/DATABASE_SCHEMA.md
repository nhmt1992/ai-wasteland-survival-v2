# Database Schema v2

## 1. 目标

v2 数据库从一开始支持多主播 SaaS。

MVP 可以只有一个默认主播，但表结构必须支持：

```text
多个 tenant
多个 streamer
多个 world
多个 live_session
多个 viewer_user
多个 NPC
```

## 2. 核心表

### 平台 / 主播 / 租户

```text
tenants
streamers
streamer_members
streamer_subscriptions
```

### 世界 / 直播

```text
worlds
world_tiles
tile_resources
live_sessions
world_events
world_ticks
```

### 用户 / NPC

```text
viewer_users
npcs
npc_states
npc_inventory
npc_relationships
npc_memories
```

### 礼物 / 资源

```text
item_definitions
resource_packs
resource_pack_items
gift_source_connections
gift_events
resource_grants
```

## 3. 多租户字段

以下表必须包含 `tenant_id`：

```text
streamer_members
streamer_subscriptions
worlds
live_sessions
viewer_users
npcs
world_events
gift_events
resource_grants
```

以下表通过 world_id 间接归属：

```text
world_tiles
tile_resources
world_ticks
```

## 4. 默认种子数据

MVP 需要默认：

```text
tenant: default
streamer: matt_demo
world: 荒土世界 Alpha
live_session: dev session
5 default NPC
basic item definitions
basic resource packs
```

## 5. RLS 策略方向

MVP 可先通过后端服务控制权限。

后续 Supabase RLS：

```text
streamer 只能访问自己的 tenant。
viewer 只能访问自己的 NPC。
public overlay 只能读取指定世界的公开快照。
service role 才能写 Tick 和礼物事件。
```

## 6. 禁止设计

```text
不允许没有 tenant_id 的 gift_event。
不允许没有 streamer/world 上下文的 NPC 创建。
不允许全局唯一世界假设。
不允许把 live gift 直接写到 NPC 状态，必须先写 gift_event / resource_grant。
```

实际 SQL 见：`supabase/schema.sql`。
