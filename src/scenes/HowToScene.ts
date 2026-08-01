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
  '② 「スタート！」を おしたら はなれて じゅんび',
  '③ 10びょう いないに おなじ ポーズに なろう！',
  '④ じかんが きたら パシャリ。ハマりどが でるよ',
];

export class HowToScene extends Phaser.Scene {
  constructor() {
    super('HowTo');
  }

  create(): void {
    addBackground(this);

    this.add.text(GAME_WIDTH / 2, 80, 'あそびかた', titleStyle(44)).setOrigin(0.5);

    STEPS.forEach((step, index) => {
      this.add
        .text(GAME_WIDTH / 2, 200 + index * 70, step, bodyStyle(28))
        .setOrigin(0.5)
        .setWordWrapWidth(GAME_WIDTH - 120);
    });

    this.add
      .text(GAME_WIDTH / 2, 510, 'ぜんぶで 3かい ちょうせん するよ', bodyStyle(26))
      .setOrigin(0.5);

    createButton(this, GAME_WIDTH / 2, GAME_HEIGHT - 90, 'はじめる', () => {
      playTap();
      localStorage.setItem(HOW_TO_SEEN_KEY, '1');
      this.scene.start('ThemeIntro');
    });
  }
}
