import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from 'pixi.js';
import type {
  CameraState,
  DecorationViewModel,
  EventViewModel,
  NpcAccessoryKey,
  NpcHeadKey,
  NpcMorphKey,
  NpcViewModel,
  ResourceGrantViewModel,
  TileViewModel,
  WorldViewModel,
} from '../types.js';
import { IsoCamera } from '../camera/isoCamera.js';
import { createGameAssets, type GameAssets } from './assets.js';
import { clamp, formatNumber } from '../utils.js';

interface NameplateEntry {
  sprite: Sprite;
  label: Text;
  value: Text;
  barBg: Graphics;
  hpBar: Graphics;
  waterBar: Graphics;
  statusTag: Text;
}

interface SpriteEntry {
  sprite: Sprite;
  baseScale: number;
  kind: string;
}

interface NpcRenderEntry {
  container: Container;
  shadow: Sprite;
  body: Sprite;
  head: Sprite;
  accessory: Sprite;
  bodyTextureKey: string;
  headTextureKey: string;
  accessoryTextureKey: string;
}

interface NpcRenderProfile {
  bodyScaleX: number;
  bodyScaleY: number;
  headScaleX: number;
  headScaleY: number;
  headOffsetX: number;
  headOffsetY: number;
  accessoryScaleX: number;
  accessoryScaleY: number;
  accessoryOffsetX: number;
  accessoryOffsetY: number;
  shadowScaleX: number;
  shadowScaleY: number;
  shadowOffsetY: number;
}

const NPC_RENDER_PROFILES: Record<NpcMorphKey, NpcRenderProfile> = {
  slim: {
    bodyScaleX: 0.86,
    bodyScaleY: 1.02,
    headScaleX: 0.78,
    headScaleY: 0.78,
    headOffsetX: 0,
    headOffsetY: -62,
    accessoryScaleX: 0.8,
    accessoryScaleY: 0.8,
    accessoryOffsetX: 0,
    accessoryOffsetY: -38,
    shadowScaleX: 0.82,
    shadowScaleY: 0.38,
    shadowOffsetY: 10,
  },
  average: {
    bodyScaleX: 0.98,
    bodyScaleY: 1.08,
    headScaleX: 0.84,
    headScaleY: 0.84,
    headOffsetX: 0,
    headOffsetY: -68,
    accessoryScaleX: 0.86,
    accessoryScaleY: 0.86,
    accessoryOffsetX: 0,
    accessoryOffsetY: -42,
    shadowScaleX: 0.92,
    shadowScaleY: 0.42,
    shadowOffsetY: 10,
  },
  tall: {
    bodyScaleX: 0.92,
    bodyScaleY: 1.24,
    headScaleX: 0.86,
    headScaleY: 0.86,
    headOffsetX: 0,
    headOffsetY: -80,
    accessoryScaleX: 0.9,
    accessoryScaleY: 0.9,
    accessoryOffsetX: 0,
    accessoryOffsetY: -52,
    shadowScaleX: 0.98,
    shadowScaleY: 0.38,
    shadowOffsetY: 11,
  },
  bulky: {
    bodyScaleX: 1.14,
    bodyScaleY: 1.12,
    headScaleX: 0.9,
    headScaleY: 0.9,
    headOffsetX: 0,
    headOffsetY: -70,
    accessoryScaleX: 0.96,
    accessoryScaleY: 0.96,
    accessoryOffsetX: 0,
    accessoryOffsetY: -44,
    shadowScaleX: 1.02,
    shadowScaleY: 0.44,
    shadowOffsetY: 9,
  },
  ragged: {
    bodyScaleX: 0.94,
    bodyScaleY: 1.0,
    headScaleX: 0.8,
    headScaleY: 0.8,
    headOffsetX: 0,
    headOffsetY: -66,
    accessoryScaleX: 0.86,
    accessoryScaleY: 0.86,
    accessoryOffsetX: 0,
    accessoryOffsetY: -40,
    shadowScaleX: 0.88,
    shadowScaleY: 0.38,
    shadowOffsetY: 11,
  },
};

function getNpcBodyTextureKey(morphKey: NpcMorphKey): keyof GameAssets['textures'] {
  const textureKeys: Record<NpcMorphKey, keyof GameAssets['textures']> = {
    slim: 'npc_body_slim_01',
    average: 'npc_body_average_01',
    tall: 'npc_body_tall_01',
    bulky: 'npc_body_bulky_01',
    ragged: 'npc_body_ragged_01',
  };
  return textureKeys[morphKey];
}

function getNpcHeadTextureKey(headKey: NpcHeadKey): keyof GameAssets['textures'] {
  const textureKeys: Record<NpcHeadKey, keyof GameAssets['textures']> = {
    narrow: 'npc_head_narrow_01',
    round: 'npc_head_round_01',
    square: 'npc_head_square_01',
    gaunt: 'npc_head_gaunt_01',
  };
  return textureKeys[headKey];
}

function getNpcAccessoryTextureKey(accessoryKey: NpcAccessoryKey): keyof GameAssets['textures'] | null {
  const textureKeys: Record<NpcAccessoryKey, keyof GameAssets['textures'] | null> = {
    none: null,
    hood: 'npc_accessory_hood_01',
    backpack: 'npc_accessory_backpack_01',
    scarf: 'npc_accessory_scarf_01',
    bundle: 'npc_accessory_bundle_01',
    wrap: 'npc_accessory_wrap_01',
  };
  return textureKeys[accessoryKey];
}

interface RuntimeFx {
  sprite: Sprite;
  bornAt: number;
  duration: number;
  pulse: number;
}

function createTextStyle(fontSize: number, fill: string, fontWeight: TextStyle['fontWeight'] = '700'): TextStyle {
  return new TextStyle({
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize,
    fill,
    fontWeight,
  });
}

function colorFromState(state: NpcViewModel['status']): number {
  if (state === 'dead') {
    return 0x8b8b8b;
  }
  return 0xe2b04d;
}

function ensureSpriteMapEntry(
  map: Map<string, SpriteEntry>,
  kind: string,
  id: string,
  texture: Texture,
  parent: Container,
  baseScale: number,
): SpriteEntry {
  const key = `${kind}:${id}`;
  const existing = map.get(key);
  if (existing) {
    return existing;
  }

  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, 1);
  sprite.scale.set(baseScale);
  parent.addChild(sprite);

  const entry = { sprite, baseScale, kind };
  map.set(key, entry);
  return entry;
}

function ensureNpcRenderEntry(
  map: Map<string, NpcRenderEntry>,
  id: string,
  parent: Container,
  assets: GameAssets,
): NpcRenderEntry {
  const existing = map.get(id);
  if (existing) {
    return existing;
  }

  const container = new Container();
  container.sortableChildren = true;
  parent.addChild(container);

  const shadow = new Sprite(assets.textures.npc_shadow_01);
  shadow.anchor.set(0.5, 0.5);
  shadow.zIndex = 0;

  const accessory = new Sprite(Texture.EMPTY);
  accessory.anchor.set(0.5, 1);
  accessory.visible = false;
  accessory.zIndex = 1;

  const body = new Sprite(assets.textures.npc_body_average_01);
  body.anchor.set(0.5, 1);
  body.zIndex = 2;

  const head = new Sprite(assets.textures.npc_head_round_01);
  head.anchor.set(0.5, 1);
  head.zIndex = 3;

  container.addChild(shadow, accessory, body, head);

  const entry: NpcRenderEntry = {
    container,
    shadow,
    body,
    head,
    accessory,
    bodyTextureKey: 'npc_body_average_01',
    headTextureKey: 'npc_head_round_01',
    accessoryTextureKey: '',
  };
  map.set(id, entry);
  return entry;
}

function pruneMapEntries(map: Map<string, SpriteEntry>, aliveKeys: Set<string>): void {
  for (const [key, entry] of map) {
    if (aliveKeys.has(key)) {
      continue;
    }
    entry.sprite.destroy();
    map.delete(key);
  }
}

function pruneNpcEntries(map: Map<string, NpcRenderEntry>, aliveKeys: Set<string>): void {
  for (const [key, entry] of map) {
    if (aliveKeys.has(key)) {
      continue;
    }
    entry.container.destroy({ children: true });
    map.delete(key);
  }
}

function createNameplate(parent: Container, texture: Texture): NameplateEntry {
  const plate = new Sprite(texture);
  plate.anchor.set(0.5, 1);
  plate.alpha = 0.85;
  plate.visible = false;
  parent.addChild(plate);

  const barBg = new Graphics();
  const hpBar = new Graphics();
  const waterBar = new Graphics();
  const label = new Text({
    text: '',
    style: createTextStyle(18, '#f5e8d0'),
  });
  const value = new Text({
    text: '',
    style: createTextStyle(14, '#a89a81', '600'),
  });
  const statusTag = new Text({
    text: '',
    style: createTextStyle(14, '#ffffff', '800'),
  });

  label.anchor.set(0.5, 0);
  value.anchor.set(0.5, 0);
  statusTag.anchor.set(0.5, 0.5);

  parent.addChild(barBg, hpBar, waterBar, label, value, statusTag);

  return {
    sprite: plate,
    label,
    value,
    barBg,
    hpBar,
    waterBar,
    statusTag,
  };
}

function updateProgressBar(graphics: Graphics, width: number, color: number, alpha = 1): void {
  graphics.clear();
  graphics.roundRect(0, 0, width, 6, 3);
  graphics.fill({ color, alpha });
}

export class PixiStageRenderer {
  private readonly app: Application;

  private readonly assets: GameAssets;

  private readonly camera: IsoCamera;

  private readonly stageRoot = new Container();

  private readonly backgroundLayer = new Container();

  private readonly backgroundBackdrop = new Graphics();

  private readonly backgroundHaze = new Graphics();

  private readonly backgroundDust = new Graphics();

  private readonly backgroundSun = new Graphics();

  private readonly backgroundRidges = new Graphics();

  private readonly backgroundVignette = new Graphics();

  private readonly tileLayer = new Container();

  private readonly vegetationLayer = new Container();

  private readonly propLayer = new Container();

  private readonly beastLayer = new Container();

  private readonly npcLayer = new Container();

  private readonly fxLayer = new Container();

  private readonly nameplateLayer = new Container();

  private readonly tileSprites = new Map<string, SpriteEntry>();

  private readonly decorationSprites = new Map<string, SpriteEntry>();

  private readonly npcSprites = new Map<string, NpcRenderEntry>();

  private readonly grantSprites = new Map<string, SpriteEntry>();

  private readonly nameplates = new Map<string, NameplateEntry>();

  private readonly fxSprites: RuntimeFx[] = [];

  private currentModel: WorldViewModel | null = null;

  private debugVisible = false;

  private lastFrameAt = performance.now();

  private fps = 60;

  constructor(app: Application, camera: IsoCamera) {
    this.app = app;
    this.assets = createGameAssets();
    this.camera = camera;

    this.app.stage.sortableChildren = true;
    this.stageRoot.sortableChildren = true;
    this.backgroundLayer.addChild(
      this.backgroundBackdrop,
      this.backgroundSun,
      this.backgroundHaze,
      this.backgroundRidges,
      this.backgroundDust,
      this.backgroundVignette,
    );
    this.stageRoot.addChild(
      this.backgroundLayer,
      this.tileLayer,
      this.vegetationLayer,
      this.propLayer,
      this.beastLayer,
      this.npcLayer,
      this.fxLayer,
      this.nameplateLayer,
    );
    this.npcLayer.sortableChildren = true;
    this.stageRoot.zIndex = 0;
    this.app.stage.addChild(this.stageRoot);
  }

  static async create(width: number, height: number): Promise<PixiStageRenderer> {
    const app = new Application();
    await app.init({
      width,
      height,
      backgroundAlpha: 0,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      powerPreference: 'high-performance',
    });
    const camera = new IsoCamera({
      focusX: 0,
      focusY: 0,
      zoom: 0.9,
      panX: 0,
      panY: 0,
      viewportWidth: width,
      viewportHeight: height,
    });
    return new PixiStageRenderer(app, camera);
  }

  get view(): HTMLCanvasElement {
    return this.app.canvas;
  }

  get fpsValue(): number {
    return this.fps;
  }

  setDebugVisible(debugVisible: boolean): void {
    this.debugVisible = debugVisible;
  }

  resize(width: number, height: number): void {
    this.app.renderer.resize(width, height);
    this.camera.setViewport(width, height);
  }

  updateCameraTarget(focusX: number, focusY: number): void {
    this.camera.setFocus(focusX, focusY);
  }

  panCamera(deltaX: number, deltaY: number): void {
    this.camera.pan(deltaX, deltaY);
  }

  zoomCamera(delta: number): void {
    this.camera.zoomBy(delta);
  }

  setModel(model: WorldViewModel): void {
    this.currentModel = model;
  }

  spawnGiftFx(tileX: number, tileY: number): void {
    const sprite = new Sprite(this.assets.textures.fx_gift_beam_large_01);
    sprite.anchor.set(0.5, 0.5);
    sprite.alpha = 0.86;
    this.fxLayer.addChild(sprite);
    const { x, y } = this.camera.project(tileX + 0.5, tileY + 0.2, 1.2);
    sprite.position.set(x, y);
    sprite.scale.set(0.35);
    this.fxSprites.push({
      sprite,
      bornAt: performance.now(),
      duration: 1400,
      pulse: 1,
    });
  }

  update(): void {
    const now = performance.now();
    const deltaSeconds = Math.max(0.001, (now - this.lastFrameAt) / 1000);
    this.lastFrameAt = now;
    this.fps = this.fps * 0.9 + (1 / deltaSeconds) * 0.1;

    const model = this.currentModel;
    if (!model) {
      return;
    }

    const cameraState = this.camera.getState();
    const screenBounds = {
      minX: -256,
      maxX: cameraState.viewportWidth + 256,
      minY: -256,
      maxY: cameraState.viewportHeight + 256,
    };

    this.renderTiles(model, screenBounds);
    this.renderDecorations(model, screenBounds);
    this.renderNpcs(model, screenBounds);
    this.renderResourceGrants(model, screenBounds);
    this.renderFx(now, screenBounds);
    this.renderNameplates(model, screenBounds);
    this.renderBackground(model, now);
  }

  private renderBackground(model: WorldViewModel, now: number): void {
    this.backgroundBackdrop.clear();
    this.backgroundBackdrop.rect(0, 0, this.app.renderer.width, this.app.renderer.height);
    this.backgroundBackdrop.fill({ color: 0x120f0b });

    this.backgroundSun.clear();
    const sunX = this.app.renderer.width * 0.58;
    const sunY = this.app.renderer.height * 0.18;
    const pulse = 0.5 + Math.sin(now / 4000) * 0.05;
    const halo = this.backgroundSun.circle(sunX, sunY, 280);
    halo.fill({ color: 0x8f5c28, alpha: 0.06 + pulse * 0.02 });
    this.backgroundSun.circle(sunX, sunY, 128);
    this.backgroundSun.fill({ color: 0xe2b04d, alpha: 0.08 });

    this.backgroundHaze.clear();
    this.backgroundHaze.circle(this.app.renderer.width * 0.52, this.app.renderer.height * 0.3, 360);
    this.backgroundHaze.fill({ color: 0x1f1710, alpha: 0.26 });

    this.backgroundRidges.clear();
    this.backgroundRidges.beginPath();
    this.backgroundRidges.moveTo(0, this.app.renderer.height * 0.56);
    this.backgroundRidges.lineTo(this.app.renderer.width * 0.18, this.app.renderer.height * 0.47);
    this.backgroundRidges.lineTo(this.app.renderer.width * 0.36, this.app.renderer.height * 0.54);
    this.backgroundRidges.lineTo(this.app.renderer.width * 0.58, this.app.renderer.height * 0.43);
    this.backgroundRidges.lineTo(this.app.renderer.width * 0.78, this.app.renderer.height * 0.5);
    this.backgroundRidges.lineTo(this.app.renderer.width, this.app.renderer.height * 0.44);
    this.backgroundRidges.lineTo(this.app.renderer.width, this.app.renderer.height);
    this.backgroundRidges.lineTo(0, this.app.renderer.height);
    this.backgroundRidges.closePath();
    this.backgroundRidges.fill({ color: 0x221710, alpha: 0.48 });

    this.backgroundDust.clear();
    const dustPulse = 0.08 + Math.sin(now / 1800) * 0.02;
    this.backgroundDust.rect(0, 0, this.app.renderer.width, this.app.renderer.height);
    this.backgroundDust.fill({ color: 0x8b6a34, alpha: dustPulse });

    this.backgroundVignette.clear();
    this.backgroundVignette.rect(0, 0, this.app.renderer.width, this.app.renderer.height);
    this.backgroundVignette.fill({ color: 0x000000, alpha: 0.14 });

    void model;
  }

  private renderTiles(model: WorldViewModel, screenBounds: { minX: number; maxX: number; minY: number; maxY: number }): void {
    const aliveKeys = new Set<string>();

    for (const tile of model.tiles) {
      const key = `tile:${tile.id}`;
      aliveKeys.add(key);
      const entry = ensureSpriteMapEntry(
        this.tileSprites,
        'tile',
        tile.id,
        this.assets.textures[tile.textureKey as keyof GameAssets['textures']],
        this.tileLayer,
        1,
      );
      entry.sprite.anchor.set(0.5, 0.5);
      const { x, y } = this.camera.project(tile.x + 0.5, tile.y + 0.5, 0);
      entry.sprite.position.set(x, y);
      entry.sprite.tint = tile.tint;
      entry.sprite.visible = x >= screenBounds.minX && x <= screenBounds.maxX && y >= screenBounds.minY && y <= screenBounds.maxY;
      entry.sprite.zIndex = tile.sortY;
    }

    pruneMapEntries(this.tileSprites, aliveKeys);
  }

  private renderDecorations(model: WorldViewModel, screenBounds: { minX: number; maxX: number; minY: number; maxY: number }): void {
    const aliveKeys = new Set<string>();

    for (const decoration of model.decorations) {
      const key = `decoration:${decoration.id}`;
      aliveKeys.add(key);
      const texture =
        decoration.kind === 'vegetation'
          ? this.assets.textures.veg_dead_tree_01
          : decoration.kind === 'prop'
            ? this.assets.textures.prop_ruin_wall_01
            : decoration.kind === 'animal'
              ? this.assets.textures.animal_rat_idle_SE_01
              : this.assets.textures.beast_hound_idle_SW_01;
      const parent =
        decoration.kind === 'vegetation'
          ? this.vegetationLayer
          : decoration.kind === 'prop'
            ? this.propLayer
            : this.beastLayer;
      const entry = ensureSpriteMapEntry(this.decorationSprites, decoration.kind, decoration.id, texture, parent, decoration.scale);
      const { x, y } = this.camera.project(decoration.x, decoration.y, decoration.kind === 'beast' ? 0.4 : 0);
      entry.sprite.position.set(x, y);
      entry.sprite.scale.set(decoration.scale);
      entry.sprite.alpha = decoration.alpha;
      entry.sprite.tint = decoration.tint;
      entry.sprite.visible = x >= screenBounds.minX && x <= screenBounds.maxX && y >= screenBounds.minY && y <= screenBounds.maxY;
      entry.sprite.zIndex = decoration.sortY;
    }

    pruneMapEntries(this.decorationSprites, aliveKeys);
  }

  private renderNpcs(model: WorldViewModel, screenBounds: { minX: number; maxX: number; minY: number; maxY: number }): void {
    const aliveKeys = new Set<string>();

    for (const npc of model.npcs) {
      const key = `npc:${npc.id}`;
      aliveKeys.add(key);
      const entry = ensureNpcRenderEntry(this.npcSprites, npc.id, this.npcLayer, this.assets);
      const profile = NPC_RENDER_PROFILES[npc.morphKey];
      const bodyTextureKey = getNpcBodyTextureKey(npc.morphKey);
      const headTextureKey = getNpcHeadTextureKey(npc.headKey);
      const accessoryTextureKey = getNpcAccessoryTextureKey(npc.accessoryKey);
      const { x, y } = this.camera.project(npc.x, npc.y, npc.status === 'dead' ? -0.08 : 0);
      const walkBob = npc.status === 'dead' ? 0 : Math.sin((npc.walkPhase + performance.now() / 260) * 0.018) * 4;
      const visible = x >= screenBounds.minX && x <= screenBounds.maxX && y >= screenBounds.minY && y <= screenBounds.maxY;

      entry.container.position.set(x, y + walkBob);
      entry.container.visible = visible;
      entry.container.zIndex = npc.sortY;
      entry.container.alpha = npc.status === 'dead' ? 0.72 : 1;

      if (entry.bodyTextureKey !== bodyTextureKey) {
        entry.body.texture = this.assets.textures[bodyTextureKey];
        entry.bodyTextureKey = bodyTextureKey;
      }
      if (entry.headTextureKey !== headTextureKey) {
        entry.head.texture = this.assets.textures[headTextureKey];
        entry.headTextureKey = headTextureKey;
      }
      if (entry.accessoryTextureKey !== (accessoryTextureKey ?? '')) {
        if (accessoryTextureKey) {
          entry.accessory.texture = this.assets.textures[accessoryTextureKey];
          entry.accessory.visible = true;
          entry.accessoryTextureKey = accessoryTextureKey;
        } else {
          entry.accessory.visible = false;
          entry.accessoryTextureKey = '';
        }
      } else if (accessoryTextureKey) {
        entry.accessory.visible = true;
      }

      entry.shadow.position.set(0, profile.shadowOffsetY);
      entry.shadow.scale.set(profile.shadowScaleX, profile.shadowScaleY);
      entry.shadow.alpha = npc.status === 'dead' ? 0.22 : 0.4;
      entry.shadow.tint = 0x000000;

      entry.body.position.set(0, 0);
      entry.body.scale.set(profile.bodyScaleX, profile.bodyScaleY);
      entry.body.tint = npc.bodyTint;
      entry.body.rotation = npc.status === 'dead' ? -0.11 : npc.hp <= 24 ? -0.04 : 0;
      entry.body.alpha = npc.status === 'dead' ? 0.78 : npc.hp <= 24 ? 0.92 : 1;

      entry.head.position.set(profile.headOffsetX, profile.headOffsetY);
      entry.head.scale.set(profile.headScaleX, profile.headScaleY);
      entry.head.tint = npc.bodyTint;
      entry.head.rotation = npc.status === 'dead' ? -0.06 : npc.hp <= 24 ? -0.02 : 0;
      entry.head.alpha = npc.status === 'dead' ? 0.82 : 1;

      entry.accessory.position.set(profile.accessoryOffsetX, profile.accessoryOffsetY);
      entry.accessory.scale.set(profile.accessoryScaleX, profile.accessoryScaleY);
      entry.accessory.tint = npc.accentTint;
      entry.accessory.rotation = npc.status === 'dead' ? -0.04 : 0;
      entry.accessory.alpha = npc.status === 'dead' ? 0.72 : 0.96;
      entry.accessory.zIndex = accessoryTextureKey === 'npc_accessory_backpack_01' ? 1 : 2.5;

      entry.container.sortChildren();
    }

    pruneNpcEntries(this.npcSprites, aliveKeys);
  }

  private renderResourceGrants(model: WorldViewModel, screenBounds: { minX: number; maxX: number; minY: number; maxY: number }): void {
    const aliveKeys = new Set<string>();

    for (const grant of model.resourceGrants) {
      const key = `grant:${grant.id}`;
      aliveKeys.add(key);
      const entry = ensureSpriteMapEntry(
        this.grantSprites,
        'grant',
        grant.id,
        this.assets.textures.item_supply_crate_01,
        this.fxLayer,
        0.55,
      );
      const { x, y } = this.camera.project(grant.x, grant.y, 0.05);
      entry.sprite.position.set(x, y);
      entry.sprite.scale.set(grant.status === 'claimed' ? 0.45 : 0.55);
      entry.sprite.tint = grant.tint;
      entry.sprite.visible = x >= screenBounds.minX && x <= screenBounds.maxX && y >= screenBounds.minY && y <= screenBounds.maxY;
      entry.sprite.zIndex = grant.sortY;
    }

    pruneMapEntries(this.grantSprites, aliveKeys);
  }

  private renderFx(now: number, screenBounds: { minX: number; maxX: number; minY: number; maxY: number }): void {
    for (const fx of this.fxSprites) {
      const age = now - fx.bornAt;
      const progress = clamp(age / fx.duration, 0, 1);
      fx.sprite.alpha = 0.86 * (1 - progress);
      fx.sprite.scale.set(0.35 + progress * 0.75 * fx.pulse);
      fx.sprite.visible = fx.sprite.x >= screenBounds.minX && fx.sprite.x <= screenBounds.maxX && fx.sprite.y >= screenBounds.minY && fx.sprite.y <= screenBounds.maxY;
      if (progress >= 1) {
        fx.sprite.destroy();
      }
    }
    this.fxSprites.splice(0, this.fxSprites.length, ...this.fxSprites.filter((fx) => now - fx.bornAt < fx.duration));
  }

  private renderNameplates(model: WorldViewModel, screenBounds: { minX: number; maxX: number; minY: number; maxY: number }): void {
    const allowed = new Set<string>();
    const compactMode = model.mode === 'stress';

    for (const npc of model.npcs) {
      const show =
        npc.labelLevel === 'always' ||
        npc.labelLevel === 'critical' ||
        npc.labelLevel === 'selected' ||
        (model.focusNpcId !== null && npc.id === model.focusNpcId);

      if (!show) {
        continue;
      }

      allowed.add(npc.id);
      const entry = this.nameplates.get(npc.id) ?? createNameplate(this.nameplateLayer, this.assets.textures.ui_nameplate_gold_01);
      this.nameplates.set(npc.id, entry);
      const { x, y } = this.camera.project(npc.x, npc.y, npc.status === 'dead' ? -0.08 : 0.04);

      entry.sprite.visible = true;
      entry.sprite.scale.set(compactMode ? 0.42 : 1);
      entry.sprite.alpha = compactMode ? 0.58 : 0.85;
      entry.sprite.position.set(x, y - (compactMode ? 20 : 38));
      entry.label.text = npc.name;
      entry.label.visible = true;
      entry.label.position.set(x, y - (compactMode ? 40 : 76));

      if (compactMode) {
        entry.value.visible = false;
        entry.statusTag.visible = true;
        entry.statusTag.text = npc.status === 'dead' ? '死亡' : npc.hp <= 24 ? '瀕死' : npc.water <= 18 || npc.food <= 18 ? '危険' : '注目中';
        entry.statusTag.position.set(x, y - 58);
        entry.barBg.visible = false;
        entry.hpBar.visible = false;
        entry.waterBar.visible = false;
      } else {
        entry.value.text = `${npc.currentActionLabel}  HP ${formatNumber(Math.round(npc.hp))}  水 ${formatNumber(Math.round(npc.water))}  食 ${formatNumber(Math.round(npc.food))}`;
        entry.value.visible = true;
        entry.value.position.set(x, y - 50);
        entry.statusTag.text = npc.status === 'dead' ? '死亡' : npc.hp <= 24 ? '瀕死' : npc.water <= 18 || npc.food <= 18 ? '危険' : '注目中';
        entry.statusTag.visible = true;
        entry.statusTag.position.set(x, y - 94);

        const hpWidth = clamp(npc.hp / 100, 0, 1) * 150;
        const waterWidth = clamp(npc.water / 100, 0, 1) * 150;
        entry.barBg.visible = true;
        entry.barBg.clear();
        entry.barBg.roundRect(x - 78, y - 26, 156, 14, 7);
        entry.barBg.fill({ color: 0x110d09, alpha: 0.9 });
        entry.hpBar.visible = true;
        updateProgressBar(entry.hpBar, hpWidth, npc.status === 'dead' ? 0x6c6c6c : npc.hp <= 24 ? 0xef675d : 0x86c86b);
        entry.hpBar.position.set(x - 76, y - 24);
        entry.waterBar.visible = true;
        updateProgressBar(entry.waterBar, waterWidth, 0x7dc0ef, 0.85);
        entry.waterBar.position.set(x - 76, y - 17);
      }
    }

    for (const [npcId, entry] of this.nameplates) {
      if (allowed.has(npcId)) {
        continue;
      }
      entry.sprite.visible = false;
      entry.label.visible = false;
      entry.value.visible = false;
      entry.statusTag.visible = false;
      entry.barBg.visible = false;
      entry.hpBar.visible = false;
      entry.waterBar.visible = false;
    }
  }

  getWorldAnchor(model: WorldViewModel): { x: number; y: number } {
    return {
      x: model.width * 64,
      y: model.height * 32,
    };
  }

  getCurrentCameraState(): CameraState {
    return this.camera.getState();
  }

  syncHudLayerVisibility(debugVisible: boolean): void {
    this.debugVisible = debugVisible;
  }
}
