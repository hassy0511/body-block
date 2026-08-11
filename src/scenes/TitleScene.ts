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
import { isRemoteActive, disconnectRemote } from '../core/remoteCamera';
import { openPairOverlay } from '../game/pairOverlay';

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

    // どのゲームも最初から自由に選べる。ステージ解放のような縛りは作らない。
    // 7本になったので2列に並べる(1列だと縦に収まらない)
    const modes: [string, string, boolean][] = [
      ['ポーズでハマる！', 'PlayerSelect', false],
      ['たいそうタワー', 'TowerIntro', true],
      ['まもって！シェルター', 'ShelterIntro', false],
      ['こわしてバトル', 'BattleIntro', true],
      ['いきものずかん', 'ZukanIntro', false],
      ['コロコロゴール！', 'RollIntro', true],
      ['あめあめキャッチ', 'CatchIntro', false],
    ];

    modes.forEach(([label, scene, alt], index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      // 最後の1つが余ったら中央に置く
      const isLastAlone = index === modes.length - 1 && modes.length % 2 === 1;
      const x = isLastAlone ? GAME_WIDTH / 2 : GAME_WIDTH / 2 + (column === 0 ? -174 : 174);
      createButton(this, x, 410 + row * 126, label, () => start(scene), {
        width: 336,
        height: 104,
        fontSize: 26,
        ...(alt ? { color: COLORS.accent, pressedColor: COLORS.accentDark } : {}),
      });
    });

    // 2台モードへの入口。この端末が「画面やく」になり、
    // カメラやく端末(pair.html)の映像で全モードが遊べるようになる
    const pairLink = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 130, '', bodyStyle(24))
      .setOrigin(0.5)
      .setColor('#209aa1')
      .setInteractive({ useHandCursor: true });

    const refreshPairLink = (): void => {
      if (!pairLink.scene) return; // シーンを離れたあとに resolve されても書き込まない
      pairLink.setText(
        isRemoteActive()
          ? '📡 2だいモードで あそびちゅう (タップで きる)'
          : '2だいで つなぐ（カメラやく／がめんやく）→',
      );
    };
    refreshPairLink();

    pairLink.on('pointerup', () => {
      playTap();
      if (isRemoteActive()) {
        disconnectRemote();
        refreshPairLink();
        return;
      }
      void openPairOverlay().then((connected) => {
        refreshPairLink();
        if (connected) unlockAudio();
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

    // 表示中の版。キャッシュが古い端末をすぐ見分けるためのもの
    this.add
      .text(GAME_WIDTH - 8, GAME_HEIGHT - 6, `v ${__BUILD_ID__}`, bodyStyle(14))
      .setOrigin(1, 1)
      .setAlpha(0.55);
  }
}
