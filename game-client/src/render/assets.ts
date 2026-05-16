import { Texture } from 'pixi.js';

type CanvasTextureKey =
  | 'tile_ground_dry_01'
  | 'tile_ground_crack_01'
  | 'tile_ground_scrub_01'
  | 'tile_ground_rocky_01'
  | 'tile_water_01'
  | 'tile_ruins_01'
  | 'npc_shadow_01'
  | 'npc_body_slim_01'
  | 'npc_body_average_01'
  | 'npc_body_tall_01'
  | 'npc_body_bulky_01'
  | 'npc_body_ragged_01'
  | 'npc_head_narrow_01'
  | 'npc_head_round_01'
  | 'npc_head_square_01'
  | 'npc_head_gaunt_01'
  | 'npc_accessory_hood_01'
  | 'npc_accessory_backpack_01'
  | 'npc_accessory_scarf_01'
  | 'npc_accessory_bundle_01'
  | 'npc_accessory_wrap_01'
  | 'npc_body_alive_01'
  | 'npc_body_dead_01'
  | 'npc_body_warning_01'
  | 'prop_ruin_wall_01'
  | 'veg_dead_tree_01'
  | 'animal_rat_idle_SE_01'
  | 'beast_hound_idle_SW_01'
  | 'item_supply_crate_01'
  | 'fx_gift_beam_large_01'
  | 'ui_nameplate_gold_01';

export interface GameAssets {
  textures: Record<CanvasTextureKey, Texture>;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawDiamondTexture(fill: string, stroke: string, accent?: string): HTMLCanvasElement {
  const canvas = createCanvas(128, 64);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D context unavailable');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  const shadow = context.createLinearGradient(0, 12, 0, 64);
  shadow.addColorStop(0, 'rgba(0, 0, 0, 0.06)');
  shadow.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
  context.beginPath();
  context.moveTo(66, 2);
  context.lineTo(126, 30);
  context.lineTo(64, 62);
  context.lineTo(2, 30);
  context.closePath();
  context.fillStyle = shadow;
  context.fill();

  const gradient = context.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, fill);
  gradient.addColorStop(0.4, fill);
  gradient.addColorStop(1, 'rgba(32, 20, 12, 0.18)');

  context.beginPath();
  context.moveTo(64, 0);
  context.lineTo(128, 32);
  context.lineTo(64, 64);
  context.lineTo(0, 32);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = stroke;
  context.stroke();

  context.beginPath();
  context.moveTo(16, 27);
  context.lineTo(64, 8);
  context.lineTo(112, 27);
  context.lineTo(64, 42);
  context.closePath();
  context.fillStyle = 'rgba(255, 255, 255, 0.08)';
  context.fill();

  context.beginPath();
  context.moveTo(26, 34);
  context.lineTo(64, 18);
  context.lineTo(102, 34);
  context.lineTo(64, 50);
  context.closePath();
  context.fillStyle = 'rgba(0, 0, 0, 0.06)';
  context.fill();

  for (let index = 0; index < 10; index += 1) {
    const speckX = 14 + index * 10;
    const speckY = 18 + (index % 3) * 7;
    context.fillStyle = index % 2 === 0 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)';
    context.fillRect(speckX, speckY, 2, 2);
  }

  if (accent) {
    context.beginPath();
    context.moveTo(18, 30);
    context.lineTo(58, 15);
    context.lineTo(108, 31);
    context.lineTo(70, 46);
    context.closePath();
    context.globalAlpha = 0.18;
    context.fillStyle = accent;
    context.fill();
    context.globalAlpha = 1;
  }

  return canvas;
}

type NpcMorphKey = 'slim' | 'average' | 'tall' | 'bulky' | 'ragged';
type NpcHeadKey = 'narrow' | 'round' | 'square' | 'gaunt';
type NpcAccessoryKey = 'none' | 'hood' | 'backpack' | 'scarf' | 'bundle' | 'wrap';

function drawNpcShadow(): HTMLCanvasElement {
  const canvas = createCanvas(128, 48);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D context unavailable');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = context.createRadialGradient(64, 24, 6, 64, 24, 52);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
  gradient.addColorStop(0.45, 'rgba(0, 0, 0, 0.24)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.ellipse(64, 24, 50, 12, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = 'rgba(0, 0, 0, 0.16)';
  context.beginPath();
  context.ellipse(64, 24, 34, 7, 0, 0, Math.PI * 2);
  context.fill();
  return canvas;
}

function drawNpcBodyVariant(morphKey: NpcMorphKey): HTMLCanvasElement {
  const canvas = createCanvas(96, 132);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D context unavailable');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(0, 0, 0, 0.26)';
  context.beginPath();
  context.ellipse(48, 118, 22, 8, 0, 0, Math.PI * 2);
  context.fill();

  const metrics: Record<NpcMorphKey, {
    shoulderWidth: number;
    torsoWidth: number;
    torsoHeight: number;
    hipWidth: number;
    legWidth: number;
    legHeight: number;
    legGap: number;
    shoulderYOffset: number;
    shoulderTilt: number;
    leftLegOffset: number;
    rightLegOffset: number;
  }> = {
    slim: {
      shoulderWidth: 13,
      torsoWidth: 18,
      torsoHeight: 34,
      hipWidth: 16,
      legWidth: 6,
      legHeight: 31,
      legGap: 7,
      shoulderYOffset: 0,
      shoulderTilt: -1,
      leftLegOffset: -7,
      rightLegOffset: 7,
    },
    average: {
      shoulderWidth: 16,
      torsoWidth: 22,
      torsoHeight: 35,
      hipWidth: 20,
      legWidth: 7,
      legHeight: 30,
      legGap: 8,
      shoulderYOffset: 0,
      shoulderTilt: 0,
      leftLegOffset: -8,
      rightLegOffset: 8,
    },
    tall: {
      shoulderWidth: 15,
      torsoWidth: 20,
      torsoHeight: 42,
      hipWidth: 18,
      legWidth: 6,
      legHeight: 35,
      legGap: 7,
      shoulderYOffset: -1,
      shoulderTilt: 0,
      leftLegOffset: -7,
      rightLegOffset: 7,
    },
    bulky: {
      shoulderWidth: 22,
      torsoWidth: 28,
      torsoHeight: 36,
      hipWidth: 24,
      legWidth: 8,
      legHeight: 28,
      legGap: 10,
      shoulderYOffset: 1,
      shoulderTilt: 1,
      leftLegOffset: -10,
      rightLegOffset: 10,
    },
    ragged: {
      shoulderWidth: 16,
      torsoWidth: 22,
      torsoHeight: 33,
      hipWidth: 19,
      legWidth: 7,
      legHeight: 29,
      legGap: 8,
      shoulderYOffset: 2,
      shoulderTilt: -2,
      leftLegOffset: -8,
      rightLegOffset: 9,
    },
  };

  const metric = metrics[morphKey];
  const bodyStroke = 'rgba(32, 22, 14, 0.9)';
  const bodyFill = '#d2b08a';
  const highlightFill = 'rgba(255, 255, 255, 0.12)';
  const shadowFill = 'rgba(0, 0, 0, 0.16)';

  context.save();
  context.translate(48, 30);
  context.rotate(metric.shoulderTilt * 0.01);
  context.translate(-48, -30);

  const shoulderTop = 27 + metric.shoulderYOffset;
  const torsoTop = shoulderTop + 8;
  const torsoLeft = 48 - metric.torsoWidth / 2;
  const hipLeft = 48 - metric.hipWidth / 2;
  const legTop = torsoTop + metric.torsoHeight - 2;

  const bodyGradient = context.createLinearGradient(36, 22, 60, 108);
  bodyGradient.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
  bodyGradient.addColorStop(0.14, bodyFill);
  bodyGradient.addColorStop(0.72, 'rgba(102, 78, 51, 0.16)');
  bodyGradient.addColorStop(1, 'rgba(0, 0, 0, 0.22)');

  context.fillStyle = bodyGradient;
  context.strokeStyle = bodyStroke;
  context.lineWidth = 4;

  context.beginPath();
  context.ellipse(48, shoulderTop, metric.shoulderWidth, 10, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.beginPath();
  context.roundRect(torsoLeft, torsoTop, metric.torsoWidth, metric.torsoHeight, Math.min(14, metric.torsoWidth / 2));
  context.fill();
  context.stroke();

  context.beginPath();
  context.roundRect(hipLeft, torsoTop + metric.torsoHeight - 6, metric.hipWidth, 18, 9);
  context.fillStyle = shadowFill;
  context.fill();
  context.stroke();

  context.beginPath();
  context.roundRect(48 - metric.legGap - metric.legWidth, legTop, metric.legWidth, metric.legHeight, 4);
  context.fillStyle = bodyGradient;
  context.fill();
  context.stroke();

  context.beginPath();
  context.roundRect(48 + metric.legGap, legTop, metric.legWidth, metric.legHeight, 4);
  context.fill();
  context.stroke();

  context.beginPath();
  context.roundRect(48 - metric.legGap - metric.legWidth - 4, torsoTop + 10, 7, 28, 4);
  context.fillStyle = 'rgba(255, 255, 255, 0.08)';
  context.fill();

  context.beginPath();
  context.roundRect(48 + metric.legGap - 3, torsoTop + 11, 7, 27, 4);
  context.fillStyle = 'rgba(0, 0, 0, 0.12)';
  context.fill();

  if (morphKey === 'ragged') {
    context.fillStyle = 'rgba(64, 40, 25, 0.16)';
    context.beginPath();
    context.moveTo(32, torsoTop + 5);
    context.lineTo(60, torsoTop + 10);
    context.lineTo(55, torsoTop + 28);
    context.lineTo(28, torsoTop + 24);
    context.closePath();
    context.fill();

    context.fillStyle = 'rgba(255, 245, 220, 0.06)';
    context.beginPath();
    context.moveTo(44, torsoTop + 16);
    context.lineTo(56, torsoTop + 20);
    context.lineTo(51, torsoTop + 32);
    context.lineTo(40, torsoTop + 29);
    context.closePath();
    context.fill();
  } else {
    context.fillStyle = highlightFill;
    context.beginPath();
    context.roundRect(torsoLeft + 3, torsoTop + 4, Math.max(6, metric.torsoWidth * 0.34), metric.torsoHeight - 10, 5);
    context.fill();
  }

  context.fillStyle = 'rgba(255, 255, 255, 0.07)';
  context.beginPath();
  context.roundRect(hipLeft + 1, torsoTop + metric.torsoHeight - 4, Math.max(4, metric.hipWidth * 0.48), 14, 5);
  context.fill();

  context.restore();
  return canvas;
}

function drawNpcHeadVariant(headKey: NpcHeadKey): HTMLCanvasElement {
  const canvas = createCanvas(72, 80);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D context unavailable');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);

  const fill = '#dcc19d';
  const stroke = 'rgba(38, 26, 18, 0.92)';
  const shadow = 'rgba(0, 0, 0, 0.15)';

  const faceGradient = context.createRadialGradient(34, 20, 4, 36, 28, 28);
  faceGradient.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
  faceGradient.addColorStop(0.24, fill);
  faceGradient.addColorStop(1, 'rgba(84, 57, 38, 0.18)');

  context.fillStyle = shadow;
  context.beginPath();
  context.ellipse(36, 68, 17, 5, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = faceGradient;
  context.strokeStyle = stroke;
  context.lineWidth = 4;

  if (headKey === 'narrow') {
    context.beginPath();
    context.ellipse(36, 26, 14, 20, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.beginPath();
    context.roundRect(24, 39, 24, 12, 6);
    context.fillStyle = 'rgba(206, 173, 136, 0.8)';
    context.fill();
  } else if (headKey === 'round') {
    context.beginPath();
    context.ellipse(36, 26, 17, 17, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.beginPath();
    context.ellipse(36, 21, 10, 7, 0, 0, Math.PI * 2);
    context.fillStyle = 'rgba(255, 255, 255, 0.08)';
    context.fill();
  } else if (headKey === 'square') {
    context.beginPath();
    context.roundRect(18, 10, 36, 34, 10);
    context.fill();
    context.stroke();
    context.beginPath();
    context.roundRect(20, 36, 32, 10, 5);
    context.fillStyle = 'rgba(206, 173, 136, 0.78)';
    context.fill();
  } else {
    context.beginPath();
    context.roundRect(22, 8, 28, 38, 12);
    context.fill();
    context.stroke();
    context.beginPath();
    context.roundRect(26, 32, 20, 14, 6);
    context.fillStyle = 'rgba(86, 61, 44, 0.2)';
    context.fill();
    context.beginPath();
    context.ellipse(28, 27, 4, 10, -0.2, 0, Math.PI * 2);
    context.ellipse(44, 27, 4, 10, 0.2, 0, Math.PI * 2);
    context.fillStyle = 'rgba(69, 45, 27, 0.18)';
    context.fill();
  }

  context.fillStyle = 'rgba(25, 16, 10, 0.88)';
  context.beginPath();
  context.arc(29, 24, 2.2, 0, Math.PI * 2);
  context.arc(43, 24, 2.2, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = 'rgba(25, 16, 10, 0.5)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(30, 31);
  context.lineTo(42, 31);
  context.stroke();

  context.fillStyle = 'rgba(255, 255, 255, 0.08)';
  context.beginPath();
  context.roundRect(24, 14, 8, 6, 3);
  context.fill();

  return canvas;
}

function drawNpcAccessoryVariant(accessoryKey: NpcAccessoryKey): HTMLCanvasElement {
  const canvas = createCanvas(104, 96);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D context unavailable');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);

  const fill = '#cfaa71';
  const stroke = 'rgba(39, 27, 18, 0.9)';
  const dark = 'rgba(52, 36, 24, 0.18)';
  const light = 'rgba(255, 255, 255, 0.1)';

  context.fillStyle = fill;
  context.strokeStyle = stroke;
  context.lineWidth = 4;

  if (accessoryKey === 'hood') {
    context.beginPath();
    context.moveTo(18, 74);
    context.quadraticCurveTo(20, 36, 40, 24);
    context.quadraticCurveTo(52, 16, 64, 16);
    context.quadraticCurveTo(82, 18, 88, 46);
    context.quadraticCurveTo(90, 68, 84, 78);
    context.quadraticCurveTo(58, 88, 26, 82);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = 'rgba(0, 0, 0, 0.16)';
    context.beginPath();
    context.ellipse(52, 42, 20, 18, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(255, 255, 255, 0.08)';
    context.beginPath();
    context.roundRect(28, 54, 46, 10, 5);
    context.fill();
    context.fillStyle = light;
    context.beginPath();
    context.roundRect(38, 26, 16, 30, 8);
    context.fill();
  } else if (accessoryKey === 'backpack') {
    context.beginPath();
    context.roundRect(30, 20, 40, 50, 12);
    context.fill();
    context.stroke();
    context.beginPath();
    context.roundRect(38, 16, 24, 12, 6);
    context.fillStyle = 'rgba(255,255,255,0.1)';
    context.fill();
    context.beginPath();
    context.roundRect(24, 28, 8, 32, 4);
    context.fillStyle = dark;
    context.fill();
    context.beginPath();
    context.roundRect(72, 28, 8, 32, 4);
    context.fill();
    context.beginPath();
    context.roundRect(35, 36, 30, 16, 6);
    context.fillStyle = 'rgba(0,0,0,0.14)';
    context.fill();
  } else if (accessoryKey === 'scarf') {
    context.beginPath();
    context.roundRect(18, 36, 68, 18, 9);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(58, 48);
    context.lineTo(80, 58);
    context.lineTo(74, 70);
    context.lineTo(54, 58);
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    context.stroke();
    context.beginPath();
    context.roundRect(28, 52, 18, 22, 8);
    context.fillStyle = 'rgba(255,255,255,0.08)';
    context.fill();
    context.beginPath();
    context.roundRect(38, 38, 20, 12, 6);
    context.fillStyle = light;
    context.fill();
  } else if (accessoryKey === 'bundle') {
    context.beginPath();
    context.moveTo(30, 42);
    context.quadraticCurveTo(50, 24, 74, 40);
    context.quadraticCurveTo(82, 56, 70, 72);
    context.quadraticCurveTo(48, 84, 28, 66);
    context.quadraticCurveTo(22, 52, 30, 42);
    context.closePath();
    context.fill();
    context.stroke();
    context.beginPath();
    context.roundRect(38, 30, 24, 14, 7);
    context.fillStyle = light;
    context.fill();
    context.beginPath();
    context.roundRect(34, 54, 32, 10, 5);
    context.fillStyle = 'rgba(0,0,0,0.16)';
    context.fill();
  } else {
    context.beginPath();
    context.roundRect(24, 24, 56, 36, 14);
    context.fill();
    context.stroke();
    context.beginPath();
    context.roundRect(34, 34, 36, 18, 8);
    context.fillStyle = 'rgba(255,255,255,0.08)';
    context.fill();
    context.beginPath();
    context.roundRect(26, 48, 52, 12, 6);
    context.fillStyle = dark;
    context.fill();
    context.beginPath();
    context.roundRect(20, 28, 12, 30, 5);
    context.fillStyle = 'rgba(255,255,255,0.08)';
    context.fill();
  }

  return canvas;
}

function drawNpcBody(fill: string, stroke: string, eye: string): HTMLCanvasElement {
  const canvas = createCanvas(64, 96);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D context unavailable');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(0, 0, 0, 0.28)';
  context.beginPath();
  context.ellipse(32, 83, 18, 7, 0, 0, Math.PI * 2);
  context.fill();

  const bodyGradient = context.createLinearGradient(16, 26, 48, 72);
  bodyGradient.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
  bodyGradient.addColorStop(0.18, fill);
  bodyGradient.addColorStop(1, 'rgba(0, 0, 0, 0.18)');

  context.beginPath();
  context.roundRect(14, 28, 36, 39, 12);
  context.fillStyle = bodyGradient;
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = stroke;
  context.stroke();

  context.beginPath();
  context.roundRect(18, 31, 8, 30, 5);
  context.fillStyle = 'rgba(255, 255, 255, 0.09)';
  context.fill();

  context.beginPath();
  context.arc(32, 18, 15, 0, Math.PI * 2);
  const headGradient = context.createRadialGradient(28, 14, 4, 32, 18, 16);
  headGradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
  headGradient.addColorStop(0.32, fill);
  headGradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
  context.fillStyle = headGradient;
  context.fill();
  context.stroke();

  context.fillStyle = 'rgba(0,0,0,0.16)';
  context.fillRect(24, 21, 16, 4);

  context.beginPath();
  context.moveTo(16, 40);
  context.lineTo(11, 68);
  context.lineTo(17, 69);
  context.lineTo(23, 43);
  context.closePath();
  context.fillStyle = 'rgba(255,255,255,0.08)';
  context.fill();

  context.beginPath();
  context.moveTo(48, 40);
  context.lineTo(53, 67);
  context.lineTo(47, 69);
  context.lineTo(41, 43);
  context.closePath();
  context.fillStyle = 'rgba(0,0,0,0.14)';
  context.fill();

  context.fillStyle = 'rgba(255,255,255,0.06)';
  context.fillRect(16, 45, 28, 5);

  context.beginPath();
  context.moveTo(20, 36);
  context.lineTo(10, 52);
  context.lineTo(15, 56);
  context.lineTo(24, 40);
  context.closePath();
  context.fillStyle = 'rgba(255,255,255,0.1)';
  context.fill();

  context.beginPath();
  context.moveTo(44, 36);
  context.lineTo(54, 52);
  context.lineTo(49, 56);
  context.lineTo(40, 40);
  context.closePath();
  context.fillStyle = 'rgba(0,0,0,0.14)';
  context.fill();

  context.beginPath();
  context.arc(26, 16, 2.5, 0, Math.PI * 2);
  context.arc(38, 16, 2.5, 0, Math.PI * 2);
  context.fillStyle = eye;
  context.fill();

  return canvas;
}

function drawPropWall(): HTMLCanvasElement {
  const canvas = createCanvas(128, 192);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D context unavailable');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  const wallGradient = context.createLinearGradient(18, 72, 110, 132);
  wallGradient.addColorStop(0, '#7a6247');
  wallGradient.addColorStop(0.48, '#4f4133');
  wallGradient.addColorStop(1, '#2d241d');
  context.fillStyle = wallGradient;
  context.fillRect(18, 72, 92, 54);
  context.fillStyle = '#6c5a46';
  context.fillRect(18, 66, 92, 10);
  context.fillStyle = '#362a20';
  context.fillRect(20, 78, 88, 3);
  context.fillStyle = 'rgba(255,255,255,0.08)';
  context.fillRect(28, 88, 16, 24);
  context.fillRect(52, 88, 16, 24);
  context.fillRect(76, 88, 16, 24);
  context.strokeStyle = 'rgba(255, 214, 140, 0.16)';
  context.lineWidth = 2;
  context.strokeRect(18, 72, 92, 54);
  context.fillStyle = 'rgba(0, 0, 0, 0.12)';
  context.fillRect(60, 96, 24, 30);
  context.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  context.lineWidth = 2;
  context.strokeRect(22, 80, 84, 42);
  return canvas;
}

function drawTree(): HTMLCanvasElement {
  const canvas = createCanvas(128, 192);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D context unavailable');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  const trunkGradient = context.createLinearGradient(56, 84, 72, 162);
  trunkGradient.addColorStop(0, '#71513a');
  trunkGradient.addColorStop(1, '#342419');
  context.fillStyle = trunkGradient;
  context.fillRect(56, 84, 16, 78);
  const crownGradient = context.createRadialGradient(64, 64, 12, 64, 66, 44);
  crownGradient.addColorStop(0, 'rgba(255, 217, 151, 0.12)');
  crownGradient.addColorStop(0.28, '#907146');
  crownGradient.addColorStop(1, '#473623');
  context.fillStyle = crownGradient;
  context.beginPath();
  context.ellipse(64, 66, 40, 34, 0.1, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = 'rgba(255, 226, 177, 0.12)';
  context.lineWidth = 2;
  context.stroke();
  context.strokeStyle = 'rgba(48, 32, 18, 0.55)';
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(64, 92);
  context.lineTo(58, 54);
  context.lineTo(49, 38);
  context.moveTo(64, 100);
  context.lineTo(72, 58);
  context.lineTo(83, 42);
  context.moveTo(63, 76);
  context.lineTo(46, 68);
  context.moveTo(66, 72);
  context.lineTo(82, 65);
  context.stroke();
  context.fillStyle = 'rgba(20, 14, 10, 0.2)';
  context.beginPath();
  context.ellipse(64, 128, 34, 11, 0, 0, Math.PI * 2);
  context.fill();
  return canvas;
}

function drawAnimal(fill: string): HTMLCanvasElement {
  const canvas = createCanvas(64, 64);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D context unavailable');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  const bodyGradient = context.createLinearGradient(16, 26, 48, 46);
  bodyGradient.addColorStop(0, 'rgba(255,255,255,0.08)');
  bodyGradient.addColorStop(0.2, fill);
  bodyGradient.addColorStop(1, 'rgba(0,0,0,0.16)');
  context.fillStyle = bodyGradient;
  context.beginPath();
  context.ellipse(32, 35, 16, 10, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = 'rgba(0,0,0,0.18)';
  context.beginPath();
  context.arc(20, 29, 4, 0, Math.PI * 2);
  context.arc(44, 29, 4, 0, Math.PI * 2);
  context.fill();
  context.fillRect(26, 43, 3, 10);
  context.fillRect(36, 43, 3, 10);
  context.fillStyle = 'rgba(255,255,255,0.08)';
  context.fillRect(24, 31, 14, 4);
  return canvas;
}

function drawCrate(): HTMLCanvasElement {
  const canvas = createCanvas(96, 96);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D context unavailable');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  const crateGradient = context.createLinearGradient(20, 24, 76, 70);
  crateGradient.addColorStop(0, '#d5aa4f');
  crateGradient.addColorStop(0.25, '#986f2d');
  crateGradient.addColorStop(1, '#4f3817');
  context.fillStyle = crateGradient;
  context.fillRect(20, 24, 56, 46);
  context.strokeStyle = '#f3cb73';
  context.lineWidth = 4;
  context.strokeRect(20, 24, 56, 46);
  context.beginPath();
  context.moveTo(20, 24);
  context.lineTo(76, 70);
  context.moveTo(76, 24);
  context.lineTo(20, 70);
  context.strokeStyle = 'rgba(61, 38, 8, 0.82)';
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(28, 28, 14, 8);
  context.fillStyle = 'rgba(0,0,0,0.18)';
  context.fillRect(24, 56, 40, 8);
  return canvas;
}

function drawGiftBeam(): HTMLCanvasElement {
  const canvas = createCanvas(256, 256);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D context unavailable');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 104);
  gradient.addColorStop(0, 'rgba(255, 245, 200, 0.92)');
  gradient.addColorStop(0.18, 'rgba(255, 210, 120, 0.7)');
  gradient.addColorStop(0.56, 'rgba(255, 168, 66, 0.24)');
  gradient.addColorStop(1, 'rgba(255, 168, 66, 0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(128, 128, 104, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = 'rgba(255, 238, 170, 0.35)';
  context.lineWidth = 3;
  context.beginPath();
  context.arc(128, 128, 74, 0, Math.PI * 2);
  context.stroke();
  return canvas;
}

function drawNameplate(): HTMLCanvasElement {
  const canvas = createCanvas(320, 96);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D context unavailable');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = context.createLinearGradient(8, 10, 312, 78);
  gradient.addColorStop(0, 'rgba(34, 25, 17, 0.92)');
  gradient.addColorStop(0.4, 'rgba(18, 12, 8, 0.92)');
  gradient.addColorStop(1, 'rgba(18, 12, 8, 0.72)');
  context.fillStyle = gradient;
  context.strokeStyle = 'rgba(226, 176, 77, 0.88)';
  context.lineWidth = 4;
  context.beginPath();
  context.roundRect(8, 10, 304, 68, 20);
  context.fill();
  context.stroke();
  context.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(12, 14, 296, 60, 17);
  context.stroke();
  return canvas;
}

export function createGameAssets(): GameAssets {
  return {
    textures: {
      tile_ground_dry_01: Texture.from(drawDiamondTexture('#5b4a32', 'rgba(226, 176, 77, 0.22)', 'rgba(255,255,255,0.08)')),
      tile_ground_crack_01: Texture.from(drawDiamondTexture('#6a5337', 'rgba(255,255,255,0.12)', 'rgba(255,220,150,0.08)')),
      tile_ground_scrub_01: Texture.from(drawDiamondTexture('#5e5938', 'rgba(134, 200, 107, 0.18)', 'rgba(134,200,107,0.1)')),
      tile_ground_rocky_01: Texture.from(drawDiamondTexture('#65605b', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.06)')),
      tile_water_01: Texture.from(drawDiamondTexture('#436890', 'rgba(125, 192, 239, 0.36)', 'rgba(125,192,239,0.12)')),
      tile_ruins_01: Texture.from(drawDiamondTexture('#5d4a3c', 'rgba(200, 142, 54, 0.32)', 'rgba(255, 224, 145, 0.1)')),
      npc_shadow_01: Texture.from(drawNpcShadow()),
      npc_body_slim_01: Texture.from(drawNpcBodyVariant('slim')),
      npc_body_average_01: Texture.from(drawNpcBodyVariant('average')),
      npc_body_tall_01: Texture.from(drawNpcBodyVariant('tall')),
      npc_body_bulky_01: Texture.from(drawNpcBodyVariant('bulky')),
      npc_body_ragged_01: Texture.from(drawNpcBodyVariant('ragged')),
      npc_head_narrow_01: Texture.from(drawNpcHeadVariant('narrow')),
      npc_head_round_01: Texture.from(drawNpcHeadVariant('round')),
      npc_head_square_01: Texture.from(drawNpcHeadVariant('square')),
      npc_head_gaunt_01: Texture.from(drawNpcHeadVariant('gaunt')),
      npc_accessory_hood_01: Texture.from(drawNpcAccessoryVariant('hood')),
      npc_accessory_backpack_01: Texture.from(drawNpcAccessoryVariant('backpack')),
      npc_accessory_scarf_01: Texture.from(drawNpcAccessoryVariant('scarf')),
      npc_accessory_bundle_01: Texture.from(drawNpcAccessoryVariant('bundle')),
      npc_accessory_wrap_01: Texture.from(drawNpcAccessoryVariant('wrap')),
      npc_body_alive_01: Texture.from(drawNpcBody('#e2c08a', 'rgba(28, 18, 12, 0.8)', '#4c382d')),
      npc_body_dead_01: Texture.from(drawNpcBody('#979797', 'rgba(38, 38, 38, 0.82)', '#4a4a4a')),
      npc_body_warning_01: Texture.from(drawNpcBody('#d8a64f', 'rgba(70, 34, 26, 0.94)', '#802a24')),
      prop_ruin_wall_01: Texture.from(drawPropWall()),
      veg_dead_tree_01: Texture.from(drawTree()),
      animal_rat_idle_SE_01: Texture.from(drawAnimal('#bda47a')),
      beast_hound_idle_SW_01: Texture.from(drawAnimal('#9d4d43')),
      item_supply_crate_01: Texture.from(drawCrate()),
      fx_gift_beam_large_01: Texture.from(drawGiftBeam()),
      ui_nameplate_gold_01: Texture.from(drawNameplate()),
    },
  };
}
