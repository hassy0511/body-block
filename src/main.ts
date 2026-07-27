import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { PlayerSelectScene } from './scenes/PlayerSelectScene';
import { HowToScene } from './scenes/HowToScene';
import { ThemeIntroScene } from './scenes/ThemeIntroScene';
import { CaptureScene } from './scenes/CaptureScene';
import { JudgeScene } from './scenes/JudgeScene';
import { ResultScene } from './scenes/ResultScene';
import { TowerIntroScene } from './scenes/TowerIntroScene';
import { TowerScene } from './scenes/TowerScene';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from './ui/ui';

// 家庭でタブレットを立てて遊ぶ横向きを基準にする(CLAUDE.md §6)。
// 縦向きでも遊べるよう、画面に合わせて縮小表示する。
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.bgCss,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 1.1 },
      // 形が合っているかを確認したいときは true にする
      debug: false,
    },
  },
  scene: [
    BootScene,
    TitleScene,
    PlayerSelectScene,
    HowToScene,
    ThemeIntroScene,
    CaptureScene,
    JudgeScene,
    ResultScene,
    TowerIntroScene,
    TowerScene,
  ],
});

// 開発時の動作確認から現在のシーンを参照できるようにする(本番ビルドでは含めない)
if (import.meta.env.DEV) {
  (window as unknown as { __game?: Phaser.Game }).__game = game;
}
