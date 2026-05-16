import type { HudSnapshot } from '../types.js';

export interface DomHudHandle {
  root: HTMLElement;
  setSnapshot(snapshot: HudSnapshot): void;
  setEvents(events: Array<{ id: string; titleJa: string; descriptionJa: string; severity: string }>): void;
  setStatusText(text: string): void;
}

function createMetric(label: string, valueClass = 'hud-value'): { root: HTMLElement; value: HTMLElement } {
  const root = document.createElement('div');
  root.className = 'hud-metric';

  const title = document.createElement('div');
  title.className = 'hud-metric-label';
  title.textContent = label;

  const value = document.createElement('div');
  value.className = valueClass;

  root.append(title, value);
  return { root, value };
}

export function createDomHud(): DomHudHandle {
  const root = document.createElement('aside');
  root.className = 'game-hud';

  const topBar = document.createElement('div');
  topBar.className = 'hud-topbar';

  const identityCard = document.createElement('section');
  identityCard.className = 'hud-panel hud-identity';
  const identityKicker = document.createElement('div');
  identityKicker.className = 'hud-kicker';
  identityKicker.textContent = 'STREAMER / WORLD';
  const streamer = createMetric('配信者');
  const world = createMetric('ワールド');
  const focus = createMetric('注目中');
  identityCard.append(identityKicker, streamer.root, world.root, focus.root);

  const statusRail = document.createElement('section');
  statusRail.className = 'hud-panel hud-status-rail';
  const mode = createMetric('MODE');
  const status = createMetric('接続');
  const tick = createMetric('TICK');
  const counts = createMetric('生存 / 死亡');
  const grants = createMetric('支援物資');
  statusRail.append(mode.root, status.root, tick.root, counts.root, grants.root);

  topBar.append(identityCard, statusRail);

  const centerStrip = document.createElement('div');
  centerStrip.className = 'hud-center-strip';
  const subtitle = document.createElement('div');
  subtitle.className = 'hud-subtitle';
  const instruction = document.createElement('div');
  instruction.className = 'hud-instruction';
  centerStrip.append(subtitle, instruction);

  const bottomBar = document.createElement('div');
  bottomBar.className = 'hud-bottombar';

  const eventsPanel = document.createElement('section');
  eventsPanel.className = 'hud-panel hud-events';

  const eventsHeader = document.createElement('div');
  eventsHeader.className = 'hud-panel-title';
  eventsHeader.textContent = 'LIVE FEED';

  const eventsList = document.createElement('div');
  eventsList.className = 'hud-events-list';

  eventsPanel.append(eventsHeader, eventsList);

  const debug = document.createElement('section');
  debug.className = 'hud-debug';

  bottomBar.append(debug, eventsPanel);

  root.append(topBar, centerStrip, bottomBar);

  let currentSnapshot: HudSnapshot | null = null;

  return {
    root,
    setSnapshot(snapshot) {
      currentSnapshot = snapshot;
      streamer.value.textContent = `${snapshot.streamerName} / ${snapshot.streamerHandle}`;
      world.value.textContent = snapshot.worldName;
      mode.value.textContent = snapshot.mode === 'live' ? '配信中' : '演出';
      status.value.textContent = snapshot.realtimeStatus;
      tick.value.textContent = `T ${snapshot.tick}`;
      counts.value.textContent = `生 ${snapshot.survivorCount} / 死 ${snapshot.deadCount}`;
      grants.value.textContent = `×${snapshot.grantsCount}`;
      focus.value.textContent = snapshot.focusText;
      subtitle.textContent = snapshot.subtitleText;
      instruction.textContent = snapshot.instructionText;
      debug.textContent = snapshot.debugVisible
        ? `FPS ${snapshot.fps.toFixed(1)} / age ${Math.round(snapshot.snapshotAgeMs)}ms / ${snapshot.realtimeStatus}`
        : '';
      debug.style.display = snapshot.debugVisible ? 'block' : 'none';
    },
    setEvents(events) {
      eventsList.replaceChildren(
        ...events.slice(0, 4).map((event, index) => {
          const item = document.createElement('article');
          item.className = `hud-event hud-event-${event.severity}`;
          item.style.setProperty('--event-index', String(index));
          const badge = document.createElement('div');
          badge.className = 'hud-event-badge';
          badge.textContent =
            event.severity === 'danger' ? '危険' : event.severity === 'warning' ? '支援' : '状況';
          const title = document.createElement('div');
          title.className = 'hud-event-title';
          title.textContent = event.titleJa;
          const desc = document.createElement('div');
          desc.className = 'hud-event-desc';
          desc.textContent = event.descriptionJa;
          item.append(badge, title, desc);
          return item;
        }),
      );
    },
    setStatusText(text) {
      status.value.textContent = text;
      if (currentSnapshot) {
        currentSnapshot.realtimeStatus = text;
      }
    },
  };
}
