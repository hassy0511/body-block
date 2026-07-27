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
      .text(GAME_WIDTH / 2, 240, 'からだブロック凹凸\nうつしてポン！', titleStyle(48))
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

    createButton(this, GAME_WIDTH / 2, 530, 'ポーズでハマる！', () => start('PlayerSelect'), {
      width: 460,
      height: 110,
      fontSize: 34,
    });

    createButton(this, GAME_WIDTH / 2, 680, 'たいそうタワー', () => start('TowerIntro'), {
      width: 460,
      height: 110,
      fontSize: 34,
      color: COLORS.accent,
      pressedColor: COLORS.accentDark,
    });

    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT - 70,
        'カメラを つかいます。\nしゃしんは このはしから そとに でません。',
        bodyStyle(22),
      )
      .setOrigin(0.5);
  }
}
