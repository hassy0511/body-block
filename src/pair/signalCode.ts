// WebRTC の接続情報(SDP)を QR コードに載る文字列へ変換する。
//
// サーバーを使わない方針(CLAUDE.md §2.1)のため、シグナリングは
// QR コードの見せ合い(または手動コピー)で行う。SDP はそのままだと
// 数KBあり QR に収まらないことがあるので、deflate で圧縮して
// base64url にする。iOS Safari 16.4+ の CompressionStream を使う。

const PREFIX = 'KBQR1:';

export interface SignalPayload {
  /** 'o' = がめんやくのオファー / 'a' = カメラやくのアンサー */
  kind: 'o' | 'a';
  sdp: string;
}

async function pipeThrough(
  data: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const blob = new Blob([data as BlobPart]);
  const compressed = blob.stream().pipeThrough(stream);
  const buffer = await new Response(compressed).arrayBuffer();
  return new Uint8Array(buffer);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 接続情報を QR 向けの短い文字列にする。 */
export async function encodeSignal(payload: SignalPayload): Promise<string> {
  const json = JSON.stringify({ k: payload.kind, s: payload.sdp });
  const raw = new TextEncoder().encode(json);
  const deflated = await pipeThrough(raw, new CompressionStream('deflate-raw'));
  return PREFIX + toBase64Url(deflated);
}

/** encodeSignal の逆。形式が違えば null。 */
export async function decodeSignal(text: string): Promise<SignalPayload | null> {
  const trimmed = text.trim();
  if (!trimmed.startsWith(PREFIX)) return null;
  try {
    const deflated = fromBase64Url(trimmed.slice(PREFIX.length));
    const raw = await pipeThrough(deflated, new DecompressionStream('deflate-raw'));
    const parsed = JSON.parse(new TextDecoder().decode(raw)) as { k: 'o' | 'a'; s: string };
    if ((parsed.k !== 'o' && parsed.k !== 'a') || typeof parsed.s !== 'string') return null;
    return { kind: parsed.k, sdp: parsed.s };
  } catch {
    return null;
  }
}

/**
 * ICE 候補が出そろうまで待つ。
 * QR は一度しか見せられないので、候補を全部含んだ SDP を作る(Vanilla ICE)。
 * ルーターによっては complete にならないことがあるため、時間で打ち切る。
 */
export function waitForIceComplete(pc: RTCPeerConnection, timeoutMs = 3000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}
