// 撮影画面。SPEC_MODE1.md §5 / CLAUDE.md §2.4。
//
// - カメラ映像を Phaser のテクスチャへ毎フレーム転写する
// - お題の穴を半透明で重ね、プレイヤーが自分を穴に重ねられるようにする
// - セグメンテーションマスクを低頻度(約8fps)で薄く色付け表示する
// - 人数分の立ち位置ガイド枠を出し、制限時間つきで自動撮影する

import Phaser from 'phaser';
import { CameraController, createOffscreenVideoElement } from '../core/camera';
import { processMask } from '../core/mask';
import { playCountdownBeep, playShutter, playTap } from '../core/sound';
import { session, type CaptureRequest } from '../game/session';
import { drawThemeSilhouette } from '../game/themeDraw';
import { addBackground, createButton, bodyStyle, COLORS, GAME_WIDTH, GAME_HEIGHT } from '../ui/ui';

/** プレビューに使う描画サイズ。実解像度より小さくして転写コストを抑える。 */
const VIEW_WIDTH = 852;
const VIEW_HEIGHT = 480;
const VIEW_X = (GAME_WIDTH - VIEW_WIDTH) / 2;
const VIEW_Y = 52;

/** マスク推論の頻度(SPEC_MODE1.md §5: 低解像度・低頻度でよい)。 */
const SEGMENT_INTERVAL_MS = 125;

/** ポーズを作るための既定の制限時間(秒)。端末から離れて構えるので短すぎないようにする。 */
export const DEFAULT_TIME_LIMIT_SEC = 10;

interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * 映像を枠いっぱいに、比率を保ったまま収める(cover)ための切り出し範囲を求める。
 *
 * 端末を縦に持つと縦長の映像が返るため、そのまま横長の枠へ引き伸ばすと
 * 顔や体が横に潰れてしまう。はみ出す方向を切り落として比率を保つ。
 */
function computeCoverRect(
  sourceWidth: number,
  sourceHeight: number,
  viewWidth: number,
  viewHeight: number,
): CropRect {
  if (sourceWidth === 0 || sourceHeight === 0) {
    return { sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight };
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const viewAspect = viewWidth / viewHeight;

  if (sourceAspect > viewAspect) {
    // 映像のほうが横長 → 左右を切る
    const sw = sourceHeight * viewAspect;
    return { sx: (sourceWidth - sw) / 2, sy: 0, sw, sh: sourceHeight };
  }

  // 映像のほうが縦長 → 上下を切る
  const sh = sourceWidth / viewAspect;
  return { sx: 0, sy: (sourceHeight - sh) / 2, sw: sourceWidth, sh };
}

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
  private startButtonLabel: Phaser.GameObjects.Text | null = null;
  private request!: CaptureRequest;
  /** 制限時間の終了時刻(performance.now() 基準)。挑戦中でなければ null。 */
  private deadlineAt: number | null = null;
  private lastShownSecond = -1;

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

    this.isCapturing = false;
    this.ready = false;

    this.videoTexture = this.textures.createCanvas('capture-video', VIEW_WIDTH, VIEW_HEIGHT)!;
    this.maskTexture = this.textures.createCanvas('capture-mask', VIEW_WIDTH, VIEW_HEIGHT)!;

    this.add.image(VIEW_X, VIEW_Y, 'capture-video').setOrigin(0, 0);
    this.add.image(VIEW_X, VIEW_Y, 'capture-mask').setOrigin(0, 0).setAlpha(0.45);

    // お題がある場合だけ、穴を薄く重ねる
    if (request.theme) {
      const silhouette = drawThemeSilhouette(
        this,
        request.theme,
        VIEW_WIDTH,
        VIEW_HEIGHT,
        '#ffffff',
        0.35,
      );
      this.add.image(VIEW_X, VIEW_Y, silhouette).setOrigin(0, 0);
    }

    this.drawStandGuides();

    this.add.text(GAME_WIDTH / 2, 28, request.headline, bodyStyle(28)).setOrigin(0.5);

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

    const startButton = createButton(
      this,
      GAME_WIDTH / 2,
      y,
      'スタート！',
      () => this.beginCountdown(),
      { width: 300, height: 76, fontSize: 34 },
    );
    this.startButtonLabel = startButton.getData('label') as Phaser.GameObjects.Text;

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
      this.deadlineAt = null;
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
      this.statusText.setText(
        `「スタート！」を おしてから ${this.request.timeLimitSec}びょう。ぜんしんが うつるように はなれてね`,
      );
    } catch {
      this.statusText.setText('カメラを つかえませんでした。きょかを かくにんしてね');
    }
  }

  update(): void {
    // カメラの状態にかかわらず、始まった制限時間は必ず進める
    this.tickCountdown();

    if (!this.ready || this.videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    this.drawVideoFrame();

    const now = this.time.now;
    if (!this.isSegmenting && now - this.lastSegmentAt >= SEGMENT_INTERVAL_MS) {
      this.lastSegmentAt = now;
      this.updateMaskOverlay();
    }
  }

  /** 映像をテクスチャへ転写する。比率は保ち、インカメラは鏡像にする。 */
  private drawVideoFrame(): void {
    const ctx = this.videoTexture.getContext();
    const mirrored = this.camera.facingMode === 'user';
    const crop = computeCoverRect(
      this.videoEl.videoWidth,
      this.videoEl.videoHeight,
      VIEW_WIDTH,
      VIEW_HEIGHT,
    );

    ctx.save();
    if (mirrored) {
      ctx.translate(VIEW_WIDTH, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(this.videoEl, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.restore();
    this.videoTexture.refresh();
  }

  private updateMaskOverlay(): void {
    const segmenter = session.segmenter;
    if (!segmenter) return;

    this.isSegmenting = true;
    try {
      this.frameTimestamp += SEGMENT_INTERVAL_MS;
      // 表示中のキャンバス(切り出し・鏡像ずみ)をそのまま推論にかけることで、
      // マスクの位置が必ず映像と一致するようにする
      const result = segmenter.segment(this.videoTexture.canvas, this.frameTimestamp);
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

    // 推論対象がすでに鏡像ずみのキャンバスなので、ここでは反転しない
    ctx.save();
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

  /**
   * 制限時間つきの挑戦を始める。
   *
   * 端末から離れて構えるので、押してすぐ撮るのではなく
   * 「制限時間内に ポーズを作りきる」ことを面白さの中心にする。
   */
  private beginCountdown(): void {
    if (this.isCapturing || !this.ready) return;
    this.isCapturing = true;
    this.startButtonLabel?.setText('とりくみちゅう');
    this.statusText.setText('はやく ポーズを とって！');

    // Phaser のタイマーはフレーム時間ベースで、推論が重いと実時間より遅れる。
    // 制限時間ゲームなので、経過は実時間(performance.now)で測る。
    this.deadlineAt = performance.now() + this.request.timeLimitSec * 1000;
    this.lastShownSecond = -1;
    this.showRemaining(this.request.timeLimitSec);
  }

  /** 残り秒数の表示を更新する。 */
  private showRemaining(remaining: number): void {
    this.lastShownSecond = remaining;
    this.countdownText.setText(String(remaining));

    // 残りわずかになったら赤く大きく見せて煽る
    const urgent = remaining <= 3;
    this.countdownText
      .setColor(urgent ? '#ff5252' : '#ffffff')
      .setAlpha(1)
      .setScale(urgent ? 1.6 : 1.3);
    this.tweens.add({
      targets: this.countdownText,
      scale: 1,
      alpha: urgent ? 0.6 : 0.35,
      duration: 700,
    });
    playCountdownBeep(urgent);
  }

  /**
   * カウントダウン表示を消す。
   * 拡大・フェードの tween が残っていると alpha を上書きされるので、先に止める。
   */
  private hideCountdown(): void {
    this.tweens.killTweensOf(this.countdownText);
    this.countdownText.setAlpha(0);
  }

  /** 制限時間の進行。update から毎フレーム呼ぶ。 */
  private tickCountdown(): void {
    if (this.deadlineAt === null) return;

    const remainingMs = this.deadlineAt - performance.now();
    if (remainingMs <= 0) {
      this.deadlineAt = null;
      this.hideCountdown();
      playShutter();
      this.captureAndJudge();
      return;
    }

    const remaining = Math.ceil(remainingMs / 1000);
    if (remaining !== this.lastShownSecond) {
      this.showRemaining(remaining);
    }
  }

  private captureAndJudge(): void {
    const segmenter = session.segmenter;
    if (!segmenter) return;

    const sourceWidth = this.videoEl.videoWidth;
    const sourceHeight = this.videoEl.videoHeight;
    if (sourceWidth === 0 || sourceHeight === 0) {
      this.retry('うまく さつえいできませんでした。もういちど！');
      return;
    }

    // 判定はフル解像度の静止画1枚に対して行う(SPEC_MODE1.md §5)。
    // プレビューと同じ範囲・同じ向きで切り出し、
    // 「見えていた画がそのまま判定される」ようにする
    const crop = computeCoverRect(sourceWidth, sourceHeight, VIEW_WIDTH, VIEW_HEIGHT);
    const width = Math.round(crop.sw);
    const height = Math.round(crop.sh);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (this.camera.facingMode === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(this.videoEl, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);

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
      if (processed.accepted.length !== this.request.expectedBlobs) {
        this.retry('はなれて たちなおしてね！');
        return;
      }

      session.captured = {
        mask: processed.mask,
        labels: processed.labels,
        blobs: processed.accepted,
        image: canvas,
      };
      this.scene.start(this.request.nextScene);
    } catch {
      this.retry('うまく きりぬけませんでした。もういちど！');
    }
  }

  private retry(message: string): void {
    this.deadlineAt = null;
    this.hideCountdown();
    this.startButtonLabel?.setText('もういちど');
    this.statusText.setText(message);
    this.isCapturing = false;
  }
}
