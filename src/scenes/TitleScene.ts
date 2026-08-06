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
      .text(GAME_WIDTH / 2, 96, 'からだブロック凹凸\nうつしてポン！', titleStyle(50))
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 220, 'あそびたい ゲームを えらんでね', bodyStyle(28))
      .setOrigin(0.5);

    const start = (scene: string): void => {
      // 最初のタップで音を鳴らせるようにする(iOS の制約)
      unlockAudio();
      playTap();
      this.scene.start(scene);
    };

    // どのゲームも最初から自由に選べる。ステージ解放のような縛りは作らない
    const modes: [string, string, boolean][] = [
      ['ポーズでハマる！', 'PlayerSelect', false],
      ['たいそうタワー', 'TowerIntro', true],
      ['まもって！シェルター', 'ShelterIntro', false],
      ['こわしてバトル', 'BattleIntro', true],
      ['いきものずかん', 'ZukanIntro', false],
    ];

    modes.forEach(([label, scene, alt], index) => {
      // 上段3つ・下段2つの2列
      const row = index < 3 ? 0 : 1;
      const x = row === 0 ? 250 + index * 390 : 445 + (index - 3) * 390;
      const y = row === 0 ? 340 : 490;
      createButton(this, x, y, label, () => start(scene), {
        width: 360,
        height: 110,
        fontSize: 28,
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
