// ポーズ定義から人型シルエットを描画する。SPEC_MODE1.md §4 参照。
//
// 頭を円、胴体と手足をカプセル(丸端の太い線分)として描く。
// 判定は二値マスクの重なり率なので造形の細かさは不要で、
// 「子どもが真似できる明快な形」であることを優先している。

import type { Figure, Limb, PoseTheme } from './poses';
import type { BinaryMask } from '../core/mask';

/** 肩幅を 1.0 としたときの各部位の比率。 */
const PROPORTION = {
  /** 肩幅(この値が長さ・太さの基準になる)。画面高さに対する比率。 */
  shoulderWidth: 0.16,
  headRadius: 0.55,
  neckLength: 0.35,
  torsoLength: 1.15,
  torsoWidth: 0.85,
  armWidth: 0.3,
  legWidth: 0.36,
  hipWidth: 0.6,
} as const;

interface Point {
  x: number;
  y: number;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * 付け根から角度・長さぶん進んだ点を返す。
 * 角度 0 = 真下、正の値 = `outward` の向き(左半身なら左、右半身なら右)へ開く。
 */
function extend(from: Point, angleDeg: number, length: number, outward: -1 | 1): Point {
  const radians = toRadians(angleDeg);
  // canvas は下方向が +y なので、角度0(真下)で +y に進む
  return {
    x: from.x + Math.sin(radians) * length * outward,
    y: from.y + Math.cos(radians) * length,
  };
}

/** 丸端の太い線分(カプセル)を描く。 */
function drawCapsule(ctx: CanvasRenderingContext2D, from: Point, to: Point, width: number): void {
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

/** 肘・膝で1回曲がる手足を描く。 */
function drawLimb(
  ctx: CanvasRenderingContext2D,
  root: Point,
  limb: Limb,
  unit: number,
  width: number,
  outward: -1 | 1,
): void {
  const totalLength = limb.length * unit;
  const bend = limb.bend ?? 0;

  if (bend === 0) {
    drawCapsule(ctx, root, extend(root, limb.angle, totalLength, outward), width);
    return;
  }

  // 曲がる場合は根本側・先端側の2本に分ける
  const joint = extend(root, limb.angle, totalLength * 0.5, outward);
  const tip = extend(joint, limb.angle - bend, totalLength * 0.5, outward);
  drawCapsule(ctx, root, joint, width);
  drawCapsule(ctx, joint, tip, width);
}

/** 人型ひとりぶんを描画する。 */
function drawFigure(
  ctx: CanvasRenderingContext2D,
  figure: Figure,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const scale = figure.scale ?? 1;
  // 肩幅を全ての長さの基準単位にする
  const unit = canvasHeight * PROPORTION.shoulderWidth * scale;

  const groundY = (figure.groundY ?? 0.94) * canvasHeight;
  const centerX = figure.x * canvasWidth;

  // 足元から積み上げて各部位の位置を決める
  const legLength = Math.max(figure.leftLeg.length, figure.rightLeg.length) * unit;
  const hipY = groundY - legLength;
  const shoulderY = hipY - PROPORTION.torsoLength * unit;
  const headCenterY = shoulderY - PROPORTION.neckLength * unit - PROPORTION.headRadius * unit;

  const hip: Point = { x: centerX, y: hipY };
  const shoulder: Point = { x: centerX, y: shoulderY };

  // 胴体
  drawCapsule(ctx, shoulder, hip, PROPORTION.torsoWidth * unit);

  // 頭
  ctx.beginPath();
  ctx.arc(centerX, headCenterY, PROPORTION.headRadius * unit, 0, Math.PI * 2);
  ctx.fill();

  // 腕(肩の左右から)
  const halfShoulder = (PROPORTION.torsoWidth / 2) * unit;
  drawLimb(
    ctx,
    { x: centerX - halfShoulder, y: shoulderY },
    figure.leftArm,
    unit,
    PROPORTION.armWidth * unit,
    -1,
  );
  drawLimb(
    ctx,
    { x: centerX + halfShoulder, y: shoulderY },
    figure.rightArm,
    unit,
    PROPORTION.armWidth * unit,
    1,
  );

  // 脚(腰の左右から)
  const halfHip = (PROPORTION.hipWidth / 2) * unit;
  drawLimb(
    ctx,
    { x: centerX - halfHip, y: hipY },
    figure.leftLeg,
    unit,
    PROPORTION.legWidth * unit,
    -1,
  );
  drawLimb(
    ctx,
    { x: centerX + halfHip, y: hipY },
    figure.rightLeg,
    unit,
    PROPORTION.legWidth * unit,
    1,
  );
}

/**
 * お題を canvas に描画する。呼び出し側で色を決められるよう fillStyle は引数で受ける。
 * 判定用マスクにも表示用シルエットにも同じ描画を使う。
 */
export function drawTheme(
  ctx: CanvasRenderingContext2D,
  theme: PoseTheme,
  width: number,
  height: number,
  color = '#ffffff',
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  for (const figure of theme.figures) {
    drawFigure(ctx, figure, width, height);
  }
  ctx.restore();
}

/**
 * お題を二値マスクとして生成する。判定(SPEC_MODE1.md §3)の T にあたる。
 */
export function renderThemeMask(theme: PoseTheme, width: number, height: number): BinaryMask {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { data: new Uint8Array(width * height), width, height };
  }

  ctx.clearRect(0, 0, width, height);
  drawTheme(ctx, theme, width, height);

  const image = ctx.getImageData(0, 0, width, height);
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 1) {
    // アルファ値だけ見れば十分(描画色は白固定)
    data[i] = image.data[i * 4 + 3]! > 127 ? 1 : 0;
  }

  return { data, width, height };
}
