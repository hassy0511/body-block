// 撮影画面。SPEC_MODE1.md §5 / CLAUDE.md §2.4。
//
// - カメラ映像を Phaser のテクスチャへ毎フレーム転写する
// - お題の穴を半透明で重ね、プレイヤーが自分を穴に重ねられるようにする
// - セグメンテーションマスクを低頻度(約8fps)で薄く色付け表示する
// - 人数分の立ち位置ガイド枠を出し、3・2・1 のカウントダウンで撮影する

import Phaser from 'phaser';
import { CameraController, createOffscreenVideoElement } from '../core/camera';
import { processMask } from '../core/mask';
import { playCountdownBeep, playShutter, playTap } from '../core/sound';
import { session } from '../game/session';
import { drawThemeSilhouette } from '../game/themeDraw';
import { addBackground, createButton, bodyStyle, COLORS, GAME_WIDTH, GAME_HEIGHT } from '../ui/ui';

/** プレビューに使う描画サイズ。実解像度より小さくして転写コストを抑える。 */
const VIEW_WIDTH = 852;
const VIEW_HEIGHT = 480;
const VIEW_X = (GAME_WIDTH - VIEW_WIDTH) / 2;
const VIEW_Y = 52;

/** マスク推論の頻度(SPEC_MODE1.md §5: 低解像度・低頻度でよい)。 */
const SEGMENT_INTERVAL_MS = 125;

export class CaptureScene extends Phaser.Scene {
  private camera!: CameraController;
  private videoEl!: HTMLVideoElement;

  private videoTexture!: Phaser.Textures.CanvasTexture;
  private maskTexture!: Phaser.Textures.CanvasTexture;

  private lastSegmentAt = 0;
  private frameTimestamp = 0;
  private isSegmenting = false;
  private isCapturing = false;
  private ready = false;

  private statusText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;

  constructor() {
    super('Capture');
  }

  create(): void {
    addBackground(this);

    const theme = session.currentTheme;
    if (!theme) {
      this.scene.start('Result');
      return;
    }

    this.isCapturing = false;
    this.ready = false;

    this.videoTexture = this.textures.createCanvas('capture-video', VIEW_WIDTH, VIEW_HEIGHT)!;
    this.maskTexture = this.textures.createCanvas('capture-mask', VIEW_WIDTH, VIEW_HEIGHT)!;

    this.add.image(VIEW_X, VIEW_Y, 'capture-video').setOrigin(0, 0);
    this.add.image(VIEW_X, VIEW_Y, 'capture-mask').setOrigin(0, 0).setAlpha(0.45);

    // お題の穴を薄く重ねる
    const silhouette = drawThemeSilhouette(this, theme, VIEW_WIDTH, VIEW_HEIGHT, '#ffffff', 0.35);
    this.add.image(VIEW_X, VIEW_Y, silhouette).setOrigin(0, 0);

    this.drawStandGuides();

    this.add
      .text(GAME_WIDTH / 2, 28, `${theme.name} の かたちに なってね`, bodyStyle(28))
      .setOrigin(0.5);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, VIEW_Y + VIEW_HEIGHT + 28, 'カメラを じゅんびちゅう...', bodyStyle(26))
      .setOrigin(0.5);

    this.countdownText = this.add
      .text(GAME_WIDTH / 2, VIEW_Y + VIEW_HEIGHT / 2, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '200px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.buildControls();
    this.setupTeardown();

    void this.startCamera();
  }

  /** 人数分の立ち位置ガイド枠(CLAUDE.md §2.4)。 */
  private drawStandGuides(): void {
    const count = session.playerCount;
    const slotWidth = VIEW_WIDTH / count;

    for (let i = 0; i < count; i += 1) {
      const centerX = VIEW_X + slotWidth * (i + 0.5);
      const frame = this.add.rectangle(
        centerX,
        VIEW_Y + VIEW_HEIGHT / 2,
        slotWidth - 16,
        VIEW_HEIGHT - 16,
      );
      frame.setStrokeStyle(3, COLORS.accent, 0.7);
      frame.setFillStyle(0, 0);

      if (count > 1) {
        this.add
          .text(centerX, VIEW_Y + VIEW_HEIGHT - 30, `${i + 1}にんめ`, bodyStyle(22))
          .setOrigin(0.5)
          .setColor('#ffffff');
      }
    }
  }

  private buildControls(): void {
    const y = GAME_HEIGHT - 78;

    createButton(this, GAME_WIDTH / 2, y, 'さつえい！', () => this.beginCountdown(), {
      width: 300,
      height: 76,
      fontSize: 34,
    });

    createButton(
      this,
      GAME_WIDTH / 2 - 330,
      y,
      'カメラきりかえ',
      () => {
        playTap();
        void this.camera.switchFacing().catch(() => {
          this.statusText.setText('カメラを きりかえられませんでした');
        });
      },
      {
        width: 260,
        height: 68,
        fontSize: 26,
        color: COLORS.accent,
        pressedColor: COLORS.accentDark,
      },
    );

    // 手動の撮り直しボタンは常設する(SPEC_MODE1.md §2)
    createButton(
      this,
      GAME_WIDTH / 2 + 330,
      y,
      'とりなおす',
      () => {
        playTap();
        this.scene.restart();
      },
      {
        width: 240,
        height: 68,
        fontSize: 26,
        color: COLORS.accent,
        pressedColor: COLORS.accentDark,
      },
    );
  }

  private setupTeardown(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.camera?.stop();
      this.videoEl?.remove();
      if (this.textures.exists('capture-video')) this.textures.remove('capture-video');
      if (this.textures.exists('capture-mask')) this.textures.remove('capture-mask');
    });
  }

  private async startCamera(): Promise<void> {
    this.videoEl = createOffscreenVideoElement();
    this.camera = new CameraController(this.videoEl);
    try {
      await this.camera.start('user');
      this.ready = true;
      this.statusText.setText('ぜんしんが うつるように はなれてね');
    } catch {
      this.statusText.setText('カメラを つかえませんでした。きょかを かくにんしてね');
    }
  }

  update(): void {
    if (!this.ready || this.videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    this.drawVideoFrame();

    const now = this.time.now;
    if (!this.isSegmenting && now - this.lastSegmentAt >= SEGMENT_INTERVAL_MS) {
      this.lastSegmentAt = now;
      this.updateMaskOverlay();
    }
  }

  /** 映像をテクスチャへ転写する。インカメラは鏡像にする。 */
  private drawVideoFrame(): void {
    const ctx = this.videoTexture.getContext();
    const mirrored = this.camera.facingMode === 'user';

    ctx.save();
    if (mirrored) {
      ctx.translate(VIEW_WIDTH, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(this.videoEl, 0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.restore();
    this.videoTexture.refresh();
  }

  private updateMaskOverlay(): void {
    const segmenter = session.segmenter;
    if (!segmenter) return;

    this.isSegmenting = true;
    try {
      this.frameTimestamp += SEGMENT_INTERVAL_MS;
      const result = segmenter.segment(this.videoEl, this.frameTimestamp);
      const mask = result.categoryMask;
      if (!mask) return;

      const processed = processMask(
        mask.getAsUint8Array(),
        mask.width,
        mask.height,
        (value) => segmenter.isPerson(value),
        { humanEvidenceCategories: segmenter.humanEvidenceCategories },
      );
      result.close();

      this.paintMask(processed.mask.data, processed.mask.width, processed.mask.height);
    } catch {
      // プレビューの推論失敗は致命的ではないので黙って次フレームへ
    } finally {
      this.isSegmenting = false;
    }
  }

  /** 二値マスクを拡大してオーバーレイテクスチャへ描く。 */
  private paintMask(data: Uint8Array, width: number, height: number): void {
    const ctx = this.maskTexture.getContext();
    ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    const scaleX = VIEW_WIDTH / width;
    const scaleY = VIEW_HEIGHT / height;
    const mirrored = this.camera.facingMode === 'user';

    ctx.save();
    if (mirrored) {
      ctx.translate(VIEW_WIDTH, 0);
      ctx.scale(-1, 1);
    }
    ctx.fillStyle = '#00d0ff';
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[y * width + x] === 1) {
          ctx.fillRect(x * scaleX, y * scaleY, scaleX + 1, scaleY + 1);
        }
      }
    }
    ctx.restore();
    this.maskTexture.refresh();
  }

  /** 3・2・1 →シャッター。「せーの！」の一体感を作る(CLAUDE.md §2.4)。 */
  private beginCountdown(): void {
    if (this.isCapturing || !this.ready) return;
    this.isCapturing = true;
    this.statusText.setText('ポーズを とって！');

    let count = 3;
    const tick = (): void => {
      this.countdownText.setText(String(count)).setAlpha(1).setScale(1.4);
      playCountdownBeep();
      this.tweens.add({
        targets: this.countdownText,
        scale: 1,
        alpha: 0.2,
        duration: 700,
      });

      count -= 1;
      if (count > 0) {
        this.time.delayedCall(1000, tick);
      } else {
        this.time.delayedCall(1000, () => {
          this.countdownText.setAlpha(0);
          playShutter();
          this.captureAndJudge();
        });
      }
    };
    tick();
  }

  private captureAndJudge(): void {
    const segmenter = session.segmenter;
    const theme = session.currentTheme;
    if (!segmenter || !theme) return;

    // 判定はフル解像度の静止画1枚に対して行う(SPEC_MODE1.md §5)
    const width = this.videoEl.videoWidth;
    const height = this.videoEl.videoHeight;
    if (width === 0 || height === 0) {
      this.statusText.setText('うまく さつえいできませんでした。もういちど！');
      this.isCapturing = false;
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (this.camera.facingMode === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(this.videoEl, 0, 0, width, height);

    try {
      this.frameTimestamp += SEGMENT_INTERVAL_MS;
      const result = segmenter.segment(canvas, this.frameTimestamp);
      const mask = result.categoryMask;
      if (!mask) {
        this.retry('うまく きりぬけませんでした。もういちど！');
        return;
      }

      const processed = processMask(
        mask.getAsUint8Array(),
        mask.width,
        mask.height,
        (value) => segmenter.isPerson(value),
        { humanEvidenceCategories: segmenter.humanEvidenceCategories },
      );
      result.close();

      // 検出した塊の数がお題の想定と合わなければ撮り直し(SPEC_MODE1.md §2)
      if (processed.accepted.length !== theme.expectedBlobs) {
        this.retry('はなれて たちなおしてね！');
        return;
      }

      session.capturedMask = processed.mask;
      this.scene.start('Judge');
    } catch {
      this.retry('うまく きりぬけませんでした。もういちど！');
    }
  }

  private retry(message: string): void {
    this.statusText.setText(message);
    this.isCapturing = false;
  }
}
