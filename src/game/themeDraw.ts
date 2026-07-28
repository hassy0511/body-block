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

export interface ThemeHoleOptions {
  /** 穴の外側(壁)を覆う色。 */
  wallColor?: string;
  /** 壁の濃さ。濃くするほど穴の形は分かるが自分が見えなくなる。 */
  wallAlpha?: number;
  /** 穴のふちの色。 */
  edgeColor?: string;
  /** 穴のふちの太さ(px)。 */
  edgeWidth?: number;
}

/**
 * お題を「型」としてカメラ映像に重ねるためのテクスチャを作る。
 *
 * 穴の中は透明にして自分の姿がそのまま見えるようにし、外側を暗く覆う。
 * 境目には太いふちを描く。半透明のベタ塗りを重ねるだけだと
 * カメラ映像に埋もれてしまい、どこに体を置けばよいのか分からない。
 *
 * お題画像は**比率を保ったまま収める**。引き伸ばすと、
 * 見えている形と判定に使う形が食い違ってしまう。
 */
export function drawThemeHole(
  scene: Phaser.Scene,
  theme: LoadedTheme,
  width: number,
  height: number,
  options: ThemeHoleOptions = {},
): string {
  const { wallColor = '#241a10', wallAlpha = 0.62, edgeColor = '#ffd166', edgeWidth = 3 } = options;

  counter += 1;
  const key = `theme-hole-${theme.id}-${counter}`;

  const canvasTexture = scene.textures.createCanvas(key, width, height);
  if (!canvasTexture) return key;

  const ctx = canvasTexture.getContext();
  ctx.clearRect(0, 0, width, height);

  // 比率を保って収める(contain)。はみ出した余白は壁として扱う
  const fit = Math.min(width / theme.image.naturalWidth, height / theme.image.naturalHeight);
  const drawWidth = theme.image.naturalWidth * fit;
  const drawHeight = theme.image.naturalHeight * fit;
  ctx.drawImage(
    theme.image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );

  const image = ctx.getImageData(0, 0, width, height);
  const hole = new Uint8Array(width * height);
  for (let i = 0; i < hole.length; i += 1) {
    // 描かれていない余白は alpha 0 なので、そのまま壁になる
    hole[i] = image.data[i * 4 + 3]! > 127 && image.data[i * 4]! > 127 ? 1 : 0;
  }

  const wall = Phaser.Display.Color.HexStringToColor(wallColor);
  const edge = Phaser.Display.Color.HexStringToColor(edgeColor);
  const wallAlphaByte = Math.round(255 * wallAlpha);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const offset = index * 4;

      if (hole[index] !== 1) {
        image.data[offset] = wall.red;
        image.data[offset + 1] = wall.green;
        image.data[offset + 2] = wall.blue;
        image.data[offset + 3] = wallAlphaByte;
        continue;
      }

      // 穴の中でも、壁に近い画素はふちとして塗る
      if (isNearWall(hole, width, height, x, y, edgeWidth)) {
        image.data[offset] = edge.red;
        image.data[offset + 1] = edge.green;
        image.data[offset + 2] = edge.blue;
        image.data[offset + 3] = 255;
      } else {
        image.data[offset + 3] = 0;
      }
    }
  }

  ctx.putImageData(image, 0, 0);
  canvasTexture.refresh();

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
  });

  return key;
}

/** (x, y) から radius 以内に穴でない画素があるか。 */
function isNearWall(
  hole: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): boolean {
  for (let dy = -radius; dy <= radius; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) return true;
    for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = x + dx;
      if (nx < 0 || nx >= width) return true;
      if (hole[ny * width + nx] !== 1) return true;
    }
  }
  return false;
}
