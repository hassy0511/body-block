// 結果画面。合計スコアとランク、もういちど / タイトルへ。SPEC_MODE1.md §2。

import Phaser from 'phaser';
import { playFanfare, playTap } from '../core/sound';
import { session, overallRank, OVERALL_RANK_LABELS } from '../game/session';
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

    this.add.text(GAME_WIDTH / 2, 70, 'けっか はっぴょう！', titleStyle(44)).setOrigin(0.5);

    // お題ごとの内訳
    results.forEach((result, index) => {
      const y = 180 + index * 62;
      this.add.text(300, y, `${index + 1}. ${result.theme.name}`, bodyStyle(30)).setOrigin(0, 0.5);
      this.add
        .text(GAME_WIDTH - 300, y, `${result.judge.displayScore}てん`, bodyStyle(30))
        .setOrigin(1, 0.5);
    });

    if (results.length === 0) {
      this.add.text(GAME_WIDTH / 2, 200, 'きろくが ありませんでした', bodyStyle(30)).setOrigin(0.5);
    }

    const maxScore = session.themeCount * 100;
    this.add
      .text(GAME_WIDTH / 2, 410, `ごうけい ${total} / ${maxScore} てん`, titleStyle(40))
      .setOrigin(0.5);

    const rankText = this.add
      .text(GAME_WIDTH / 2, 490, OVERALL_RANK_LABELS[rank], titleStyle(40))
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
      GAME_WIDTH / 2 - 220,
      GAME_HEIGHT - 80,
      'もういちど',
      () => {
        playTap();
        this.scene.start('PlayerSelect');
      },
      { width: 340, height: 76, fontSize: 30 },
    );

    createButton(
      this,
      GAME_WIDTH / 2 + 220,
      GAME_HEIGHT - 80,
      'タイトルへ',
      () => {
        playTap();
        this.scene.start('Title');
      },
      {
        width: 340,
        height: 76,
        fontSize: 30,
        color: COLORS.accent,
        pressedColor: COLORS.accentDark,
      },
    );
  }
}
