// 1ゲームぶんの進行状態。シーンをまたいで共有する。SPEC_MODE1.md §2 参照。

import type { LoadedTheme } from '../themes/themes';
import type { JudgeResult } from '../core/score';
import type { PersonSegmenter } from '../core/segmenter';
import type { BinaryMask } from '../core/mask';

/**
 * 撮影画面へ渡す依頼。撮影画面はモードを知らずに済むようにする。
 */
export interface CaptureRequest {
  /** 合わせるお題。null なら自由なポーズ(モード2 など)。 */
  theme: LoadedTheme | null;
  /** 期待するかたまりの数。合わなければ撮り直しを促す。 */
  expectedBlobs: number;
  /** 撮影後に進むシーン。 */
  nextScene: string;
  /** 画面上部に出す案内。 */
  headline: string;
  /** 制限時間(秒)。 */
  timeLimitSec: number;
}

/** 撮影結果。切り抜きに必要なものを一式渡す。 */
export interface CaptureResult {
  /** ノイズ処理・かたまり判定を通したマスク。 */
  mask: BinaryMask;
  /** 各画素の所属ラベル。 */
  labels: Int32Array;
  /** 採用されたかたまり(重心Xの昇順)。 */
  blobs: import('../core/mask').MaskBlob[];
  /** 撮影した静止画。スプライトの絵柄に使う。 */
  image: HTMLCanvasElement;
}

/** 1ゲームで挑戦するお題の数。 */
export const THEMES_PER_GAME = 3;

export interface ThemeResult {
  theme: LoadedTheme;
  judge: JudgeResult;
}

export class GameSession {
  playerCount = 1;
  themes: LoadedTheme[] = [];
  results: ThemeResult[] = [];
  currentIndex = 0;

  /** 撮影画面への依頼。 */
  captureRequest: CaptureRequest | null = null;
  /** 直近の撮影結果。 */
  captured: CaptureResult | null = null;

  /** 直近の撮影で得たプレイヤーのマスク。判定シーンへ渡す。 */
  get capturedMask(): BinaryMask | null {
    return this.captured?.mask ?? null;
  }

  /** モデルの読み込みは重いので、ゲーム全体で1つを使い回す。 */
  segmenter: PersonSegmenter | null = null;

  /**
   * このゲームで実際に出るお題の数。
   *
   * THEMES_PER_GAME は「最大いくつ出すか」でしかない。
   * 人数によってはお題が足りず（3人用は2件しかない）それより少なくなるので、
   * 表示や満点の計算にはこちらを使う。
   */
  get themeCount(): number {
    return this.themes.length;
  }

  get currentTheme(): LoadedTheme | null {
    return this.themes[this.currentIndex] ?? null;
  }

  get isLastTheme(): boolean {
    return this.currentIndex >= this.themes.length - 1;
  }

  get totalScore(): number {
    return this.results.reduce((sum, result) => sum + result.judge.displayScore, 0);
  }

  /** 満点に対する割合(0〜100)。お題数が変わっても比較できるようにする。 */
  get averageScore(): number {
    if (this.results.length === 0) return 0;
    return this.totalScore / this.results.length;
  }

  /** お題ごとの挑戦回数。「なんかいめ」の表示に使う。 */
  private attempts: number[] = [];

  startGame(playerCount: number, themes: LoadedTheme[]): void {
    this.playerCount = playerCount;
    this.themes = themes;
    this.results = [];
    this.attempts = [];
    this.currentIndex = 0;
    this.captured = null;
  }

  /** いまのお題に何回挑戦したか。 */
  get currentAttempt(): number {
    return this.attempts[this.currentIndex] ?? 0;
  }

  /** いまのお題で記録されている点数。まだ撮っていなければ null。 */
  get bestScoreForCurrent(): number | null {
    return this.results[this.currentIndex]?.judge.displayScore ?? null;
  }

  /**
   * 判定結果を記録する。
   *
   * 同じお題は何度でも撮り直せる。「もういっかい！」と言われたのに
   * できないと子どもは納得しないため(SPEC_MODE1.md §2)。
   *
   * 記録に残すのは**いちばん良かった回**。撮り直して悪くなったぶんが
   * 残ると、挑戦するほど損になってしまい撮り直す気がなくなる。
   */
  recordResult(judge: JudgeResult): void {
    const theme = this.currentTheme;
    if (!theme) return;

    this.attempts[this.currentIndex] = this.currentAttempt + 1;

    const existing = this.results[this.currentIndex];
    if (!existing || judge.displayScore > existing.judge.displayScore) {
      this.results[this.currentIndex] = { theme, judge };
    }
  }

  /** 同じお題をもう一度撮る。 */
  retryCurrent(): void {
    this.captured = null;
  }

  advance(): void {
    this.currentIndex += 1;
    this.captured = null;
  }
}

/** 全シーンで共有する唯一のセッション。 */
export const session = new GameSession();

export type OverallRank = 'gold' | 'silver' | 'bronze' | 'try';

export const OVERALL_RANK_LABELS: Record<OverallRank, string> = {
  gold: 'ぜんぶ かんぺき！',
  silver: 'なかなか やるね！',
  bronze: 'いいちょうし！',
  try: 'またちょうせん してね！',
};

export function overallRank(averageScore: number): OverallRank {
  if (averageScore >= 85) return 'gold';
  if (averageScore >= 65) return 'silver';
  if (averageScore >= 45) return 'bronze';
  return 'try';
}
