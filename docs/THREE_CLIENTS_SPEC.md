# Three Clients Spec v2

## 1. 三端定义

v2 系统由三类入口组成：

```text
Platform Server：服务端，平台核心系统。
Streamer Console：直播端，主播工作台。
Viewer / Creator：用户端，观众创建和观看 NPC。
```

## 2. 服务端 Platform Server

服务端负责系统运行，不直接面向普通观众。

职责：

```text
多租户管理
主播账号
订阅状态
世界运行
Tick Engine
NPC 行为
礼物事件归属
WebSocket 推送
权限控制
日志与监控
```

服务端模块：

```text
Auth
Tenant
Streamer
Billing
World
NPC
Gift
LiveSession
OverlayGateway
ViewerGateway
Admin
```

## 3. 直播端 Streamer Console

主播登录后使用。

功能：

```text
主播登录
查看订阅状态
创建 / 选择世界
创建直播会话
连接 TikTok 礼物来源
打开 OBS Overlay
查看 NPC 危机榜
查看礼物事件
查看观众创建的 NPC
复制观众创建链接
切换镜头 / 跟随 NPC
```

路径规划：

```text
/streamer/login
/streamer/dashboard
/streamer/worlds
/streamer/worlds/:worldId
/streamer/live-sessions/:liveSessionId
/streamer/gift-connection
/streamer/billing
```

UI 语言：日文。

## 4. OBS Overlay

Overlay 是直播端的一部分，但专门给 OBS Browser Source 使用。

路径：

```text
/overlay/:streamerHandle/:worldId
```

分辨率：

```text
1920 × 1080
```

功能：

```text
2.5D 世界显示
NPC 名字与状态条
事件字幕
礼物特效
世界时间
生存者 / 死亡者数量
当前聚焦 NPC
```

Overlay 不显示敏感后台数据。

## 5. 用户端 Viewer / Creator

观众通过主播分享的链接进入。

路径：

```text
/s/:streamerHandle/create
/s/:streamerHandle/my-npc
/s/:streamerHandle/watch/:npcId
```

功能：

```text
输入 TikTok ID
输入 NPC Prompt
创建 NPC
查看自己的 NPC
查看背包
查看最近事件
查看死亡记录
```

限制：

```text
不能控制 NPC。
不能命令 NPC 攻击。
不能直接使用物品。
不能查看主播后台。
不能查看其他主播的私有世界数据。
```

UI 语言：日文。

## 6. 三端权限差异

| 功能 | 服务端 | 直播端 | 用户端 |
|---|---|---|---|
| 世界 Tick | 是 | 否 | 否 |
| NPC 行为计算 | 是 | 否 | 否 |
| 连接礼物源 | 是 | 发起 / 配置 | 否 |
| 观察全世界 | API | 是 | 否 |
| 查看自己的 NPC | API | 可查看所有 | 是 |
| 创建 NPC | API | 否 | 是 |
| 管理订阅 | 是 | 是 | 否 |
| 操作镜头 | 否 | 是 | 仅跟随自己 |

## 7. MVP 实现

MVP 前端目录：

```text
frontend/streamer
frontend/overlay
frontend/viewer
```

Creator 暂时放在 viewer 中。

后续可拆分：

```text
frontend/creator
```
