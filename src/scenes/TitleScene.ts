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
      .text(GAME_WIDTH / 2, 110, 'からだブロック凹凸\nうつしてポン！', titleStyle(52))
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 240, 'あそびたい ゲームを えらんでね', bodyStyle(30))
      .setOrigin(0.5);

    const start = (scene: string): void => {
      // 最初のタップで音を鳴らせるようにする(iOS の制約)
      unlockAudio();
      playTap();
      this.scene.start(scene);
    };

    const modes: [string, string, boolean][] = [
      ['ポーズでハマる！', 'PlayerSelect', false],
      ['たいそうタワー', 'TowerIntro', true],
      ['まもって！シェルター', 'ShelterIntro', false],
    ];

    modes.forEach(([label, scene, alt], index) => {
      createButton(this, 250 + index * 390, 420, label, () => start(scene), {
        width: 360,
        height: 130,
        fontSize: 30,
        ...(alt ? { color: COLORS.accent, pressedColor: COLORS.accentDark } : {}),
      });
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
