// getUserMedia ラッパ / プレビュー。SPEC.md §2.4, SPEC_MODE1.md §5 参照。

export type FacingMode = 'user' | 'environment';

/**
 * 画面には出さず、映像の取り込みだけに使う video 要素を作る。
 *
 * Phaser のキャンバスへ描画するので表示は不要だが、iOS Safari は
 * DOM に載っていない video を再生しないことがあるため、
 * 見えないだけで DOM には配置する。
 */
export function createOffscreenVideoElement(): HTMLVideoElement {
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.style.position = 'fixed';
  video.style.top = '0';
  video.style.left = '0';
  video.style.width = '1px';
  video.style.height = '1px';
  video.style.opacity = '0';
  video.style.pointerEvents = 'none';
  document.body.appendChild(video);
  return video;
}

/**
 * カメラストリームを video 要素に流し込むだけの薄いラッパ。
 * インカメラ(user)はプレビューを鏡像表示する(SPEC_MODE1.md §5)。
 */
export class CameraController {
  readonly videoEl: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private currentFacingMode: FacingMode = 'user';

  constructor(videoEl: HTMLVideoElement) {
    this.videoEl = videoEl;
  }

  get facingMode(): FacingMode {
    return this.currentFacingMode;
  }

  async start(facingMode: FacingMode = 'user'): Promise<void> {
    this.stop();

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    this.currentFacingMode = facingMode;
    this.videoEl.srcObject = this.stream;
    this.videoEl.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'none';
    await this.videoEl.play();
  }

  async switchFacing(): Promise<void> {
    const next: FacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
    await this.start(next);
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
