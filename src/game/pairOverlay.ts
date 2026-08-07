// ゲーム内から2台接続するためのオーバーレイ。SPEC_PAIR.md 参照。
//
// 2台とも同じゲームを開き、それぞれここで役をえらぶ:
//   がめんやく: この端末であそぶ。つながったらオーバーレイは閉じ、
//               全モードがカメラやくの映像で動く
//   カメラやく: この端末はカメラになる。つながったら送信画面のまま
//               立てて置いてもらう
//
// QR まわりは DOM のほうが圧倒的に楽なので、Phaser のシーンにはせず
// キャンバスの上に重ねる素の DOM で作る。

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
#pair-overlay [hidden] { display: none !important; }
#pair-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(45, 37, 28, 0.94);
  color: #fff3e0;
  font-family: 'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Yu Gothic', system-ui, sans-serif;
  display: flex; flex-direction: column; align-items: center;
  padding: 20px 16px; overflow-y: auto; line-height: 1.7;
}
#pair-overlay h2 { font-size: 1.15rem; margin: 0 0 4px; }
#pair-overlay .po-step { font-weight: bold; margin: 8px 0; text-align: center; }
#pair-overlay .po-status { font-size: 0.9rem; min-height: 1.6em; text-align: center; max-width: 90vw; }
#pair-overlay .po-status.error { color: #ffb3a7; font-weight: bold; }
#pair-overlay .po-roles { display: grid; gap: 12px; width: min(88vw, 380px); margin-top: 10px; }
#pair-overlay button {
  font-family: inherit; font-weight: bold; font-size: 1rem;
  border: none; border-radius: 14px; padding: 12px 20px; margin: 6px;
  background: #ff8a3d; color: #fff; cursor: pointer;
}
#pair-overlay button.po-role { font-size: 1.1rem; padding: 16px; line-height: 1.5; margin: 0; }
#pair-overlay button.po-role small { display: block; font-weight: normal; font-size: 0.78rem; opacity: 0.9; }
#pair-overlay button.po-alt { background: #33bfc7; }
#pair-overlay button.po-ghost { background: transparent; color: #d8c3a5; text-decoration: underline; font-weight: normal; }
#pair-overlay canvas.po-qr { background: #fff; padding: 8px; border-radius: 10px; max-width: 78vw; }
#pair-overlay .po-video-box { position: relative; width: min(78vw, 360px); border-radius: 12px; overflow: hidden; }
#pair-overlay .po-video-box video { display: block; width: 100%; }
#pair-overlay .po-video-box .po-frame {
  position: absolute; inset: 12%; border: 3px dashed rgba(255,255,255,0.85);
  border-radius: 12px; pointer-events: none;
}
#pair-overlay .po-live {
  position: absolute; top: 8px; left: 8px; background: #e0533d; color: #fff;
  font-size: 0.75rem; font-weight: bold; padding: 2px 10px; border-radius: 999px;
}
#pair-overlay details { font-size: 0.85rem; max-width: min(90vw, 420px); margin-top: 10px; }
#pair-overlay summary { cursor: pointer; color: #d8c3a5; }
#pair-overlay textarea {
  width: 100%; font-family: monospace; font-size: 0.7rem;
  border-radius: 8px; border: none; padding: 8px; margin: 6px 0; word-break: break-all;
}
`;

type Role = 'screen' | 'camera';

/** がめんやく として接続できたら resolve(true)。それ以外で閉じたら resolve(false)。 */
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
      <p class="po-status" id="po-status">もう1だいでも このゲームをひらいて、「2だいで つなぐ」から 役をえらんでね</p>
      <div class="po-roles" id="po-roles">
        <button class="po-role" id="po-role-screen">
          がめんやく になる<br /><small>手もとに置く方。この端末であそぶ</small>
        </button>
        <button class="po-role po-alt" id="po-role-camera">
          カメラやく になる<br /><small>はなれた場所に立てる方。カメラになる</small>
        </button>
      </div>
      <p class="po-step" id="po-step"></p>
      <canvas class="po-qr" id="po-qr" hidden></canvas>
      <div class="po-video-box" id="po-scan" hidden>
        <video id="po-scan-video" autoplay playsinline muted></video>
        <div class="po-frame"></div>
      </div>
      <div class="po-video-box" id="po-local" hidden>
        <video id="po-local-video" autoplay playsinline muted></video>
        <span class="po-live">そうしんちゅう</span>
      </div>
      <div>
        <button id="po-next" hidden></button>
        <button id="po-close" class="po-ghost">とじる</button>
      </div>
      <details id="po-manual" hidden>
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
    const rolesBox = $('po-roles');
    const qrCanvas = $<HTMLCanvasElement>('po-qr');
    const scanBox = $('po-scan');
    const scanVideo = $<HTMLVideoElement>('po-scan-video');
    const localBox = $('po-local');
    const localVideo = $<HTMLVideoElement>('po-local-video');
    const nextBtn = $<HTMLButtonElement>('po-next');
    const closeBtn = $<HTMLButtonElement>('po-close');
    const manualBox = $('po-manual');
    const outArea = $<HTMLTextAreaElement>('po-out');
    const inArea = $<HTMLTextAreaElement>('po-in');

    let role: Role | null = null;
    let pc: RTCPeerConnection | null = null;
    let scanStream: MediaStream | null = null;
    let sendStream: MediaStream | null = null;
    let scanTimer: number | null = null;
    let scanToken = 0;
    let remoteStream: MediaStream | null = null;
    let settled = false;

    const setStatus = (text: string, isError = false): void => {
      statusEl.textContent = text;
      statusEl.classList.toggle('error', isError);
    };

    const stopScan = (): void => {
      // 起動待ちの getUserMedia があっても、戻ってきた時点で捨てられるようにする
      scanToken += 1;
      if (scanTimer !== null) clearTimeout(scanTimer);
      scanTimer = null;
      scanStream?.getTracks().forEach((track) => track.stop());
      scanStream = null;
      scanBox.hidden = true;
    };

    /**
     * オーバーレイを閉じる。
     * がめんやく で接続できたときだけ true。カメラやく はこの端末では
     * ゲームを進めないので、どう閉じても false(接続の後始末だけ行う)。
     */
    const finish = (screenConnected: boolean): void => {
      if (settled) return;
      settled = true;
      stopScan();
      if (!screenConnected) {
        pc?.close();
        sendStream?.getTracks().forEach((track) => track.stop());
      }
      root.remove();
      resolve(screenConnected);
    };

    const startScan = async (onPayload: (payload: SignalPayload) => void): Promise<void> => {
      const token = ++scanToken;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      // 待っている間に stopScan された(コードが手ではりつけられた等)なら捨てる
      if (token !== scanToken) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      scanStream = stream;
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
              onPayload(payload);
              return;
            }
          }
        }
        scanTimer = window.setTimeout(() => void tick(), 120);
      };
      void tick();
    };

    const showQr = async (code: string): Promise<void> => {
      await QRCode.toCanvas(qrCanvas, code, { errorCorrectionLevel: 'L', margin: 2, scale: 4 });
      qrCanvas.hidden = false;
      outArea.value = code;
    };

    // 手動コード欄(QRの代替)。役に応じて同じ受け口に流す
    const handlePayload = (payload: SignalPayload): void => {
      if (role === 'screen') void acceptAnswer(payload);
      else if (role === 'camera') void acceptOffer(payload);
    };

    // ---------- がめんやく ----------

    const startScreenRole = async (): Promise<void> => {
      role = 'screen';
      rolesBox.hidden = true;
      manualBox.hidden = false;

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
      setStatus('カメラやくの端末で「カメラやく になる」をおすと、よみとりが始まるよ');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceComplete(pc);
      await showQr(await encodeSignal({ kind: 'o', sdp: pc.localDescription!.sdp }));

      nextBtn.textContent = '② カメラやくのQRを よみとる';
      nextBtn.hidden = false;
      nextBtn.onclick = () => {
        nextBtn.hidden = true;
        qrCanvas.hidden = true;
        stepEl.textContent = '② カメラやくの端末に出た QR を うつしてね';
        setStatus('QRをさがしています...');
        void startScan(handlePayload).catch(() => {
          setStatus('カメラをつかえませんでした。下のコード欄をつかってね。', true);
        });
      };
    };

    const acceptAnswer = async (payload: SignalPayload): Promise<void> => {
      if (!pc || payload.kind !== 'a') {
        setStatus('それは がめんやくのQRみたい。カメラやくの端末のQRをよんでね。', true);
        void startScan(handlePayload).catch(() => undefined);
        return;
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      stepEl.textContent = '③ つないでいます...';
      setStatus('あとすこし...');
    };

    // ---------- カメラやく ----------

    const startCameraRole = async (): Promise<void> => {
      role = 'camera';
      rolesBox.hidden = true;
      manualBox.hidden = false;

      stepEl.textContent = '① がめんやくの端末に出ている QR を うつしてね';
      setStatus('QRをさがしています...');
      await startScan(handlePayload).catch(() => {
        setStatus('カメラをつかえませんでした。下のコード欄をつかってね。', true);
      });
    };

    const acceptOffer = async (payload: SignalPayload): Promise<void> => {
      if (payload.kind !== 'o') {
        setStatus('それは カメラやくのQRみたい。がめんやくの端末のQRをよんでね。', true);
        void startScan(handlePayload).catch(() => undefined);
        return;
      }
      setStatus('カメラを起動しています...');

      // 立てて使うので背面カメラ。QR読み取りに使ったものをそのまま送信に使う
      sendStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      pc = new RTCPeerConnection();
      for (const track of sendStream.getTracks()) pc.addTrack(track, sendStream);
      pc.addEventListener('connectionstatechange', () => {
        if (!pc) return;
        if (pc.connectionState === 'connected') onCameraConnected();
        if (pc.connectionState === 'failed') {
          setStatus('つなげませんでした。おなじWi-Fiか かくにんしてね。', true);
        }
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
          setStatus('せつぞくが きれました。とじて やりなおしてね。', true);
          localBox.hidden = true;
        }
      });

      await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIceComplete(pc);

      stepEl.textContent = '② このQRを がめんやくの端末で よみとってね';
      setStatus('がめんやくが「②よみとる」をおして、このQRをうつすと つながるよ');
      await showQr(await encodeSignal({ kind: 'a', sdp: pc.localDescription!.sdp }));
    };

    const onCameraConnected = (): void => {
      qrCanvas.hidden = true;
      manualBox.hidden = true;
      stepEl.textContent = 'つながった！ この端末は カメラになったよ';
      setStatus(
        'この端末を立てて、あそぶ場所へむけてね。' +
          '画面はつけたままに（じどうロックは切っておいてね）',
      );
      localVideo.srcObject = sendStream;
      void localVideo.play().catch(() => undefined);
      localBox.hidden = false;
      closeBtn.textContent = 'そうしんを やめる';

      // 画面が消えると配信も止まるので、できる端末ではスリープを止める
      const wakeLock = (
        navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<unknown> } }
      ).wakeLock;
      void wakeLock?.request('screen').catch(() => undefined);
    };

    // ---------- 入口まわり ----------

    $('po-role-screen').addEventListener('click', () => {
      void startScreenRole().catch(() =>
        setStatus('じゅんびに しっぱいしました。とじて やりなおしてね。', true),
      );
    });
    $('po-role-camera').addEventListener('click', () => {
      void startCameraRole().catch(() =>
        setStatus('じゅんびに しっぱいしました。とじて やりなおしてね。', true),
      );
    });
    closeBtn.addEventListener('click', () => finish(false));
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
        handlePayload(payload);
      })();
    });

    if (!('RTCPeerConnection' in window) || !('CompressionStream' in window)) {
      rolesBox.hidden = true;
      setStatus(
        'このブラウザは2台モードにたいおうしていません(あたらしいSafariでひらいてね)。',
        true,
      );
    }

    // 開発時の動作確認用
    if (import.meta.env.DEV) {
      (window as unknown as { __pairGame?: unknown }).__pairGame = {
        pickRole: (r: Role) => {
          if (r === 'screen') void startScreenRole();
          else void startCameraRole();
        },
        currentCode: () => outArea.value,
        feedCode: async (text: string) => {
          const payload = await decodeSignal(text);
          if (payload) {
            stopScan();
            handlePayload(payload);
          }
        },
        getState: () => ({ role, connection: pc?.connectionState ?? 'none' }),
      };
    }
  });
}
