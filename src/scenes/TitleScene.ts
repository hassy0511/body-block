import Phaser from 'phaser';
import {
  addBackground,
  createButton,
  titleStyle,
  bodyStyle,
  COLORS,
  GAME_WIDTH,
  GAME_HEIGHT,
} from '../ui/ui';
import { playTap, unlockAudio } from '../core/sound';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    addBackground(this);

    this.add
      .text(GAME_WIDTH / 2, 200, 'からだブロック凹凸\nうつしてポン！', titleStyle(64))
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 330, 'あそびたい ゲームを えらんでね', bodyStyle(30))
      .setOrigin(0.5);

    const start = (scene: string): void => {
      // 最初のタップで音を鳴らせるようにする(iOS の制約)
      unlockAudio();
      playTap();
      this.scene.start(scene);
    };

    createButton(this, GAME_WIDTH / 2 - 230, 450, 'ポーズでハマる！', () => start('PlayerSelect'), {
      width: 400,
      height: 110,
      fontSize: 34,
    });

    createButton(this, GAME_WIDTH / 2 + 230, 450, 'たいそうタワー', () => start('TowerIntro'), {
      width: 400,
      height: 110,
      fontSize: 34,
      color: COLORS.accent,
      pressedColor: COLORS.accentDark,
    });

    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT - 60,
        'カメラを つかいます。しゃしんは このはしから そとに でません。',
        bodyStyle(22),
      )
      .setOrigin(0.5);
  }
}
