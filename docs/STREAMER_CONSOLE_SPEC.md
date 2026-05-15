# Streamer Console Spec v2

## 1. 目标

Streamer Console 是主播使用的工作台。

它不是游戏玩家端，而是直播运营工具。

主播通过它完成：

```text
登录
查看订阅
管理世界
创建直播会话
连接礼物来源
复制 OBS Overlay 链接
复制观众创建链接
观察 NPC 状态
切换直播镜头
```

## 2. 核心页面

```text
/streamer/login
/streamer/dashboard
/streamer/worlds
/streamer/worlds/:worldId
/streamer/live-sessions/:liveSessionId
/streamer/gift-connection
/streamer/billing
/streamer/settings
```

## 3. Dashboard

显示：

```text
订阅状态
当前套餐
世界数量
NPC 总数
当前是否直播中
最近直播会话
最近礼物事件
系统通知
```

日文 UI：

| 中文 | 日文 |
|---|---|
| 控制台 | ダッシュボード |
| 订阅状态 | 契約状態 |
| 当前套餐 | 現在のプラン |
| 世界数量 | ワールド数 |
| AI 住民数量 | AI住民数 |
| 最近直播 | 最近の配信 |

## 4. 世界管理

功能：

```text
查看世界列表
创建世界
暂停世界
归档世界
查看世界 NPC 数量
查看世界状态
进入世界预览
```

世界状态：

```text
inactive
active
live
paused
archived
```

## 5. 直播会话

主播开播流程：

```text
选择世界
→ 创建 live_session
→ 连接礼物来源
→ 复制 Overlay URL 到 OBS
→ 开始直播
→ 结束直播
→ 查看统计
```

直播中显示：

```text
当前 live_session_id
礼物连接状态
本场礼物数
本场新建 NPC 数
濒死 NPC 列表
死亡事件列表
最近世界事件
```

## 6. 礼物连接

状态：

```text
未连接
连接中
已连接
断线重连中
连接失败
测试模式
```

MVP 先实现：

```text
DevMockGiftAdapter
ManualGiftAdapter
```

真实 TikTok Adapter 后置。

## 7. OBS Overlay 管理

主播可以复制：

```text
Overlay URL
Viewer Create URL
Viewer My NPC URL
```

示例：

```text
https://game.example.com/overlay/matt/default-world
https://game.example.com/s/matt/create
```

OBS 推荐设置：

```text
Width: 1920
Height: 1080
FPS: 30
```

## 8. NPC 危机榜

直播中必须突出：

```text
快没水的 NPC
快没食物的 NPC
HP 低的 NPC
刚收到礼物的 NPC
刚被攻击的 NPC
刚死亡的 NPC
```

主播需要这些信息来讲故事。

## 9. 镜头控制

主播端可以：

```text
自由拖拽世界
缩放
点击 NPC 跟随
从危机榜一键切换到 NPC
从礼物事件一键切换到 NPC
```

## 10. 订阅限制提示

当主播接近套餐限制时显示提示：

```text
NPC 数量接近上限
世界数量已达上限
AI 旁白额度不足
订阅即将过期
订阅已过期，世界暂停
```

## 11. MVP 验收标准

```text
主播能登录或进入默认主播空间。
主播能看到自己的默认世界。
主播能创建 live_session。
主播能复制 Overlay URL。
主播能复制观众创建链接。
主播能看到模拟礼物事件。
主播能看到 NPC 危机榜。
```
