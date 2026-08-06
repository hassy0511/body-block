// モード4「こわしてバトル」。SPEC_MODE4.md 参照。
//
// 積み木タワーのてっぺんの かんむり を、体ブロックを落として崩し合う。
// ふたり: 交互に撮影し、相手のタワーへ落とす。先に相手の かんむり を落とした方が勝ち。
// ひとり: 1本のタワーを5回で崩せたらクリア。

import Phaser from 'phaser';
import { buildCutoutPiece } from '../core/cutout';
import { registerDecomp } from '../core/physics';
import { playFanfare, playTap } from '../core/sound';
import { session } from '../game/session';
import { spawnCutoutBlock } from '../game/blockFactory';
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

/** 1人あたりの撮影回数。 */
const MAX_SHOTS_EACH = 5;
/** ポーズを作るための制限時間(秒)。 */
const SHOT_TIME_LIMIT_SEC = 8;

/**
 * タワーの柱とカメラ枠の幅。
 * カメラに写った位置を、攻撃先の柱の同じ位置に対応させる(モード2 の原則の応用)。
 * 立ち位置がそのまま狙いになる。
 */
const COL_WIDTH = 300;
const CAM_WIDTH = COL_WIDTH;
const CAM_X = Math.round((GAME_WIDTH - CAM_WIDTH) / 2);
const CAM_Y = 36;
const CAM_HEIGHT = Math.round((CAM_WIDTH * 9) / 16);

const ARENA_TOP = CAM_Y + CAM_HEIGHT;
const FLOOR_Y = GAME_HEIGHT - 64;

/** ふたり用の柱の左端。あか(P1)が左、あお(P2)が右。 */
const LEFT_COL_X = 210;
const RIGHT_COL_X = GAME_WIDTH - 210 - COL_WIDTH;
/** ひとり用はカメラの真下。 */
const SOLO_COL_X = CAM_X;

/**
 * タワーの段数と積み木の寸法。
 * 幅の広い低いタワーは安定しすぎて、5回当てても崩れなかった。
 * 細く高くして「ちゃんと狙えば崩せる」に寄せてある。
 */
const TOWER_BLOCKS = 4;
const BRICK_WIDTH = 120;
const BRICK_HEIGHT = 44;
const CROWN_WIDTH = 60;
const CROWN_HEIGHT = 44;

/** 落とすブロックの高さ上限(px)。 */
const MAX_BLOCK_HEIGHT = 170;
/** 落ち着き待ちの上限(ms)。物理が暴れても番が止まらないようにする。 */
const SETTLE_TIMEOUT_MS = 4000;
/** かんむり転落の持続判定(ms)。一瞬のバウンドで誤判定しない。 */
const CROWN_DOWN_HOLD_MS = 500;

type Side = 'p1' | 'p2' | 'solo';
type Phase = 'play' | 'over';

const SIDE_LABEL: Record<Side, string> = { p1: 'あか', p2: 'あお', solo: '' };
const SIDE_COLOR: Record<Side, number> = { p1: 0xe0533d, p2: 0x3d7de0, solo: 0xff8a3d };

interface Tower {
  side: Side;
  colLeft: number;
  crown: Phaser.Physics.Matter.Image;
  /** かんむりの定位置。転落判定はここからの相対で見る。 */
  crownHomeY: number;
  crownDownSince: number | null;
}

export class BattleScene extends Phaser.Scene {
  private panel!: CameraPanel;
  private towers: Tower[] = [];
  private dropped: Phaser.Physics.Matter.Image[] = [];
  private towerPieces: Phaser.Physics.Matter.Image[] = [];
  private textureKeys: string[] = [];

  private phase: Phase = 'play';
  private turn: 'p1' | 'p2' = 'p1';
  private shotsUsed = { p1: 0, p2: 0 };
  private busy = false;
  private settleDeadline = 0;
  private waitingSettle = false;

  private solo = false;

  private turnText!: Phaser.GameObjects.Text;
  private shotsText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private startLabel!: Phaser.GameObjects.Text;
  private aimMarker!: Phaser.GameObjects.Triangle;

  constructor() {
    super('Battle');
  }

  create(): void {
    addBackground(this);
    registerDecomp();

    this.towers = [];
    this.dropped = [];
    this.towerPieces = [];
    this.textureKeys = [];
    this.phase = 'play';
    this.turn = 'p1';
    this.shotsUsed = { p1: 0, p2: 0 };
    this.busy = false;
    this.waitingSettle = false;
    this.solo = session.playerCount <= 1;

    this.buildStage();
    this.buildHud();

    this.panel = new CameraPanel(this, {
      x: CAM_X,
      y: CAM_Y,
      width: CAM_WIDTH,
      height: CAM_HEIGHT,
      guideCount: 1,
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const key of this.textureKeys) {
        if (this.textures.exists(key)) this.textures.remove(key);
      }
      this.textureKeys = [];
    });

    void this.panel.start().then((ok) => {
      this.statusText.setText(
        ok
          ? this.solo
            ? `${MAX_SHOTS_EACH}かいで タワーを こわそう！`
            : 'こうたいで あいての タワーを ねらおう！'
          : 'カメラを つかえませんでした。きょかを かくにんしてね',
      );
    });

    this.updateHud();
  }

  // ---------- 舞台 ----------

  private buildStage(): void {
    // 床は全幅。崩れた積み木が転がる
    this.add.rectangle(GAME_WIDTH / 2, FLOOR_Y + 20, GAME_WIDTH, 40, COLORS.wall);
    this.matter.add.rectangle(GAME_WIDTH / 2, FLOOR_Y + 30, GAME_WIDTH, 60, {
      isStatic: true,
      friction: 1,
      frictionStatic: 1,
    });

    this.buildTextures();

    if (this.solo) {
      this.towers.push(this.buildTower('solo', SOLO_COL_X));
    } else {
      this.towers.push(this.buildTower('p1', LEFT_COL_X));
      this.towers.push(this.buildTower('p2', RIGHT_COL_X));
    }

    // 攻撃先を指す▼。番が変わるたびに動かす
    this.aimMarker = this.add
      .triangle(0, ARENA_TOP + 24, 0, 0, 36, 0, 18, 26, 0xff8a3d)
      .setOrigin(0.5, 0.5)
      .setDepth(20);
    this.tweens.add({
      targets: this.aimMarker,
      y: ARENA_TOP + 38,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** 積み木と かんむり のテクスチャを1回だけ作る。 */
  private buildTextures(): void {
    if (!this.textures.exists('battle-brick')) {
      const t = this.textures.createCanvas('battle-brick', BRICK_WIDTH, BRICK_HEIGHT);
      if (t) {
        const ctx = t.getContext();
        ctx.fillStyle = '#d9b98a';
        ctx.fillRect(0, 0, BRICK_WIDTH, BRICK_HEIGHT);
        ctx.strokeStyle = '#b08d5a';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, BRICK_WIDTH - 4, BRICK_HEIGHT - 4);
        t.refresh();
      }
      this.textureKeys.push('battle-brick');
    }

    if (!this.textures.exists('battle-crown')) {
      const t = this.textures.createCanvas('battle-crown', CROWN_WIDTH, CROWN_HEIGHT);
      if (t) {
        const ctx = t.getContext();
        ctx.fillStyle = '#f5c542';
        ctx.beginPath();
        ctx.moveTo(4, CROWN_HEIGHT - 6);
        ctx.lineTo(4, 14);
        ctx.lineTo(CROWN_WIDTH * 0.25, 26);
        ctx.lineTo(CROWN_WIDTH * 0.5, 6);
        ctx.lineTo(CROWN_WIDTH * 0.75, 26);
        ctx.lineTo(CROWN_WIDTH - 4, 14);
        ctx.lineTo(CROWN_WIDTH - 4, CROWN_HEIGHT - 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#e0533d';
        ctx.beginPath();
        ctx.arc(CROWN_WIDTH / 2, CROWN_HEIGHT - 14, 5, 0, Math.PI * 2);
        ctx.fill();
        t.refresh();
      }
      this.textureKeys.push('battle-crown');
    }
  }

  private buildTower(side: Side, colLeft: number): Tower {
    const centerX = colLeft + COL_WIDTH / 2;

    // 柱の下地(所有者の色をうっすら)
    this.add
      .rectangle(
        centerX,
        (ARENA_TOP + FLOOR_Y) / 2 + 20,
        COL_WIDTH,
        FLOOR_Y + 40 - ARENA_TOP,
        SIDE_COLOR[side],
        0.08,
      )
      .setDepth(0);

    if (side !== 'solo') {
      this.add
        .text(centerX, FLOOR_Y + 20, `${SIDE_LABEL[side]}の タワー`, bodyStyle(22))
        .setOrigin(0.5)
        .setColor('#fff3e0')
        .setDepth(20);
    }

    for (let i = 0; i < TOWER_BLOCKS; i += 1) {
      const brick = this.matter.add.image(
        centerX,
        FLOOR_Y - BRICK_HEIGHT * (i + 0.5),
        'battle-brick',
        undefined,
        { friction: 0.6, frictionStatic: 0.7, restitution: 0, density: 0.004 },
      );
      brick.setDepth(PANEL_DEPTH + 4);
      this.towerPieces.push(brick);
    }

    const crownHomeY = FLOOR_Y - BRICK_HEIGHT * TOWER_BLOCKS - CROWN_HEIGHT / 2;
    const crown = this.matter.add.image(centerX, crownHomeY, 'battle-crown', undefined, {
      friction: 0.8,
      frictionStatic: 0.9,
      restitution: 0.1,
      density: 0.002,
    });
    crown.setDepth(PANEL_DEPTH + 5);
    this.towerPieces.push(crown);

    return { side, colLeft, crown, crownHomeY, crownDownSince: null };
  }

  // ---------- HUD ----------

  private buildHud(): void {
    this.turnText = this.add.text(20, 24, '', titleStyle(30)).setOrigin(0, 0).setDepth(20);
    this.shotsText = this.add.text(20, 78, '', bodyStyle(24)).setOrigin(0, 0).setDepth(20);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, ARENA_TOP + 90, '', bodyStyle(22))
      .setOrigin(0.5)
      .setAlign('center')
      .setWordWrapWidth(300)
      .setDepth(20);
    this.statusText.setText('カメラを じゅんびちゅう...');

    const startButton = createButton(
      this,
      GAME_WIDTH - 130,
      70,
      'スタート！',
      () => this.beginShot(),
      { width: 220, height: 78, fontSize: 28 },
    );
    this.startLabel = startButton.getData('label') as Phaser.GameObjects.Text;

    createButton(
      this,
      GAME_WIDTH - 130,
      160,
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
        width: 220,
        height: 60,
        fontSize: 20,
        color: COLORS.accent,
        pressedColor: COLORS.accentDark,
      },
    );

    createButton(
      this,
      GAME_WIDTH - 130,
      232,
      'やめる',
      () => {
        playTap();
        this.scene.start('Title');
      },
      {
        width: 220,
        height: 60,
        fontSize: 20,
        color: COLORS.accent,
        pressedColor: COLORS.accentDark,
      },
    );
  }

  private updateHud(): void {
    if (this.solo) {
      this.turnText.setText('こわしてチャレンジ');
      this.shotsText.setText(`のこり ${MAX_SHOTS_EACH - this.shotsUsed.p1}かい`);
    } else {
      const label = SIDE_LABEL[this.turn];
      this.turnText.setText(`${label}の ばん`);
      this.turnText.setColor(this.turn === 'p1' ? '#e0533d' : '#3d7de0');
      this.shotsText.setText(
        `あか のこり${MAX_SHOTS_EACH - this.shotsUsed.p1} / あお のこり${MAX_SHOTS_EACH - this.shotsUsed.p2}`,
      );
    }

    const target = this.targetTower();
    this.aimMarker.setX(target.colLeft + COL_WIDTH / 2);
    this.aimMarker.setFillStyle(SIDE_COLOR[this.solo ? 'solo' : this.turn]);
  }

  /** いま攻撃する先のタワー。ふたりなら相手のもの。 */
  private targetTower(): Tower {
    if (this.solo) return this.towers[0]!;
    const opponent: Side = this.turn === 'p1' ? 'p2' : 'p1';
    return this.towers.find((tower) => tower.side === opponent)!;
  }

  // ---------- 撮影と落下 ----------

  private beginShot(): void {
    if (this.phase !== 'play' || this.busy) return;
    if (this.shotsUsed[this.turn] >= MAX_SHOTS_EACH) return;
    if (!this.panel.ready) return;

    this.busy = true;
    this.startLabel.setText('とりくみちゅう');
    this.statusText.setText('はやく ポーズを とって！');

    this.panel.beginCountdown(
      SHOT_TIME_LIMIT_SEC,
      (frame) => this.onCaptured(frame),
      (message) => this.onFailed(message),
    );
  }

  private onFailed(message: string): void {
    // 撮影に失敗した回は回数を消費しない(SPEC_MODE4.md §5)
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

    const target = this.targetTower();
    const viewScale = CAM_WIDTH / image.width;

    let droppedCount = 0;
    for (const blob of processed.accepted) {
      const piece = buildCutoutPiece(processed.mask, blob, processed.labels, {
        source: image,
        sourceWidth: image.width,
        sourceHeight: image.height,
      });
      if (!piece) continue;

      const scale = Math.min(viewScale, MAX_BLOCK_HEIGHT / piece.sprite.height);
      // カメラの中の位置を、攻撃先の柱の同じ位置に対応させる
      const localX = (piece.origin.x + piece.contourCentroid.x) * viewScale;
      const spawned = spawnCutoutBlock(this, piece, {
        x: target.colLeft + Phaser.Math.Clamp(localX, 0, COL_WIDTH),
        y: ARENA_TOP + 40,
        scale,
        depth: PANEL_DEPTH + 6,
        // タワーの積み木より重くする。軽いと乗るだけで崩れず決着がつかない
        body: {
          friction: 0.8,
          frictionStatic: 1,
          frictionAir: 0.01,
          restitution: 0.05,
          density: 0.008,
        },
      });
      if (!spawned) continue;

      this.dropped.push(spawned.block);
      this.textureKeys.push(spawned.textureKey);
      droppedCount += 1;
    }

    if (droppedCount === 0) {
      this.onFailed('からだを ブロックに できませんでした。もういちど！');
      return;
    }

    playTap();
    this.shotsUsed[this.turn] += 1;
    this.statusText.setText('どうなる…！？');

    // 落ち着くまで待ってから次の番へ
    this.waitingSettle = true;
    this.settleDeadline = performance.now() + SETTLE_TIMEOUT_MS;
  }

  private resolveTurn(): void {
    this.waitingSettle = false;
    this.busy = false;

    if (this.phase !== 'play') return;

    const everyoneDone = this.solo
      ? this.shotsUsed.p1 >= MAX_SHOTS_EACH
      : this.shotsUsed.p1 >= MAX_SHOTS_EACH && this.shotsUsed.p2 >= MAX_SHOTS_EACH;

    if (everyoneDone) {
      if (this.solo) {
        this.finish('タワー つよい！\nこわせなかった…また ちょうせん！', false);
      } else {
        this.finish('りょうほう まもりきった！\nひきわけ！', true);
      }
      return;
    }

    if (!this.solo) this.turn = this.turn === 'p1' ? 'p2' : 'p1';
    this.startLabel.setText('スタート！');
    this.statusText.setText(
      this.solo ? 'もういちど ねらおう！' : `${SIDE_LABEL[this.turn]}の ばんだよ！`,
    );
    this.updateHud();
  }

  // ---------- 判定 ----------

  update(): void {
    this.panel.update();
    if (this.phase !== 'play') return;

    const now = performance.now();

    // 画面の外へ飛んだものは片付ける
    this.dropped = this.dropped.filter((block) => {
      if (block.y > GAME_HEIGHT + 400 || block.x < -400 || block.x > GAME_WIDTH + 400) {
        block.destroy();
        return false;
      }
      return true;
    });

    // かんむりの転落。持続で見て、一瞬のバウンドで誤判定しない。
    // 「床まで落ちたか」では、がれきの山の上に乗ると成立しないことがあった。
    // 定位置から2ダンぶん下がる、または柱の外へ弾かれたら転落とする
    for (const tower of this.towers) {
      const center = tower.colLeft + COL_WIDTH / 2;
      const down =
        tower.crown.y > tower.crownHomeY + BRICK_HEIGHT * 2 ||
        Math.abs(tower.crown.x - center) > COL_WIDTH / 2;
      if (!down) {
        tower.crownDownSince = null;
        continue;
      }
      tower.crownDownSince ??= now;
      if (now - tower.crownDownSince >= CROWN_DOWN_HOLD_MS) {
        this.onCrownDown(tower);
        return;
      }
    }

    if (this.waitingSettle && (this.isSettled() || now >= this.settleDeadline)) {
      this.resolveTurn();
    }
  }

  private onCrownDown(tower: Tower): void {
    if (this.solo) {
      const used = this.shotsUsed.p1;
      this.finish(`こわした！\n${used}かいで せいこう！`, true);
      return;
    }
    const winner: Side = tower.side === 'p1' ? 'p2' : 'p1';
    this.finish(`${SIDE_LABEL[winner]}の かち！\nかんむりを おとしたよ！`, true);
  }

  private isSettled(): boolean {
    const all = [...this.dropped, ...this.towerPieces];
    return all.every((image) => {
      const body = image.body as MatterJS.BodyType | null;
      if (!body) return true;
      return Math.abs(body.velocity.x) < 0.45 && Math.abs(body.velocity.y) < 0.45;
    });
  }

  private finish(message: string, good: boolean): void {
    this.phase = 'over';
    playFanfare(good);

    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, 340, COLORS.primary, 0.94)
      .setDepth(30);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 70, message, titleStyle(40))
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
        this.scene.restart();
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
