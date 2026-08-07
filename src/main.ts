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
import { ShelterIntroScene } from './scenes/ShelterIntroScene';
import { ShelterScene } from './scenes/ShelterScene';
import { BattleIntroScene } from './scenes/BattleIntroScene';
import { BattleScene } from './scenes/BattleScene';
import { ZukanIntroScene } from './scenes/ZukanIntroScene';
import { ZukanScene } from './scenes/ZukanScene';
import { installErrorOverlay } from './core/errorOverlay';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from './ui/ui';

// 実機では開発者ツールを開けないことが多いので、例外を画面に出せるようにしておく
installErrorOverlay();

// 上から下へ落ちるゲームがあるため縦長を基準にする(CLAUDE.md §6)。
// 横向きの画面では左右に余白が出るが、FIT スケールでそのまま遊べる。
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
    ShelterIntroScene,
    ShelterScene,
    BattleIntroScene,
    BattleScene,
    ZukanIntroScene,
    ZukanScene,
  ],
});

// 開発時の動作確認から現在のシーンを参照できるようにする(本番ビルドでは含めない)
if (import.meta.env.DEV) {
  (window as unknown as { __game?: Phaser.Game }).__game = game;
}
