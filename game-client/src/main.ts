import { clamp } from './utils.js';
import { openWorldRealtime, loadWorldSnapshot } from './data/api.js';
import { buildStressSnapshot } from './data/stressWorldFactory.js';
import { buildWorldViewModel } from './model/viewModel.js';
import { PixiStageRenderer } from './render/pixiStage.js';
import { createDomHud } from './hud/domHud.js';
import type { BackendSnapshotResponse, GameRouteState, GameMode, HudSnapshot, RealtimeMessage } from './types.js';
import './style.css';

const DEFAULT_STREAMER_HANDLE = 'matt';
const DEFAULT_WORLD_ID = '00000000-0000-0000-0000-000000000101';

function parseRoute(): GameRouteState {
  const query = new URLSearchParams(window.location.search);
  const segments = window.location.pathname.split('/').filter(Boolean);
  const routeMode = query.get('mode') === 'stress' ? 'stress' : 'live';
  const defaultStreamer = query.get('streamerHandle') || DEFAULT_STREAMER_HANDLE;
  const defaultWorldId = query.get('worldId') || DEFAULT_WORLD_ID;
  const streamerHandle = segments[0] === 'game' && segments[1] ? segments[1] : defaultStreamer;
  const worldId = segments[0] === 'game' && segments[2] ? segments[2] : defaultWorldId;
  const npcCount = clamp(Number.parseInt(query.get('npcCount') ?? '1000', 10) || 1000, 1, 1000);
  const debug = query.get('debug') === '1' || query.get('debug') === 'true';
  return {
    streamerHandle,
    worldId,
    mode: routeMode,
    npcCount,
    debug,
  };
}

function createShell(): { shell: HTMLElement; canvasHost: HTMLElement; note: HTMLElement } {
  const shell = document.createElement('div');
  shell.className = 'game-shell';

  const canvasHost = document.createElement('div');
  canvasHost.className = 'game-canvas';

  const note = document.createElement('div');
  note.className = 'game-overlay-note';
  note.innerHTML = `
    <strong>2.5D / WINDOW CAPTURE</strong>
    <div>ドラッグで移動、ホイールでズーム、ライブ世界をそのまま表示。</div>
  `;

  shell.append(canvasHost, note);
  return { shell, canvasHost, note };
}

function updateDocumentTitle(route: GameRouteState): void {
  document.title = `AI Wasteland Survival v2 / ${route.streamerHandle} / ${route.mode}`;
}

function createSyntheticSnapshot(route: GameRouteState): BackendSnapshotResponse {
  return buildStressSnapshot(route.streamerHandle, route.worldId, route.npcCount);
}

async function resolveSnapshot(route: GameRouteState, signal?: AbortSignal): Promise<BackendSnapshotResponse> {
  if (route.mode === 'stress') {
    return createSyntheticSnapshot(route);
  }

  return loadWorldSnapshot(route.streamerHandle, route.worldId, signal);
}

function makeHudSnapshot(model: ReturnType<typeof buildWorldViewModel>, fps: number, realtimeStatus: string): HudSnapshot {
  const topEvent = model.events[0];
  return {
    mode: model.mode,
    streamerHandle: model.streamerHandle,
    streamerName: model.streamerName,
    worldName: model.worldName,
    worldStatus: model.worldStatus,
    liveSessionStatus: model.liveSessionStatus,
    tick: model.tick,
    survivorCount: model.survivorCount,
    deadCount: model.deadCount,
    grantsCount: model.resourceGrants.length,
    focusText: model.focusReason,
    subtitleText: topEvent?.titleJa ? `${topEvent.titleJa} · ${model.worldStatus === 'live' ? '配信中' : '観測中'}` : `荒土世界 ${model.worldStatus}`,
    realtimeStatus,
    snapshotAgeMs: performance.now() - model.snapshotLoadedAt,
    fps,
    debugVisible: false,
    instructionText: 'ドラッグ: 視点移動  /  ホイール: ズーム  /  クリック: 注目切替',
  };
}

async function bootstrap(): Promise<void> {
  const route = parseRoute();
  updateDocumentTitle(route);

  const { shell, canvasHost } = createShell();
  document.body.appendChild(shell);

  const hud = createDomHud();
  shell.appendChild(hud.root);

  const renderer = await PixiStageRenderer.create(window.innerWidth, window.innerHeight);
  canvasHost.appendChild(renderer.view);

  let realtimeStatus = route.mode === 'stress' ? 'local_stress' : 'loading';
  let currentModel = buildWorldViewModel({
    snapshot: createSyntheticSnapshot(route),
    mode: route.mode,
    snapshotLoadedAt: performance.now(),
    realtimeStatus,
  });

  renderer.setModel(currentModel);
  renderer.setDebugVisible(route.debug);
  if (route.mode === 'stress') {
    renderer.zoomCamera(0.3);
  }

  const resize = (): void => {
    renderer.resize(window.innerWidth, window.innerHeight);
  };

  window.addEventListener('resize', resize);
  resize();

  let dragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let manualCameraUntil = 0;

  renderer.view.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    renderer.view.setPointerCapture(event.pointerId);
    manualCameraUntil = performance.now() + 6000;
  });

  renderer.view.addEventListener('pointermove', (event) => {
    if (!dragging) {
      return;
    }
    const deltaX = event.clientX - lastPointerX;
    const deltaY = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    renderer.panCamera(deltaX * -0.75, deltaY * -0.75);
    manualCameraUntil = performance.now() + 6000;
  });

  const stopDragging = (): void => {
    dragging = false;
  };

  renderer.view.addEventListener('pointerup', stopDragging);
  renderer.view.addEventListener('pointercancel', stopDragging);
  renderer.view.addEventListener('wheel', (event) => {
    event.preventDefault();
    const direction = Math.sign(event.deltaY);
    renderer.zoomCamera(direction > 0 ? -0.06 : 0.06);
    manualCameraUntil = performance.now() + 6000;
  }, { passive: false });

  let snapshotAbortController: AbortController | null = null;
  let liveSnapshotTimer: number | null = null;
  let realtimeDispose: (() => void) | null = null;
  let pendingRefresh = false;
  let lastRealtimeMessage: RealtimeMessage | null = null;

  const loadAndRenderSnapshot = async (reason: string): Promise<void> => {
    if (pendingRefresh) {
      return;
    }
    pendingRefresh = true;
    snapshotAbortController?.abort();
    snapshotAbortController = new AbortController();

    try {
      realtimeStatus = reason;
      const snapshot = await resolveSnapshot(route, snapshotAbortController.signal);
      currentModel = buildWorldViewModel({
        snapshot,
        mode: route.mode,
        snapshotLoadedAt: performance.now(),
        realtimeStatus,
        focusNpcId: lastRealtimeMessage?.targetNpcId as string | null | undefined,
        focusReason: lastRealtimeMessage?.type === 'gift_received' ? '礼物演出' : undefined,
      });
      renderer.setModel(currentModel);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'snapshot failed';
      realtimeStatus = `error: ${message}`;
    } finally {
      pendingRefresh = false;
    }
  };

  const handleRealtimeMessage = (message: RealtimeMessage): void => {
    lastRealtimeMessage = message;
    realtimeStatus = message.type;
    if (message.type === 'gift_received') {
      const grantId = typeof message.resourceGrantId === 'string' ? message.resourceGrantId : null;
      const targetNpcId = typeof message.targetNpcId === 'string' ? message.targetNpcId : null;
      const currentGrant = grantId ? currentModel?.resourceGrants.find((grant) => grant.id === grantId) ?? null : null;
      const currentNpc = targetNpcId ? currentModel?.npcs.find((npc) => npc.id === targetNpcId) ?? null : null;
      const tileX = Number(currentGrant?.x ?? currentNpc?.x ?? message.tileX ?? message.spawnTileX ?? 0);
      const tileY = Number(currentGrant?.y ?? currentNpc?.y ?? message.tileY ?? message.spawnTileY ?? 0);
      renderer.spawnGiftFx(tileX, tileY);
    }
    if (message.type === 'world_tick_completed' || message.type === 'gift_received') {
      void loadAndRenderSnapshot(`realtime:${message.type}`);
    }
  };

  if (route.mode === 'live') {
    try {
      await loadAndRenderSnapshot('loading');
      realtimeDispose = openWorldRealtime(route.streamerHandle, route.worldId, handleRealtimeMessage, (status) => {
        realtimeStatus = status;
      });
      liveSnapshotTimer = window.setInterval(() => {
        if (performance.now() < manualCameraUntil) {
          return;
        }
        void loadAndRenderSnapshot('poll');
      }, 15000);
    } catch (error) {
      realtimeStatus = error instanceof Error ? error.message : 'load failed';
    }
  }

  const tick = (): void => {
    renderer.update();

    if (currentModel) {
      const hudSnapshot = makeHudSnapshot(currentModel, renderer.fpsValue, realtimeStatus);
      hudSnapshot.debugVisible = route.debug;
      hud.setSnapshot(hudSnapshot);
      hud.setEvents(currentModel.events.slice(0, 6));

      const focusNpc = currentModel.npcs.find((npc) => npc.id === currentModel.focusNpcId) ?? null;
      if (focusNpc && performance.now() > manualCameraUntil) {
        renderer.updateCameraTarget((focusNpc.x - focusNpc.y) * 64, (focusNpc.x + focusNpc.y) * 32);
      } else if (performance.now() > manualCameraUntil) {
        const centerX = currentModel.width / 2;
        const centerY = currentModel.height / 2;
        renderer.updateCameraTarget((centerX - centerY) * 64, (centerX + centerY) * 32);
      }
    }

    requestAnimationFrame(tick);
  };

  tick();

  window.addEventListener('beforeunload', () => {
    realtimeDispose?.();
    snapshotAbortController?.abort();
    if (liveSnapshotTimer !== null) {
      window.clearInterval(liveSnapshotTimer);
    }
  });
}

void bootstrap().catch((error) => {
  const fallback = document.createElement('pre');
  fallback.style.whiteSpace = 'pre-wrap';
  fallback.style.padding = '24px';
  fallback.style.color = '#f5e8d0';
  fallback.style.background = '#120f0b';
  fallback.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
  document.body.appendChild(fallback);
});
