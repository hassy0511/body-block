// 切り抜き(CutoutPiece)を Matter の剛体つきスプライトにする共通処理。
//
// モード2 で確立した手順をそのまま踏む(SPEC_MODE2.md §5 実装上の注意):
// - 輪郭は重心基準へ寄せるだけで、拡縮は掛けない。
//   Phaser の setScale は剛体も一緒に拡縮するため、頂点側でも掛けると二重になる
// - 絵の原点を輪郭の重心に合わせる。Matter は頂点列の重心を剛体の原点にする

import Phaser from 'phaser';
import type { CutoutPiece } from '../core/cutout';

let seq = 0;

export interface SpawnBlockOptions {
  x: number;
  y: number;
  /** 表示とあたり判定の倍率。呼び出し側で頭打ちを済ませて渡す。 */
  scale: number;
  depth: number;
  /** Matter のボディ設定(密度・摩擦など)。 */
  body: Phaser.Types.Physics.Matter.MatterBodyConfig;
}

export interface SpawnedBlock {
  block: Phaser.Physics.Matter.Image;
  /** シーン側で破棄するためのテクスチャキー。 */
  textureKey: string;
}

/** 切り抜きを剛体つきスプライトとして置く。凸分割に失敗したら矩形で代用する。 */
export function spawnCutoutBlock(
  scene: Phaser.Scene,
  piece: CutoutPiece,
  options: SpawnBlockOptions,
): SpawnedBlock | null {
  seq += 1;
  const key = `cutout-block-${seq}`;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, piece.sprite.canvas);

  const centroid = piece.contourCentroid;
  const vertices = piece.contour.map((point) => ({
    x: point.x - centroid.x,
    y: point.y - centroid.y,
  }));

  let block: Phaser.Physics.Matter.Image;
  try {
    block = scene.matter.add.image(options.x, options.y, key, undefined, {
      shape: { type: 'fromVerts', verts: vertices, flagInternal: true },
      ...options.body,
    });
  } catch {
    block = scene.matter.add.image(options.x, options.y, key, undefined, options.body);
  }

  block.setScale(options.scale);
  block.setOrigin(centroid.x / piece.sprite.width, centroid.y / piece.sprite.height);
  block.setDepth(options.depth);

  return { block, textureKey: key };
}
