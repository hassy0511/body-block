// モード9 の導入。何人で遊ぶかを選んで送り出す。

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

export class SeesawIntroScene extends Phaser.Scene {
  constructor() {
    super('SeesawIntro');
  }

  create(): void {
    addBackground(this);

    this.add.text(GAME_WIDTH / 2, 150, 'シーソーバランス', titleStyle(46)).setOrigin(0.5);

    [
      'おおきな シーソーの うえに',
      'こうたいで からだブロックを のせていくよ',
      'かたむけて たおしちゃった ひとの まけ！',
      'まんなかに のる？ はしっこで せめる？',
    ].forEach((line, index) => {
      this.add
        .text(GAME_WIDTH / 2, 300 + index * 58, line, bodyStyle(26))
        .setOrigin(0.5)
        .setWordWrapWidth(GAME_WIDTH - 60);
    });

    this.add.text(GAME_WIDTH / 2, 610, 'なんにんで あそぶ？', bodyStyle(28)).setOrigin(0.5);

    [1, 2, 3, 4].forEach((count, index) => {
      createButton(
        this,
        105 + index * 170,
        710,
        `${count}にん`,
        () => {
          playTap();
          this.startGame(count);
        },
        { width: 150, height: 96, fontSize: 30 },
      );
    });

    this.add
      .text(
        GAME_WIDTH / 2,
        790,
        'ひとりのときは たおさず 6こ のせきれるか ちょうせん！',
        bodyStyle(20),
      )
      .setOrigin(0.5)
      .setColor('#8a7460');

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

  private startGame(challengers: number): void {
    // 1人ずつ順番に写るモードなので、撮影ガイドは常に1人ぶん
    session.startGame(1, []);
    session.captureRequest = null;
    this.scene.start('Seesaw', { challengers });
  }
}
