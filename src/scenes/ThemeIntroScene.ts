// お題(穴)のシルエットを数秒見せる画面。SPEC_MODE1.md §2。

import Phaser from 'phaser';
import {
  addBackground,
  createButton,
  titleStyle,
  bodyStyle,
  COLORS,
  GAME_WIDTH,
  GAME_HEIGHT,
} from '../ui/ui';
import { playTap } from '../core/sound';
import { session } from '../game/session';
import { drawThemeSilhouette } from '../game/themeDraw';
import { DEFAULT_TIME_LIMIT_SEC } from './CaptureScene';

const AUTO_ADVANCE_MS = 4000;

export class ThemeIntroScene extends Phaser.Scene {
  constructor() {
    super('ThemeIntro');
  }

  create(): void {
    addBackground(this);

    const theme = session.currentTheme;
    if (!theme) {
      this.scene.start('Result');
      return;
    }

    this.add
      .text(
        GAME_WIDTH / 2,
        130,
        `${session.currentIndex + 1}もんめ / ${session.themeCount}もん`,
        bodyStyle(28),
      )
      .setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 200, theme.name, titleStyle(44)).setOrigin(0.5);

    // 壁に空いた穴として見せる(壁 = 濃い色、穴 = 明るい色)
    const boardWidth = GAME_WIDTH - 40;
    const boardHeight = Math.round(boardWidth * (9 / 16));
    const boardY = 290;

    this.add.rectangle(
      GAME_WIDTH / 2,
      boardY + boardHeight / 2,
      boardWidth,
      boardHeight,
      COLORS.wall,
    );

    const texture = drawThemeSilhouette(this, theme, boardWidth, boardHeight, '#fff9ef');
    this.add.image(GAME_WIDTH / 2, boardY + boardHeight / 2, texture).setOrigin(0.5);

    const countdown = this.add
      .text(GAME_WIDTH / 2, boardY + boardHeight + 28, '', bodyStyle(28))
      .setOrigin(0.5);

    let remaining = Math.ceil(AUTO_ADVANCE_MS / 1000);
    countdown.setText(`${remaining}びょうごに さつえいへ`);
    const timer = this.time.addEvent({
      delay: 1000,
      repeat: remaining - 1,
      callback: () => {
        remaining -= 1;
        countdown.setText(remaining > 0 ? `${remaining}びょうごに さつえいへ` : 'さつえいへ！');
      },
    });

    const goToCapture = (): void => {
      timer.remove();
      session.captureRequest = {
        theme,
        expectedBlobs: theme.expectedBlobs,
        nextScene: 'Judge',
        headline: `${theme.name} の かたちに なってね`,
        timeLimitSec: DEFAULT_TIME_LIMIT_SEC,
      };
      this.scene.start('Capture');
    };

    this.time.delayedCall(AUTO_ADVANCE_MS, goToCapture);

    createButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 120,
      'すすむ',
      () => {
        playTap();
        goToCapture();
      },
      { width: 280, height: 78, fontSize: 30 },
    );
  }
}
