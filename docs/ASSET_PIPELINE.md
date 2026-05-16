# Asset Pipeline

## 目标

建立一套后续可替换正式美术的资源管线。

本阶段先用占位实现，但路径、命名和尺寸从一开始就固定。

## 目录结构

```text
frontend/overlay/src/assets/
  tiles/
  objects/
  npcs/
  fx/
  ui/
```

## 命名规则

统一使用：

```text
<category>_<subject>_<variant>_<direction|state>_<index>
```

示例：

```text
tile_ground_dry_01
tile_ground_crack_01
tile_water_small_01
obj_dead_tree_01
obj_ruin_wall_01
npc_common_idle_SE
fx_gift_large
ui_nameplate_gold
```

## 建议规格

### Tiles

- 等距建议基准：`128 x 64`
- 用途：地面、裂土、砂地、岩面、水面
- 允许后续用更高分辨率导出，但视觉比例不变

### Objects

- 小物件：`128 x 128`
- 高物件：`128 x 192`
- 用途：枯树、废墟墙、水井、营地、补给箱、野兽巢穴

### NPC

- 单体建议：`64 x 96` 或更高
- 方向建议：四向，MVP 可先用 `SE` / `SW` 两方向
- 目标：直播压缩后仍能识别轮廓和配饰

### FX

- 建议：`256 x 256` 或 `512 x 512`
- 用途：礼物光束、危机警报、死亡提示、聚焦圈、支援落点

### UI

- 图标：`64 x 64`
- 名牌 / 状态面板装饰：按 UI 组件尺寸导出

## Pivot 规则

- 地面 tile：中心 pivot
- 站立 NPC：脚底 pivot
- 物件：接地 pivot
- FX：按视觉中心或着地点定义

## 导出规则

- 保持透明背景。
- 轮廓优先，细节次之。
- 不要把文字做进普通 tile 或 object 资源里。
- 带文字的资源只允许 UI 面板、标牌和特殊演出图。

## 占位实现要求

在正式美术未到位前：

- 使用 CSS / DOM / Canvas 占位实现视觉层。
- 路径必须预留给未来正式资源替换。
- 组件不能写死具体像素图文件名之外的实现逻辑。

## 替换约定

后续资源替换时，前端只改资源文件，不改层级语义：

```text
tile layer -> tiles/
object layer -> objects/
npc layer -> npcs/
effect layer -> fx/
hud/label -> ui/
```
