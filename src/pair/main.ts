// 2台接続の実験ページ。SPEC_PAIR.md 参照。
//
// 1台をカメラ(離れた場所)、もう1台を画面(手元)にする構成の技術検証。
// 映像は WebRTC の P2P で端末から端末へ直接送る。サーバーへは送らない
// (CLAUDE.md §2.1)。接続確立に必要な情報の交換もサーバーを使わず、
// QR コードの見せ合い(または手動コピー)で行う。
//
// ながれ:
//   画面やく: オファーQRを表示 → カメラやくのアンサーQRを読む → 映像が届く
//   カメラやく: 画面やくのQRを読む → 自分のアンサーQRを表示 → 送信開始

import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { encodeSignal, decodeSignal, waitForIceComplete, type SignalPayload } from './signalCode';
import './style.css';

type Role = 'screen' | 'camera';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} がありません`);
  return el as T;
};

const roleSelect = $('role-select');
const flow = $('flow');
const stepText = $('step-text');
const qrArea = $('qr-area');
const qrCanvas = $<HTMLCanvasElement>('qr-canvas');
const scanArea = $('scan-area');
const scanVideo = $<HTMLVideoElement>('scan-video');
const remoteArea = $('remote-area');
const remoteVideo = $<HTMLVideoElement>('remote-video');
const localArea = $('local-area');
const localVideo = $<HTMLVideoElement>('local-video');
const nextBtn = $<HTMLButtonElement>('next-btn');
const resetBtn = $<HTMLButtonElement>('reset-btn');
const statusEl = $('status');
const statsEl = $<HTMLPreElement>('stats');
const codeOut = $<HTMLTextAreaElement>('code-out');
const codeIn = $<HTMLTextAreaElement>('code-in');
const copyBtn = $<HTMLButtonElement>('copy-btn');
const pasteBtn = $<HTMLButtonElement>('paste-btn');

let role: Role | null = null;
let pc: RTCPeerConnection | null = null;
let scanStream: MediaStream | null = null;
let sendStream: MediaStream | null = null;
let scanTimer: number | null = null;

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

/** エラーの中身を人が読める形に。口頭で伝えてもらうときの手がかりになる */
function errText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

// 想定外のエラーも必ず画面に出す(実機では開発者ツールを開けない)
window.addEventListener('error', (event) => {
  setStatus(`エラー: ${event.message}`, true);
});
window.addEventListener('unhandledrejection', (event) => {
  setStatus(`エラー: ${errText(event.reason)}`, true);
});

function setStep(message: string): void {
  stepText.textContent = message;
}

// ---------- 共通部品 ----------

function newPeer(): RTCPeerConnection {
  // STUN も指定しない。同じWi-Fi内なら host 候補だけでつながり、
  // 外部サーバーへの問い合わせが一切発生しない
  const peer = new RTCPeerConnection();
  peer.addEventListener('connectionstatechange', () => {
    if (peer.connectionState === 'connected') onConnected();
    if (peer.connectionState === 'failed') {
      setStatus(
        'つなげませんでした。同じWi-Fiか確認してください。' +
          'ルーターの設定(AP分離/プライバシーセパレーター)で端末同士の通信が' +
          '禁止されていると失敗します。',
        true,
      );
    }
  });
  return peer;
}

async function showQr(text: string): Promise<void> {
  await QRCode.toCanvas(qrCanvas, text, {
    errorCorrectionLevel: 'L', // SDP は長いので容量優先
    margin: 2,
    scale: 4,
  });
  qrArea.hidden = false;
  codeOut.value = text;
}

/** カメラで QR を読み続ける。読めたら止めて返す。 */
async function scanQr(onDecoded: (payload: SignalPayload) => void): Promise<void> {
  // QR 読み取りは背面カメラのほうが向けやすい
  scanStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  scanVideo.srcObject = scanStream;
  await scanVideo.play();
  scanArea.hidden = false;

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
          onDecoded(payload);
          return;
        }
      }
    }
    scanTimer = window.setTimeout(() => void tick(), 120);
  };
  void tick();
}

function stopScan(): void {
  if (scanTimer !== null) clearTimeout(scanTimer);
  scanTimer = null;
  scanStream?.getTracks().forEach((track) => track.stop());
  scanStream = null;
  scanArea.hidden = true;
}

/** 手動コード入力(QRの代替)。 */
pasteBtn.addEventListener('click', () => {
  void (async () => {
    const payload = await decodeSignal(codeIn.value);
    if (!payload) {
      setStatus('コードの形式が違うようです。全部コピーできているか確認してください。', true);
      return;
    }
    stopScan();
    handlePayload(payload);
  })();
});

copyBtn.addEventListener('click', () => {
  void navigator.clipboard.writeText(codeOut.value).then(() => setStatus('コードをコピーしました'));
});

resetBtn.addEventListener('click', () => window.location.reload());

// ---------- 画面やく ----------

async function startScreenRole(): Promise<void> {
  role = 'screen';
  roleSelect.hidden = true;
  flow.hidden = false;

  pc = newPeer();
  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addEventListener('track', (event) => {
    remoteVideo.srcObject = event.streams[0] ?? new MediaStream([event.track]);
  });

  setStep('① このQRを、カメラやくの端末で読み取ってください');
  setStatus('接続コードを作っています...');
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceComplete(pc);
  await showQr(await encodeSignal({ kind: 'o', sdp: pc.localDescription!.sdp }));
  setStatus('カメラやくが読み取ったら、向こうにアンサーQRが出ます。');

  nextBtn.textContent = '② カメラやくのQRを読み取る';
  nextBtn.hidden = false;
  nextBtn.onclick = () => {
    nextBtn.hidden = true;
    qrArea.hidden = true;
    setStep('② カメラやくの端末に出ているQRを写してください');
    setStatus('QRをさがしています...');
    void scanQr(handlePayload).catch((error) => {
      setStatus(
        `カメラを使えませんでした (${errText(error)})。下の手動コード欄を使ってください。`,
        true,
      );
    });
  };
}

async function acceptAnswer(payload: SignalPayload): Promise<void> {
  if (!pc) return;
  await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
  setStep('③ つないでいます...');
  setStatus('あとすこし...');
}

// ---------- カメラやく ----------

async function startCameraRole(): Promise<void> {
  role = 'camera';
  roleSelect.hidden = true;
  flow.hidden = false;

  setStep('① 画面やくの端末に出ているQRを写してください');
  setStatus('QRをさがしています...');
  await scanQr(handlePayload).catch((error) => {
    setStatus(
      `カメラを使えませんでした (${errText(error)})。下の手動コード欄を使ってください。`,
      true,
    );
  });
}

async function acceptOffer(payload: SignalPayload): Promise<void> {
  setStatus('カメラを起動しています...');

  // QR読み取りに使った背面カメラをそのまま送信にも使う
  sendStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  localVideo.srcObject = sendStream;
  localArea.hidden = false;

  pc = newPeer();
  for (const track of sendStream.getTracks()) pc.addTrack(track, sendStream);

  await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIceComplete(pc);

  setStep('② このQRを、画面やくの端末で読み取ってください');
  await showQr(await encodeSignal({ kind: 'a', sdp: pc.localDescription!.sdp }));
  setStatus('画面やくが読み取ると、自動でつながります。');
}

// ---------- 受け取ったコードの振り分け ----------

function handlePayload(payload: SignalPayload): void {
  const fail = (error: unknown): void =>
    setStatus(`接続処理に失敗しました (${errText(error)})`, true);
  if (role === 'screen' && payload.kind === 'a') {
    void acceptAnswer(payload).catch(fail);
  } else if (role === 'camera' && payload.kind === 'o') {
    void acceptOffer(payload).catch(fail);
  } else {
    setStatus(
      payload.kind === 'o'
        ? 'それは画面やくのQRです。カメラやくの端末のQRを読んでください。'
        : 'それはカメラやくのQRです。画面やくの端末のQRを読んでください。',
      true,
    );
    // 読み取り中だった場合は続けられるように再開する
    if (role === 'screen' || role === 'camera') {
      void scanQr(handlePayload).catch(() => undefined);
    }
  }
}

// ---------- 接続後 ----------

function onConnected(): void {
  qrArea.hidden = true;
  nextBtn.hidden = true;

  if (role === 'screen') {
    setStep('つながった！ カメラやくの映像がここに届いています');
    remoteArea.hidden = false;
  } else {
    setStep('つながった！ この端末の映像を送っています');
  }
  setStatus('接続OK。しばらく置いて、映像が止まらないか見てください。');

  // 画面が消えると配信も止まるので、できる端末ではスリープを止める
  const wakeLock = (
    navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<unknown> } }
  ).wakeLock;
  void wakeLock?.request('screen').catch(() => undefined);

  statsEl.hidden = false;
  window.setInterval(() => void updateStats(), 1000);
}

/** 接続の様子を出す。LAN内直結(host)になっているかが分かる。 */
async function updateStats(): Promise<void> {
  if (!pc) return;
  const lines: string[] = [`接続: ${pc.connectionState}`];

  const stats = await pc.getStats();
  stats.forEach((report) => {
    if (report.type === 'inbound-rtp' && report.kind === 'video') {
      const r = report as RTCInboundRtpStreamStats & { framesPerSecond?: number };
      lines.push(
        `受信: ${r.frameWidth ?? '?'}x${r.frameHeight ?? '?'} / ${r.framesPerSecond ?? '?'}fps`,
      );
    }
    if (report.type === 'outbound-rtp' && report.kind === 'video') {
      const r = report as RTCOutboundRtpStreamStats & { framesPerSecond?: number };
      lines.push(
        `送信: ${r.frameWidth ?? '?'}x${r.frameHeight ?? '?'} / ${r.framesPerSecond ?? '?'}fps`,
      );
    }
    if (report.type === 'candidate-pair' && (report as RTCIceCandidatePairStats).nominated) {
      const pair = report as RTCIceCandidatePairStats;
      const local = stats.get(pair.localCandidateId) as { candidateType?: string } | undefined;
      if (local?.candidateType) {
        lines.push(
          `経路: ${local.candidateType}${local.candidateType === 'host' ? ' (同一LAN直結)' : ''}`,
        );
      }
    }
  });

  statsEl.textContent = lines.join('\n');
}

// ---------- 入口 ----------

document
  .querySelector('footer')
  ?.insertAdjacentHTML('beforeend', ` <span>v ${__BUILD_ID__}</span>`);

if (!('RTCPeerConnection' in window) || !('CompressionStream' in window)) {
  setStatus(
    'このブラウザは2台接続に対応していません(iOS 16.4以降のSafariで開いてください)。',
    true,
  );
} else {
  $('role-screen').addEventListener('click', () => void startScreenRole());
  $('role-camera').addEventListener('click', () => void startCameraRole());
}

// 開発時の動作確認用。手動コード欄と同じ経路を外から叩けるようにする
declare global {
  interface Window {
    __pair?: {
      getPeer: () => RTCPeerConnection | null;
      getRole: () => Role | null;
      currentCode: () => string;
      feedCode: (text: string) => Promise<void>;
      testQrRoundTrip: (sdp: string) => Promise<{ ok: boolean; codeLen: number; qrSize: number }>;
    };
  }
}
if (import.meta.env.DEV) {
  window.__pair = {
    getPeer: () => pc,
    getRole: () => role,
    currentCode: () => codeOut.value,
    feedCode: async (text: string) => {
      const payload = await decodeSignal(text);
      if (payload) handlePayload(payload);
    },
    // QR 生成 → jsQR で読み戻す一往復の検査(カメラなしで通せる)
    testQrRoundTrip: async (sdp: string) => {
      const code = await encodeSignal({ kind: 'o', sdp });
      const canvas = document.createElement('canvas');
      await QRCode.toCanvas(canvas, code, { errorCorrectionLevel: 'L', margin: 2, scale: 4 });
      const ctx = canvas.getContext('2d')!;
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(image.data, image.width, image.height);
      if (!found) return { ok: false, codeLen: code.length, qrSize: canvas.width };
      const decoded = await decodeSignal(found.data);
      return {
        ok: decoded !== null && decoded.sdp === sdp && decoded.kind === 'o',
        codeLen: code.length,
        qrSize: canvas.width,
      };
    },
  };
}
