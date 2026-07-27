// あそびかた説明。初回のみ表示し、スキップできる(SPEC_MODE1.md §2)。

import Phaser from 'phaser';
import {
  addBackground,
  createButton,
  titleStyle,
  bodyStyle,
  GAME_WIDTH,
  GAME_HEIGHT,
} from '../ui/ui';
import { playTap } from '../core/sound';
import { HOW_TO_SEEN_KEY } from './PlayerSelectScene';

const STEPS = [
  '① がめんに でてくる かたちを おぼえる',
  '② おなじ ポーズを して カメラの まえに たつ',
  '③ 3・2・1 で しゃしんを パシャリ！',
  '④ かたちが どれだけ ハマったか スコアが でるよ',
];

export class HowToScene extends Phaser.Scene {
  constructor() {
    super('HowTo');
  }

  create(): void {
    addBackground(this);

    this.add.text(GAME_WIDTH / 2, 110, 'あそびかた', titleStyle(52)).setOrigin(0.5);

    STEPS.forEach((step, index) => {
      this.add.text(GAME_WIDTH / 2, 230 + index * 70, step, bodyStyle(32)).setOrigin(0.5);
    });

    this.add
      .text(GAME_WIDTH / 2, 540, 'ぜんぶで 3かい ちょうせん するよ', bodyStyle(26))
      .setOrigin(0.5);

    createButton(this, GAME_WIDTH / 2, GAME_HEIGHT - 110, 'はじめる', () => {
      playTap();
      localStorage.setItem(HOW_TO_SEEN_KEY, '1');
      this.scene.start('ThemeIntro');
    });
  }
}
