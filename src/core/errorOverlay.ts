// 想定外のエラーを画面に出す。
//
// Phaser はゲームループの中で例外が漏れると次フレームを予約せず、
// 画面が止まったまま無反応になる。実機では開発者ツールを開けないことも多いので、
// 何が起きたかを画面に出して切り分けられるようにしておく。

let installed = false;

function show(title: string, detail: string): void {
  let box = document.querySelector<HTMLDivElement>('#error-overlay');
  if (!box) {
    box = document.createElement('div');
    box.id = 'error-overlay';
    box.style.cssText = [
      'position:fixed',
      'left:0',
      'right:0',
      'bottom:0',
      'z-index:9999',
      'max-height:45vh',
      'overflow:auto',
      'padding:12px 16px',
      'background:rgba(120,20,20,0.94)',
      'color:#fff',
      'font:13px/1.5 system-ui, sans-serif',
      'white-space:pre-wrap',
      'word-break:break-word',
    ].join(';');
    document.body.appendChild(box);
  }
  box.textContent = `${title}\n${detail}`;

  // 出しっぱなしだと直った後の画面まで覆ってしまうので、閉じられるようにする
  const close = document.createElement('button');
  close.textContent = '× とじる';
  close.style.cssText =
    'display:block;margin-top:8px;padding:6px 16px;border:none;border-radius:8px;' +
    'background:#fff;color:#7a1414;font-weight:bold;cursor:pointer;font-family:inherit';
  close.addEventListener('click', () => box?.remove());
  box.appendChild(close);
}

export function installErrorOverlay(): void {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    const error = event.error as Error | undefined;
    show('エラーが おきました', error?.stack ?? error?.message ?? event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as unknown;
    const detail =
      reason instanceof Error ? (reason.stack ?? reason.message) : JSON.stringify(reason);
    show('しょりに しっぱいしました', detail);
  });
}
