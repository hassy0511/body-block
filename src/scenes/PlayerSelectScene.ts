import Phaser from 'phaser';
import {
  addBackground,
  createButton,
  titleStyle,
  bodyStyle,
  GAME_WIDTH,
  GAME_HEIGHT,
} from '../ui/ui';
import { playTap } from '../core/sound';
import { pickThemes, loadThemes } from '../themes/themes';
import { session, THEMES_PER_GAME } from '../game/session';

const HOW_TO_SEEN_KEY = 'bodyblock.mode1.howToSeen';

export class PlayerSelectScene extends Phaser.Scene {
  constructor() {
    super('PlayerSelect');
  }

  create(): void {
    addBackground(this);

    this.add.text(GAME_WIDTH / 2, 180, 'なんにんで あそぶ？', titleStyle(42)).setOrigin(0.5);

    const status = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 90, '', bodyStyle(26))
      .setOrigin(0.5);

    const buttons: Phaser.GameObjects.Container[] = [];
    [1, 2, 3].forEach((count, index) => {
      const button = createButton(
        this,
        GAME_WIDTH / 2,
        340 + index * 150,
        `${count}にん`,
        () => {
          playTap();
          buttons.forEach((b) => b.disableInteractive());
          void this.startGame(count, status);
        },
        { width: 320, height: 110, fontSize: 40 },
      );
      buttons.push(button);
    });

    createButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 140,
      'もどる',
      () => {
        playTap();
        this.scene.start('Title');
      },
      { width: 220, height: 76, fontSize: 30 },
    );
  }

  private async startGame(playerCount: number, status: Phaser.GameObjects.Text): Promise<void> {
    status.setText('おだいを よみこんでいます...');
    try {
      const metas = pickThemes(playerCount, THEMES_PER_GAME);
      const themes = await loadThemes(metas);
      session.startGame(playerCount, themes);

      const seen = localStorage.getItem(HOW_TO_SEEN_KEY) === '1';
      this.scene.start(seen ? 'ThemeIntro' : 'HowTo');
    } catch {
      status.setText('おだいの よみこみに しっぱいしました。もういちど えらんでね');
      this.scene.restart();
    }
  }
}

export { HOW_TO_SEEN_KEY };
