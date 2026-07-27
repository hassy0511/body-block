// お題(穴)とプレイヤーのマスクの重なり率で判定する。SPEC_MODE1.md §3 参照。
//
// 物理演算は使わず、二値マスク同士の比較のみで判定する。
// 位置ズレと大きさの違いは前処理で吸収し、回転補正はしない
// (ポーズで形を合わせるのがゲームの本体なので)。

import type { BinaryMask } from './mask';

export interface MaskBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface MaskStats {
  pixelCount: number;
  centroidX: number;
  centroidY: number;
  bounds: MaskBounds | null;
}

/** マスクの面積・重心・バウンディングボックスを求める。 */
export function analyzeMask(mask: BinaryMask): MaskStats {
  let pixelCount = 0;
  let sumX = 0;
  let sumY = 0;
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.data[y * mask.width + x] !== 1) continue;
      pixelCount += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (pixelCount === 0) {
    return { pixelCount: 0, centroidX: 0, centroidY: 0, bounds: null };
  }

  return {
    pixelCount,
    centroidX: sumX / pixelCount,
    centroidY: sumY / pixelCount,
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    },
  };
}

/**
 * プレイヤーマスクを、お題マスクに重心とスケールを合わせて描き直す。
 *
 * - 重心を合わせて位置ズレを吸収する
 * - お題のバウンディングボックスに収まるよう等倍(縦横同率)で拡縮する
 * - 回転補正はしない
 */
export function alignMask(player: BinaryMask, target: BinaryMask): BinaryMask {
  const playerStats = analyzeMask(player);
  const targetStats = analyzeMask(target);
  const aligned: BinaryMask = {
    data: new Uint8Array(target.width * target.height),
    width: target.width,
    height: target.height,
  };

  if (!playerStats.bounds || !targetStats.bounds) return aligned;

  // 縦横それぞれの収まり率のうち小さい方を採用する(はみ出させない)
  const scale = Math.min(
    targetStats.bounds.width / playerStats.bounds.width,
    targetStats.bounds.height / playerStats.bounds.height,
  );
  if (!Number.isFinite(scale) || scale <= 0) return aligned;

  // 出力側の各画素が、入力側のどこから来るかを逆算する(最近傍)
  for (let y = 0; y < aligned.height; y += 1) {
    const sourceY = Math.round((y - targetStats.centroidY) / scale + playerStats.centroidY);
    if (sourceY < 0 || sourceY >= player.height) continue;

    for (let x = 0; x < aligned.width; x += 1) {
      const sourceX = Math.round((x - targetStats.centroidX) / scale + playerStats.centroidX);
      if (sourceX < 0 || sourceX >= player.width) continue;

      aligned.data[y * aligned.width + x] = player.data[sourceY * player.width + sourceX]!;
    }
  }

  return aligned;
}

export interface JudgeResult {
  /** 0〜100 の「ハマり度」(IoU × 100)。 */
  score: number;
  /** 演出用に丸めたスコア(5点刻み)。 */
  displayScore: number;
  rank: PoseRank;
  /** 穴に入っている部分の画素数。 */
  overlap: number;
  /** 穴なのに埋まっていない部分の画素数。 */
  miss: number;
  /** 穴からはみ出した部分の画素数。 */
  overflow: number;
  /** 位置・大きさを合わせたあとのプレイヤーマスク(演出表示に使う)。 */
  alignedPlayer: BinaryMask;
}

export type PoseRank = 'perfect' | 'good' | 'close' | 'retry';

export const RANK_LABELS: Record<PoseRank, string> = {
  perfect: 'かんぺき！',
  good: 'いいかんじ！',
  close: 'おしい！',
  retry: 'もういっかい！',
};

/** SPEC_MODE1.md §3 のランク分け。 */
export function rankForScore(score: number): PoseRank {
  if (score >= 90) return 'perfect';
  if (score >= 70) return 'good';
  if (score >= 50) return 'close';
  return 'retry';
}

/**
 * プレイヤーのマスクとお題の穴マスクを比較してスコアを出す。
 *
 * score = 100 × |P ∩ T| / |P ∪ T|
 */
export function judgePose(player: BinaryMask, target: BinaryMask): JudgeResult {
  const alignedPlayer = alignMask(player, target);

  let overlap = 0;
  let miss = 0;
  let overflow = 0;

  for (let i = 0; i < target.data.length; i += 1) {
    const inPlayer = alignedPlayer.data[i] === 1;
    const inTarget = target.data[i] === 1;

    if (inPlayer && inTarget) overlap += 1;
    else if (inTarget) miss += 1;
    else if (inPlayer) overflow += 1;
  }

  const union = overlap + miss + overflow;
  const score = union === 0 ? 0 : (overlap / union) * 100;
  // 演出上は甘めに見せてよい(SPEC_MODE1.md §3)ので 5点刻みで切り上げる
  const displayScore = Math.min(100, Math.ceil(score / 5) * 5);

  return {
    score,
    displayScore,
    rank: rankForScore(displayScore),
    overlap,
    miss,
    overflow,
    alignedPlayer,
  };
}
