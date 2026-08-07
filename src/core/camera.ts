// getUserMedia ラッパ / プレビュー。SPEC.md §2.4, SPEC_MODE1.md §5 参照。

import { getRemoteStream } from './remoteCamera';

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
 *
 * 2台モード(SPEC_PAIR.md)のときは、手元のカメラの代わりに
 * カメラやく端末から届いた映像を使う。呼び出し側は違いを気にしなくてよい。
 */
export class CameraController {
  readonly videoEl: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private currentFacingMode: FacingMode = 'user';
  private usingRemote = false;

  constructor(videoEl: HTMLVideoElement) {
    this.videoEl = videoEl;
  }

  get facingMode(): FacingMode {
    return this.currentFacingMode;
  }

  async start(facingMode: FacingMode = 'user'): Promise<void> {
    this.stop();

    const remote = getRemoteStream();
    if (remote) {
      // 鏡像で見せる(鏡の前に立つ感覚に合わせる。SPEC_PAIR.md §6)。
      // facingMode を 'user' にしておけば、切り出し側の反転処理もそのまま効く
      this.usingRemote = true;
      this.currentFacingMode = 'user';
      this.videoEl.srcObject = remote;
      this.videoEl.style.transform = 'scaleX(-1)';
      await this.videoEl.play();
      return;
    }

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
    // 2台モードでは手元のカメラに切り替える意味がないので何もしない
    if (this.usingRemote) return;
    const next: FacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
    await this.start(next);
  }

  stop(): void {
    if (this.usingRemote) {
      // リモート映像は止めない(接続は生かしたまま次のシーンでも使う)。外すだけ
      this.videoEl.srcObject = null;
      this.usingRemote = false;
      return;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
