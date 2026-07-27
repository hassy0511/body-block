// お題(穴)のポーズ定義。SPEC_MODE1.md §4 参照。
//
// シルエットは全て自作。人型を「頭 = 円」「胴体・手足 = カプセル(太い線分)」で表し、
// 関節の角度と長さだけをデータで持つ。既存キャラクターを連想させる形は作らない。
//
// 角度の基準: 0度 = 真下、正の値 = 体の外側(左半身は左へ、右半身は右へ)。
// 「バンザイ」なら腕の角度は 160 度前後になる。
// 長さ・太さは「肩幅を 1.0 とした相対値」で持ち、描画時に実サイズへ変換する。

export interface Limb {
  /** 付け根から見た角度(度)。0 = 真下、正 = 体の外側へ開く。 */
  angle: number;
  /** 肩幅を 1.0 とした長さ。 */
  length: number;
  /** 肘・膝の曲げ角度(度)。0 = まっすぐ。正 = 外側へ曲がる。 */
  bend?: number;
}

export interface Figure {
  /** 立ち位置。0 = 画面左端、1 = 画面右端。 */
  x: number;
  /** 体の大きさ(標準を 1.0 とする)。しゃがみポーズなどで縮める。 */
  scale?: number;
  /** 足元の位置。0 = 画面上端、1 = 画面下端。 */
  groundY?: number;
  leftArm: Limb;
  rightArm: Limb;
  leftLeg: Limb;
  rightLeg: Limb;
}

export interface PoseTheme {
  id: string;
  /** 表示名。ひらがな中心(CLAUDE.md §6)。 */
  name: string;
  /** 対応人数。 */
  players: number;
  /** 難易度 1〜3。 */
  difficulty: 1 | 2 | 3;
  /** 人数分の人型。左から順に並べる(重心Xでの所有権割り当てと対応)。 */
  figures: Figure[];
}

/** 直立に近い既定値。ポーズはここからの差分として書くと読みやすい。 */
const STAND: Omit<Figure, 'x'> = {
  leftArm: { angle: 20, length: 0.85 },
  rightArm: { angle: 20, length: 0.85 },
  leftLeg: { angle: 8, length: 1.0 },
  rightLeg: { angle: 8, length: 1.0 },
};

export const POSE_THEMES: PoseTheme[] = [
  // ---- 1人用 ----
  {
    id: 'daimonji',
    name: 'だいのじ',
    players: 1,
    difficulty: 1,
    figures: [
      {
        ...STAND,
        x: 0.5,
        leftArm: { angle: 125, length: 0.9 },
        rightArm: { angle: 125, length: 0.9 },
        leftLeg: { angle: 30, length: 1.0 },
        rightLeg: { angle: 30, length: 1.0 },
      },
    ],
  },
  {
    id: 'banzai',
    name: 'ばんざい',
    players: 1,
    difficulty: 1,
    figures: [
      {
        ...STAND,
        x: 0.5,
        leftArm: { angle: 165, length: 0.9 },
        rightArm: { angle: 165, length: 0.9 },
        leftLeg: { angle: 10, length: 1.0 },
        rightLeg: { angle: 10, length: 1.0 },
      },
    ],
  },
  {
    id: 't_pose',
    name: 'ティーのポーズ',
    players: 1,
    difficulty: 1,
    figures: [
      {
        ...STAND,
        x: 0.5,
        leftArm: { angle: 90, length: 0.95 },
        rightArm: { angle: 90, length: 0.95 },
        leftLeg: { angle: 5, length: 1.0 },
        rightLeg: { angle: 5, length: 1.0 },
      },
    ],
  },
  {
    id: 'kunoji',
    name: 'くのじ',
    players: 1,
    difficulty: 2,
    figures: [
      {
        ...STAND,
        x: 0.5,
        leftArm: { angle: 150, length: 0.9 },
        rightArm: { angle: 60, length: 0.9 },
        leftLeg: { angle: 35, length: 1.0 },
        rightLeg: { angle: -5, length: 1.0 },
      },
    ],
  },
  {
    id: 'kataashi',
    name: 'かたあしバランス',
    players: 1,
    difficulty: 3,
    figures: [
      {
        ...STAND,
        x: 0.5,
        leftArm: { angle: 100, length: 0.9 },
        rightArm: { angle: 140, length: 0.9 },
        leftLeg: { angle: 70, length: 0.95, bend: 45 },
        rightLeg: { angle: 0, length: 1.0 },
      },
    ],
  },
  {
    id: 'shagami',
    name: 'しゃがみだま',
    players: 1,
    difficulty: 2,
    figures: [
      {
        ...STAND,
        x: 0.5,
        scale: 0.72,
        leftArm: { angle: 55, length: 0.7, bend: 70 },
        rightArm: { angle: 55, length: 0.7, bend: 70 },
        leftLeg: { angle: 40, length: 0.7, bend: 85 },
        rightLeg: { angle: 40, length: 0.7, bend: 85 },
      },
    ],
  },

  // ---- 2人用 ----
  {
    id: 'heart',
    name: 'はんぶんこハート',
    players: 2,
    difficulty: 3,
    figures: [
      {
        ...STAND,
        x: 0.36,
        leftArm: { angle: 155, length: 0.9, bend: 55 },
        rightArm: { angle: 70, length: 0.9, bend: 60 },
        leftLeg: { angle: 12, length: 1.0 },
        rightLeg: { angle: 5, length: 1.0 },
      },
      {
        ...STAND,
        x: 0.64,
        leftArm: { angle: 70, length: 0.9, bend: -60 },
        rightArm: { angle: 155, length: 0.9, bend: -55 },
        leftLeg: { angle: 5, length: 1.0 },
        rightLeg: { angle: 12, length: 1.0 },
      },
    ],
  },
  {
    id: 'yama_tani',
    name: 'やまとたに',
    players: 2,
    difficulty: 2,
    figures: [
      {
        ...STAND,
        x: 0.33,
        leftArm: { angle: 150, length: 0.9 },
        rightArm: { angle: 150, length: 0.9 },
        leftLeg: { angle: 25, length: 1.0 },
        rightLeg: { angle: 25, length: 1.0 },
      },
      {
        ...STAND,
        x: 0.67,
        scale: 0.75,
        leftArm: { angle: 95, length: 0.85 },
        rightArm: { angle: 95, length: 0.85 },
        leftLeg: { angle: 45, length: 0.8, bend: 60 },
        rightLeg: { angle: 45, length: 0.8, bend: 60 },
      },
    ],
  },
  {
    id: 'daishou',
    name: 'だいしょうコンビ',
    players: 2,
    difficulty: 1,
    figures: [
      {
        ...STAND,
        x: 0.35,
        scale: 1.05,
        leftArm: { angle: 130, length: 0.9 },
        rightArm: { angle: 40, length: 0.9 },
      },
      {
        ...STAND,
        x: 0.65,
        scale: 0.7,
        leftArm: { angle: 40, length: 0.85 },
        rightArm: { angle: 130, length: 0.85 },
      },
    ],
  },
  {
    id: 'tunnel',
    name: 'トンネル',
    players: 2,
    difficulty: 2,
    figures: [
      {
        ...STAND,
        x: 0.36,
        leftArm: { angle: 130, length: 0.95 },
        rightArm: { angle: 155, length: 0.95 },
        leftLeg: { angle: 30, length: 1.0 },
        rightLeg: { angle: 5, length: 1.0 },
      },
      {
        ...STAND,
        x: 0.64,
        leftArm: { angle: 155, length: 0.95 },
        rightArm: { angle: 130, length: 0.95 },
        leftLeg: { angle: 5, length: 1.0 },
        rightLeg: { angle: 30, length: 1.0 },
      },
    ],
  },

  // ---- 3人用 ----
  {
    id: 'sanninbanzai',
    name: 'さんにんばんざい',
    players: 3,
    difficulty: 1,
    figures: [
      {
        ...STAND,
        x: 0.24,
        leftArm: { angle: 160, length: 0.9 },
        rightArm: { angle: 160, length: 0.9 },
      },
      {
        ...STAND,
        x: 0.5,
        leftArm: { angle: 160, length: 0.9 },
        rightArm: { angle: 160, length: 0.9 },
      },
      {
        ...STAND,
        x: 0.76,
        leftArm: { angle: 160, length: 0.9 },
        rightArm: { angle: 160, length: 0.9 },
      },
    ],
  },
  {
    id: 'kaidan',
    name: 'かいだん',
    players: 3,
    difficulty: 2,
    figures: [
      {
        ...STAND,
        x: 0.22,
        scale: 0.7,
        leftArm: { angle: 95, length: 0.85 },
        rightArm: { angle: 95, length: 0.85 },
        leftLeg: { angle: 40, length: 0.8, bend: 70 },
        rightLeg: { angle: 40, length: 0.8, bend: 70 },
      },
      {
        ...STAND,
        x: 0.5,
        scale: 0.9,
        leftArm: { angle: 95, length: 0.85 },
        rightArm: { angle: 95, length: 0.85 },
        leftLeg: { angle: 20, length: 0.9, bend: 30 },
        rightLeg: { angle: 20, length: 0.9, bend: 30 },
      },
      {
        ...STAND,
        x: 0.78,
        scale: 1.1,
        leftArm: { angle: 95, length: 0.85 },
        rightArm: { angle: 95, length: 0.85 },
      },
    ],
  },
];

/** 指定人数に対応するお題だけを返す。 */
export function themesForPlayers(players: number): PoseTheme[] {
  return POSE_THEMES.filter((theme) => theme.players === players);
}

/** 同一ゲーム内で重複しないようにお題をランダムに選ぶ(SPEC_MODE1.md §4)。 */
export function pickThemes(players: number, count: number, random = Math.random): PoseTheme[] {
  const pool = [...themesForPlayers(players)];
  const picked: PoseTheme[] = [];

  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    picked.push(pool.splice(index, 1)[0]!);
  }

  return picked;
}
