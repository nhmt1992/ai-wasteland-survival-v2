import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type WorldSummary = {
  id: string;
  name: string;
  width: number;
  height: number;
  currentTick: number;
  status: string;
  overlayUrl: string;
  viewerCreateUrl: string;
  viewerMyNpcUrl: string;
  npcCount: number;
  aliveNpcCount: number;
  deadNpcCount: number;
  latestLiveSessionStatus: string | null;
  lastTickStartedAt: string | null;
  latestLiveSessionId: string | null;
};

type LiveSession = {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  viewerCountPeak: number;
  giftCount: number;
};

type OverlayNpc = {
  id: string;
  name: string;
  status: string;
  state: {
    hp: number;
    food: number;
    water: number;
    stamina: number;
    morale: number;
    injury: number;
    shelter: number;
    currentAction: string;
    tileX: number;
    tileY: number;
  };
};

type OverlayEvent = {
  id: string;
  tick: number;
  eventType: string;
  titleJa: string | null;
  descriptionJa: string | null;
  actorNpcId: string | null;
  targetNpcId: string | null;
  tileX: number | null;
  tileY: number | null;
  createdAt: string;
};

type ResourceGrant = {
  id: string;
  packId: string | null;
  status: string;
  spawnTileX: number | null;
  spawnTileY: number | null;
  targetNpcId: string | null;
  expiresAt: string | null;
};

type SnapshotResponse = {
  ok: boolean;
  world: WorldSummary;
  liveSession: LiveSession | null;
  npcs: OverlayNpc[];
  events: OverlayEvent[];
  resourceGrants: ResourceGrant[];
};

type OverlayRoute = {
  streamerHandle: string;
  worldId: string;
};

type RealtimeMessage = {
  type: string;
  worldId: string;
  timestamp: string;
  [key: string]: unknown;
};

type SceneTone = 'calm' | 'gift' | 'danger' | 'death';

type SceneTileKind = 'dust' | 'crack' | 'sand' | 'rock' | 'ruin' | 'water' | 'camp';

type SceneObjectKind = 'dead_tree' | 'ruin_wall' | 'puddle' | 'campfire' | 'crate' | 'beast_den' | 'shelter';

type SceneObject = {
  kind: SceneObjectKind;
  label: string;
  tileX: number;
  tileY: number;
  tone: SceneTone;
  lift: number;
  scale: number;
  width: number;
  height: number;
};

type SceneTile = {
  tileX: number;
  tileY: number;
  kind: SceneTileKind;
  left: number;
  top: number;
  width: number;
  height: number;
  zIndex: number;
};

type SceneNpcPlacement = {
  npc: OverlayNpc;
  accent: string;
  left: number;
  top: number;
  zIndex: number;
  focus: boolean;
  danger: boolean;
};

type SceneResourcePlacement = {
  grant: ResourceGrant;
  left: number;
  top: number;
  zIndex: number;
  accent: string;
};

function resolveApiBaseUrl(): string {
  const explicit = import.meta.env.VITE_API_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  return '';
}

const API_BASE_URL = resolveApiBaseUrl();

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function websocketUrl(path: string): string {
  const baseUrl = API_BASE_URL.startsWith('http') ? API_BASE_URL : window.location.origin;
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  }

  return url.toString();
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (init?.body !== undefined && init?.body !== null) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  } else {
    headers.delete('Content-Type');
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`);
  }

  return response.json() as Promise<T>;
}

function formatShortNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatLiveStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '未配信';
  }

  switch (status) {
    case 'live':
      return '配信中';
    case 'connecting':
      return '接続中';
    case 'created':
      return '作成済み';
    case 'ended':
      return '配信終了';
    case 'failed':
      return '失敗';
    default:
      return status;
  }
}

function resolveOverlayRoute(): OverlayRoute {
  const parts = window.location.pathname.split('/').filter(Boolean);

  if (parts[0] === 'overlay' && parts.length >= 3) {
    return {
      streamerHandle: parts[1]?.trim() ?? '',
      worldId: parts[2]?.trim() ?? '',
    };
  }

  return {
    streamerHandle: '',
    worldId: '',
  };
}

function urgentLabel(npc: OverlayNpc): string {
  if (npc.status === 'dead') {
    return '死亡';
  }

  if (npc.state.hp <= 30 || npc.state.water <= 25 || npc.state.food <= 25) {
    return '要注意';
  }

  return '安定';
}

function useRealtimeFeed(streamerHandle: string, worldId: string, onMessage: (message: RealtimeMessage) => void, enabled: boolean) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'reconnecting'>('idle');
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    let retryTimer: number | null = null;
    let attempt = 0;

    if (!enabled || !streamerHandle || !worldId) {
      setStatus('idle');
      return () => {
        active = false;
      };
    }

    const connect = () => {
      if (!active) {
        return;
      }

      setStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      socket = new WebSocket(
        websocketUrl(
          `/api/realtime?streamerHandle=${encodeURIComponent(streamerHandle)}&worldId=${encodeURIComponent(worldId)}`,
        ),
      );

      socket.onopen = () => {
        if (!active) {
          return;
        }

        attempt = 0;
        setStatus('connected');
      };

      socket.onmessage = (event) => {
        if (!active) {
          return;
        }

        try {
          const payload = JSON.parse(String(event.data)) as RealtimeMessage;
          if (payload.type !== 'hello') {
            onMessageRef.current(payload);
          }
        } catch {
          // 受信失敗はポーリング側に任せる
        }
      };

      socket.onclose = () => {
        if (!active) {
          return;
        }

        setStatus('reconnecting');
        attempt += 1;
        const delay = Math.min(1000 + attempt * 500, 5000);
        retryTimer = window.setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      active = false;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      socket?.close();
    };
  }, [enabled, streamerHandle, worldId]);

  return status;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: rect.width,
        height: rect.height,
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  return [ref, size] as const;
}

function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatSceneToneLabel(tone: SceneTone): string {
  switch (tone) {
    case 'gift':
      return '支援到着';
    case 'danger':
      return '危険接近';
    case 'death':
      return '死亡アラート';
    default:
      return '観測中';
  }
}

function isDeathEvent(event: OverlayEvent | null): boolean {
  if (!event) {
    return false;
  }

  const haystack = `${event.eventType} ${event.titleJa ?? ''} ${event.descriptionJa ?? ''}`.toLowerCase();
  return haystack.includes('death') || haystack.includes('dead') || haystack.includes('死亡') || haystack.includes('倒れ');
}

function isGiftEvent(event: OverlayEvent | null): boolean {
  if (!event) {
    return false;
  }

  const haystack = `${event.eventType} ${event.titleJa ?? ''} ${event.descriptionJa ?? ''}`.toLowerCase();
  return haystack.includes('gift') || haystack.includes('支援') || haystack.includes('物資') || haystack.includes('補給');
}

function isDangerEvent(event: OverlayEvent | null): boolean {
  if (!event) {
    return false;
  }

  const haystack = `${event.eventType} ${event.titleJa ?? ''} ${event.descriptionJa ?? ''}`.toLowerCase();
  return haystack.includes('danger') || haystack.includes('危険') || haystack.includes('襲来') || haystack.includes('attack');
}

function resolveFocusNpc(snapshot: SnapshotResponse | null): OverlayNpc | null {
  if (!snapshot || snapshot.npcs.length === 0) {
    return null;
  }

  const latestEvent = snapshot.events[0] ?? null;
  const eventNpcId = latestEvent?.actorNpcId ?? latestEvent?.targetNpcId ?? null;
  if (eventNpcId) {
    const eventNpc = snapshot.npcs.find((npc) => npc.id === eventNpcId);
    if (eventNpc) {
      return eventNpc;
    }
  }

  const aliveNpcs = snapshot.npcs.filter((npc) => npc.status !== 'dead');
  if (aliveNpcs.length === 0) {
    return snapshot.npcs[0] ?? null;
  }

  const criticalNpc = [...aliveNpcs].sort((left, right) => {
    const leftScore = Math.min(left.state.hp, left.state.water, left.state.food);
    const rightScore = Math.min(right.state.hp, right.state.water, right.state.food);
    return leftScore - rightScore;
  })[0];

  if (criticalNpc && Math.min(criticalNpc.state.hp, criticalNpc.state.water, criticalNpc.state.food) <= 35) {
    return criticalNpc;
  }

  return aliveNpcs[0] ?? snapshot.npcs[0] ?? null;
}

function resolveDangerNpc(snapshot: SnapshotResponse | null): OverlayNpc | null {
  if (!snapshot || snapshot.npcs.length === 0) {
    return null;
  }

  const aliveNpcs = snapshot.npcs.filter((npc) => npc.status !== 'dead');
  if (aliveNpcs.length > 0) {
    return [...aliveNpcs].sort((left, right) => {
      const leftScore = Math.min(left.state.hp, left.state.water, left.state.food);
      const rightScore = Math.min(right.state.hp, right.state.water, right.state.food);
      return leftScore - rightScore;
    })[0];
  }

  return snapshot.npcs[0] ?? null;
}

function resolveSceneTone(snapshot: SnapshotResponse | null, latestEvent: OverlayEvent | null, latestGrant: ResourceGrant | null): SceneTone {
  if (isDeathEvent(latestEvent)) {
    return 'death';
  }

  if (isGiftEvent(latestEvent) || latestGrant) {
    return 'gift';
  }

  if (isDangerEvent(latestEvent)) {
    return 'danger';
  }

  const dangerNpc = resolveDangerNpc(snapshot);
  if (dangerNpc && dangerNpc.status !== 'dead' && Math.min(dangerNpc.state.hp, dangerNpc.state.water, dangerNpc.state.food) <= 25) {
    return 'danger';
  }

  return 'calm';
}

function projectScenePoint(frameWidth: number, frameHeight: number, centerX: number, centerY: number, tileX: number, tileY: number) {
  const tileWidth = clamp(Math.min(frameWidth / 12.4, frameHeight / 4.5), 72, 110);
  const tileHeight = tileWidth * 0.56;
  const originX = frameWidth * 0.5;
  const originY = frameHeight * 0.54;
  const dx = tileX - centerX;
  const dy = tileY - centerY;

  return {
    left: originX + (dx - dy) * tileWidth * 0.5,
    top: originY + (dx + dy) * tileHeight * 0.5,
    tileWidth,
    tileHeight,
  };
}

function classifyTileKind(worldId: string, tileX: number, tileY: number, centerX: number, centerY: number): SceneTileKind {
  const distance = Math.abs(tileX - centerX) + Math.abs(tileY - centerY);
  if (tileX === centerX && tileY === centerY) {
    return 'camp';
  }

  if (distance <= 1) {
    return 'camp';
  }

  const noise = hashString(`${worldId}:${tileX}:${tileY}`) % 100;
  if (noise < 8) {
    return 'water';
  }
  if (noise < 24) {
    return 'ruin';
  }
  if (noise < 40) {
    return 'rock';
  }
  if (noise < 58) {
    return 'crack';
  }
  if (noise < 80) {
    return 'sand';
  }

  return 'dust';
}

function buildSceneTiles(snapshot: SnapshotResponse, centerNpc: OverlayNpc | null, frameWidth: number, frameHeight: number): SceneTile[] {
  const width = Math.max(1, snapshot.world.width);
  const height = Math.max(1, snapshot.world.height);
  const focusX = clamp(centerNpc?.state.tileX ?? Math.floor(width / 2), 0, width - 1);
  const focusY = clamp(centerNpc?.state.tileY ?? Math.floor(height / 2), 0, height - 1);
  const visibleRadiusX = clamp(Math.round(frameWidth / 180), 5, 7);
  const visibleRadiusY = clamp(Math.round(frameHeight / 150), 4, 6);
  const tiles: SceneTile[] = [];

  for (let tileY = focusY - visibleRadiusY; tileY <= focusY + visibleRadiusY; tileY += 1) {
    for (let tileX = focusX - visibleRadiusX; tileX <= focusX + visibleRadiusX; tileX += 1) {
      if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) {
        continue;
      }

      const position = projectScenePoint(frameWidth, frameHeight, focusX, focusY, tileX, tileY);
      tiles.push({
        tileX,
        tileY,
        kind: classifyTileKind(snapshot.world.id, tileX, tileY, focusX, focusY),
        left: position.left,
        top: position.top,
        width: position.tileWidth,
        height: position.tileHeight,
        zIndex: tileX + tileY,
      });
    }
  }

  return tiles.sort((left, right) => left.zIndex - right.zIndex);
}

function buildSceneObjects(
  snapshot: SnapshotResponse,
  centerNpc: OverlayNpc | null,
  latestGrant: ResourceGrant | null,
  frameWidth: number,
  frameHeight: number,
): SceneObject[] {
  const width = Math.max(1, snapshot.world.width);
  const height = Math.max(1, snapshot.world.height);
  const focusX = clamp(centerNpc?.state.tileX ?? Math.floor(width / 2), 0, width - 1);
  const focusY = clamp(centerNpc?.state.tileY ?? Math.floor(height / 2), 0, height - 1);
  const seed = hashString(snapshot.world.id);
  const direction = seed % 2 === 0 ? 1 : -1;
  const objects: SceneObject[] = [
    {
      kind: 'shelter',
      label: '小さな避難所',
      tileX: clamp(focusX - 2 * direction, 0, width - 1),
      tileY: clamp(focusY - 2, 0, height - 1),
      tone: 'calm',
      lift: 0.6,
      scale: 1,
      width: 132,
      height: 104,
    },
    {
      kind: 'dead_tree',
      label: '枯れ木',
      tileX: clamp(focusX - 4 * direction, 0, width - 1),
      tileY: clamp(focusY - 1, 0, height - 1),
      tone: 'calm',
      lift: 0.8,
      scale: 1,
      width: 86,
      height: 136,
    },
    {
      kind: 'ruin_wall',
      label: '壊れた倉庫',
      tileX: clamp(focusX + 4 * direction, 0, width - 1),
      tileY: clamp(focusY - 1, 0, height - 1),
      tone: 'danger',
      lift: 0.42,
      scale: 1,
      width: 142,
      height: 96,
    },
    {
      kind: 'puddle',
      label: '小さな水たまり',
      tileX: clamp(focusX + 1, 0, width - 1),
      tileY: clamp(focusY + 2, 0, height - 1),
      tone: 'calm',
      lift: 0.05,
      scale: 1,
      width: 132,
      height: 70,
    },
    {
      kind: 'campfire',
      label: '焚き火',
      tileX: focusX,
      tileY: clamp(focusY + 1, 0, height - 1),
      tone: 'gift',
      lift: 0.14,
      scale: 1,
      width: 92,
      height: 92,
    },
    {
      kind: 'beast_den',
      label: '野獣の巣',
      tileX: clamp(focusX + 5 * direction, 0, width - 1),
      tileY: clamp(focusY + 3, 0, height - 1),
      tone: 'danger',
      lift: 0.28,
      scale: 1,
      width: 130,
      height: 86,
    },
  ];

  if (latestGrant && latestGrant.spawnTileX !== null && latestGrant.spawnTileY !== null) {
    objects.unshift({
      kind: 'crate',
      label: latestGrant.packId ?? '補給クレート',
      tileX: clamp(latestGrant.spawnTileX, 0, width - 1),
      tileY: clamp(latestGrant.spawnTileY, 0, height - 1),
      tone: 'gift',
      lift: 0.2,
      scale: 1,
      width: 96,
      height: 88,
    });
  }

  return objects;
}

function buildSceneNpcPlacements(
  snapshot: SnapshotResponse,
  centerNpc: OverlayNpc | null,
  dangerNpc: OverlayNpc | null,
  frameWidth: number,
  frameHeight: number,
): SceneNpcPlacement[] {
  const width = Math.max(1, snapshot.world.width);
  const height = Math.max(1, snapshot.world.height);
  const focusX = clamp(centerNpc?.state.tileX ?? Math.floor(width / 2), 0, width - 1);
  const focusY = clamp(centerNpc?.state.tileY ?? Math.floor(height / 2), 0, height - 1);
  const dangerNpcId = dangerNpc?.id ?? null;

  return snapshot.npcs
    .map((npc, index) => {
      const position = projectScenePoint(frameWidth, frameHeight, focusX, focusY, npc.state.tileX, npc.state.tileY);
      const accentPalette = ['#e6b24e', '#7dc0ef', '#86c86b', '#ef675d', '#d18cf0', '#f1bde8'];
      const accent = accentPalette[hashString(`${npc.id}:${index}`) % accentPalette.length] ?? '#e6b24e';

      return {
        npc,
        accent,
        left: position.left,
        top: position.top,
        zIndex: npc.state.tileX + npc.state.tileY + 1000,
        focus: npc.id === centerNpc?.id,
        danger: npc.id === dangerNpcId || npc.status === 'dead' || Math.min(npc.state.hp, npc.state.water, npc.state.food) <= 25,
      };
    })
    .sort((left, right) => left.zIndex - right.zIndex);
}

function buildSceneResourcePlacements(
  snapshot: SnapshotResponse,
  centerNpc: OverlayNpc | null,
  frameWidth: number,
  frameHeight: number,
): SceneResourcePlacement[] {
  const width = Math.max(1, snapshot.world.width);
  const height = Math.max(1, snapshot.world.height);
  const focusX = clamp(centerNpc?.state.tileX ?? Math.floor(width / 2), 0, width - 1);
  const focusY = clamp(centerNpc?.state.tileY ?? Math.floor(height / 2), 0, height - 1);

  return snapshot.resourceGrants
    .map((grant, index) => {
      const tileX = clamp(grant.spawnTileX ?? focusX, 0, width - 1);
      const tileY = clamp(grant.spawnTileY ?? focusY, 0, height - 1);
      const position = projectScenePoint(frameWidth, frameHeight, focusX, focusY, tileX, tileY);
      const accentPalette = ['#e2b04d', '#f4c869', '#f8d98c'];

      return {
        grant,
        left: position.left,
        top: position.top,
        zIndex: tileX + tileY + 1200 + index,
        accent: accentPalette[index % accentPalette.length] ?? '#e2b04d',
      };
    })
    .sort((left, right) => left.zIndex - right.zIndex);
}

function SceneViewport({
  snapshot,
  latestEvent,
  latestGrant,
  realtimeStatus,
  demoMode,
}: {
  snapshot: SnapshotResponse | null;
  latestEvent: OverlayEvent | null;
  latestGrant: ResourceGrant | null;
  realtimeStatus: 'idle' | 'connecting' | 'connected' | 'reconnecting';
  demoMode: boolean;
}) {
  const [frameRef, frameSize] = useElementSize<HTMLDivElement>();

  const focusNpc = useMemo(() => resolveFocusNpc(snapshot), [snapshot]);
  const dangerNpc = useMemo(() => resolveDangerNpc(snapshot), [snapshot]);
  const sceneTone = useMemo(() => resolveSceneTone(snapshot, latestEvent, latestGrant), [latestEvent, latestGrant, snapshot]);

  const tiles = useMemo(() => {
    if (!snapshot || frameSize.width === 0 || frameSize.height === 0) {
      return [];
    }

    return buildSceneTiles(snapshot, focusNpc, frameSize.width, frameSize.height);
  }, [focusNpc, frameSize.height, frameSize.width, snapshot]);

  const objects = useMemo(() => {
    if (!snapshot || frameSize.width === 0 || frameSize.height === 0) {
      return [];
    }

    return buildSceneObjects(snapshot, focusNpc, latestGrant, frameSize.width, frameSize.height);
  }, [focusNpc, frameSize.height, frameSize.width, latestGrant, snapshot]);

  const resourcePlacements = useMemo(() => {
    if (!snapshot || frameSize.width === 0 || frameSize.height === 0) {
      return [];
    }

    return buildSceneResourcePlacements(snapshot, focusNpc, frameSize.width, frameSize.height);
  }, [focusNpc, frameSize.height, frameSize.width, snapshot]);

  const npcPlacements = useMemo(() => {
    if (!snapshot || frameSize.width === 0 || frameSize.height === 0) {
      return [];
    }

    return buildSceneNpcPlacements(snapshot, focusNpc, dangerNpc, frameSize.width, frameSize.height);
  }, [dangerNpc, focusNpc, frameSize.height, frameSize.width, snapshot]);

  const bannerText = latestEvent ? latestEvent.titleJa ?? latestEvent.eventType : '静かな荒土を監視中';
  const bannerDescription = latestEvent?.descriptionJa ?? 'Tick の進行を待っています。';
  const bannerAccent = sceneTone === 'death' ? 'death' : sceneTone === 'gift' ? 'gift' : sceneTone === 'danger' ? 'danger' : 'calm';
  const focusLabel = focusNpc ? `${focusNpc.name} / ${formatShortNumber(Math.round(focusNpc.state.hp))} HP` : '注目 NPC なし';
  const dangerLabel = dangerNpc ? `${dangerNpc.name} / ${urgentLabel(dangerNpc)}` : '危機なし';

  return (
    <div className="scene-frame" ref={frameRef}>
      <div className={`scene-backdrop scene-backdrop--${bannerAccent}`} aria-hidden="true" />
      <div className="scene-dust" aria-hidden="true" />
      <div className="scene-layer scene-tiles" aria-hidden="true">
        {tiles.map((tile) => (
          <span
            key={`${tile.tileX}-${tile.tileY}`}
            className={`scene-tile scene-tile--${tile.kind}`}
            style={{
              left: `${tile.left}px`,
              top: `${tile.top}px`,
              width: `${tile.width}px`,
              height: `${tile.height}px`,
              zIndex: tile.zIndex,
            }}
          />
        ))}
      </div>

      <div className="scene-layer scene-objects" aria-hidden="true">
        {objects.map((object, index) => {
          const position = projectScenePoint(
            frameSize.width,
            frameSize.height,
            focusNpc?.state.tileX ?? Math.floor(Math.max(1, snapshot?.world.width ?? 1) / 2),
            focusNpc?.state.tileY ?? Math.floor(Math.max(1, snapshot?.world.height ?? 1) / 2),
            object.tileX,
            object.tileY,
          );

          return (
            <div
              key={`${object.kind}-${index}-${object.tileX}-${object.tileY}`}
              className={`scene-object scene-object--${object.kind} scene-object--${object.tone}`}
              style={{
                left: `${position.left}px`,
                top: `${position.top}px`,
                width: `${object.width * object.scale}px`,
                height: `${object.height * object.scale}px`,
                zIndex: object.tileX + object.tileY + 800,
              }}
            >
              <span className="scene-object-core" aria-hidden="true" />
              <span className="scene-object-label">{object.label}</span>
            </div>
          );
        })}
      </div>

      <div className="scene-layer scene-fx" aria-hidden="true">
        {resourcePlacements.map(({ grant, left, top, zIndex, accent }) => (
          <div
            key={grant.id}
            className="scene-gift"
            style={{
              left: `${left}px`,
              top: `${top}px`,
              zIndex,
            }}
          >
            <span className="scene-gift-beam" style={{ '--beam-accent': accent } as React.CSSProperties} />
            <span className="scene-gift-core" style={{ '--beam-accent': accent } as React.CSSProperties} />
          </div>
        ))}

        {dangerNpc ? (
          <div
            className="scene-fx-pulse scene-fx-pulse--danger"
            style={{
              left: `${projectScenePoint(
                frameSize.width,
                frameSize.height,
                focusNpc?.state.tileX ?? Math.floor(Math.max(1, snapshot?.world.width ?? 1) / 2),
                focusNpc?.state.tileY ?? Math.floor(Math.max(1, snapshot?.world.height ?? 1) / 2),
                dangerNpc.state.tileX,
                dangerNpc.state.tileY,
              ).left}px`,
              top: `${projectScenePoint(
                frameSize.width,
                frameSize.height,
                focusNpc?.state.tileX ?? Math.floor(Math.max(1, snapshot?.world.width ?? 1) / 2),
                focusNpc?.state.tileY ?? Math.floor(Math.max(1, snapshot?.world.height ?? 1) / 2),
                dangerNpc.state.tileX,
                dangerNpc.state.tileY,
              ).top}px`,
              zIndex: dangerNpc.state.tileX + dangerNpc.state.tileY + 1100,
            }}
          />
        ) : null}
      </div>

      <div className="scene-layer scene-npcs">
        {npcPlacements.map(({ npc, accent, left, top, zIndex, focus, danger }) => (
          <div
            key={npc.id}
            className={`scene-npc scene-npc--${npc.status} ${focus ? 'scene-npc--focus' : ''} ${danger ? 'scene-npc--danger' : ''}`}
            style={{
              left: `${left}px`,
              top: `${top}px`,
              zIndex,
            }}
          >
            <span className="scene-npc-shadow" />
            <span className="scene-npc-avatar" style={{ '--npc-accent': accent } as React.CSSProperties} />
            <span className="scene-npc-ring" />
          </div>
        ))}
      </div>

      <div className="scene-layer scene-nameplates">
        {npcPlacements.map(({ npc, accent, left, top, zIndex, focus, danger }) => (
          <div
            key={`${npc.id}-nameplate`}
            className={`scene-nameplate ${focus ? 'scene-nameplate--focus' : ''} ${danger ? 'scene-nameplate--danger' : ''}`}
            style={{
              left: `${left}px`,
              top: `${top - 84}px`,
              zIndex: zIndex + 1,
              '--npc-accent': accent,
            } as React.CSSProperties}
          >
            <div className="scene-nameplate-head">
              <strong>{npc.name}</strong>
              <span>{npc.status === 'dead' ? '死亡' : urgentLabel(npc)}</span>
            </div>
            <div className="scene-status-bars">
              <Bar label="HP" value={npc.state.hp} accent="hp" />
              <Bar label="水" value={npc.state.water} accent="water" />
              <Bar label="食料" value={npc.state.food} accent="food" />
            </div>
            <div className="scene-nameplate-action">
              <span>現在の行動</span>
              <strong>{npc.state.currentAction}</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="scene-layer scene-hud">
        <div className={`scene-banner scene-banner--${bannerAccent}`}>
          <div className="scene-banner-head">
            <span>{formatSceneToneLabel(sceneTone)}</span>
            <strong>{bannerText}</strong>
          </div>
          <p>{bannerDescription}</p>
        </div>

        <div className="scene-hud-stack">
          {demoMode ? <span className="scene-hud-chip">デモ表示</span> : null}
          <span className="scene-hud-chip">注目中 {focusLabel}</span>
          <span className="scene-hud-chip">危機 {dangerLabel}</span>
          <span className="scene-hud-chip">WS {realtimeStatus === 'connected' ? '接続中' : realtimeStatus === 'reconnecting' ? '再接続' : realtimeStatus === 'connecting' ? '接続中' : '待機'}</span>
        </div>
      </div>

      <div className="scene-layer scene-alerts">
        {isDeathEvent(latestEvent) && latestEvent ? (
          <div className="scene-alert scene-alert--death">
            <strong>死亡アラート</strong>
            <p>{latestEvent.descriptionJa ?? latestEvent.titleJa ?? 'NPC が倒れました。'}</p>
          </div>
        ) : null}

        {(latestGrant || isGiftEvent(latestEvent)) && latestEvent ? (
          <div className="scene-alert scene-alert--gift">
            <strong>支援物資到着</strong>
            <p>{latestGrant?.packId ?? latestEvent.titleJa ?? 'resource pack'} が着弾しました。</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function createDemoSnapshot(route: OverlayRoute): SnapshotResponse {
  const now = new Date();
  const currentTick = 128;
  const worldId = route.worldId || 'demo-world';

  return {
    ok: true,
    world: {
      id: worldId,
      name: '荒土世界 Alpha',
      width: 64,
      height: 64,
      currentTick,
      status: 'live',
      overlayUrl: '',
      viewerCreateUrl: '',
      viewerMyNpcUrl: '',
      npcCount: 5,
      aliveNpcCount: 4,
      deadNpcCount: 1,
      latestLiveSessionStatus: 'live',
      lastTickStartedAt: now.toISOString(),
      latestLiveSessionId: 'demo-live-session',
    },
    liveSession: {
      id: 'demo-live-session',
      status: 'live',
      startedAt: new Date(now.getTime() - 1000 * 60 * 22).toISOString(),
      endedAt: null,
      viewerCountPeak: 412,
      giftCount: 7,
    },
    npcs: [
      {
        id: 'demo-npc-1',
        name: 'ケンジ',
        status: 'alive',
        state: {
          hp: 28,
          food: 65,
          water: 42,
          stamina: 53,
          morale: 74,
          injury: 12,
          shelter: 22,
          currentAction: '資材を修理している...',
          tileX: 30,
          tileY: 31,
        },
      },
      {
        id: 'demo-npc-2',
        name: 'サラ',
        status: 'alive',
        state: {
          hp: 78,
          food: 65,
          water: 42,
          stamina: 66,
          morale: 82,
          injury: 4,
          shelter: 54,
          currentAction: '見張りを続けている',
          tileX: 24,
          tileY: 27,
        },
      },
      {
        id: 'demo-npc-3',
        name: 'ハル',
        status: 'alive',
        state: {
          hp: 90,
          food: 70,
          water: 41,
          stamina: 72,
          morale: 68,
          injury: 0,
          shelter: 60,
          currentAction: '補給地点に向かっている',
          tileX: 35,
          tileY: 24,
        },
      },
      {
        id: 'demo-npc-4',
        name: 'バク',
        status: 'alive',
        state: {
          hp: 60,
          food: 50,
          water: 35,
          stamina: 48,
          morale: 50,
          injury: 18,
          shelter: 36,
          currentAction: '安全地帯を確認している',
          tileX: 40,
          tileY: 33,
        },
      },
      {
        id: 'demo-npc-5',
        name: 'ミラ',
        status: 'dead',
        state: {
          hp: 0,
          food: 0,
          water: 0,
          stamina: 0,
          morale: 0,
          injury: 100,
          shelter: 0,
          currentAction: '倒れている...',
          tileX: 46,
          tileY: 40,
        },
      },
    ],
    events: [
      {
        id: 'demo-event-1',
        tick: currentTick,
        eventType: 'npc_dead',
        titleJa: '仲間が倒れた！',
        descriptionJa: '負傷者を確認して、支援の優先順位を決めてください。',
        actorNpcId: 'demo-npc-5',
        targetNpcId: null,
        tileX: 46,
        tileY: 40,
        createdAt: now.toISOString(),
      },
      {
        id: 'demo-event-2',
        tick: currentTick - 1,
        eventType: 'gift_received',
        titleJa: 'ギフト投下が発生！',
        descriptionJa: '視聴者からの支援物資が届きました。',
        actorNpcId: null,
        targetNpcId: 'demo-npc-1',
        tileX: 31,
        tileY: 30,
        createdAt: new Date(now.getTime() - 1000 * 30).toISOString(),
      },
    ],
    resourceGrants: [
      {
        id: 'demo-grant-1',
        packId: 'gift_pack_gold',
        status: 'active',
        spawnTileX: 31,
        spawnTileY: 30,
        targetNpcId: 'demo-npc-1',
        expiresAt: new Date(now.getTime() + 1000 * 60 * 10).toISOString(),
      },
      {
        id: 'demo-grant-2',
        packId: 'water_drop_small',
        status: 'active',
        spawnTileX: 38,
        spawnTileY: 32,
        targetNpcId: 'demo-npc-2',
        expiresAt: new Date(now.getTime() + 1000 * 60 * 6).toISOString(),
      },
    ],
  };
}

function OverlayApp() {
  const route = useMemo(resolveOverlayRoute, []);
  const routeError = !route.streamerHandle || !route.worldId ? 'overlay URL に streamerHandle と worldId を指定してください' : null;
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  const loadSnapshot = useCallback(async () => {
    if (routeError) {
      setSnapshot(null);
      setError(routeError);
      setDemoMode(false);
      setLoading(false);
      return;
    }

    try {
      const data = await requestJson<SnapshotResponse>(
        `/api/streamers/${encodeURIComponent(route.streamerHandle)}/worlds/${encodeURIComponent(route.worldId)}/snapshot`,
      );
      setSnapshot(data);
      setError(null);
      setDemoMode(false);
      setLastUpdatedAt(new Date().toISOString());
    } catch (loadError) {
      if (import.meta.env.DEV) {
        setSnapshot(createDemoSnapshot(route));
        setError(null);
        setDemoMode(true);
        setLastUpdatedAt(new Date().toISOString());
      } else {
        setError(loadError instanceof Error ? loadError.message : 'snapshot の取得に失敗しました');
      }
    } finally {
      setLoading(false);
    }
  }, [route.streamerHandle, route.worldId, routeError]);

  const realtimeStatus = useRealtimeFeed(route.streamerHandle, route.worldId, () => {
    void loadSnapshot();
  }, !demoMode);

  useEffect(() => {
    let active = true;
    setLoading(true);

    if (demoMode) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    if (routeError) {
      setLoading(false);
      setSnapshot(null);
      setError(routeError);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      await loadSnapshot();
      if (!active) {
        return;
      }
    };

    void run();
    const timer = window.setInterval(() => {
      void loadSnapshot();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [demoMode, loadSnapshot, routeError]);

  const latestEvent = snapshot?.events[0] ?? null;
  const latestGrant = snapshot?.resourceGrants[0] ?? null;

  if (routeError) {
    return (
      <main className="overlay-shell">
        <div className="overlay-error">{routeError}</div>
      </main>
    );
  }

  return (
    <main className="overlay-shell">
      <header className="hud">
        <div className="hud-brand">
          <strong>{snapshot?.world.name ?? '荒土世界 Alpha'}</strong>
          <span>@{route.streamerHandle} / overlay</span>
        </div>
        <div className="hud-stats">
          <div className="hud-stat">
            <span>Tick</span>
            <strong>{snapshot ? formatShortNumber(snapshot.world.currentTick) : '—'}</strong>
          </div>
          <div className="hud-stat">
            <span>生存者</span>
            <strong>{snapshot ? formatShortNumber(snapshot.world.aliveNpcCount) : '—'}</strong>
          </div>
          <div className="hud-stat">
            <span>死亡者</span>
            <strong>{snapshot ? formatShortNumber(snapshot.world.deadNpcCount) : '—'}</strong>
          </div>
          <div className="hud-stat">
            <span>支援</span>
            <strong>{snapshot ? formatShortNumber(snapshot.resourceGrants.length) : '—'}</strong>
          </div>
          <div className="hud-stat">
            <span>ライブ</span>
            <strong>{formatLiveStatusLabel(snapshot?.liveSession?.status ?? snapshot?.world.latestLiveSessionStatus)}</strong>
          </div>
          <div className="hud-stat">
            <span>WS</span>
            <strong>{realtimeStatus === 'connected' ? '接続中' : realtimeStatus === 'reconnecting' ? '再接続' : realtimeStatus === 'connecting' ? '接続中' : '待機'}</strong>
          </div>
        </div>
      </header>

      {error ? <div className="overlay-error">{error}</div> : null}

      <section className="overlay-grid">
        <section className="stage-panel">
          <div className="stage-head">
            <div>
              <p className="eyebrow">WORLD SNAPSHOT</p>
              <h1>荒土世界のライブ監視</h1>
            </div>
            <div className="stage-meta">
              <span>Width {snapshot ? formatShortNumber(snapshot.world.width) : '—'}</span>
              <span>Height {snapshot ? formatShortNumber(snapshot.world.height) : '—'}</span>
              <span>Last Tick {snapshot?.world.lastTickStartedAt ? formatDateTime(snapshot.world.lastTickStartedAt) : '—'}</span>
            </div>
          </div>

          <SceneViewport snapshot={snapshot} latestEvent={latestEvent} latestGrant={latestGrant} realtimeStatus={realtimeStatus} demoMode={demoMode} />

          <div className="ticker">
            <span>最新イベント</span>
            <strong>{latestEvent ? latestEvent.titleJa ?? latestEvent.eventType : 'イベントはまだありません'}</strong>
            <p>{latestEvent?.descriptionJa ?? 'Tick の進行を待っています。'}</p>
          </div>
        </section>

        <aside className="side-panel">
          <section className="panel-block">
            <header className="block-head">
              <div>
                <h2>AI 住民</h2>
                <p>5 人の状態と行動を縦に確認できます。</p>
              </div>
              <span className="status-chip">{loading ? '読込中' : '最新'}</span>
            </header>

            <div className="npc-list">
              {(snapshot?.npcs ?? []).map((npc) => (
                <article key={npc.id} className="npc-row">
                  <div className="npc-row-top">
                    <strong>{npc.name}</strong>
                    <span>{npc.state.currentAction}</span>
                  </div>
                  <div className="npc-row-meta">
                    <span>HP {formatShortNumber(Math.round(npc.state.hp))}</span>
                    <span>水 {formatShortNumber(Math.round(npc.state.water))}</span>
                    <span>食料 {formatShortNumber(Math.round(npc.state.food))}</span>
                    <span>座標 {npc.state.tileX}, {npc.state.tileY}</span>
                  </div>
                  <div className="row-meter">
                    <span style={{ width: `${npc.state.hp}%` }} />
                  </div>
                </article>
              ))}
              {snapshot?.npcs.length === 0 ? <div className="empty-state">NPC がいません。</div> : null}
            </div>
          </section>

          <section className="panel-block">
            <header className="block-head">
              <div>
                <h2>最近の出来事</h2>
                <p>world_events の最新 5 件です。</p>
              </div>
            </header>
            <div className="event-list">
              {(snapshot?.events ?? []).slice(0, 5).map((event) => (
                <article key={event.id} className="event-row">
                  <span className="event-badge">Tick {formatShortNumber(event.tick)}</span>
                  <strong>{event.titleJa ?? event.eventType}</strong>
                  <p>{event.descriptionJa ?? '—'}</p>
                </article>
              ))}
              {snapshot?.events.length === 0 ? <div className="empty-state">イベントはまだありません。</div> : null}
            </div>
          </section>

          <section className="panel-block">
            <header className="block-head">
              <div>
                <h2>支援物資</h2>
                <p>gift_events で生成された resource_grants を表示します。</p>
              </div>
            </header>

            {latestGrant ? (
              <article className="grant-row">
                <div className="grant-row-top">
                  <strong>{latestGrant.packId ?? 'pack'}</strong>
                  <span>{latestGrant.status}</span>
                </div>
                <p>
                  {latestGrant.spawnTileX ?? '—'}, {latestGrant.spawnTileY ?? '—'}
                </p>
                <small>期限 {formatDateTime(latestGrant.expiresAt)}</small>
              </article>
            ) : (
              <div className="empty-state">支援物資はまだありません。</div>
            )}
          </section>
        </aside>
      </section>

      <footer className="bottom-bar">
        <span>{snapshot ? `Tick ${formatShortNumber(snapshot.world.currentTick)}` : 'Tick —'}</span>
        <strong>{latestEvent ? latestEvent.titleJa ?? latestEvent.eventType : 'イベント待機中'}</strong>
        <span>{lastUpdatedAt ? `更新 ${formatDateTime(lastUpdatedAt)}` : '更新待機中'}</span>
      </footer>
    </main>
  );
}

function Bar({ label, value, accent = 'neutral' }: { label: string; value: number; accent?: 'hp' | 'water' | 'food' | 'neutral' }) {
  return (
    <div className={`bar-row bar-row--${accent}`}>
      <span>{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<OverlayApp />);
