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
      .text(GAME_WIDTH / 2, 170, 'からだブロック凹凸\nうつしてポン！', titleStyle(48))
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 290, 'あそびたい ゲームを えらんでね', bodyStyle(28))
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
      createButton(this, GAME_WIDTH / 2, 420 + index * 138, label, () => start(scene), {
        width: 480,
        height: 110,
        fontSize: 32,
        ...(alt ? { color: COLORS.accent, pressedColor: COLORS.accentDark } : {}),
      });
    });

    // 2台接続(実験)への入口。プロトタイプ段階なので目立たせず、でも見つかる場所に
    const pairLink = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 130, 'じっけんちゅう: 2だいで つなぐ →', bodyStyle(24))
      .setOrigin(0.5)
      .setColor('#209aa1')
      .setInteractive({ useHandCursor: true });
    pairLink.on('pointerup', () => {
      window.location.href = 'pair.html';
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
