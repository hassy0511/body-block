// カメラのプレビューと撮影をまとめた部品。
//
// モード1(撮影専用画面)とモード2(撮る→その場で落ちる)の両方で使えるよう、
// シーンから切り離してある。呼び出し側は好きな位置・大きさに置ける。

import Phaser from 'phaser';
import { CameraController, createOffscreenVideoElement } from '../core/camera';
import { processMask, type ProcessedMask } from '../core/mask';
import { playCountdownBeep, playShutter } from '../core/sound';
import { session } from './session';

/** マスク推論の頻度(SPEC_MODE1.md §5: 低解像度・低頻度でよい)。 */
const SEGMENT_INTERVAL_MS = 125;

export interface CameraPanelOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 立ち位置ガイド枠の数。0 なら出さない。 */
  guideCount?: number;
  /** マスクの重畳を出すか。 */
  showMask?: boolean;
  /**
   * プレビューの推論が1回終わるたびに呼ばれる。
   * 撮る前に「いま何点か」を出したいモードで使う。
   */
  onPreviewMask?: (processed: ProcessedMask) => void;
}

export interface CapturedFrame {
  processed: ProcessedMask;
  /** 撮影した静止画(プレビューと同じ範囲・向き)。 */
  image: HTMLCanvasElement;
}

interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * 映像を枠いっぱいに、比率を保ったまま収める(cover)ための切り出し範囲を求める。
 *
 * 端末を縦に持つと縦長の映像が返るため、そのまま別比率の枠へ引き伸ばすと
 * 顔や体が潰れてしまう。はみ出す方向を切り落として比率を保つ。
 */
export function computeCoverRect(
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
    const sw = sourceHeight * viewAspect;
    return { sx: (sourceWidth - sw) / 2, sy: 0, sw, sh: sourceHeight };
  }

  const sh = sourceWidth / viewAspect;
  return { sx: 0, sy: (sourceHeight - sh) / 2, sw: sourceWidth, sh };
}

export interface DrawLayout {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/**
 * 映像を枠へどう描くかを決める。
 *
 * 枠と映像の比率が近ければ cover(枠いっぱい・はみ出しは切る)。
 * 大きく違うとき(縦持ち端末の映像を横長の枠に入れる2台モードなど)は
 * contain(全体を収めて余白を出す)。cover のままだと上下が大きく捨てられ、
 * 視野が細い帯になってしまう(実機で発生した)。
 */
export function computeDrawLayout(
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  boxHeight: number,
): DrawLayout {
  if (sourceWidth === 0 || sourceHeight === 0) {
    return {
      sx: 0,
      sy: 0,
      sw: sourceWidth,
      sh: sourceHeight,
      dx: 0,
      dy: 0,
      dw: boxWidth,
      dh: boxHeight,
    };
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const boxAspect = boxWidth / boxHeight;
  const mismatch = Math.max(sourceAspect, boxAspect) / Math.min(sourceAspect, boxAspect);

  if (mismatch <= 1.5) {
    const crop = computeCoverRect(sourceWidth, sourceHeight, boxWidth, boxHeight);
    return { ...crop, dx: 0, dy: 0, dw: boxWidth, dh: boxHeight };
  }

  const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const dw = sourceWidth * scale;
  const dh = sourceHeight * scale;
  return {
    sx: 0,
    sy: 0,
    sw: sourceWidth,
    sh: sourceHeight,
    dx: (boxWidth - dw) / 2,
    dy: (boxHeight - dh) / 2,
    dw,
    dh,
  };
}

/** カメラ表示の深さ。ゲーム側の背景より手前になるようにする。 */
export const PANEL_DEPTH = 10;

let panelSeq = 0;

export class CameraPanel {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;

  private scene: Phaser.Scene;
  private camera: CameraController | null = null;
  private videoEl: HTMLVideoElement | null = null;

  private videoTexture!: Phaser.Textures.CanvasTexture;
  private maskTexture: Phaser.Textures.CanvasTexture | null = null;
  private videoKey: string;
  private maskKey: string;

  private lastSegmentAt = 0;
  private frameTimestamp = 0;
  private isSegmenting = false;

  private countdownText!: Phaser.GameObjects.Text;
  private deadlineAt: number | null = null;
  private lastShownSecond = -1;

  private onCaptured: ((frame: CapturedFrame) => void) | null = null;
  private onFailed: ((message: string) => void) | null = null;
  private onPreviewMask: ((processed: ProcessedMask) => void) | null = null;

  ready = false;

  constructor(scene: Phaser.Scene, options: CameraPanelOptions) {
    this.scene = scene;
    this.x = options.x;
    this.y = options.y;
    this.width = options.width;
    this.height = options.height;

    this.onPreviewMask = options.onPreviewMask ?? null;

    panelSeq += 1;
    this.videoKey = `campanel-video-${panelSeq}`;
    this.maskKey = `campanel-mask-${panelSeq}`;

    // 落ちてくるブロックがカメラ表示の上に重ならないよう、手前の深さに置く
    this.videoTexture = scene.textures.createCanvas(this.videoKey, this.width, this.height)!;
    scene.add.image(this.x, this.y, this.videoKey).setOrigin(0, 0).setDepth(PANEL_DEPTH);

    if (options.showMask !== false) {
      this.maskTexture = scene.textures.createCanvas(this.maskKey, this.width, this.height)!;
      scene.add
        .image(this.x, this.y, this.maskKey)
        .setOrigin(0, 0)
        .setAlpha(0.45)
        .setDepth(PANEL_DEPTH + 1);
    }

    if (options.guideCount && options.guideCount > 1) {
      this.drawGuides(options.guideCount);
    }

    this.countdownText = scene.add
      .text(this.x + this.width / 2, this.y + this.height / 2, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: `${Math.round(this.height * 0.5)}px`,
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(PANEL_DEPTH + 3);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private drawGuides(count: number): void {
    const slotWidth = this.width / count;
    for (let i = 0; i < count; i += 1) {
      const frame = this.scene.add.rectangle(
        this.x + slotWidth * (i + 0.5),
        this.y + this.height / 2,
        slotWidth - 12,
        this.height - 12,
      );
      frame.setStrokeStyle(3, 0x33bfc7, 0.7);
      frame.setFillStyle(0, 0);
      frame.setDepth(PANEL_DEPTH + 2);
    }
  }

  /** カメラを起動する。成功したら true。 */
  async start(): Promise<boolean> {
    this.videoEl = createOffscreenVideoElement();
    this.camera = new CameraController(this.videoEl);
    try {
      await this.camera.start('user');
      this.ready = true;
      return true;
    } catch {
      this.ready = false;
      return false;
    }
  }

  async switchFacing(): Promise<void> {
    await this.camera?.switchFacing();
  }

  /** 制限時間つきの撮影を始める。 */
  beginCountdown(
    seconds: number,
    onCaptured: (frame: CapturedFrame) => void,
    onFailed: (message: string) => void,
  ): void {
    if (!this.ready || this.deadlineAt !== null) return;
    this.onCaptured = onCaptured;
    this.onFailed = onFailed;
    this.deadlineAt = performance.now() + seconds * 1000;
    this.lastShownSecond = -1;
    this.showRemaining(seconds);
  }

  get isCountingDown(): boolean {
    return this.deadlineAt !== null;
  }

  private showRemaining(remaining: number): void {
    this.lastShownSecond = remaining;
    const urgent = remaining <= 3;
    this.countdownText
      .setText(String(remaining))
      .setColor(urgent ? '#ff5252' : '#ffffff')
      .setAlpha(1)
      .setScale(urgent ? 1.4 : 1.2);
    this.scene.tweens.add({
      targets: this.countdownText,
      scale: 1,
      alpha: urgent ? 0.6 : 0.35,
      duration: 700,
    });
    playCountdownBeep(urgent);
  }

  private hideCountdown(): void {
    this.scene.tweens.killTweensOf(this.countdownText);
    this.countdownText.setAlpha(0);
  }

  /** 毎フレーム呼ぶ。例外を外へ出さない。 */
  update(): void {
    try {
      this.tickCountdown();
      if (!this.ready || !this.videoEl) return;
      if (this.videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      this.drawVideoFrame();

      const now = this.scene.time.now;
      if (!this.isSegmenting && now - this.lastSegmentAt >= SEGMENT_INTERVAL_MS) {
        this.lastSegmentAt = now;
        this.updateMaskOverlay();
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.deadlineAt = null;
      this.onFailed?.(`エラーが おきました (${detail})`);
    }
  }

  private tickCountdown(): void {
    if (this.deadlineAt === null) return;

    const remainingMs = this.deadlineAt - performance.now();
    if (remainingMs <= 0) {
      this.deadlineAt = null;
      this.hideCountdown();
      playShutter();
      this.capture();
      return;
    }

    const remaining = Math.ceil(remainingMs / 1000);
    if (remaining !== this.lastShownSecond) this.showRemaining(remaining);
  }

  /** 必ず前回より大きいタイムスタンプを返す(MediaPipe は単調増加を要求する)。 */
  private nextTimestamp(): number {
    const now = Math.round(performance.now());
    this.frameTimestamp = Math.max(now, this.frameTimestamp + 1);
    return this.frameTimestamp;
  }

  private drawVideoFrame(): void {
    if (!this.videoEl || !this.camera) return;
    const ctx = this.videoTexture.getContext();
    const layout = computeDrawLayout(
      this.videoEl.videoWidth,
      this.videoEl.videoHeight,
      this.width,
      this.height,
    );

    // contain のときに出る余白は暗く塗る
    ctx.fillStyle = '#20242b';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    if (this.camera.facingMode === 'user') {
      ctx.translate(this.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(
      this.videoEl,
      layout.sx,
      layout.sy,
      layout.sw,
      layout.sh,
      layout.dx,
      layout.dy,
      layout.dw,
      layout.dh,
    );
    ctx.restore();
    this.videoTexture.refresh();
  }

  private updateMaskOverlay(): void {
    const segmenter = session.segmenter;
    if (!segmenter) return;
    if (!this.maskTexture && !this.onPreviewMask) return;

    this.isSegmenting = true;
    try {
      // 表示中のキャンバス(切り出し・鏡像ずみ)を推論にかけ、位置を必ず一致させる
      const result = segmenter.segment(this.videoTexture.canvas, this.nextTimestamp());
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
      this.onPreviewMask?.(processed);
    } catch {
      // プレビューの推論失敗は致命的ではない
    } finally {
      this.isSegmenting = false;
    }
  }

  private paintMask(data: Uint8Array, width: number, height: number): void {
    if (!this.maskTexture) return;
    const ctx = this.maskTexture.getContext();
    ctx.clearRect(0, 0, this.width, this.height);

    const scaleX = this.width / width;
    const scaleY = this.height / height;
    ctx.fillStyle = '#00d0ff';
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[y * width + x] === 1) {
          ctx.fillRect(x * scaleX, y * scaleY, scaleX + 1, scaleY + 1);
        }
      }
    }
    this.maskTexture.refresh();
  }

  /** 静止画をフル解像度で撮って切り抜く。 */
  private capture(): void {
    try {
      this.captureUnsafe();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.onFailed?.(`さつえいに しっぱいしました (${detail})`);
    }
  }

  private captureUnsafe(): void {
    const segmenter = session.segmenter;
    if (!segmenter || !this.videoEl || !this.camera) {
      this.onFailed?.('じゅんびが できていません。リロードしてね');
      return;
    }

    const sourceWidth = this.videoEl.videoWidth;
    const sourceHeight = this.videoEl.videoHeight;
    if (sourceWidth === 0 || sourceHeight === 0) {
      this.onFailed?.('うまく さつえいできませんでした。もういちど！');
      return;
    }

    // プレビューと同じ構図で、枠と同じ比率の高解像度キャンバスに描く。
    // 「見えていた画がそのまま判定に使われる」を、contain の余白ごと保つ
    const width = 1280;
    const height = Math.round((width * this.height) / this.width);
    const layout = computeDrawLayout(sourceWidth, sourceHeight, width, height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.onFailed?.('えを つくれませんでした。もういちど！');
      return;
    }

    ctx.fillStyle = '#20242b';
    ctx.fillRect(0, 0, width, height);
    if (this.camera.facingMode === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(
      this.videoEl,
      layout.sx,
      layout.sy,
      layout.sw,
      layout.sh,
      layout.dx,
      layout.dy,
      layout.dw,
      layout.dh,
    );

    const result = segmenter.segment(canvas, this.nextTimestamp());
    const mask = result.categoryMask;
    if (!mask) {
      this.onFailed?.('うまく きりぬけませんでした。もういちど！');
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

    this.onCaptured?.({ processed, image: canvas });
  }

  destroy(): void {
    this.deadlineAt = null;
    this.camera?.stop();
    this.videoEl?.remove();
    this.videoEl = null;
    if (this.scene.textures.exists(this.videoKey)) this.scene.textures.remove(this.videoKey);
    if (this.scene.textures.exists(this.maskKey)) this.scene.textures.remove(this.maskKey);
  }
}
