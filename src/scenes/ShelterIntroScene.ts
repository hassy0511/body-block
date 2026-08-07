// モード3 の導入。人数を選んでシェルター画面へ送り出す。

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

export class ShelterIntroScene extends Phaser.Scene {
  constructor() {
    super('ShelterIntro');
  }

  create(): void {
    addBackground(this);

    this.add.text(GAME_WIDTH / 2, 150, 'まもって！シェルター', titleStyle(44)).setOrigin(0.5);

    [
      'ゆかに いる たまごちゃんに',
      'うえから ボールが ふってくるよ',
      'じぶんの からだを やねにして',
      'あたらないように まもろう！',
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
          // 撮影と防御が同じ画面で続くので、撮影シーンは経由しない
          session.startGame(count, []);
          session.captureRequest = null;
          this.scene.start('Shelter');
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
}
