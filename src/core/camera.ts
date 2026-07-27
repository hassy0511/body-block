// getUserMedia ラッパ / プレビュー。SPEC.md §2.4, SPEC_MODE1.md §5 参照。

export type FacingMode = 'user' | 'environment';

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
