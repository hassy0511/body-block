// お題シルエットの確認用ページ。ポーズ定義が意図した形に見えるかを目視するためのもの。
import './style.css';
import { POSE_THEMES } from '../themes/poses';
import { drawTheme } from '../themes/render';

const CARD_WIDTH = 320;
const CARD_HEIGHT = 240;

const grid = document.querySelector<HTMLDivElement>('#theme-grid')!;

for (const theme of POSE_THEMES) {
  const card = document.createElement('figure');
  card.className = 'theme-card';

  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // 壁を黒、穴を白で描く(SPEC_MODE1.md §4 のマスク表現に合わせる)
    ctx.fillStyle = '#10131a';
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    drawTheme(ctx, theme, CARD_WIDTH, CARD_HEIGHT, '#ffffff');
  }

  const caption = document.createElement('figcaption');
  caption.textContent = `${theme.name} / ${theme.players}人 / むずかしさ${theme.difficulty}`;

  card.append(canvas, caption);
  grid.append(card);
}
