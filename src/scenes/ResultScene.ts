// 結果画面。合計スコアとランク、もういちど / タイトルへ。SPEC_MODE1.md §2。

import Phaser from 'phaser';
import { playFanfare, playTap } from '../core/sound';
import { session, overallRank, OVERALL_RANK_LABELS, THEMES_PER_GAME } from '../game/session';
import {
  addBackground,
  createButton,
  titleStyle,
  bodyStyle,
  COLORS,
  GAME_WIDTH,
  GAME_HEIGHT,
} from '../ui/ui';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(): void {
    addBackground(this);

    const results = session.results;
    const total = session.totalScore;
    const rank = overallRank(session.averageScore);

    this.add.text(GAME_WIDTH / 2, 150, 'けっか はっぴょう！', titleStyle(44)).setOrigin(0.5);

    // お題ごとの内訳
    results.forEach((result, index) => {
      const y = 300 + index * 70;
      this.add.text(60, y, `${index + 1}. ${result.theme.name}`, bodyStyle(30)).setOrigin(0, 0.5);
      this.add
        .text(GAME_WIDTH - 60, y, `${result.judge.displayScore}てん`, bodyStyle(30))
        .setOrigin(1, 0.5);
    });

    if (results.length === 0) {
      this.add.text(GAME_WIDTH / 2, 330, 'きろくが ありませんでした', bodyStyle(30)).setOrigin(0.5);
    }

    const maxScore = THEMES_PER_GAME * 100;
    this.add
      .text(GAME_WIDTH / 2, 600, `ごうけい ${total} / ${maxScore} てん`, titleStyle(40))
      .setOrigin(0.5);

    const rankText = this.add
      .text(GAME_WIDTH / 2, 700, OVERALL_RANK_LABELS[rank], titleStyle(40))
      .setOrigin(0.5)
      .setScale(0.6);

    this.tweens.add({
      targets: rankText,
      scale: 1,
      duration: 400,
      ease: 'Back.easeOut',
      onComplete: () => playFanfare(rank === 'gold' || rank === 'silver'),
    });

    createButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 250,
      'もういちど',
      () => {
        playTap();
        this.scene.start('PlayerSelect');
      },
      { width: 380, height: 84, fontSize: 32 },
    );

    createButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 140,
      'タイトルへ',
      () => {
        playTap();
        this.scene.start('Title');
      },
      {
        width: 380,
        height: 84,
        fontSize: 32,
        color: COLORS.accent,
        pressedColor: COLORS.accentDark,
      },
    );
  }
}
