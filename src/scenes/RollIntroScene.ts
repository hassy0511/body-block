// モード6 の導入。人数を選んで送り出す。

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

export class RollIntroScene extends Phaser.Scene {
  constructor() {
    super('RollIntro');
  }

  create(): void {
    addBackground(this);

    this.add.text(GAME_WIDTH / 2, 150, 'コロコロゴール！', titleStyle(46)).setOrigin(0.5);

    [
      'うえから ボールが ころがってくるよ',
      'ポーズを とって、からだの ブロックで',
      'みちを つくって、ゴールの かごまで',
      'ボールを はこぼう！ みんなで きょうりょく！',
    ].forEach((line, index) => {
      this.add
        .text(GAME_WIDTH / 2, 300 + index * 58, line, bodyStyle(26))
        .setOrigin(0.5)
        .setWordWrapWidth(GAME_WIDTH - 60);
    });

    this.add
      .text(GAME_WIDTH / 2, 610, 'なんにんで うつる？(こうたいでも OK)', bodyStyle(26))
      .setOrigin(0.5);

    [1, 2, 3].forEach((count, index) => {
      createButton(
        this,
        130 + index * 230,
        710,
        `${count}にん`,
        () => {
          playTap();
          this.startGame(count);
        },
        { width: 210, height: 96, fontSize: 34 },
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

  private startGame(playerCount: number): void {
    session.startGame(playerCount, []);
    session.captureRequest = null;
    this.scene.start('Roll');
  }
}
