// お題の確認用ページ。PNG が判定用マスクとして正しく機能するかを目視するためのもの。
// 元画像と、実際の判定に使う縮小・二値化後のマスクを並べて表示する。
import './style.css';
import { THEME_META, loadTheme, type LoadedTheme } from '../themes/themes';

const grid = document.querySelector<HTMLDivElement>('#theme-grid')!;

/** 二値マスクを拡大表示用の canvas に描く。 */
function maskToCanvas(theme: LoadedTheme): HTMLCanvasElement {
  const { mask } = theme;
  const canvas = document.createElement('canvas');
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const image = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i += 1) {
    const offset = i * 4;
    const value = mask.data[i] === 1 ? 255 : 16;
    image.data[offset] = value;
    image.data[offset + 1] = value;
    image.data[offset + 2] = value;
    image.data[offset + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function buildCard(theme: LoadedTheme): HTMLElement {
  const card = document.createElement('figure');
  card.className = 'theme-card';

  const row = document.createElement('div');
  row.className = 'theme-row';

  const original = document.createElement('img');
  original.src = theme.image.src;
  original.alt = `${theme.name} の元画像`;

  const maskCanvas = maskToCanvas(theme);
  maskCanvas.className = 'mask-canvas';

  row.append(original, maskCanvas);

  const caption = document.createElement('figcaption');
  const blobMismatch = theme.expectedBlobs !== theme.players;
  caption.innerHTML =
    `<strong>${theme.name}</strong> (${theme.id})<br />` +
    `${theme.players}人 / むずかしさ${theme.difficulty} / ` +
    `かたまり${theme.expectedBlobs}個` +
    (blobMismatch ? ' <span class="warn">※人数と不一致(手をつなぐお題)</span>' : '');

  card.append(row, caption);
  return card;
}

async function init(): Promise<void> {
  for (const meta of THEME_META) {
    try {
      const theme = await loadTheme(meta);
      grid.append(buildCard(theme));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = document.createElement('p');
      failed.className = 'warn';
      failed.textContent = `${meta.id}: ${message}`;
      grid.append(failed);
    }
  }
}

void init();
