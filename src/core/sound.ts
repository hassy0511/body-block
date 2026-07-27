// 効果音。CLAUDE.md §5 の素材ライセンス制約を避けるため、
// 音声ファイルは持たず WebAudio で合成する(＝自作)。

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  context ??= new AudioContext();
  // iOS ではユーザー操作後まで suspended のままなので都度復帰させる
  if (context.state === 'suspended') void context.resume();
  return context;
}

/** 初回のタップ時に呼んで、以降の再生をできるようにする。 */
export function unlockAudio(): void {
  getContext();
}

interface ToneOptions {
  frequency: number;
  durationMs: number;
  type?: OscillatorType;
  volume?: number;
  /** 開始を遅らせる(ミリ秒)。 */
  delayMs?: number;
}

function playTone({
  frequency,
  durationMs,
  type = 'sine',
  volume = 0.2,
  delayMs = 0,
}: ToneOptions): void {
  const ctx = getContext();
  if (!ctx) return;

  const startAt = ctx.currentTime + delayMs / 1000;
  const endAt = startAt + durationMs / 1000;

  const oscillator = ctx.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);

  const gain = ctx.createGain();
  // 立ち上がりと減衰を付けてプツッというノイズを防ぐ
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(endAt + 0.02);
}

/** カウントダウンの「ピッ」。 */
export function playCountdownBeep(): void {
  playTone({ frequency: 660, durationMs: 140, type: 'triangle', volume: 0.18 });
}

/** シャッターの「カシャッ」。短い高音2発で代用する。 */
export function playShutter(): void {
  playTone({ frequency: 1400, durationMs: 60, type: 'square', volume: 0.12 });
  playTone({ frequency: 900, durationMs: 90, type: 'square', volume: 0.1, delayMs: 70 });
}

/** ボタンのタップ音。 */
export function playTap(): void {
  playTone({ frequency: 880, durationMs: 80, type: 'triangle', volume: 0.12 });
}

/** スコア発表の「ジャーン」。ランクに応じて明るさを変える。 */
export function playFanfare(good: boolean): void {
  const notes = good ? [523, 659, 784, 1047] : [523, 494, 440];
  notes.forEach((frequency, index) => {
    playTone({
      frequency,
      durationMs: 260,
      type: 'triangle',
      volume: 0.16,
      delayMs: index * 110,
    });
  });
}
