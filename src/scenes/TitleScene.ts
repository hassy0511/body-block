import Phaser from 'phaser';
import {
  addBackground,
  createButton,
  titleStyle,
  bodyStyle,
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

    this.add.text(GAME_WIDTH / 2, 350, 'ポーズでハマる！', bodyStyle(36)).setOrigin(0.5);

    createButton(this, GAME_WIDTH / 2, 490, 'あそぶ', () => {
      // 最初のタップで音を鳴らせるようにする(iOS の制約)
      unlockAudio();
      playTap();
      this.scene.start('PlayerSelect');
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
