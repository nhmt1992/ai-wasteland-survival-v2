# AI-NPC Engine Spec v2

## 1. 目标

AI-NPC Engine 负责让 NPC 在主播世界中自主生存、移动、采集、社交、冲突和死亡。

v2 必须支持多主播、多世界，但 MVP 可以先运行一个默认世界。

## 2. 核心原则

```text
规则 AI 为主。
LLM 低频增强叙事。
不每 NPC 每 Tick 调用 LLM。
NPC 行为必须可解释、可复现、低成本。
```

## 3. NPC 数据

每个 NPC 需要：

```text
tenant_id
world_id
viewer_user_id
name
personality_prompt
trait_social
trait_aggression
trait_greed
trait_cooperation
trait_risk
trait_leadership
hp
food
water
stamina
morale
injury
shelter
tile_x
tile_y
inventory
status
memory_summary
```

## 4. Tick 流程

```text
1. Tick Scheduler 选中 active / live world
2. 读取该 world 中 alive NPC
3. 读取 NPC 附近资源、补给箱、NPC、危险
4. 扣除 water / food / stamina
5. 检查死亡
6. 计算 survival_pressure
7. 按优先级选择行为
8. 执行动作
9. 更新状态、背包、关系、事件
10. 写入 world_events
11. 推送 WebSocket snapshot
```

## 5. 生存压力

```text
survival_pressure =
  (100 - water) * 1.5
+ (100 - food) * 1.0
+ (100 - hp) * 2.0
+ injury * 1.2
+ nearby_danger * 1.5
- shelter * 0.5
```

行为阶段：

```text
if survival_pressure >= 120:
    emergency_behavior
elif survival_pressure >= 70:
    survival_behavior
else:
    personality_behavior
```

## 6. 行为优先级

| 优先级 | 条件 | 行为 |
|---|---|---|
| P0 | hp <= 0 | dead |
| P0 | water <= 20 且背包有水 | drink |
| P0 | food <= 20 且背包有食物 | eat |
| P0 | hp <= 25 | flee / rest / use_medicine |
| P1 | water <= 40 | seek_water |
| P1 | food <= 45 | seek_food |
| P1 | 附近危险高 | flee / fight |
| P2 | 附近有补给箱 | evaluate_pickup |
| P2 | stamina <= 30 | rest |
| P3 | social 高且附近 NPC | socialize |
| P3 | greed 高且附近资源 | steal / hoard |
| P4 | 状态良好 | explore / gather / build |

## 7. 行为列表

```text
idle
move
gather_food
gather_water
gather_wood
rest
eat
drink
pickup_grant
socialize
trade
steal
attack
flee
build_shelter
join_tribe
leave_tribe
```

## 8. 礼物资源处理

礼物不会直接修改 NPC 意志。

```text
gift_event
→ resource_grant
→ spawn near NPC
→ NPC observes nearby grant
→ NPC decides pickup / ignore / trade / hide
```

其他 NPC 也可能发现并抢夺地面补给。

## 9. 死亡规则

NPC 死亡不可原地复活。

允许：

```text
墓碑
纪念碑
遗物箱
继承者 NPC
记忆碎片
```

禁止：

```text
礼物直接满血复活。
```

## 10. LLM 使用点

| 场景 | 频率 |
|---|---:|
| NPC 创建人格 | 每 NPC 一次 |
| 重大事件总结 | 低频 |
| 部落命名 | 部落创建时一次 |
| 直播旁白 | 批量 / 低频 |

MVP 第一版可以完全不接 LLM，只手写 5 个 NPC 人格向量。

## 11. MVP 验收

```text
5 个 NPC 运行 1 小时。
NPC 会找水、找食物、休息、移动。
NPC 会因为错误决策或资源不足陷入危险。
NPC 可能死亡。
模拟礼物能生成资源箱。
NPC 可以自主拾取资源箱。
事件日志能说明发生了什么。
```
