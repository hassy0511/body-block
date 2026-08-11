// モード9「シーソーバランス」。SPEC_MODE9.md 参照。
//
// 大きなシーソーの上に、交代で体ブロックを載せていく。
// かたむけて たおしてしまった人の負け(いわゆる積み木崩し式)。
//
// 当初案は「2チームで相手側のブロックを落とし合う」だったが、
// シーソーは自分の側に載せるほど自分の側が下がるため、
// 「相手を落とすつもりが自分から傾ける」ことになり成立しない。
// 「倒した人の負け」ルールなら同じドキドキ感のまま人数も自由になる。
//
// ほかのモードと違い、ブロックは固定しない。揺れて滑るバランスが本体。

import Phaser from 'phaser';
import { buildCutoutPiece, type CutoutPiece } from '../core/cutout';
import { registerDecomp } from '../core/physics';
import { playFanfare, playTap } from '../core/sound';
import { CameraPanel, PANEL_DEPTH, type CapturedFrame } from '../game/cameraPanel';
import {
  addBackground,
  createButton,
  titleStyle,
  bodyStyle,
  COLORS,
  GAME_WIDTH,
  GAME_HEIGHT,
} from '../ui/ui';

/** ポーズを作るための制限時間(秒)。 */
const SHOT_TIME_LIMIT_SEC = 8;

/** カメラ枠と舞台の幅。ほかの物理モードと同じ考え方(SPEC_MODE2.md §5)。 */
const STAGE_WIDTH = 560;
const STAGE_X = Math.round((GAME_WIDTH - STAGE_WIDTH) / 2);
const STAGE_RIGHT = STAGE_X + STAGE_WIDTH;

const CAM_X = STAGE_X;
const CAM_Y = 96;
const CAM_WIDTH = STAGE_WIDTH;
const CAM_HEIGHT = Math.round((STAGE_WIDTH * 9) / 16);

const ARENA_TOP = CAM_Y + CAM_HEIGHT;
const FLOOR_Y = GAME_HEIGHT - 190;

/**
 * シーソーは「やじろべえ式」で作る。
 *
 * 板の中心をピン留めしただけでは「どの角度でも釣り合う棒」になり、
 * 一度揺れたら傾いたまま戻らない。両端をゼロ長のソフト拘束で吊る案も
 * 試したが、Matter のゼロ長拘束はバネとして働かず、どれだけ重くても
 * 勝手に水平へ戻りきってしまった(いずれもヘッドレス検証で確認)。
 *
 * そこで**支点を板より PIVOT_DROP だけ上に置く**。板の重心が支点より
 * 下にあるため、板自身の重さが振り子のように水平へ戻す力になり、
 * 「載せた重さ × 端からの距離」に応じてじわっと傾く。
 * 釣り合いの目安: sin(傾き) ≒ ブロック質量×腕の長さ ÷ (板質量×PIVOT_DROP)
 */
const PIVOT_Y = FLOOR_Y - 162;
const PIVOT_DROP = 42;
const PLANK_HALF = 250;
const PLANK_THICK = 20;
/** 板は重くする。戻す力のもとになり、落下の衝撃でも暴れにくくなる。 */
const PLANK_DENSITY = 0.2;
/**
 * 板の回転慣性(Matter の inertia)。既定値(質量×長さ²/12 ≒ 4200万)のままだと
 * 重い板は回り出しが遅すぎて、セーフ判定の時間内に釣り合いの角度まで
 * 傾ききらない(ヘッドレス検証で確認)。釣り合いの角度そのものは慣性に
 * よらないので、ここだけ小さくして「よく動くが釣り合いは同じ」板にする。
 */
const PLANK_INERTIA = 6e6;

/** 「たおれた」とみなす傾き(度)と、その状態が続く時間(ms)。 */
const TIP_DEG = 20;
const TIP_HOLD_MS = 750;

/** 載せる回数。1人はバランス挑戦、複数人は1人3回ぶんで交代。 */
const SOLO_BLOCKS = 6;
const BLOCKS_PER_PLAYER = 3;

type Phase = 'build' | 'settling' | 'over';

export class SeesawScene extends Phaser.Scene {
  private panel!: CameraPanel;
  private blocks: Phaser.GameObjects.GameObject[] = [];
  private textureKeys: string[] = [];

  private plankRect!: Phaser.GameObjects.Rectangle;
  private plankBody!: MatterJS.BodyType;

  private challengers = 1;
  private currentPlayer = 1;
  private placedCount = 0;
  private lastPlacer: number | null = null;
  /** たおした人(結果表示ずみ)。動作確認から読むために公開している。 */
  tippedBy: number | null = null;

  private phase: Phase = 'build';
  private busy = false;
  private settleStartedAt = 0;
  private tiltedSince: number | null = null;

  private statusText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private startLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('Seesaw');
  }

  init(data: { challengers?: number }): void {
    this.challengers = data.challengers ?? 1;
  }

  private get maxBlocks(): number {
    return this.challengers > 1 ? this.challengers * BLOCKS_PER_PLAYER : SOLO_BLOCKS;
  }

  create(): void {
    addBackground(this);
    registerDecomp();

    this.blocks = [];
    this.textureKeys = [];
    this.currentPlayer = 1;
    this.placedCount = 0;
    this.lastPlacer = null;
    this.tippedBy = null;
    this.phase = 'build';
    this.busy = false;
    this.tiltedSince = null;

    this.buildStage();
    this.buildHud();

    this.panel = new CameraPanel(this, {
      x: CAM_X,
      y: CAM_Y,
      width: CAM_WIDTH,
      height: CAM_HEIGHT,
      // 1人ずつ順番に載せるモードなのでガイド枠は出さない
      guideCount: 1,
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const key of this.textureKeys) {
        if (this.textures.exists(key)) this.textures.remove(key);
      }
      this.textureKeys = [];
    });

    void this.panel.start().then((ok) => {
      // カメラ起動が返ってくる前にシーンを離れていたら何もしない。
      // 破棄ずみのテキストへ書き込むと例外になる(実機で発生した)
      if (!this.statusText.scene) return;
      this.statusText.setText(
        ok
          ? 'シーソーを たおさないように のせていこう！\n「スタート！」で さつえい'
          : 'カメラを つかえませんでした。きょかを かくにんしてね',
      );
    });
  }

  private buildStage(): void {
    const centerX = STAGE_X + STAGE_WIDTH / 2;

    this.add.rectangle(
      centerX,
      (ARENA_TOP + FLOOR_Y + 40) / 2,
      STAGE_WIDTH,
      FLOOR_Y + 40 - ARENA_TOP,
      0xfff2d6,
    );

    // 床
    this.add.rectangle(centerX, FLOOR_Y + 20, STAGE_WIDTH, 40, COLORS.wall);
    this.matter.add.rectangle(centerX, FLOOR_Y + 30, STAGE_WIDTH, 60, {
      isStatic: true,
      friction: 0.8,
      frictionStatic: 1,
    });

    // 左右の壁
    for (const wallX of [STAGE_X - 30, STAGE_RIGHT + 30]) {
      this.matter.add.rectangle(wallX, GAME_HEIGHT / 2, 60, GAME_HEIGHT * 2, {
        isStatic: true,
        friction: 0.2,
      });
      this.add.rectangle(
        wallX,
        (ARENA_TOP + FLOOR_Y + 40) / 2,
        8,
        FLOOR_Y + 40 - ARENA_TOP,
        0xeed9a8,
      );
    }

    // 支点(見た目だけ)。剛体にすると板の回転と干渉するので絵に留め、
    // 板はピン留め(worldConstraint)で支える
    this.add
      .triangle(centerX, FLOOR_Y - 60, 0, 120, 60, 0, 120, 120, 0xb0793f)
      .setDepth(PANEL_DEPTH + 3);

    // 板。端が床に着くのは約28°なので、たおれ判定(22°)が先に来る。
    // 支点は板より上(やじろべえ式。冒頭の定数の説明を参照)
    this.plankRect = this.add
      .rectangle(centerX, PIVOT_Y + PIVOT_DROP, PLANK_HALF * 2, PLANK_THICK, 0xa06a3a)
      .setDepth(PANEL_DEPTH + 4);
    this.matter.add.gameObject(this.plankRect, {
      friction: 0.9,
      frictionStatic: 1.1,
      restitution: 0,
      density: PLANK_DENSITY,
      // 揺れの収まりの速さ。小さいと振り子のように往復し続け、
      // 大きいと傾きがゆっくりになりすぎる
      frictionAir: 0.02,
    });
    this.plankBody = this.plankRect.body as MatterJS.BodyType;
    this.matter.body.setInertia(this.plankBody, PLANK_INERTIA);
    this.matter.add.worldConstraint(this.plankBody, 0, 1, {
      pointA: { x: centerX, y: PIVOT_Y },
      pointB: { x: 0, y: -PIVOT_DROP },
    });
  }

  private buildHud(): void {
    this.add
      .text(GAME_WIDTH / 2, 26, 'シーソーバランス', titleStyle(38))
      .setOrigin(0.5)
      .setDepth(20);

    this.countText = this.add.text(16, 62, '', bodyStyle(24)).setOrigin(0, 0).setDepth(20);
    this.updateHud();

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 130, 'カメラを じゅんびちゅう...', bodyStyle(22))
      .setOrigin(0.5)
      .setWordWrapWidth(GAME_WIDTH - 40)
      .setDepth(20);

    const startButton = createButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 62,
      'スタート！',
      () => this.beginShot(),
      { width: 250, height: 74, fontSize: 30 },
    );
    this.startLabel = startButton.getData('label') as Phaser.GameObjects.Text;

    createButton(
      this,
      118,
      GAME_HEIGHT - 62,
      'カメラきりかえ',
      () => {
        playTap();
        if (this.panel.isCountingDown) {
          this.statusText.setText('さつえいちゅうは きりかえられないよ');
          return;
        }
        void this.panel.switchFacing().catch(() => {
          this.statusText.setText('カメラを きりかえられませんでした');
        });
      },
      {
        width: 212,
        height: 62,
        fontSize: 22,
        color: COLORS.accent,
        pressedColor: COLORS.accentDark,
      },
    );

    createButton(
      this,
      GAME_WIDTH - 86,
      GAME_HEIGHT - 62,
      'やめる',
      () => {
        playTap();
        this.scene.start('Title');
      },
      {
        width: 142,
        height: 62,
        fontSize: 24,
        color: COLORS.accent,
        pressedColor: COLORS.accentDark,
      },
    );
  }

  private updateHud(): void {
    const turn = this.challengers > 1 ? ` / ${this.currentPlayer}にんめの ばん` : '';
    this.countText.setText(`のせた ${this.placedCount}/${this.maxBlocks}こ${turn}`);
  }

  private beginShot(): void {
    if (this.phase !== 'build' || this.busy) return;
    if (!this.panel.ready) return;

    this.busy = true;
    this.startLabel.setText('とりくみちゅう');
    this.statusText.setText('のせたい ばしょに たって ポーズ！');

    this.panel.beginCountdown(
      SHOT_TIME_LIMIT_SEC,
      (frame) => this.onCaptured(frame),
      (message) => this.onFailed(message),
    );
  }

  private onFailed(message: string): void {
    this.busy = false;
    this.startLabel.setText('もういちど');
    this.statusText.setText(message);
  }

  private onCaptured(frame: CapturedFrame): void {
    const { processed, image } = frame;
    if (processed.accepted.length === 0) {
      this.onFailed('うつっていないみたい。もういちど！');
      return;
    }

    // タワーと同じ。写っていた位置・大きさのまま落とす
    const viewScale = CAM_WIDTH / image.width;

    let dropped = 0;
    for (const blob of processed.accepted) {
      const piece = buildCutoutPiece(processed.mask, blob, processed.labels, {
        source: image,
        sourceWidth: image.width,
        sourceHeight: image.height,
      });
      if (!piece) continue;
      if (this.dropPiece(piece, viewScale)) dropped += 1;
    }

    if (dropped === 0) {
      this.onFailed('からだを ブロックに できませんでした。もういちど！');
      return;
    }

    this.placedCount += 1;
    this.lastPlacer = this.currentPlayer;
    this.busy = false;
    this.phase = 'settling';
    this.settleStartedAt = performance.now();
    this.startLabel.setText('ドキドキ…');
    this.statusText.setText('たおれるな たおれるな…！');
    this.updateHud();
  }

  /** 切り抜きを、カメラに写っていたその位置・その大きさで落とす(タワーと同じ)。 */
  private dropPiece(piece: CutoutPiece, viewScale: number): boolean {
    const key = `seesaw-piece-${this.textureKeys.length}`;
    if (this.textures.exists(key)) this.textures.remove(key);
    this.textures.addCanvas(key, piece.sprite.canvas);
    this.textureKeys.push(key);

    const centroid = piece.contourCentroid;

    // scale を掛けないこと。Phaser の setScale は剛体も拡縮するため二重になる
    const vertices = piece.contour.map((point) => ({
      x: point.x - centroid.x,
      y: point.y - centroid.y,
    }));

    const x = CAM_X + (piece.origin.x + centroid.x) * viewScale;
    const y = CAM_Y + (piece.origin.y + centroid.y) * viewScale;

    const options = {
      friction: 0.9,
      frictionStatic: 1.1,
      frictionAir: 0.02,
      restitution: 0,
      density: 0.008,
    };
    let block: Phaser.Physics.Matter.Image;
    try {
      block = this.matter.add.image(x, y, key, undefined, {
        shape: { type: 'fromVerts', verts: vertices, flagInternal: true },
        ...options,
      });
    } catch {
      block = this.matter.add.image(x, y, key, undefined, options);
    }

    block.setScale(viewScale);
    block.setOrigin(centroid.x / piece.sprite.width, centroid.y / piece.sprite.height);
    block.setDepth(PANEL_DEPTH + 5);

    this.blocks.push(block);
    playTap();
    return true;
  }

  /** いまの板の傾き(度)。 */
  private plankAngleDeg(): number {
    return Math.abs(Phaser.Math.RadToDeg(this.plankBody.angle));
  }

  update(): void {
    this.panel.update();
    if (this.phase === 'over') return;

    // 落ちたブロックの片付け(床に転がったものは残す。画面外だけ消す)
    this.blocks = this.blocks.filter((block) => {
      const body = block.body as MatterJS.BodyType | null;
      if (!body) return false;
      if (body.position.y > GAME_HEIGHT + 400) {
        block.destroy();
        return false;
      }
      return true;
    });

    // たおれ判定は常に見る。あとからじわじわ滑って傾くこともあり、
    // その責任は最後に載せた人にある(積み木崩しと同じ約束)
    if (this.plankAngleDeg() > TIP_DEG) {
      this.tiltedSince ??= performance.now();
      if (this.lastPlacer !== null && performance.now() - this.tiltedSince > TIP_HOLD_MS) {
        this.tip(this.lastPlacer);
        return;
      }
    } else {
      this.tiltedSince = null;
    }

    if (this.phase === 'settling') this.tickSettling();
  }

  private tickSettling(): void {
    const elapsed = performance.now() - this.settleStartedAt;
    // 板が揺れている間は判定しない。時計だけで区切ると、釣り合いの角度へ
    // 向かう途中の一瞬を「セーフ」と誤判定する(ヘッドレス検証で確認)。
    // 揺れが収まらない場合でも 9 秒で打ち切って進行を止めない
    if (elapsed < 2500) return;
    const calm = Math.abs(this.plankBody.angularVelocity) < 0.0008;
    if (!calm && elapsed < 9000) return;
    // 落ちる角度を超えたまま静かになった場合は「セーフ」を出さず、
    // たおれ判定(750ms待ち)に任せる
    if (this.plankAngleDeg() > TIP_DEG) return;

    if (this.placedCount >= this.maxBlocks) {
      this.surviveWin();
      return;
    }

    this.phase = 'build';
    if (this.challengers > 1) {
      this.currentPlayer = (this.currentPlayer % this.challengers) + 1;
      this.statusText.setText(`セーフ！ つぎは ${this.currentPlayer}にんめの ばん！`);
    } else {
      this.statusText.setText('セーフ！ つぎを のせよう');
    }
    this.startLabel.setText('つぎを とる！');
    this.updateHud();
  }

  private tip(loser: number): void {
    this.phase = 'over';
    this.tippedBy = loser;
    playFanfare(false);
    const message =
      this.challengers > 1
        ? `ぐらりん！\n${loser}にんめが たおしちゃった…`
        : `${this.placedCount}こめで ぐらりん…`;
    this.showBanner(message, COLORS.wall);
  }

  private surviveWin(): void {
    this.phase = 'over';
    playFanfare(true);
    const message =
      this.challengers > 1
        ? `すごい！ ${this.placedCount}こ のせても\nたおれなかった！ みんなの かち！`
        : `${this.placedCount}こ のせきった！\nバランスめいじん！`;
    this.showBanner(message, COLORS.primary);
  }

  private showBanner(message: string, color: number): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, 320, color, 0.94).setDepth(30);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, message, titleStyle(40))
      .setOrigin(0.5)
      .setAlign('center')
      .setColor('#ffffff')
      .setDepth(31);

    createButton(
      this,
      GAME_WIDTH / 2 - 180,
      GAME_HEIGHT / 2 + 60,
      'もういちど',
      () => {
        playTap();
        this.scene.restart({ challengers: this.challengers });
      },
      { width: 300, height: 80, fontSize: 30 },
    ).setDepth(32);

    createButton(
      this,
      GAME_WIDTH / 2 + 180,
      GAME_HEIGHT / 2 + 60,
      'タイトルへ',
      () => {
        playTap();
        this.scene.start('Title');
      },
      {
        width: 300,
        height: 80,
        fontSize: 30,
        color: COLORS.accent,
        pressedColor: COLORS.accentDark,
      },
    ).setDepth(32);
  }
}
