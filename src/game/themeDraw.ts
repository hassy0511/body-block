// お題マスクを Phaser のテクスチャとして描くためのヘルパー。
//
// 元画像は「白 = 穴、黒 = 壁」なので、そのまま貼ると壁まで黒く塗ってしまう。
// 穴の部分だけを指定色で塗り、壁の部分は透明にしたテクスチャを作る。

import Phaser from 'phaser';
import type { LoadedTheme } from '../themes/themes';

let counter = 0;

/**
 * お題のシルエットを、穴だけ着色した透過テクスチャとして生成しキー名を返す。
 * 生成したテクスチャはシーン終了時に破棄する。
 */
export function drawThemeSilhouette(
  scene: Phaser.Scene,
  theme: LoadedTheme,
  width: number,
  height: number,
  color: string,
  alpha = 1,
): string {
  counter += 1;
  const key = `theme-${theme.id}-${counter}`;

  const canvasTexture = scene.textures.createCanvas(key, width, height);
  if (!canvasTexture) return key;

  const ctx = canvasTexture.getContext();
  ctx.clearRect(0, 0, width, height);

  // 元画像を縮小して読み取り、白い画素だけを塗る
  ctx.drawImage(theme.image, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const rgb = Phaser.Display.Color.HexStringToColor(color);

  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    const isHole = image.data[offset]! > 127;
    if (isHole) {
      image.data[offset] = rgb.red;
      image.data[offset + 1] = rgb.green;
      image.data[offset + 2] = rgb.blue;
      image.data[offset + 3] = Math.round(255 * alpha);
    } else {
      image.data[offset + 3] = 0;
    }
  }

  ctx.putImageData(image, 0, 0);
  canvasTexture.refresh();

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
  });

  return key;
}
