// 判定演出。切り抜きが穴にハマる様子とスコアを見せる。SPEC_MODE1.md §3。
//
// miss(穴なのに埋まっていない) と overflow(穴からはみ出した) を色分けし、
// 「どこが合ってなかったか」を目で分かるようにする。

import Phaser from 'phaser';
import { judgePose, RANK_LABELS } from '../core/score';
import { playFanfare, playTap } from '../core/sound';
import { session, THEMES_PER_GAME } from '../game/session';
import { addBackground, createButton, titleStyle, bodyStyle, COLORS, GAME_WIDTH } from '../ui/ui';

// 比較画像は左、点数は右。横長では縦に積めない。
const BOARD_WIDTH = 620;
const BOARD_HEIGHT = Math.round((BOARD_WIDTH * 9) / 16);
const BOARD_X = 350;
const BOARD_Y = 300;
/** 右の情報パネル。 */
const SIDE_X = 950;

export class JudgeScene extends Phaser.Scene {
  constructor() {
    super('Judge');
  }

  create(): void {
    addBackground(this);

    const theme = session.currentTheme;
    const playerMask = session.capturedMask;
    if (!theme || !playerMask) {
      this.scene.start('Result');
      return;
    }

    const judge = judgePose(playerMask, theme.mask);
    // 記録を更新する前のベストを控えておく(「こうしん！」の判定に使う)
    const previousBest = session.bestScoreForCurrent;
    session.recordResult(judge);
    const attempt = session.currentAttempt;

    this.add.rectangle(BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT, COLORS.wall);
    this.add.image(BOARD_X, BOARD_Y, this.buildComparisonTexture(judge, theme.mask)).setOrigin(0.5);

    this.add.text(BOARD_X, 42, `${theme.name}`, bodyStyle(30)).setOrigin(0.5);

    // 凡例
    this.addLegend(BOARD_X, BOARD_Y + BOARD_HEIGHT / 2 + 40);

    // スコアは 0 から回して発表する
    const scoreText = this.add.text(SIDE_X, 180, 'ハマりど 0', titleStyle(50)).setOrigin(0.5);

    const rankText = this.add.text(SIDE_X, 290, '', titleStyle(42)).setOrigin(0.5).setAlpha(0);

    this.tweens.addCounter({
      from: 0,
      to: judge.displayScore,
      duration: 900,
      ease: 'Cubic.easeOut',
      onUpdate: (tween) => {
        scoreText.setText(`ハマりど ${Math.round(tween.getValue() ?? 0)}`);
      },
      onComplete: () => {
        rankText.setText(RANK_LABELS[judge.rank]).setAlpha(1);
        this.tweens.add({
          targets: rankText,
          scale: { from: 0.6, to: 1 },
          duration: 300,
          ease: 'Back.easeOut',
        });
        playFanfare(judge.displayScore >= 70);
      },
    });

    // 2回目からは、記録として残る点(いちばん良かった回)を添える
    if (attempt > 1) {
      const best = session.bestScoreForCurrent ?? judge.displayScore;
      const updated = previousBest === null || judge.displayScore > previousBest;
      this.add
        .text(
          SIDE_X,
          370,
          updated ? `じこベスト こうしん！ (${attempt}かいめ)` : `きろくは ${best}てん のまま`,
          bodyStyle(24),
        )
        .setOrigin(0.5)
        .setWordWrapWidth(420);
    }

    this.buildControls();

    this.add
      .text(GAME_WIDTH - 24, 24, `${session.currentIndex + 1} / ${THEMES_PER_GAME}`, bodyStyle(26))
      .setOrigin(1, 0);
  }

  /**
   * 「もういちど」と「つぎへ」を並べる。
   *
   * 点が低いと「もういっかい！」と出るのに撮り直せず、
   * 次へ進むしかないのは子どもが納得しない(SPEC_MODE1.md §2)。
   * 回数制限は設けない。記録はいちばん良かった回が残る。
   */
  private buildControls(): void {
    const isLast = session.isLastTheme;

    createButton(
      this,
      SIDE_X,
      460,
      'もういちど とる',
      () => {
        playTap();
        session.retryCurrent();
        this.scene.start('Capture');
      },
      { width: 340, height: 84, fontSize: 28 },
    );

    createButton(
      this,
      SIDE_X,
      570,
      isLast ? 'けっかを みる' : 'つぎの おだいへ',
      () => {
        playTap();
        if (isLast) {
          this.scene.start('Result');
        } else {
          session.advance();
          this.scene.start('ThemeIntro');
        }
      },
      {
        width: 340,
        height: 84,
        fontSize: 28,
        color: COLORS.accent,
        pressedColor: COLORS.accentDark,
      },
    );

    this.add.text(SIDE_X, 650, 'なんかいでも やりなおせるよ', bodyStyle(22)).setOrigin(0.5);
  }

  /**
   * お題とプレイヤーの重なりを1枚の画像にする。
   * 重なった部分・足りない部分・はみ出した部分を塗り分ける。
   */
  private buildComparisonTexture(
    judge: ReturnType<typeof judgePose>,
    target: import('../core/mask').BinaryMask,
  ): string {
    const key = `judge-${session.currentIndex}-${Date.now()}`;
    const texture = this.textures.createCanvas(key, BOARD_WIDTH, BOARD_HEIGHT);
    if (!texture) return key;

    const ctx = texture.getContext();
    const image = ctx.createImageData(target.width, target.height);

    const overlapColor = Phaser.Display.Color.IntegerToRGB(COLORS.hole);
    const missColor = Phaser.Display.Color.IntegerToRGB(COLORS.miss);
    const overflowColor = Phaser.Display.Color.IntegerToRGB(COLORS.overflow);

    for (let i = 0; i < target.data.length; i += 1) {
      const offset = i * 4;
      const inTarget = target.data[i] === 1;
      const inPlayer = judge.alignedPlayer.data[i] === 1;

      let color: { r: number; g: number; b: number } | null = null;
      let alpha = 0;

      if (inTarget && inPlayer) {
        color = overlapColor;
        alpha = 255;
      } else if (inTarget) {
        color = missColor;
        alpha = 200;
      } else if (inPlayer) {
        color = overflowColor;
        alpha = 170;
      }

      if (color) {
        image.data[offset] = color.r;
        image.data[offset + 1] = color.g;
        image.data[offset + 2] = color.b;
        image.data[offset + 3] = alpha;
      }
    }

    // マスクは低解像度なので、いったん等倍で描いてから引き伸ばす
    const scratch = document.createElement('canvas');
    scratch.width = target.width;
    scratch.height = target.height;
    scratch.getContext('2d')?.putImageData(image, 0, 0);

    ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scratch, 0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    texture.refresh();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.textures.exists(key)) this.textures.remove(key);
    });

    return key;
  }

  private addLegend(centerX: number, y: number): void {
    const items = [
      { color: COLORS.hole, label: 'ハマった' },
      { color: COLORS.miss, label: 'たりない' },
      { color: COLORS.overflow, label: 'はみだし' },
    ];

    items.forEach((item, index) => {
      const x = centerX - 200 + index * 175;
      this.add.rectangle(x - 20, y, 22, 22, item.color).setOrigin(0.5);
      this.add.text(x + 4, y, item.label, bodyStyle(22)).setOrigin(0, 0.5);
    });
  }
}
