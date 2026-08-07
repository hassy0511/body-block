// 2台モードの状態置き場。SPEC_PAIR.md 参照。
//
// 画面やく(この端末)が受け取った、カメラやく端末の映像ストリームを保持する。
// これが設定されている間、CameraController は手元のカメラの代わりに
// この映像を使う。シーンをまたいで生きるので Phaser の外に置く。

let stream: MediaStream | null = null;
let peer: RTCPeerConnection | null = null;

/** 接続が確立したら呼ぶ。切断されたら自動で解除される。 */
export function setRemotePair(newStream: MediaStream, newPeer: RTCPeerConnection): void {
  disconnectRemote();
  stream = newStream;
  peer = newPeer;

  newPeer.addEventListener('connectionstatechange', () => {
    if (
      newPeer.connectionState === 'failed' ||
      newPeer.connectionState === 'disconnected' ||
      newPeer.connectionState === 'closed'
    ) {
      // 解除しておけば、次にカメラを使うとき手元のカメラへ自然に戻る
      if (peer === newPeer) disconnectRemote();
    }
  });
}

export function getRemoteStream(): MediaStream | null {
  return stream;
}

export function isRemoteActive(): boolean {
  return stream !== null;
}

/** 2台モードをやめる。 */
export function disconnectRemote(): void {
  peer?.close();
  stream?.getTracks().forEach((track) => track.stop());
  peer = null;
  stream = null;
}
