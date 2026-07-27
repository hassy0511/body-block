// 画面共通の見た目とパーツ。CLAUDE.md §6 の「親しみやすいシリーズ感」に合わせる。

import Phaser from 'phaser';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const COLORS = {
  bg: 0xfff3e0,
  bgCss: '#fff3e0',
  primary: 0xff8a3d,
  primaryDark: 0xe06a1f,
  accent: 0x33bfc7,
  accentDark: 0x209aa1,
  text: '#5a4634',
  textLight: '#ffffff',
  wall: 0x3d3227,
  hole: 0xfff9ef,
  miss: 0xff6b6b,
  overflow: 0x4d8bff,
} as const;

export const FONT_FAMILY =
  '"Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", system-ui, sans-serif';

export function titleStyle(size = 56): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT_FAMILY,
    fontSize: `${size}px`,
    color: COLORS.text,
    fontStyle: 'bold',
    align: 'center',
  };
}

export function bodyStyle(size = 30): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT_FAMILY,
    fontSize: `${size}px`,
    color: COLORS.text,
    align: 'center',
  };
}

export interface ButtonOptions {
  width?: number;
  height?: number;
  color?: number;
  pressedColor?: number;
  textColor?: string;
  fontSize?: number;
}

/**
 * まるっこいボタン。タップ領域を大きめに取り、押した感触が出るよう軽く沈ませる。
 */
export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  options: ButtonOptions = {},
): Phaser.GameObjects.Container {
  const {
    width = 320,
    height = 96,
    color = COLORS.primary,
    pressedColor = COLORS.primaryDark,
    textColor = COLORS.textLight,
    fontSize = 36,
  } = options;

  const container = scene.add.container(x, y);

  // 立体感を出すため、下にずらした濃い色の面を先に描く
  const radius = height / 2;
  const graphics = scene.add.graphics();
  graphics.fillStyle(pressedColor, 1);
  graphics.fillRoundedRect(-width / 2, -height / 2 + 6, width, height, radius);
  graphics.fillStyle(color, 1);
  graphics.fillRoundedRect(-width / 2, -height / 2, width, height, radius);

  const text = scene.add
    .text(0, 0, label, {
      fontFamily: FONT_FAMILY,
      fontSize: `${fontSize}px`,
      color: textColor,
      fontStyle: 'bold',
      align: 'center',
    })
    .setOrigin(0.5);

  container.add([graphics, text]);
  container.setSize(width, height + 12);
  // 押したあとにラベルを差し替えたい場合があるので取り出せるようにしておく
  container.setData('label', text);
  container.setInteractive({ useHandCursor: true });

  const press = (): void => {
    container.setY(y + 4);
  };
  const release = (): void => {
    container.setY(y);
  };

  container.on('pointerdown', press);
  container.on('pointerout', release);
  container.on('pointerup', () => {
    release();
    onClick();
  });

  return container;
}

/** 画面全体の背景。全シーンで共通の下地にする。 */
export function addBackground(scene: Phaser.Scene): void {
  scene.cameras.main.setBackgroundColor(COLORS.bgCss);
}
