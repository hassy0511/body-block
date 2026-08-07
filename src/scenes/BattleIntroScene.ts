// モード4 の導入。ひとりで / ふたりで を選んでバトルへ送り出す。

import Phaser from 'phaser';
import { playTap } from '../core/sound';
import { session } from '../game/session';
import {
  addBackground,
  createButton,
  titleStyle,
  bodyStyle,
  COLORS,
  GAME_WIDTH,
  GAME_HEIGHT,
} from '../ui/ui';

export class BattleIntroScene extends Phaser.Scene {
  constructor() {
    super('BattleIntro');
  }

  create(): void {
    addBackground(this);

    this.add.text(GAME_WIDTH / 2, 150, 'こわしてバトル', titleStyle(44)).setOrigin(0.5);

    [
      'タワーの てっぺんに かんむりが のっているよ',
      'からだを うつして おとして、タワーを こわそう',
      'カメラの ひだりに うつれば ひだりに おちる。',
      'たちいちで ねらいを きめよう！',
    ].forEach((line, index) => {
      this.add
        .text(GAME_WIDTH / 2, 290 + index * 60, line, bodyStyle(26))
        .setOrigin(0.5)
        .setWordWrapWidth(GAME_WIDTH - 60);
    });

    this.add.text(GAME_WIDTH / 2, 620, 'どっちで あそぶ？', bodyStyle(28)).setOrigin(0.5);

    createButton(this, GAME_WIDTH / 2, 730, 'ひとりで', () => this.start(1), {
      width: 320,
      height: 100,
      fontSize: 34,
    });

    createButton(this, GAME_WIDTH / 2, 860, 'ふたりで', () => this.start(2), {
      width: 320,
      height: 100,
      fontSize: 34,
      color: COLORS.accent,
      pressedColor: COLORS.accentDark,
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

  private start(playerCount: number): void {
    playTap();
    session.startGame(playerCount, []);
    session.captureRequest = null;
    this.scene.start('Battle');
  }
}
