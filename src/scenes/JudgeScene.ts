// 判定演出。切り抜きが穴にハマる様子とスコアを見せる。SPEC_MODE1.md §3。
//
// miss(穴なのに埋まっていない) と overflow(穴からはみ出した) を色分けし、
// 「どこが合ってなかったか」を目で分かるようにする。

import Phaser from 'phaser';
import { judgePose, RANK_LABELS } from '../core/score';
import { playFanfare, playTap } from '../core/sound';
import { session, THEMES_PER_GAME } from '../game/session';
import {
  addBackground,
  createButton,
  titleStyle,
  bodyStyle,
  COLORS,
  GAME_WIDTH,
  GAME_HEIGHT,
} from '../ui/ui';

const BOARD_WIDTH = 660;
const BOARD_HEIGHT = 371;

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
    session.recordResult(judge);

    const boardX = GAME_WIDTH / 2;
    const boardY = 380;

    this.add.rectangle(boardX, boardY, BOARD_WIDTH, BOARD_HEIGHT, COLORS.wall);
    this.add.image(boardX, boardY, this.buildComparisonTexture(judge, theme.mask)).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 40, `${theme.name}`, bodyStyle(30)).setOrigin(0.5);

    // 凡例
    this.addLegend(GAME_WIDTH / 2, boardY + BOARD_HEIGHT / 2 + 44);

    // スコアは 0 から回して発表する
    const scoreText = this.add
      .text(GAME_WIDTH / 2, boardY + BOARD_HEIGHT / 2 + 130, 'ハマりど 0', titleStyle(50))
      .setOrigin(0.5);

    const rankText = this.add
      .text(GAME_WIDTH / 2, boardY + BOARD_HEIGHT / 2 + 210, '', titleStyle(40))
      .setOrigin(0.5)
      .setAlpha(0);

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

    const isLast = session.isLastTheme;
    createButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 90,
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
      { width: 400, height: 80, fontSize: 30 },
    );

    this.add
      .text(GAME_WIDTH - 24, 24, `${session.currentIndex + 1} / ${THEMES_PER_GAME}`, bodyStyle(26))
      .setOrigin(1, 0);
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
      const x = centerX - 230 + index * 200;
      this.add.rectangle(x - 20, y, 22, 22, item.color).setOrigin(0.5);
      this.add.text(x + 4, y, item.label, bodyStyle(22)).setOrigin(0, 0.5);
    });
  }
}
