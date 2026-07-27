// モード2 の導入。人数を選んで撮影へ送り出す。

import Phaser from 'phaser';
import { playTap } from '../core/sound';
import { session } from '../game/session';
import {
  addBackground,
  createButton,
  titleStyle,
  bodyStyle,
  GAME_WIDTH,
  GAME_HEIGHT,
} from '../ui/ui';
import { DEFAULT_TIME_LIMIT_SEC } from './CaptureScene';

export class TowerIntroScene extends Phaser.Scene {
  constructor() {
    super('TowerIntro');
  }

  create(): void {
    addBackground(this);

    this.add.text(GAME_WIDTH / 2, 90, 'たいそうタワー', titleStyle(56)).setOrigin(0.5);

    [
      'すきな ポーズで しゃしんを とると',
      'その かたちが ブロックに なるよ',
      'タップした ところに おちてくるので',
      'たかく つみあげよう！',
    ].forEach((line, index) => {
      this.add.text(GAME_WIDTH / 2, 190 + index * 46, line, bodyStyle(30)).setOrigin(0.5);
    });

    this.add.text(GAME_WIDTH / 2, 410, 'なんにんで あそぶ？', bodyStyle(30)).setOrigin(0.5);

    [1, 2, 3].forEach((count, index) => {
      createButton(
        this,
        GAME_WIDTH / 2 - 320 + index * 320,
        510,
        `${count}にん`,
        () => {
          playTap();
          this.startCapture(count);
        },
        { width: 220, height: 100, fontSize: 40 },
      );
    });

    createButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 50,
      'もどる',
      () => {
        playTap();
        this.scene.start('Title');
      },
      { width: 200, height: 64, fontSize: 28 },
    );
  }

  private startCapture(playerCount: number): void {
    session.startGame(playerCount, []);
    session.captureRequest = {
      theme: null,
      // 人数ぶんのかたまりが取れていることを撮影の条件にする
      expectedBlobs: playerCount,
      nextScene: 'Tower',
      headline: 'すきな ポーズを して！',
      timeLimitSec: DEFAULT_TIME_LIMIT_SEC,
    };
    this.scene.start('Capture');
  }
}
