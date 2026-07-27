// 撮影画面(モード1)。SPEC_MODE1.md §5 / CLAUDE.md §2.4。
//
// カメラまわりは CameraPanel に切り出してあるので、ここは
// お題の重ね表示・撮り直し判定・次のシーンへの受け渡しに専念する。

import Phaser from 'phaser';
import { playTap } from '../core/sound';
import { session, type CaptureRequest } from '../game/session';
import { CameraPanel, type CapturedFrame } from '../game/cameraPanel';
import { drawThemeSilhouette } from '../game/themeDraw';
import { addBackground, createButton, bodyStyle, COLORS, GAME_WIDTH, GAME_HEIGHT } from '../ui/ui';

/** ポーズを作るための既定の制限時間(秒)。端末から離れて構えるので短すぎないようにする。 */
export const DEFAULT_TIME_LIMIT_SEC = 10;

const CAM_X = 0;
const CAM_Y = 130;
const CAM_WIDTH = GAME_WIDTH;
const CAM_HEIGHT = 720;

export class CaptureScene extends Phaser.Scene {
  private panel!: CameraPanel;
  private request!: CaptureRequest;
  private busy = false;

  private statusText!: Phaser.GameObjects.Text;
  private startLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('Capture');
  }

  create(): void {
    addBackground(this);

    const request = session.captureRequest;
    if (!request) {
      this.scene.start('Title');
      return;
    }
    this.request = request;
    this.busy = false;

    this.add
      .text(GAME_WIDTH / 2, 46, request.headline, bodyStyle(30))
      .setOrigin(0.5)
      .setWordWrapWidth(GAME_WIDTH - 40);

    this.panel = new CameraPanel(this, {
      x: CAM_X,
      y: CAM_Y,
      width: CAM_WIDTH,
      height: CAM_HEIGHT,
      guideCount: session.playerCount,
    });

    // お題がある場合だけ、穴を薄く重ねる
    if (request.theme) {
      const silhouette = drawThemeSilhouette(
        this,
        request.theme,
        CAM_WIDTH,
        CAM_HEIGHT,
        '#ffffff',
        0.35,
      );
      this.add.image(CAM_X, CAM_Y, silhouette).setOrigin(0, 0);
    }

    this.statusText = this.add
      .text(GAME_WIDTH / 2, CAM_Y + CAM_HEIGHT + 32, 'カメラを じゅんびちゅう...', bodyStyle(24))
      .setOrigin(0.5)
      .setWordWrapWidth(GAME_WIDTH - 40);

    this.buildControls();

    void this.panel.start().then((ok) => {
      this.statusText.setText(
        ok
          ? `「スタート！」を おしてから ${this.request.timeLimitSec}びょう。ぜんしんが うつるように はなれてね`
          : 'カメラを つかえませんでした。きょかを かくにんしてね',
      );
    });
  }

  private buildControls(): void {
    const startButton = createButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 130,
      'スタート！',
      () => this.beginShot(),
      { width: 320, height: 80, fontSize: 34 },
    );
    this.startLabel = startButton.getData('label') as Phaser.GameObjects.Text;

    createButton(
      this,
      GAME_WIDTH / 2 - 170,
      GAME_HEIGHT - 44,
      'カメラきりかえ',
      () => {
        playTap();
        void this.panel.switchFacing().catch(() => {
          this.statusText.setText('カメラを きりかえられませんでした');
        });
      },
      {
        width: 300,
        height: 60,
        fontSize: 24,
        color: COLORS.accent,
        pressedColor: COLORS.accentDark,
      },
    );

    // 手動の撮り直しボタンは常設する(SPEC_MODE1.md §2)
    createButton(
      this,
      GAME_WIDTH / 2 + 170,
      GAME_HEIGHT - 44,
      'とりなおす',
      () => {
        playTap();
        this.scene.restart();
      },
      {
        width: 280,
        height: 60,
        fontSize: 24,
        color: COLORS.accent,
        pressedColor: COLORS.accentDark,
      },
    );
  }

  private beginShot(): void {
    if (this.busy || !this.panel.ready) return;
    this.busy = true;
    this.startLabel.setText('とりくみちゅう');
    this.statusText.setText('はやく ポーズを とって！');

    this.panel.beginCountdown(
      this.request.timeLimitSec,
      (frame) => this.onCaptured(frame),
      (message) => this.retry(message),
    );
  }

  private onCaptured(frame: CapturedFrame): void {
    const { processed, image } = frame;

    // 検出した塊の数がお題の想定と合わなければ撮り直し(SPEC_MODE1.md §2)
    if (processed.accepted.length !== this.request.expectedBlobs) {
      this.retry('はなれて たちなおしてね！');
      return;
    }

    session.captured = {
      mask: processed.mask,
      labels: processed.labels,
      blobs: processed.accepted,
      image,
    };
    this.scene.start(this.request.nextScene);
  }

  private retry(message: string): void {
    this.startLabel.setText('もういちど');
    this.statusText.setText(message);
    this.busy = false;
  }

  update(): void {
    this.panel.update();
  }
}
