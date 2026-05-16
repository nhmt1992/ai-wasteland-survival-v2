# Three Clients Spec v2

## 1. 三端定义

首发版本由三类入口组成：

```text
Platform Server：服务端，平台核心系统。
game-client：主播窗口游戏画面与礼物反馈。
Viewer / Creator：用户端，观众创建和观看自己的 NPC。
```

## 2. 服务端 Platform Server

服务端负责系统运行，不直接面向普通观众。

职责：

```text
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
World
NPC
Gift
LiveSession
ViewerGateway
GameClientGateway
```

## 3. 主播端 game-client

主播登录后使用 `game-client` 作为主要直播画面。

功能：

```text
读取世界快照
展示 NPC 状态
展示礼物反馈
展示危机事件
展示世界时间
支持直播窗口采集
```

路径规划：

```text
/game/:streamerHandle/:worldId
```

UI 语言：日文。

## 4. 用户端 Viewer / Creator

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

## 5. 首发差异

| 功能 | 服务端 | game-client | 用户端 |
|---|---|---|---|
| 世界 Tick | 是 | 否 | 否 |
| NPC 行为计算 | 是 | 否 | 否 |
| 连接礼物源 | 是 | 发起 / 展示 | 否 |
| 观察世界 | API | 是 | 否 |
| 查看自己的 NPC | API | 可查看摘要 | 是 |
| 创建 NPC | API | 否 | 是 |
| 管理订阅 | 预留 | 否 | 否 |
| 操作镜头 | 否 | 是 | 仅跟随自己 |

## 6. 首发实现

首发前端目录：

```text
frontend/viewer
game-client
```

后续再补：

```text
frontend/streamer
frontend/overlay
frontend/admin
```
