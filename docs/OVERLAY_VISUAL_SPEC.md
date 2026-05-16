# Overlay Visual Spec

## 目标

OBS Overlay 必须满足两个条件：

1. 远看能读懂当前战况。
2. 近看有足够的世界感和礼物反馈。

默认分辨率：

```text
1920 x 1080
```

## 视觉层级

建议顺序：

```text
background layer
tile layer
object layer
npc layer
effect layer
nameplate layer
hud layer
alert layer
```

## 画面区块

### 1. Background

- 负责荒土氛围和边缘暗角。
- 不抢 NPC 和事件信息。
- 用 dust / haze / vignette 表达空间。

### 2. Tile Layer

- 负责地表结构。
- 要能区分干裂土、砂地、岩面、水坑、废墟。

### 3. Object Layer

- 负责可讲述地点。
- 推荐对象：枯树、废墙、水井、营地、补给箱、野兽巢穴。

### 4. NPC Layer

- NPC 必须有清晰脚底定位。
- 轮廓、发色、服装色彩必须能让观众认出差异。

### 5. Effect Layer

- 礼物光束
- 危机脉冲
- 聚焦圈
- 死亡闪屏

### 6. Nameplate Layer

- 名字必须大于普通 UI 文本。
- 状态条必须与名字绑定，不要分散在别处。

### 7. HUD Layer

- Tick
- 生存者 / 死亡者
- 当前直播状态
- 当前聚焦 NPC

### 8. Alert Layer

- 礼物到达
- NPC 濒死
- NPC 死亡
- 危机接近

## 状态规范

### 常态

- 信息清晰
- UI 稳定
- 背景不抢信息

### 危险

- 红色闪烁
- nameplate 边框加亮
- 死亡 / 濒死提示更大

### 礼物命中

- 光束下落
- 支援物资高亮
- 右侧事件日志同步高亮

### NPC 聚焦

- 聚焦圈
- 名牌加宽
- 当前行为更突出

### 死亡演出

- 全屏或大横幅提示
- 事件字幕强提示
- NPC 视觉状态变灰

## 布局要求

- 主地图应占据 60% 以上可视面积。
- 侧栏只做次级信息承载。
- 不能因为信息过多把地图压成小预览。
- 不能让名字牌遮挡整个人物主体。

## 日本语文案建议

```text
配信中
注目中
危険
支援物資
死亡
瀕死
生存者
死亡者
現在の行動
```

## 实现约束

- 先用 CSS / DOM / Canvas 占位实现。
- 不改变后端 API。
- 不改 WebSocket 协议。
- 不破坏 beta:demo。
