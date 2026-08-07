// モード5 の導入。説明だけして水槽へ。人数選択はない(何人で写ってもよい)。

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

export class ZukanIntroScene extends Phaser.Scene {
  constructor() {
    super('ZukanIntro');
  }

  create(): void {
    addBackground(this);

    this.add.text(GAME_WIDTH / 2, 180, 'いきものずかん', titleStyle(44)).setOrigin(0.5);

    [
      'しゃしんを とると、その すがたが',
      '「いきもの」に なって すいそうを およぐよ',
      'なんかいでも なかまを ふやせる',
      'かちまけは ないよ。ながめて たのしもう！',
    ].forEach((line, index) => {
      this.add
        .text(GAME_WIDTH / 2, 330 + index * 64, line, bodyStyle(27))
        .setOrigin(0.5)
        .setWordWrapWidth(GAME_WIDTH - 60);
    });

    createButton(
      this,
      GAME_WIDTH / 2,
      760,
      'すいそうへ いく',
      () => {
        playTap();
        session.startGame(1, []);
        session.captureRequest = null;
        this.scene.start('Zukan');
      },
      { width: 400, height: 110, fontSize: 34 },
    );

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
}
