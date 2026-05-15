# Gift Adapter Spec v2

## 1. 目标

v2 中礼物接入必须 Adapter 化。

核心系统不能依赖某一个 TikTok 库，也不能假设所有主播都能用同一种礼物接入方式。

## 2. Adapter 列表

```text
GiftAdapter
  ├── DevMockGiftAdapter
  ├── ManualGiftAdapter
  ├── TikTokExperimentalAdapter
  └── FutureOfficialTikTokAdapter
```

## 3. 标准化 GiftEvent

所有来源都必须转换为统一结构：

```json
{
  "tenantId": "uuid",
  "streamerId": "uuid",
  "worldId": "uuid",
  "liveSessionId": "uuid",
  "platform": "tiktok",
  "platformEventId": "unique-event-id",
  "tiktokId": "viewer_123",
  "displayName": "Viewer123",
  "giftId": "rose",
  "giftName": "Rose",
  "giftValue": 1,
  "repeatCount": 10,
  "raw": {}
}
```

## 4. 礼物处理流

```text
Gift Adapter receives raw event
→ Normalize GiftEvent
→ Deduplicate by platform_event_id
→ Resolve streamer / live_session / world
→ Resolve viewer_user by tiktok_id
→ Resolve target NPC
→ Create resource_grant
→ Create world_event
→ Broadcast to Overlay
```

## 5. DevMockGiftAdapter

MVP 必须先做。

接口：

```http
POST /api/dev/gift-events
```

请求：

```json
{
  "streamerHandle": "matt",
  "tiktokId": "viewer_123",
  "giftName": "Rose",
  "giftValue": 1,
  "repeatCount": 10
}
```

用途：

```text
不依赖真实 TikTok。
先验证礼物 → NPC → 资源 → Overlay 闭环。
```

## 6. ManualGiftAdapter

主播后台手动触发礼物事件。

用途：

```text
直播测试
礼物接入失败时备用
演示环境
调试 NPC 资源支援
```

## 7. TikTokExperimentalAdapter

真实 TikTok 礼物接入属于实验项。

原则：

```text
不能阻塞 MVP。
不能影响核心游戏逻辑。
必须可关闭。
必须有重连和失败日志。
必须保留 ManualGiftAdapter 备用。
```

## 8. 礼物转资源

礼物不能直接控制 NPC。

允许：

```text
生成资源箱
生成食物 / 水 / 工具 / 药品
生成世界事件
触发 Overlay 特效
```

禁止：

```text
直接加 HP
直接命令 NPC 行动
直接攻击其他 NPC
直接原地复活 NPC
```

## 9. 多主播归属

每个 GiftEvent 必须归属到：

```text
tenant_id
streamer_id
world_id
live_session_id
```

否则礼物可能进入错误主播世界。

## 10. MVP 验收标准

```text
DevMockGiftAdapter 可创建礼物事件。
礼物事件能找到正确主播世界。
礼物事件能找到对应 TikTok ID 的 NPC。
资源箱生成在 NPC 附近。
Overlay 收到 gift_received 消息。
核心系统不依赖真实 TikTok。
```
