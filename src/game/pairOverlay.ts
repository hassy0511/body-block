// ゲーム内から2台接続するためのオーバーレイ。SPEC_PAIR.md 参照。
//
// この端末は常に「画面やく」。カメラやく端末は pair.html を開く。
// QR まわりは DOM のほうが圧倒的に楽なので、Phaser のシーンにはせず
// キャンバスの上に重ねる素の DOM で作る。
//
// つながったら remoteCamera に預けてオーバーレイを閉じる。
// 以降は全モードの CameraController が自動でリモート映像を使う。

import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  encodeSignal,
  decodeSignal,
  waitForIceComplete,
  type SignalPayload,
} from '../pair/signalCode';
import { setRemotePair } from '../core/remoteCamera';

const STYLE_ID = 'pair-overlay-style';

const CSS = `
#pair-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(45, 37, 28, 0.92);
  color: #fff3e0;
  font-family: 'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Yu Gothic', system-ui, sans-serif;
  display: flex; flex-direction: column; align-items: center;
  padding: 20px 16px; overflow-y: auto; line-height: 1.7;
}
#pair-overlay h2 { font-size: 1.15rem; margin: 0 0 4px; }
#pair-overlay .po-step { font-weight: bold; margin: 8px 0; text-align: center; }
#pair-overlay .po-status { font-size: 0.9rem; min-height: 1.6em; text-align: center; }
#pair-overlay .po-status.error { color: #ffb3a7; font-weight: bold; }
#pair-overlay canvas.po-qr { background: #fff; padding: 8px; border-radius: 10px; max-width: 78vw; }
#pair-overlay .po-scan { position: relative; width: min(78vw, 360px); border-radius: 12px; overflow: hidden; }
#pair-overlay .po-scan video { display: block; width: 100%; }
#pair-overlay .po-scan .po-frame {
  position: absolute; inset: 12%; border: 3px dashed rgba(255,255,255,0.85);
  border-radius: 12px; pointer-events: none;
}
#pair-overlay button {
  font-family: inherit; font-weight: bold; font-size: 1rem;
  border: none; border-radius: 999px; padding: 12px 24px; margin: 6px;
  background: #ff8a3d; color: #fff; cursor: pointer;
}
#pair-overlay button.po-ghost { background: transparent; color: #d8c3a5; text-decoration: underline; font-weight: normal; }
#pair-overlay details { font-size: 0.85rem; max-width: min(90vw, 420px); margin-top: 10px; }
#pair-overlay summary { cursor: pointer; color: #d8c3a5; }
#pair-overlay textarea {
  width: 100%; font-family: monospace; font-size: 0.7rem;
  border-radius: 8px; border: none; padding: 8px; margin: 6px 0; word-break: break-all;
}
`;

/** つながったら resolve(true)。とじたら resolve(false)。 */
export function openPairOverlay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.getElementById('pair-overlay')) {
      resolve(false);
      return;
    }
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const root = document.createElement('div');
    root.id = 'pair-overlay';
    root.innerHTML = `
      <h2>2だいで つなぐ</h2>
      <p class="po-status" id="po-status">もう1だいで pair.html をひらいて「カメラやく」をえらんでね</p>
      <p class="po-step" id="po-step"></p>
      <canvas class="po-qr" id="po-qr" hidden></canvas>
      <div class="po-scan" id="po-scan" hidden>
        <video id="po-video" autoplay playsinline muted></video>
        <div class="po-frame"></div>
      </div>
      <div>
        <button id="po-next" hidden></button>
        <button id="po-close" class="po-ghost">とじる</button>
      </div>
      <details>
        <summary>QRがよめないとき（コードを手でわたす）</summary>
        <textarea id="po-out" readonly rows="3" placeholder="じぶんのコード"></textarea>
        <button id="po-copy">コードをコピー</button>
        <textarea id="po-in" rows="3" placeholder="あいてのコードをはりつけ"></textarea>
        <button id="po-paste">はりつけたコードをつかう</button>
      </details>
    `;
    document.body.appendChild(root);

    const $ = <T extends HTMLElement>(id: string): T => root.querySelector(`#${id}`) as T;
    const statusEl = $('po-status');
    const stepEl = $('po-step');
    const qrCanvas = $<HTMLCanvasElement>('po-qr');
    const scanBox = $('po-scan');
    const scanVideo = $<HTMLVideoElement>('po-video');
    const nextBtn = $<HTMLButtonElement>('po-next');
    const outArea = $<HTMLTextAreaElement>('po-out');
    const inArea = $<HTMLTextAreaElement>('po-in');

    let pc: RTCPeerConnection | null = null;
    let scanStream: MediaStream | null = null;
    let scanTimer: number | null = null;
    let remoteStream: MediaStream | null = null;
    let settled = false;

    const setStatus = (text: string, isError = false): void => {
      statusEl.textContent = text;
      statusEl.classList.toggle('error', isError);
    };

    const stopScan = (): void => {
      if (scanTimer !== null) clearTimeout(scanTimer);
      scanTimer = null;
      scanStream?.getTracks().forEach((track) => track.stop());
      scanStream = null;
      scanBox.hidden = true;
    };

    const finish = (connected: boolean): void => {
      if (settled) return;
      settled = true;
      stopScan();
      if (!connected) pc?.close();
      root.remove();
      resolve(connected);
    };

    const startScan = async (): Promise<void> => {
      scanStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      scanVideo.srcObject = scanStream;
      await scanVideo.play();
      scanBox.hidden = false;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const tick = async (): Promise<void> => {
        if (!scanStream || !ctx) return;
        if (scanVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          canvas.width = scanVideo.videoWidth;
          canvas.height = scanVideo.videoHeight;
          ctx.drawImage(scanVideo, 0, 0);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const found = jsQR(image.data, image.width, image.height, {
            inversionAttempts: 'dontInvert',
          });
          if (found?.data) {
            const payload = await decodeSignal(found.data);
            if (payload) {
              stopScan();
              void accept(payload);
              return;
            }
          }
        }
        scanTimer = window.setTimeout(() => void tick(), 120);
      };
      void tick();
    };

    const accept = async (payload: SignalPayload): Promise<void> => {
      if (!pc || payload.kind !== 'a') {
        setStatus('それは カメラやくの QR じゃないみたい。もういちど。', true);
        void startScan().catch(() => undefined);
        return;
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      stepEl.textContent = '③ つないでいます...';
    };

    const begin = async (): Promise<void> => {
      pc = new RTCPeerConnection();
      pc.addEventListener('track', (event) => {
        remoteStream = event.streams[0] ?? new MediaStream([event.track]);
      });
      pc.addEventListener('connectionstatechange', () => {
        if (!pc) return;
        if (pc.connectionState === 'connected' && remoteStream) {
          setRemotePair(remoteStream, pc);
          finish(true);
        }
        if (pc.connectionState === 'failed') {
          setStatus(
            'つなげませんでした。おなじWi-Fiか かくにんしてね。' +
              'ルーターのAP分離(プライバシーセパレーター)でも失敗します。',
            true,
          );
        }
      });
      pc.addTransceiver('video', { direction: 'recvonly' });

      stepEl.textContent = '① このQRを カメラやくの端末で よみとってね';
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceComplete(pc);
      const code = await encodeSignal({ kind: 'o', sdp: pc.localDescription!.sdp });
      await QRCode.toCanvas(qrCanvas, code, { errorCorrectionLevel: 'L', margin: 2, scale: 4 });
      qrCanvas.hidden = false;
      outArea.value = code;

      nextBtn.textContent = '② カメラやくのQRを よみとる';
      nextBtn.hidden = false;
      nextBtn.onclick = () => {
        nextBtn.hidden = true;
        qrCanvas.hidden = true;
        stepEl.textContent = '② カメラやくの端末の QR を うつしてね';
        void startScan().catch(() => {
          setStatus('カメラをつかえませんでした。下のコード欄をつかってね。', true);
        });
      };
    };

    $('po-close').addEventListener('click', () => finish(false));
    $('po-copy').addEventListener('click', () => {
      void navigator.clipboard.writeText(outArea.value).then(() => setStatus('コピーしました'));
    });
    $('po-paste').addEventListener('click', () => {
      void (async () => {
        const payload = await decodeSignal(inArea.value);
        if (!payload) {
          setStatus('コードのかたちが ちがうみたい。ぜんぶコピーできてる？', true);
          return;
        }
        stopScan();
        void accept(payload);
      })();
    });

    void begin().catch(() =>
      setStatus('じゅんびに しっぱいしました。とじて やりなおしてね。', true),
    );

    // 開発時の動作確認用
    if (import.meta.env.DEV) {
      (window as unknown as { __pairGame?: unknown }).__pairGame = {
        currentCode: () => outArea.value,
        feedCode: async (text: string) => {
          const payload = await decodeSignal(text);
          if (payload) await accept(payload);
        },
      };
    }
  });
}
