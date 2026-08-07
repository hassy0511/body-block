// getUserMedia の「返ってこない」対策。
//
// iOS ではカメラの起動要求が、まれに成功も失敗もせず固まることがある
// (特にホーム画面追加のアプリ表示で、実機で発生した)。
// 固まったままだと再起動しか手がなくなるので、時間で見切りをつけて
// エラーにし、呼び出し側で「もういちど」を出せるようにする。

export function getCameraWithTimeout(
  constraints: MediaStreamConstraints,
  timeoutMs = 8000,
): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error('カメラの おうとうが ありません(時間ぎれ)'));
    }, timeoutMs);

    navigator.mediaDevices.getUserMedia(constraints).then(
      (stream) => {
        if (timedOut) {
          // 見切りをつけたあとに返ってきたら、使わずに止める
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        clearTimeout(timer);
        resolve(stream);
      },
      (error: unknown) => {
        if (!timedOut) {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      },
    );
  });
}
