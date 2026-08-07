// 撮影画面(モード1)。SPEC_MODE1.md §5 / CLAUDE.md §2.4。
//
// カメラまわりは CameraPanel に切り出してあるので、ここは
// お題の重ね表示・撮り直し判定・次のシーンへの受け渡しに専念する。

import Phaser from 'phaser';
import type { ProcessedMask } from '../core/mask';
import { judgePose } from '../core/score';
import { playTap } from '../core/sound';
import { session, type CaptureRequest } from '../game/session';
import { CameraPanel, PANEL_DEPTH, type CapturedFrame } from '../game/cameraPanel';
import { drawThemeHole, drawThemeSilhouette } from '../game/themeDraw';
import {
  addBackground,
  createButton,
  titleStyle,
  bodyStyle,
  COLORS,
  GAME_WIDTH,
  GAME_HEIGHT,
} from '../ui/ui';

/** ポーズを作るための既定の制限時間(秒)。端末から離れて構えるので短すぎないようにする。 */
export const DEFAULT_TIME_LIMIT_SEC = 10;

/**
 * カメラの表示領域。
 *
 * お題の画像は 16:9 なので、カメラ枠も 16:9 にしてある。
 * 枠とお題の比率が違うと、重ねて見せている形と判定に使う形が食い違い、
 * 「見た目は合っているのに点が出ない」ことになる。
 */
const CAM_X = 0;
const CAM_Y = 108;
const CAM_WIDTH = GAME_WIDTH;
const CAM_HEIGHT = Math.round((GAME_WIDTH * 9) / 16);
const CAM_BOTTOM = CAM_Y + CAM_HEIGHT;

/** 手本として出すお題の縮小表示。 */
const SAMPLE_WIDTH = 300;
const SAMPLE_HEIGHT = Math.round((SAMPLE_WIDTH * 9) / 16);

export class CaptureScene extends Phaser.Scene {
  private panel!: CameraPanel;
  private request!: CaptureRequest;
  private busy = false;

  private statusText!: Phaser.GameObjects.Text;
  private startLabel!: Phaser.GameObjects.Text;
  private fitText: Phaser.GameObjects.Text | null = null;

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
    this.fitText = null;

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
      onPreviewMask: request.theme ? (processed) => this.updateFit(processed) : undefined,
    });

    if (request.theme) this.buildThemeOverlay();

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 210, 'カメラを じゅんびちゅう...', bodyStyle(24))
      .setOrigin(0.5)
      .setWordWrapWidth(GAME_WIDTH - 40);

    this.buildControls();

    void this.panel.start().then((ok) => {
      // カメラ起動が返ってくる前にシーンを離れていたら何もしない。
      // 破棄ずみのテキストへ書き込むと例外になる(実機で発生した)
      if (!this.statusText.scene) return;
      this.statusText.setText(
        ok
          ? `「スタート！」を おしてから ${this.request.timeLimitSec}びょう。あなに からだを あわせてね`
          : 'カメラを つかえませんでした。きょかを かくにんしてね',
      );
    });
  }

  /**
   * お題の穴をカメラ映像に重ねる。
   *
   * カメラ表示より手前の深さに置くこと。奥に置くと映像に隠れて
   * まったく見えず、どこに体を持っていけばよいのか分からなくなる。
   */
  private buildThemeOverlay(): void {
    const theme = this.request.theme!;

    this.add
      .image(CAM_X, CAM_Y, drawThemeHole(this, theme, CAM_WIDTH, CAM_HEIGHT))
      .setOrigin(0, 0)
      .setDepth(PANEL_DEPTH + 2);

    // いま何点かを大きく出す。合わせている最中に見るものなのでカメラのすぐ下に置く
    this.fitText = this.add
      .text(GAME_WIDTH / 2, CAM_BOTTOM + 62, 'ハマりど --', titleStyle(48))
      .setOrigin(0.5);

    // 手本。穴に重ねただけだと全体の形が掴みにくいので、別に小さく出す
    const sampleY = CAM_BOTTOM + 240;
    this.add
      .text(
        GAME_WIDTH / 2,
        sampleY - SAMPLE_HEIGHT / 2 - 32,
        `おてほん: ${theme.name}`,
        bodyStyle(26),
      )
      .setOrigin(0.5);
    this.add.rectangle(GAME_WIDTH / 2, sampleY, SAMPLE_WIDTH + 16, SAMPLE_HEIGHT + 16, COLORS.wall);
    this.add
      .image(
        GAME_WIDTH / 2,
        sampleY,
        drawThemeSilhouette(this, theme, SAMPLE_WIDTH, SAMPLE_HEIGHT, '#fff9ef'),
      )
      .setOrigin(0.5);
  }

  /** プレビューの推論結果から、いまのハマり度を出す。 */
  private updateFit(processed: ProcessedMask): void {
    const theme = this.request.theme;
    if (!theme || !this.fitText) return;

    const score = judgePose(processed.mask, theme.mask).displayScore;
    this.fitText.setText(`ハマりど ${score}`);
    this.fitText.setColor(score >= 70 ? '#209aa1' : score >= 50 ? '#c07a20' : COLORS.text);
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
        if (this.panel.isCountingDown) {
          this.statusText.setText('さつえいちゅうは きりかえられないよ');
          return;
        }
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
