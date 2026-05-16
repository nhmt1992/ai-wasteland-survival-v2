# Game Client Development Plan

本文档定义 `game-client/` 的开发计划。它把直播画面从 OBS Browser Overlay 的网页展示，扩展为主播可独立启动和窗口采集的 WebGL 游戏客户端。

## 1. 产品定位

`game-client/` 是主播端使用的本地游戏画面客户端。

```text
主播后台仍是 Web。
用户端仍是 Web。
管理端仍是 Web。
后端仍负责世界状态。
game-client 只负责读取世界快照并渲染游戏画面。
```

它不是新的服务器，也不是 viewer / admin / streamer console 的替代品。

当前目标：

```text
WebGL 先行。
不直接接 UE。
不替换 frontend/overlay。
先证明大地图、1000 NPC、动植物、物品、野兽和直播演出画面可行。
```

长期方向可以评估 UE 或桌面壳，但本阶段不进入 UE 工程。

## 2. 非目标

本阶段禁止：

```text
修改后端 API。
修改数据库 schema。
修改用户端 viewer。
修改管理端 admin。
修改主播后台 streamer console。
替换旧 frontend/overlay。
让 game-client 写入世界状态。
接真实 TikTok。
接真实 Stripe。
实现复杂战斗 AI。
接 UE / Electron / Tauri。
```

`game-client/` 必须只读现有 snapshot API 和 WebSocket。

## 3. 技术栈

固定技术栈：

```text
Vite
TypeScript
PixiJS v8
WebGL renderer
DOM HUD
```

建议运行入口：

```bash
npm run dev:game
```

建议默认端口：

```text
5177
```

建议路由：

```text
/game/:streamerHandle/:worldId
```

建议 query：

```text
mode=live | stress
npcCount=1000
debug=1
```

示例：

```text
/game/matt/00000000-0000-0000-0000-000000000101?mode=live
/game/matt/00000000-0000-0000-0000-000000000101?mode=stress&npcCount=1000&debug=1
```

## 4. 画面目标

视觉方向沿用：

```text
荒土末日 x 2.5D 等距 x 高清像素风 x 直播强化 UI
```

优先级：

```text
1. 直播可读性
2. 千 NPC 性能
3. NPC 个体识别
4. 礼物反馈冲击
5. 世界荒凉感
```

画面必须能在 1920 x 1080 的直播窗口中远看读懂：

```text
谁在危险。
谁收到礼物。
哪里有资源箱。
哪里发生死亡或濒死。
当前镜头聚焦谁。
```

## 5. 渲染层级

WebGL 场景层级固定为：

```text
background
tile
vegetation
props/items
animals/beasts
NPC
FX
nameplates
HUD
```

职责：

| 层级 | 职责 |
|---|---|
| background | 荒土背景、尘雾、暗角 |
| tile | 等距地表、水坑、裂土、废墟地块 |
| vegetation | 枯树、草丛、灌木、荒土植物 |
| props/items | 废墙、营地、资源箱、掉落物 |
| animals/beasts | 小动物、野兽、危险氛围实体 |
| NPC | 角色主体、移动、死亡、危险状态 |
| FX | 礼物光束、冲击波、聚焦圈、死亡闪屏 |
| nameplates | 重点 NPC 名字牌和状态条 |
| HUD | Tick、生存者、死亡者、FPS、事件字幕 |

DOM HUD 只承载文字密集信息。主游戏画面必须由 PixiJS 渲染。

## 6. 数据策略

### Live 模式

`live` 模式读取现有后端：

```text
GET /api/streamers/:handle/worlds/:worldId/snapshot
WebSocket /api/realtime?streamerHandle=&worldId=
```

Live 模式只显示后端真实状态：

```text
world
liveSession
npcs
events
resourceGrants
```

植物、动物、野兽和环境物件在本阶段由客户端按 `worldId`、tile 坐标和 world seed 确定性生成，不写回后端。

### Stress 模式

`stress` 模式不依赖后端扩容，客户端本地生成：

```text
1000 NPC
大地图 tile
植物
物品
小动物
野兽
礼物 FX 样例
危险状态样例
死亡状态样例
```

Stress 模式用于画面容量、FPS 和摄像机流畅度验收。

## 7. 性能策略

性能优先于复杂表现。

必须采用：

```text
对象池
视口裁剪
texture atlas
同类 batch
低频远景更新
名字牌分级显示
debug FPS overlay
```

禁止：

```text
每帧重建全部 display object。
为 1000 NPC 全量显示名字牌。
每个实体单独加载散图。
把文本 HUD 全部画进 canvas。
把后端 tick 当成渲染帧率。
```

建议目标：

```text
1920 x 1080
1000 NPC stress 模式目标 60 FPS
最低不低于 45 FPS
主地图占可视面积 70% 以上
```

## 8. 模块边界

建议模块：

```text
data/
  liveSnapshotClient
  realtimeClient
  stressWorldFactory

model/
  worldViewModel
  entityViewModel
  eventViewModel

render/
  pixiApp
  layers
  entityPools
  tileRenderer
  npcRenderer
  fxRenderer

camera/
  isoCamera
  directorCamera
  inputCamera

assets/
  assetManifest
  atlasKeys

hud/
  domHud
  debugHud
```

原则：

```text
data adapter 负责读取外部数据。
view-model 负责把后端数据转换成渲染友好的实体。
renderer 只负责画面和动画。
camera 只负责镜头。
HUD 只负责直播信息。
```

## 9. 美术资源约定

正式资源未完成前允许占位，但 key、目录和 pivot 必须从第一版固定。

参考：

```text
docs/ART_DIRECTION.md
docs/ASSET_PIPELINE.md
docs/OVERLAY_VISUAL_SPEC.md
```

建议目录：

```text
game-client/src/assets/
  tiles/
  vegetation/
  props/
  items/
  animals/
  beasts/
  npcs/
  fx/
  ui/
```

命名规则：

```text
<category>_<subject>_<variant>_<direction|state>_<index>
```

示例：

```text
tile_ground_dry_01
veg_dead_tree_01
prop_ruin_wall_01
item_supply_crate_01
animal_rat_idle_SE_01
beast_hound_idle_SW_01
npc_common_walk_SE_01
fx_gift_beam_large_01
ui_nameplate_gold_01
```

Pivot：

```text
tile: center
NPC: feet
object: ground
FX: center or impact point
```

## 10. 里程碑

### Phase G0: 文档与规则

交付：

```text
docs/GAME_CLIENT_DEVELOPMENT_PLAN.md
game-client/AGENTS.md
README 文档入口
根 AGENTS 目录约定
```

验收：

```text
文档路径存在。
规则不要求修改后端或旧 overlay。
命令、端口、路由命名一致。
```

### Phase G1: 客户端骨架

交付：

```text
game-client workspace
Vite + TypeScript + PixiJS
npm run dev:game
/game/:streamerHandle/:worldId 路由
live / stress mode 参数解析
基础 DOM HUD
```

验收：

```text
npm run dev:game 可启动。
空场景可渲染。
debug HUD 显示 FPS 和 mode。
```

### Phase G2: 大地图与 1000 NPC

交付：

```text
等距 tile renderer
camera pan / zoom
1000 NPC stress 数据
NPC 对象池
视口裁剪
基础排序
```

验收：

```text
stress 模式 npcCount=1000 可运行。
1920 x 1080 目标 60 FPS，最低不低于 45 FPS。
镜头拖拽和缩放不卡顿。
```

### Phase G3: 世界实体与演出

交付：

```text
植物
动物
野兽
物品
资源箱
礼物光束
危险脉冲
死亡提示
NPC idle / walk / danger / dead 动画
```

验收：

```text
远看能识别 NPC、资源箱、危险状态和礼物落点。
名字牌不会全屏遮挡。
事件字幕能支持主播讲述。
```

### Phase G4: Live 数据接入

交付：

```text
snapshot API adapter
WebSocket reload
后端 NPC 映射到渲染实体
resourceGrants 映射到资源箱和礼物 FX
world_events 映射到导演镜头和字幕
```

验收：

```text
live 模式能读取 matt 默认世界。
模拟礼物后 game-client 显示支援物资演出。
手动 Tick 后 NPC 位置和状态更新。
```

### Phase G5: 主播窗口使用

交付：

```text
生产 build
全屏窗口使用说明
OBS Window Capture 使用说明
性能调试参数说明
```

验收：

```text
主播可以启动 game-client 并用窗口采集直播。
旧 frontend/overlay 仍可继续使用。
beta:demo 不被破坏。
```

## 11. 后续迁移方向

只有在 WebGL 方案证明以下条件后，才评估 UE：

```text
1000 NPC 可读性不足。
WebGL 视觉上限无法满足直播画面。
需要复杂 3D 场景、材质、灯光、动画蓝图。
主播机器性能足以运行 UE 客户端。
```

UE 迁移必须作为单独计划，不混入当前 WebGL 阶段。

