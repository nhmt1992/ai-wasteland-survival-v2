# Multi-Tenant Model v2

## 1. 核心定义

v2 中每个主播都是一个租户。

```text
tenant = streamer workspace
```

一个 tenant 可以拥有：

```text
一个或多个 streamer 用户
一个或多个 world
一个或多个 live_session
多个 viewer 用户
多个 NPC
多个 gift_event
```

MVP 阶段可以只有一个默认租户，但数据库与 API 不能写死单租户。

## 2. 租户隔离原则

所有核心表必须至少包含以下字段之一：

```text
tenant_id
streamer_id
world_id
live_session_id
```

查询必须始终带上下文：

```text
viewer 查询：tenant_id + viewer_user_id
streamer 查询：tenant_id + streamer_id
world 查询：tenant_id + world_id
gift 查询：tenant_id + live_session_id
```

## 3. 核心实体关系

```text
platform_users
  └── streamers
        └── tenants
              ├── streamer_members
              ├── streamer_subscriptions
              ├── worlds
              │     ├── npcs
              │     ├── world_tiles
              │     ├── tile_resources
              │     └── world_events
              ├── live_sessions
              │     └── gift_events
              └── viewer_users
                    └── npcs
```

## 4. 关键 ID

| ID | 含义 |
|---|---|
| tenant_id | 主播工作区 / 租户 |
| streamer_id | 主播账号 |
| viewer_user_id | 观众用户 |
| world_id | 主播世界 |
| live_session_id | 某次直播会话 |
| npc_id | AI-NPC |

## 5. URL 上下文

主播端：

```text
/streamer/dashboard
/streamer/worlds/:worldId
/streamer/live-sessions/:liveSessionId
```

Overlay：

```text
/overlay/:streamerHandle/:worldId
```

用户端：

```text
/s/:streamerHandle/create
/s/:streamerHandle/my-npc
/s/:streamerHandle/watch/:npcId
```

## 6. 权限模型

### platform_admin

```text
查看所有 tenant
管理主播账号
管理订阅
查看系统日志
暂停违规主播
```

### streamer_owner

```text
管理自己的 tenant
管理自己的 world
管理自己的 live_session
复制 overlay 链接
复制 viewer 创建链接
查看自己的礼物事件
```

### streamer_member

```text
查看被授权的 world
操作直播控制台
不能修改计费
```

### viewer_user

```text
创建自己的 NPC
查看自己的 NPC
查看公开世界事件
不能控制 NPC
不能查看主播后台
```

## 7. 数据访问示例

### 主播读取自己的世界

```sql
select * from worlds
where tenant_id = :tenant_id
and id = :world_id;
```

### 用户读取自己的 NPC

```sql
select * from npcs
where tenant_id = :tenant_id
and viewer_user_id = :viewer_user_id;
```

### 礼物事件归属

```sql
select * from gift_events
where tenant_id = :tenant_id
and live_session_id = :live_session_id;
```

## 8. MVP 简化

MVP 可使用默认数据：

```text
default tenant
default streamer
default world
default live_session
```

但代码里必须显式传递：

```text
tenantId
streamerId
worldId
liveSessionId
```

禁止写死：

```text
GLOBAL_WORLD_ID
SINGLE_STREAMER_ONLY
```

## 9. 后续扩展

当多主播上线后：

```text
每个 streamer 注册时创建 tenant。
每个 tenant 默认创建一个 world。
每次开播创建 live_session。
用户通过 streamerHandle 进入对应 tenant。
礼物事件通过 live_session 归属到正确世界。
```
