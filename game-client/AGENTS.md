# game-client/AGENTS.md

本文件定义 `game-client/` 目录内 AI 开发 Agent 的专用规则。根目录 `AGENTS.md` 仍然生效；如有冲突，以本文件对 `game-client/` 的更具体规则为准。

## 1. 开发模型

主要开发模型：

```text
GPT-5.4
```

其他 Agent 可以协助，但必须遵守本文件和根目录规则。

## 2. 客户端定位

`game-client/` 是主播使用的 WebGL 游戏画面客户端。

```text
它是窗口采集用的游戏画面。
它不是 OBS Browser overlay 的替代提交。
它不是后端。
它不是用户端。
它不是管理端。
它不是主播后台。
```

主播后台仍由 `frontend/streamer` 提供。旧 OBS Browser 方案仍由 `frontend/overlay` 保留。

## 3. 语言规则

```text
开发沟通：中文
代码注释：中文
游戏 / HUD UI：日文
数据库字段：英文 snake_case
TypeScript 类型：英文 PascalCase / camelCase
资源 key：英文 snake_case
```

## 4. 本阶段目标

当前目标是 WebGL 先行：

```text
Vite + TypeScript + PixiJS v8
2.5D 等距荒土大地图
1000 NPC stress 模式
植物、动物、野兽、物品、角色占位美术
流畅镜头和动画
主播窗口采集友好
```

## 5. 禁止事项

在 `game-client/` 开发阶段禁止：

```text
修改 backend API。
修改 supabase/schema.sql。
修改 frontend/viewer。
修改 frontend/admin。
修改 frontend/streamer。
修改 frontend/overlay 的既有行为。
让 game-client 写入世界状态。
让 game-client 直接控制 NPC。
让礼物直接控制 NPC。
接真实 TikTok。
接真实 Stripe。
接 UE。
接 Electron / Tauri。
实现复杂战斗 AI。
```

如果必须突破这些边界，必须先写新的计划文档并得到明确确认。

## 6. 数据边界

`game-client/` 只能读取：

```text
GET /api/streamers/:handle/worlds/:worldId/snapshot
WebSocket /api/realtime?streamerHandle=&worldId=
```

后端仍是世界状态唯一来源。

允许本地生成的视觉实体：

```text
植物
动物
野兽
地表细节
废墟物件
环境粒子
stress 模式 NPC
```

这些实体在本阶段只用于画面表现，不能写回后端。

## 7. 架构分层

必须分层实现：

```text
data adapter
simulation view-model
renderer
camera
asset manifest
HUD
```

职责：

| 模块 | 职责 |
|---|---|
| data adapter | snapshot / WebSocket / stress 数据读取 |
| view-model | 把后端数据转换为渲染实体 |
| renderer | PixiJS 场景、层级、动画、对象池 |
| camera | 等距镜头、自动导演、手动拖拽缩放 |
| asset manifest | 稳定资源 key、atlas、加载状态 |
| HUD | DOM 文本、FPS、直播状态、事件字幕 |

禁止把数据读取、游戏状态、Pixi display object 和 DOM HUD 混在一个大文件里。

## 8. PixiJS / WebGL 性能硬规则

必须优先性能：

```text
对象池优先。
视口裁剪优先。
texture atlas 优先。
同类实体批处理。
远景低频更新。
名字牌分级显示。
debug FPS 可开关。
```

禁止：

```text
每帧重建 1000 个 NPC。
每帧重新解析完整 snapshot。
默认显示 1000 个名字牌。
每个实体独立加载散图。
把后端 Tick 当成渲染帧率。
在 ticker 内做无界数组 filter / sort。
在 renderer 中直接 fetch API。
```

性能目标：

```text
1920 x 1080
stress npcCount=1000
目标 60 FPS
最低不低于 45 FPS
```

## 9. 渲染层级

固定层级：

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

主地图必须占据画面 70% 以上。HUD 不能把游戏画面压成小预览。

## 10. 资源规则

资源规则参考：

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

Pivot：

```text
tile：中心
NPC：脚底
object：接地
FX：视觉中心或着地点
```

占位美术可以用程序图形或临时 sprite，但 manifest key 必须稳定，后续替换正式美术时不能重写业务逻辑。

## 11. UI 文案

游戏 / HUD 文案使用日文。优先短词：

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
FPS
```

不要在游戏画面里放长说明文。长说明只允许出现在调试面板或文档中。

## 12. 实现前检查

每次实现前必须确认：

```text
是否触碰 backend。
是否触碰 supabase/schema.sql。
是否触碰 frontend/viewer / frontend/admin / frontend/streamer。
是否破坏 frontend/overlay。
是否影响 beta:demo。
是否把 game-client 当成世界状态来源。
是否能在 stress 模式下保持性能目标。
```

如果答案有风险，先停止并更新计划，不要直接实现。

## 13. 验收命令

game-client 实现后至少验证：

```bash
npm run typecheck
npm run build
npm run dev:game
```

游戏画面验收 URL：

```text
/game/matt/00000000-0000-0000-0000-000000000101?mode=stress&npcCount=1000&debug=1
/game/matt/00000000-0000-0000-0000-000000000101?mode=live
```

验收重点：

```text
FPS 可见。
1000 NPC 可见且不卡顿。
镜头拖拽 / 缩放流畅。
礼物、危险、死亡演出可读。
旧 frontend/overlay 不受影响。
```

