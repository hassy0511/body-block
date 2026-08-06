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

    this.add.text(GAME_WIDTH / 2, 90, 'いきものずかん', titleStyle(46)).setOrigin(0.5);

    [
      'しゃしんを とると、その すがたが',
      '「いきもの」に なって すいそうを およぐよ',
      'なんかいでも なかまを ふやせる',
      'かちまけは ないよ。ながめて たのしもう！',
    ].forEach((line, index) => {
      this.add
        .text(GAME_WIDTH / 2, 190 + index * 50, line, bodyStyle(27))
        .setOrigin(0.5)
        .setWordWrapWidth(GAME_WIDTH - 120);
    });

    createButton(
      this,
      GAME_WIDTH / 2,
      490,
      'すいそうへ いく',
      () => {
        playTap();
        session.startGame(1, []);
        session.captureRequest = null;
        this.scene.start('Zukan');
      },
      { width: 360, height: 100, fontSize: 32 },
    );

    createButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 60,
      'もどる',
      () => {
        playTap();
        this.scene.start('Title');
      },
      { width: 260, height: 70, fontSize: 28 },
    );
  }
}
