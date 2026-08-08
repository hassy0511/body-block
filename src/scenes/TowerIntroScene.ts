// モード2 の導入。ゴールの高さ(難しさ)と人数を選んで撮影へ送り出す。

import Phaser from 'phaser';
import { playTap } from '../core/sound';
import { session, type TowerGoal } from '../game/session';
import {
  addBackground,
  createButton,
  titleStyle,
  bodyStyle,
  COLORS,
  GAME_WIDTH,
  GAME_HEIGHT,
} from '../ui/ui';

/**
 * ゴールの高さの選択肢。
 * カメラから離れて撮るほどブロックが小さくなり、同じ高さでも難しくなる。
 * 遊ぶ距離は部屋の事情で変えられないので、高さのほうを選べるようにした。
 */
const GOAL_CHOICES: { key: TowerGoal; label: string }[] = [
  { key: 'low', label: 'ひくい' },
  { key: 'mid', label: 'ふつう' },
  { key: 'high', label: 'たかい' },
];

export class TowerIntroScene extends Phaser.Scene {
  private goalButtons = new Map<TowerGoal, Phaser.GameObjects.Container>();

  constructor() {
    super('TowerIntro');
  }

  create(): void {
    addBackground(this);
    this.goalButtons.clear();

    this.add.text(GAME_WIDTH / 2, 140, 'たいそうタワー', titleStyle(46)).setOrigin(0.5);

    [
      'すきな ポーズで しゃしんを とると',
      'その かたちが ブロックに なって',
      'そのまま したへ おちてくるよ',
      'なんかいも とって、たかく つみあげよう！',
    ].forEach((line, index) => {
      this.add
        .text(GAME_WIDTH / 2, 260 + index * 54, line, bodyStyle(26))
        .setOrigin(0.5)
        .setWordWrapWidth(GAME_WIDTH - 60);
    });

    this.add.text(GAME_WIDTH / 2, 560, 'ゴールの たかさは？', bodyStyle(28)).setOrigin(0.5);

    GOAL_CHOICES.forEach((choice, index) => {
      const button = createButton(
        this,
        130 + index * 230,
        648,
        choice.label,
        () => {
          playTap();
          session.towerGoal = choice.key;
          this.refreshGoalButtons();
        },
        {
          width: 210,
          height: 88,
          fontSize: 30,
          color: COLORS.accent,
          pressedColor: COLORS.accentDark,
        },
      );
      this.goalButtons.set(choice.key, button);
    });
    this.refreshGoalButtons();

    this.add
      .text(GAME_WIDTH / 2, 716, 'ひくいほど かんたんだよ', bodyStyle(20))
      .setOrigin(0.5)
      .setColor('#8a7460');

    this.add.text(GAME_WIDTH / 2, 800, 'なんにんで あそぶ？', bodyStyle(28)).setOrigin(0.5);

    [1, 2, 3].forEach((count, index) => {
      createButton(
        this,
        130 + index * 230,
        892,
        `${count}にん`,
        () => {
          playTap();
          this.startCapture(count);
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

  /** いま選ばれている高さだけをはっきり見せる。 */
  private refreshGoalButtons(): void {
    for (const [key, button] of this.goalButtons) {
      button.setAlpha(key === session.towerGoal ? 1 : 0.4);
    }
  }

  private startCapture(playerCount: number): void {
    // モード2 は撮影と落下が同じ画面で続くので、撮影シーンは経由しない
    session.startGame(playerCount, []);
    session.captureRequest = null;
    this.scene.start('Tower');
  }
}
