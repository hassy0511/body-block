// 切り抜きからスプライトと剛体を作る。CLAUDE.md §2.2 のパイプライン後半。
//
//   マスク → 輪郭抽出(ムーア近傍追跡)
//        → 頂点間引き(Douglas-Peucker)
//        → 凸分割(poly-decomp)
//        → Matter.Bodies.fromVertices で剛体化
//
// スプライトは輪郭に白フチを付けてステッカー風にする。
// 見た目が可愛くなるうえ、切り抜きのギザつきを隠す効果もある。

import type { BinaryMask, MaskBlob } from './mask';

export interface Point {
  x: number;
  y: number;
}

/**
 * 二値マスクから輪郭をたどる(ムーア近傍追跡)。
 * 返す点列は時計回り。塊が見つからなければ空配列。
 */
export function traceContour(mask: BinaryMask, label?: (index: number) => boolean): Point[] {
  const { width, height, data } = mask;
  const isFilled = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const index = y * width + x;
    if (label && !label(index)) return false;
    return data[index] === 1;
  };

  // 走査して最初の輪郭画素を見つける
  let startX = -1;
  let startY = -1;
  outer: for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isFilled(x, y)) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }
  if (startX < 0) return [];

  // 8近傍を時計回りに並べたもの
  const neighbors = [
    { dx: 1, dy: 0 },
    { dx: 1, dy: 1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: -1, dy: -1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: -1 },
  ];

  const contour: Point[] = [];
  let currentX = startX;
  let currentY = startY;
  let direction = 0;
  const maxSteps = width * height * 4;

  for (let step = 0; step < maxSteps; step += 1) {
    contour.push({ x: currentX, y: currentY });

    let found = false;
    // ひとつ前に来た向きの少し手前から探し始めると輪郭をなぞれる
    for (let i = 0; i < neighbors.length; i += 1) {
      const dirIndex = (direction + 6 + i) % neighbors.length;
      const neighbor = neighbors[dirIndex]!;
      const nx = currentX + neighbor.dx;
      const ny = currentY + neighbor.dy;

      if (isFilled(nx, ny)) {
        currentX = nx;
        currentY = ny;
        direction = dirIndex;
        found = true;
        break;
      }
    }

    if (!found) break;
    if (currentX === startX && currentY === startY && contour.length > 2) break;
  }

  return contour;
}

/** 2点を結ぶ直線からの距離。 */
function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);

  const cross = Math.abs(dx * (lineStart.y - point.y) - (lineStart.x - point.x) * dy);
  return cross / Math.sqrt(lengthSquared);
}

/** Douglas-Peucker で頂点を間引く。 */
export function simplifyPath(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return [...points];

  let maxDistance = 0;
  let index = 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;

  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i]!, first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }

  if (maxDistance <= tolerance) return [first, last];

  const left = simplifyPath(points.slice(0, index + 1), tolerance);
  const right = simplifyPath(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

/**
 * 多角形の重心(面積重心)。
 *
 * Matter は与えた頂点列の重心を剛体の原点にするため、
 * スプライト側の原点も同じ点に合わせないと絵と当たり判定がずれる。
 */
export function polygonCentroid(points: Point[]): Point {
  let areaSum = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i]!;
    const next = points[(i + 1) % points.length]!;
    const cross = current.x * next.y - next.x * current.y;
    areaSum += cross;
    cx += (current.x + next.x) * cross;
    cy += (current.y + next.y) * cross;
  }

  if (Math.abs(areaSum) < 1e-6) {
    // つぶれた形は単純平均で代用する
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
  }

  const area = areaSum * 0.5;
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

export interface CutoutSprite {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface CutoutPiece {
  /** アルファ付きのスプライト画像。 */
  sprite: CutoutSprite;
  /** スプライト座標系での輪郭(剛体化に使う)。 */
  contour: Point[];
  /** 輪郭の重心(スプライト座標系)。剛体の原点になるので絵の原点もここに合わせる。 */
  contourCentroid: Point;
  /** 元マスクでの面積(画素数)。 */
  area: number;
  /** 元マスクでの重心X。左にいた人 = P1 の割り当てに使う(CLAUDE.md §2.2)。 */
  centroidX: number;
}

export interface BuildCutoutOptions {
  /** 元画像(撮影した静止画)。スプライトの絵柄に使う。 */
  source: CanvasImageSource;
  /** source の実サイズ。 */
  sourceWidth: number;
  sourceHeight: number;
  /** 白フチの太さ(スプライト座標系の画素)。 */
  outlineWidth?: number;
  /** 輪郭の間引き強度。大きいほど粗くなる。 */
  simplifyTolerance?: number;
}

/**
 * 塊ひとつぶんの切り抜きスプライトと輪郭を作る。
 *
 * マスクは縮小されているので、スプライトは元画像の解像度に合わせて拡大して作る。
 */
export function buildCutoutPiece(
  mask: BinaryMask,
  blob: MaskBlob,
  labels: Int32Array,
  options: BuildCutoutOptions,
): CutoutPiece | null {
  // 輪郭が細かすぎると凸分割の断片が増えて挙動が不安定になるので、既定は強めに間引く
  const { source, sourceWidth, sourceHeight, outlineWidth = 6, simplifyTolerance = 3 } = options;

  // マスク座標 → 元画像座標の倍率
  const scaleX = sourceWidth / mask.width;
  const scaleY = sourceHeight / mask.height;

  // 塊の範囲だけを切り出す(余白は白フチのぶん少し広げる)
  const padding = Math.ceil(outlineWidth / Math.min(scaleX, scaleY)) + 2;
  const minX = Math.max(0, blob.minX - padding);
  const minY = Math.max(0, blob.minY - padding);
  const maxX = Math.min(mask.width - 1, blob.maxX + padding);
  const maxY = Math.min(mask.height - 1, blob.maxY + padding);

  const maskWidth = maxX - minX + 1;
  const maskHeight = maxY - minY + 1;
  if (maskWidth <= 0 || maskHeight <= 0) return null;

  const spriteWidth = Math.round(maskWidth * scaleX);
  const spriteHeight = Math.round(maskHeight * scaleY);
  if (spriteWidth <= 0 || spriteHeight <= 0) return null;

  // この塊だけを含む部分マスクを作る
  const localMask: BinaryMask = {
    data: new Uint8Array(maskWidth * maskHeight),
    width: maskWidth,
    height: maskHeight,
  };
  for (let y = 0; y < maskHeight; y += 1) {
    for (let x = 0; x < maskWidth; x += 1) {
      const globalIndex = (minY + y) * mask.width + (minX + x);
      if (labels[globalIndex] === blob.label) {
        localMask.data[y * maskWidth + x] = 1;
      }
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = spriteWidth;
  canvas.height = spriteHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // 1. マスクの形をシルエットとして描く
  const silhouette = document.createElement('canvas');
  silhouette.width = spriteWidth;
  silhouette.height = spriteHeight;
  const silhouetteCtx = silhouette.getContext('2d');
  if (!silhouetteCtx) return null;

  const cellWidth = spriteWidth / maskWidth;
  const cellHeight = spriteHeight / maskHeight;
  silhouetteCtx.fillStyle = '#ffffff';
  for (let y = 0; y < maskHeight; y += 1) {
    for (let x = 0; x < maskWidth; x += 1) {
      if (localMask.data[y * maskWidth + x] === 1) {
        silhouetteCtx.fillRect(x * cellWidth, y * cellHeight, cellWidth + 1, cellHeight + 1);
      }
    }
  }

  // 2. シルエットを少しずつずらして重ね、白フチを作る
  ctx.globalCompositeOperation = 'source-over';
  const steps = 12;
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    ctx.drawImage(silhouette, Math.cos(angle) * outlineWidth, Math.sin(angle) * outlineWidth);
  }

  // 3. 白フチの内側に元画像を塗る
  const body = document.createElement('canvas');
  body.width = spriteWidth;
  body.height = spriteHeight;
  const bodyCtx = body.getContext('2d');
  if (!bodyCtx) return null;

  bodyCtx.drawImage(silhouette, 0, 0);
  bodyCtx.globalCompositeOperation = 'source-in';
  bodyCtx.drawImage(
    source,
    minX * scaleX,
    minY * scaleY,
    maskWidth * scaleX,
    maskHeight * scaleY,
    0,
    0,
    spriteWidth,
    spriteHeight,
  );

  ctx.drawImage(body, 0, 0);

  // 4. 輪郭を取り出してスプライト座標へ変換する
  const rawContour = traceContour(localMask);
  if (rawContour.length < 3) return null;

  const scaled = rawContour.map((point) => ({
    x: (point.x + 0.5) * cellWidth,
    y: (point.y + 0.5) * cellHeight,
  }));
  const simplified = simplifyPath(scaled, simplifyTolerance * Math.max(cellWidth, cellHeight));

  return {
    sprite: { canvas, width: spriteWidth, height: spriteHeight },
    contour: simplified,
    contourCentroid: polygonCentroid(simplified),
    area: blob.pixelCount,
    centroidX: blob.centroidX,
  };
}
