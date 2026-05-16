import type {
  BackendSnapshotResponse,
  DecorationViewModel,
  EventViewModel,
  GameMode,
  NpcAccessoryKey,
  NpcHeadKey,
  NpcMorphKey,
  NpcViewModel,
  ResourceGrantViewModel,
  TileViewModel,
  WorldViewModel,
} from '../types.js';
import { clamp, createSeededRng } from '../utils.js';
import { getStressTextureKey } from '../data/stressWorldFactory.js';

const NPC_BODY_PALETTE = [0xe7c89a, 0xd9b07b, 0xc89b66, 0xb98a57] as const;
const NPC_ACCENT_PALETTE = [0xc98b42, 0xb8693b, 0x9d5a33, 0x8e6a40] as const;
const NPC_MORPHES: NpcMorphKey[] = ['slim', 'average', 'tall', 'bulky', 'ragged'];
const NPC_HEADS: NpcHeadKey[] = ['narrow', 'round', 'square', 'gaunt'];
const NPC_ACCESSORIES: NpcAccessoryKey[] = ['none', 'hood', 'backpack', 'scarf', 'bundle', 'wrap'];

function tileTint(tileType: string): number {
  if (tileType.includes('water')) {
    return 0x476fa8;
  }
  if (tileType.includes('ruin')) {
    return 0x70503c;
  }
  if (tileType.includes('rock')) {
    return 0x6c655c;
  }
  if (tileType.includes('scrub')) {
    return 0x81714d;
  }
  if (tileType.includes('crack')) {
    return 0x8a6b45;
  }
  return 0x5b4a32;
}

function decorationForTile(tileType: string, rng: () => number): 'vegetation' | 'prop' | 'animal' | 'beast' | null {
  if (tileType.includes('water')) {
    if (rng() < 0.06) {
      return 'animal';
    }
    return null;
  }

  if (tileType.includes('ruin')) {
    if (rng() < 0.1) {
      return 'prop';
    }
    if (rng() < 0.02) {
      return 'beast';
    }
    return null;
  }

  if (tileType.includes('scrub') && rng() < 0.12) {
    return 'vegetation';
  }

  if (tileType.includes('rock') && rng() < 0.07) {
    return 'prop';
  }

  if (rng() < 0.015) {
    return rng() < 0.5 ? 'vegetation' : 'prop';
  }

  return null;
}

function actionLabel(action: string): string {
  switch (action) {
    case 'drink':
      return '飲水';
    case 'eat':
      return '食事';
    case 'rest':
      return '休息';
    case 'flee':
      return '退避';
    case 'pickup_grant':
      return '支援物資';
    case 'move':
      return '移動';
    case 'socialize':
      return '会話';
    case 'gather_food':
      return '採集';
    case 'gather_water':
      return '採水';
    case 'gather_wood':
      return '伐採';
    default:
      return '待機';
  }
}

function deriveSeverity(eventType: string): EventViewModel['severity'] {
  if (eventType.includes('dead') || eventType.includes('warning') || eventType.includes('flee')) {
    return 'danger';
  }
  if (eventType.includes('gift') || eventType.includes('pickup')) {
    return 'warning';
  }
  return 'info';
}

function pickWeighted<T extends string>(seed: string, items: Array<{ key: T; weight: number }>): T {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  const rng = createSeededRng(seed);
  let threshold = rng() * total;

  for (const item of items) {
    threshold -= Math.max(0, item.weight);
    if (threshold <= 0) {
      return item.key;
    }
  }

  return items[items.length - 1]?.key as T;
}

function resolveNpcMorphKey(npc: BackendSnapshotResponse['npcs'][number], index: number): NpcMorphKey {
  const seed = `${npc.appearanceKey}:${npc.age ?? 0}:${npc.gender ?? ''}:${npc.traits.social}:${npc.traits.aggression}:${npc.traits.greed}:${npc.traits.cooperation}:${npc.traits.risk}:${npc.traits.leadership}:${index}`;
  const weights: Array<{ key: NpcMorphKey; weight: number }> = [
    { key: 'slim', weight: 18 + Math.max(0, 50 - npc.traits.greed) * 0.2 + Math.max(0, 60 - npc.traits.aggression) * 0.12 },
    { key: 'average', weight: 28 + Math.max(0, 70 - npc.traits.social) * 0.08 + Math.max(0, 70 - npc.traits.risk) * 0.05 },
    { key: 'tall', weight: 16 + Math.max(0, npc.traits.leadership - 35) * 0.18 + Math.max(0, npc.traits.risk - 40) * 0.12 },
    { key: 'bulky', weight: 15 + Math.max(0, npc.traits.aggression - 35) * 0.2 + Math.max(0, npc.traits.greed - 30) * 0.14 },
    { key: 'ragged', weight: 11 + Math.max(0, (npc.age ?? 28) - 35) * 0.22 + Math.max(0, 45 - npc.traits.cooperation) * 0.1 },
  ];

  if ((npc.age ?? 0) <= 24) {
    weights[0].weight += 5;
    weights[2].weight += 4;
  }
  if ((npc.age ?? 0) >= 45) {
    weights[4].weight += 10;
    weights[3].weight += 4;
  }
  if (npc.status === 'dead') {
    weights[4].weight += 18;
  }

  return pickWeighted<NpcMorphKey>(seed, weights);
}

function resolveNpcHeadKey(npc: BackendSnapshotResponse['npcs'][number], morphKey: NpcMorphKey, index: number): NpcHeadKey {
  const seed = `${npc.appearanceKey}:head:${npc.age ?? 0}:${npc.gender ?? ''}:${morphKey}:${index}`;
  const weights: Array<{ key: NpcHeadKey; weight: number }> = [
    { key: 'narrow', weight: morphKey === 'slim' ? 28 : 10 },
    { key: 'round', weight: morphKey === 'average' ? 26 : 14 },
    { key: 'square', weight: morphKey === 'bulky' ? 28 : 12 },
    { key: 'gaunt', weight: morphKey === 'ragged' ? 28 : 10 },
  ];

  if ((npc.age ?? 0) <= 22) {
    weights[0].weight += 7;
    weights[1].weight += 4;
  }
  if ((npc.age ?? 0) >= 42) {
    weights[3].weight += 8;
    weights[2].weight += 3;
  }

  return pickWeighted<NpcHeadKey>(seed, weights);
}

function resolveNpcAccessoryKey(npc: BackendSnapshotResponse['npcs'][number], morphKey: NpcMorphKey, index: number): NpcAccessoryKey {
  const seed = `${npc.appearanceKey}:accessory:${npc.state.hp}:${npc.state.injury}:${npc.state.food}:${npc.state.water}:${morphKey}:${index}`;
  const weights: Array<{ key: NpcAccessoryKey; weight: number }> = [
    { key: 'none', weight: 24 + Math.max(0, 55 - npc.traits.social) * 0.08 },
    { key: 'hood', weight: 16 + Math.max(0, 60 - npc.traits.social) * 0.12 + Math.max(0, npc.traits.risk - 35) * 0.08 },
    { key: 'backpack', weight: 16 + Math.max(0, npc.traits.greed - 30) * 0.16 + Math.max(0, npc.traits.leadership - 40) * 0.08 },
    { key: 'scarf', weight: 14 + Math.max(0, npc.traits.social - 40) * 0.14 + Math.max(0, 60 - npc.traits.aggression) * 0.05 },
    { key: 'bundle', weight: 12 + Math.max(0, npc.traits.greed - 45) * 0.18 + Math.max(0, npc.traits.cooperation - 35) * 0.05 },
    { key: 'wrap', weight: 10 + Math.max(0, 100 - npc.state.hp) * 0.12 + Math.max(0, npc.state.injury - 10) * 0.14 },
  ];

  if (npc.state.hp <= 35 || npc.state.injury >= 18) {
    weights[5].weight += 16;
    weights[4].weight += 4;
  }
  if ((npc.age ?? 0) >= 40) {
    weights[1].weight += 5;
    weights[5].weight += 4;
  }
  if (morphKey === 'bulky') {
    weights[2].weight += 10;
    weights[4].weight += 2;
  }
  if (morphKey === 'ragged') {
    weights[1].weight += 8;
    weights[5].weight += 10;
  }

  return pickWeighted<NpcAccessoryKey>(seed, weights);
}

export interface BuildWorldViewModelInput {
  snapshot: BackendSnapshotResponse;
  mode: GameMode;
  snapshotLoadedAt: number;
  realtimeStatus: string;
  focusNpcId?: string | null;
  focusReason?: string;
}

export function buildWorldViewModel(input: BuildWorldViewModelInput): WorldViewModel {
  const { snapshot } = input;
  const tiles: TileViewModel[] = [];
  const decorations: DecorationViewModel[] = [];

  for (let y = 0; y < snapshot.world.height; y += 1) {
    for (let x = 0; x < snapshot.world.width; x += 1) {
      const hashSeed = `${snapshot.world.worldSeed}:${x}:${y}`;
      const localRng = createSeededRng(hashSeed);
      const tileType =
        x === 0 || y === 0 || x === snapshot.world.width - 1 || y === snapshot.world.height - 1
          ? 'border_wastes'
          : localRng() < 0.06
            ? 'water'
            : localRng() < 0.18
              ? 'ruins'
              : localRng() < 0.34
                ? 'rocky'
                : localRng() < 0.52
                  ? 'scrub'
                  : localRng() < 0.72
                    ? 'crack'
                    : 'dust_plain';

      tiles.push({
        id: `${snapshot.world.id}:${x}:${y}`,
        x,
        y,
        tileType,
        dangerLevel: clamp(Math.floor(localRng() * 100), 0, 100),
        fertility: clamp(Math.floor(localRng() * 100), 0, 100),
        waterLevel: clamp(Math.floor(localRng() * 100), 0, 100),
        hasBlocker: tileType.includes('ruin') ? localRng() < 0.14 : localRng() < 0.03,
        textureKey: getStressTextureKey(tileType),
        tint: tileTint(tileType),
        sortY: x + y,
      });

      const decorationKind = decorationForTile(tileType, localRng);
      if (decorationKind) {
        decorations.push({
          id: `${snapshot.world.id}:decoration:${x}:${y}`,
          kind: decorationKind,
          x: x + 0.5,
          y: y + 0.5,
          textureKey:
            decorationKind === 'vegetation'
              ? 'veg_dead_tree_01'
              : decorationKind === 'prop'
                ? 'prop_ruin_wall_01'
                : decorationKind === 'animal'
                  ? 'animal_rat_idle_SE_01'
                  : 'beast_hound_idle_SW_01',
          tint:
            decorationKind === 'vegetation'
              ? 0x8d7b49
              : decorationKind === 'prop'
                ? 0x90755b
                : decorationKind === 'animal'
                  ? 0xb8aa8b
                  : 0xb14b3d,
          scale:
            decorationKind === 'vegetation'
              ? 1.0 + localRng() * 0.4
              : decorationKind === 'prop'
                ? 1.1 + localRng() * 0.3
                : decorationKind === 'animal'
                  ? 0.55
                  : 0.8,
          sortY: x + y + 0.1,
          alpha:
            decorationKind === 'beast'
              ? 0.85
              : decorationKind === 'animal'
                ? 0.75
                : 0.95,
        });
      }
    }
  }

  const npcs: NpcViewModel[] = snapshot.npcs.map((npc, index) => {
    const hp = npc.state.hp;
    const food = npc.state.food;
    const water = npc.state.water;
    const injury = npc.state.injury;
    const dead = npc.status === 'dead' || hp <= 0;
    const focusLevel = clamp((100 - hp) * 1.8 + (100 - water) * 1.2 + (100 - food) + injury * 1.4, 0, 300);
    const critical = dead || hp <= 24 || water <= 18 || food <= 18;
    const bodyPaletteIndex = index % NPC_BODY_PALETTE.length;
    const accentPaletteIndex = index % NPC_ACCENT_PALETTE.length;
    const morphKey = resolveNpcMorphKey(npc, index);
    const headKey = resolveNpcHeadKey(npc, morphKey, index);
    const accessoryKey = resolveNpcAccessoryKey(npc, morphKey, index);
    const tint = dead
      ? 0x8b8b8b
      : critical
        ? 0xef675d
        : NPC_BODY_PALETTE[bodyPaletteIndex];
    return {
      id: npc.id,
      name: npc.name,
      status: npc.status,
      morphKey,
      headKey,
      accessoryKey,
      action: npc.state.currentAction,
      x: npc.state.tileX + 0.5,
      y: npc.state.tileY + 0.5,
      hp,
      food,
      water,
      stamina: npc.state.stamina,
      morale: npc.state.morale,
      injury,
      shelter: npc.state.shelter,
      focusLevel,
      labelLevel: 'hidden',
      bodyTint: tint,
      accentTint: dead ? 0x6c6c6c : critical ? 0xef675d : NPC_ACCENT_PALETTE[accentPaletteIndex],
      sortY: npc.state.tileX + npc.state.tileY + 0.6,
      walkPhase: index % 8,
      avatarKey: npc.appearanceKey,
      currentActionLabel: actionLabel(npc.state.currentAction),
    };
  });

  const priorityNpcIds = new Set(
    [...npcs]
      .sort((left, right) => right.focusLevel - left.focusLevel)
      .slice(0, input.mode === 'stress' ? 6 : 12)
      .map((npc) => npc.id),
  );

  const centerX = snapshot.world.width / 2;
  const centerY = snapshot.world.height / 2;
  const stressAnchorNpc =
    input.mode === 'stress'
      ? [...npcs]
          .filter((npc) => priorityNpcIds.has(npc.id) && npc.status !== 'dead')
          .sort((left, right) => {
            const leftDistance = Math.hypot(left.x - centerX, left.y - centerY);
            const rightDistance = Math.hypot(right.x - centerX, right.y - centerY);
            return leftDistance - rightDistance;
          })[0] ?? null
      : null;

  for (const npc of npcs) {
    const dead = npc.status === 'dead';
    const critical = dead || npc.hp <= 24 || npc.water <= 18 || npc.food <= 18;
    if (input.mode === 'stress') {
      npc.labelLevel = npc.id === (input.focusNpcId ?? null) ? 'selected' : priorityNpcIds.has(npc.id) && critical ? 'critical' : 'hidden';
      continue;
    }
    npc.labelLevel = dead ? 'always' : critical ? 'critical' : npc.focusLevel > 130 ? 'selected' : 'hidden';
  }

  const resourceGrants: ResourceGrantViewModel[] = snapshot.resourceGrants.map((grant, index) => ({
    id: grant.id,
    x: (grant.spawnTileX ?? 0) + 0.5,
    y: (grant.spawnTileY ?? 0) + 0.5,
    packId: grant.packId,
    status: grant.status,
    sortY: (grant.spawnTileX ?? 0) + (grant.spawnTileY ?? 0) + 0.55,
    tint:
      grant.status === 'claimed'
        ? 0x86c86b
        : grant.status === 'expired'
          ? 0x6c6c6c
          : index % 2 === 0
            ? 0xe2b04d
            : 0x7dc0ef,
  }));

  const events: EventViewModel[] = snapshot.events.slice(0, 12).map((event) => ({
    id: event.id,
    type: event.eventType,
    titleJa: event.titleJa ?? event.eventType,
    descriptionJa: event.descriptionJa ?? '',
    x: event.tileX,
    y: event.tileY,
    severity: deriveSeverity(event.eventType),
    highlightNpcId: event.targetNpcId ?? event.actorNpcId,
  }));

  const urgentNpc = [...npcs]
    .sort((left, right) => right.focusLevel - left.focusLevel)
    .find((npc) => (input.mode === 'stress' ? priorityNpcIds.has(npc.id) && npc.status !== 'dead' : npc.labelLevel !== 'hidden'))
    ?? [...npcs]
      .sort((left, right) => right.focusLevel - left.focusLevel)
      .find((npc) => (input.mode === 'stress' ? priorityNpcIds.has(npc.id) : npc.labelLevel !== 'hidden'));

  const latestEvent = events[0] ?? null;
  const focusNpcId = input.focusNpcId ?? latestEvent?.highlightNpcId ?? stressAnchorNpc?.id ?? urgentNpc?.id ?? null;
  const focusReason = input.focusReason ?? latestEvent?.titleJa ?? stressAnchorNpc?.currentActionLabel ?? urgentNpc?.currentActionLabel ?? '状況監視';
  const focusNpc = npcs.find((npc) => npc.id === focusNpcId) ?? null;
  const focusLabel = focusNpc ? `${focusNpc.name} · ${focusNpc.currentActionLabel}` : focusReason;

  return {
    mode: input.mode,
    streamerHandle: snapshot.streamer.handle,
    streamerName: snapshot.streamer.displayName,
    tenantName: snapshot.tenant.name,
    worldId: snapshot.world.id,
    worldName: snapshot.world.name,
    worldSeed: snapshot.world.worldSeed,
    width: snapshot.world.width,
    height: snapshot.world.height,
    tick: snapshot.world.currentTick,
    worldStatus: snapshot.world.status,
    liveSessionStatus: snapshot.liveSession?.status ?? snapshot.world.latestLiveSessionStatus,
    snapshotLoadedAt: input.snapshotLoadedAt,
    tiles,
    decorations,
    npcs,
    resourceGrants,
    events,
    survivorCount: snapshot.world.aliveNpcCount,
    deadCount: snapshot.world.deadNpcCount,
    focusNpcId,
    focusReason: focusLabel,
    overlayUrl: snapshot.world.overlayUrl,
    viewerCreateUrl: snapshot.world.viewerCreateUrl,
    viewerMyNpcUrl: snapshot.world.viewerMyNpcUrl,
    subscriptionPlan: snapshot.subscription.plan,
    subscriptionStatus: snapshot.subscription.status,
  };
}
