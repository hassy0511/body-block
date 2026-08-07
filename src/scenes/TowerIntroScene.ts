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

export class TowerIntroScene extends Phaser.Scene {
  constructor() {
    super('TowerIntro');
  }

  create(): void {
    addBackground(this);

    this.add.text(GAME_WIDTH / 2, 150, 'たいそうタワー', titleStyle(46)).setOrigin(0.5);

    [
      'すきな ポーズで しゃしんを とると',
      'その かたちが ブロックに なって',
      'そのまま したへ おちてくるよ',
      'なんかいも とって、たかく つみあげよう！',
    ].forEach((line, index) => {
      this.add
        .text(GAME_WIDTH / 2, 290 + index * 60, line, bodyStyle(26))
        .setOrigin(0.5)
        .setWordWrapWidth(GAME_WIDTH - 60);
    });

    this.add.text(GAME_WIDTH / 2, 600, 'なんにんで あそぶ？', bodyStyle(28)).setOrigin(0.5);

    [1, 2, 3].forEach((count, index) => {
      createButton(
        this,
        GAME_WIDTH / 2,
        700 + index * 130,
        `${count}にん`,
        () => {
          playTap();
          this.startCapture(count);
        },
        { width: 300, height: 96, fontSize: 36 },
      );
    });

    createButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 100,
      'もどる',
      () => {
        playTap();
        this.scene.start('Title');
      },
      { width: 260, height: 70, fontSize: 28 },
    );
  }

  private startCapture(playerCount: number): void {
    // モード2 は撮影と落下が同じ画面で続くので、撮影シーンは経由しない
    session.startGame(playerCount, []);
    session.captureRequest = null;
    this.scene.start('Tower');
  }
}
