// 1ゲームぶんの進行状態。シーンをまたいで共有する。SPEC_MODE1.md §2 参照。

import type { LoadedTheme } from '../themes/themes';
import type { JudgeResult } from '../core/score';
import type { PersonSegmenter } from '../core/segmenter';

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

  /** 直近の撮影で得たプレイヤーのマスク。判定シーンへ渡す。 */
  capturedMask: import('../core/mask').BinaryMask | null = null;

  /** モデルの読み込みは重いので、ゲーム全体で1つを使い回す。 */
  segmenter: PersonSegmenter | null = null;

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

  startGame(playerCount: number, themes: LoadedTheme[]): void {
    this.playerCount = playerCount;
    this.themes = themes;
    this.results = [];
    this.currentIndex = 0;
    this.capturedMask = null;
  }

  recordResult(judge: JudgeResult): void {
    const theme = this.currentTheme;
    if (!theme) return;
    this.results.push({ theme, judge });
  }

  advance(): void {
    this.currentIndex += 1;
    this.capturedMask = null;
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
