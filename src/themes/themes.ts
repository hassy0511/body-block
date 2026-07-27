// お題(穴)の定義と読み込み。SPEC_MODE1.md §4 参照。
//
// お題はグレースケール PNG(白 = 穴、黒 = 壁)で管理する。
// 画像は全て自作で、既存キャラクターや特定の演出を連想させる形は作らない。

import { labelBlobs, type BinaryMask } from '../core/mask';

/** 判定に使うマスクの横幅。プレイヤー側のノイズ処理後の解像度と揃えている。 */
export const THEME_MASK_WIDTH = 256;

export interface ThemeMeta {
  id: string;
  /** 表示名。ひらがな中心(CLAUDE.md §6)。 */
  name: string;
  /** 対応人数。 */
  players: number;
  /** 難易度 1〜3。 */
  difficulty: 1 | 2 | 3;
  /** public/themes/ からの相対ファイル名。 */
  file: string;
}

export const THEME_META: ThemeMeta[] = [
  // ---- 1人用 ----
  { id: 'daimonji', name: 'だいのじ', players: 1, difficulty: 1, file: 'daimonji.png' },
  { id: 'banzai', name: 'ばんざい', players: 1, difficulty: 1, file: 'banzai.png' },
  { id: 't_pose', name: 'ティーのポーズ', players: 1, difficulty: 1, file: 't_pose.png' },
  { id: 'kunoji', name: 'くのじ', players: 1, difficulty: 2, file: 'kunoji.png' },
  { id: 'shagami', name: 'しゃがみだま', players: 1, difficulty: 2, file: 'shagami.png' },
  { id: 'kataashi', name: 'かたあしバランス', players: 1, difficulty: 3, file: 'kataashi.png' },

  // ---- 2人用 ----
  { id: 'daishou', name: 'だいしょうコンビ', players: 2, difficulty: 1, file: 'daishou.png' },
  { id: 'yama_tani', name: 'やまとたに', players: 2, difficulty: 2, file: 'yama_tani.png' },
  { id: 'tunnel', name: 'トンネル', players: 2, difficulty: 2, file: 'tunnel.png' },
  { id: 'heart', name: 'てをつないで', players: 2, difficulty: 3, file: 'heart.png' },

  // ---- 3人用 ----
  {
    id: 'sanninbanzai',
    name: 'さんにんばんざい',
    players: 3,
    difficulty: 1,
    file: 'sanninbanzai.png',
  },
  { id: 'kaidan', name: 'かいだん', players: 3, difficulty: 2, file: 'kaidan.png' },
];

export interface LoadedTheme extends ThemeMeta {
  /** 判定に使う二値マスク(縮小済み)。 */
  mask: BinaryMask;
  /** 表示用の画像。 */
  image: HTMLImageElement;
  /**
   * このお題が想定する「かたまりの数」。
   *
   * 人数と一致するとは限らない。手をつなぐお題では2人でも1つのかたまりになるため、
   * 撮り直し判定(SPEC_MODE1.md §2)はこの値と比較する。
   */
  expectedBlobs: number;
}

function themeUrl(file: string): string {
  return `${import.meta.env.BASE_URL}themes/${file}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`お題の画像を読み込めませんでした: ${url}`));
    image.src = url;
  });
}

/** グレースケール画像を二値マスクに変換する(白 = 穴 = 1)。 */
function imageToMask(image: HTMLImageElement, targetWidth: number): BinaryMask {
  const width = targetWidth;
  const height = Math.max(1, Math.round((image.naturalHeight / image.naturalWidth) * targetWidth));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { data: new Uint8Array(width * height), width, height };

  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;

  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 1) {
    // グレースケールなので R だけ見れば足りる
    data[i] = pixels[i * 4]! > 127 ? 1 : 0;
  }

  return { data, width, height };
}

/** マスクに含まれる、十分な大きさのかたまりの数を数える。 */
function countBlobs(mask: BinaryMask, minAreaRatio = 0.005): number {
  const minPixels = mask.width * mask.height * minAreaRatio;
  return labelBlobs(mask).blobs.filter((blob) => blob.pixelCount >= minPixels).length;
}

export async function loadTheme(meta: ThemeMeta): Promise<LoadedTheme> {
  const image = await loadImage(themeUrl(meta.file));
  const mask = imageToMask(image, THEME_MASK_WIDTH);
  return { ...meta, image, mask, expectedBlobs: countBlobs(mask) };
}

export function loadThemes(metas: ThemeMeta[]): Promise<LoadedTheme[]> {
  return Promise.all(metas.map(loadTheme));
}

/** 指定人数に対応するお題だけを返す。 */
export function themesForPlayers(players: number): ThemeMeta[] {
  return THEME_META.filter((theme) => theme.players === players);
}

/** 同一ゲーム内で重複しないようにお題をランダムに選ぶ(SPEC_MODE1.md §4)。 */
export function pickThemes(players: number, count: number, random = Math.random): ThemeMeta[] {
  const pool = themesForPlayers(players);
  const picked: ThemeMeta[] = [];

  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    picked.push(pool.splice(index, 1)[0]!);
  }

  return picked;
}
