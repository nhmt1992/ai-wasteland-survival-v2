Original prompt: PLEASE IMPLEMENT THIS PLAN: NPC 轮廓分型强化

- 2026-05-16: 已把 NPC 的客户端派生字段扩展为 `morphKey / headKey / accessoryKey`，不改后端 schema。
- 2026-05-16: 开始把渲染层从单 sprite 改成容器化多层合成，目标是身体轮廓、头型和配件可在远景下区分。
- 2026-05-16: 待办：完成 `pixiStage.ts` 的 NPC 容器渲染收尾，并跑 `typecheck`、`build`、浏览器可视验证。
- 2026-05-16: 待办：确认 1000 NPC stress 模式下，轮廓差异清晰且不引入新的性能退化。
- 2026-05-16: 已完成多轮编译与浏览器验证；stress 模式已收紧 nameplate，并修正 camera focus 到等距投影坐标。
- 2026-05-16: 仍需观察的点：如果后续要更强的“角色感”，下一轮应继续加大 NPC 前景对比和局部镜头 framing。
