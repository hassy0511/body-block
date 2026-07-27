// モード2「たいそうタワー」。SPEC_MODE2.md 参照。
//
// 撮影した体の切り抜きを剛体にして、タップした位置から落として積み上げる。
// 目標ラインより高く、崩れずに一定時間たてばクリア。

import Phaser from 'phaser';
import { buildCutoutPiece, type CutoutPiece } from '../core/cutout';
import { registerDecomp } from '../core/physics';
import { playFanfare, playTap } from '../core/sound';
import { session } from '../game/session';
import {
  addBackground,
  createButton,
  titleStyle,
  bodyStyle,
  COLORS,
  GAME_WIDTH,
  GAME_HEIGHT,
} from '../ui/ui';

/** 積み上げるブロックの数。撮影した形を順番に使い回す。 */
const TOTAL_BLOCKS = 8;
/** 落とすブロックの高さ(px)。画面に対して大きすぎないようにする。 */
const BLOCK_HEIGHT = 180;
/** 床の高さ。 */
const FLOOR_Y = GAME_HEIGHT - 40;
/**
 * ここより上まで積めたらクリア。
 * ポーズによってブロックの高さが変わるので、まずは届く見込みのある高さにしている。
 * 実機で遊んでみて手ごたえを見ながら調整する。
 */
const GOAL_Y = 470;
/** クリア判定に必要な「崩れずに保つ」時間(ミリ秒)。 */
const HOLD_MS = 1500;

export class TowerScene extends Phaser.Scene {
  private pieces: CutoutPiece[] = [];
  private textureKeys: string[] = [];
  private droppedBodies: Phaser.Physics.Matter.Image[] = [];

  private remaining = TOTAL_BLOCKS;
  private nextIndex = 0;
  private finished = false;
  private goalReachedAt: number | null = null;

  private remainingText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private preview: Phaser.GameObjects.Image | null = null;
  /** これまでに到達した最高地点(y が小さいほど高い)。 */
  private bestTop: number | null = null;
  private bestMarker!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Tower');
  }

  create(): void {
    addBackground(this);
    registerDecomp();

    const captured = session.captured;
    if (!captured || captured.blobs.length === 0) {
      this.scene.start('Title');
      return;
    }

    this.resetState();
    this.buildPieces(captured);

    if (this.pieces.length === 0) {
      this.showFailure('からだを ブロックに できませんでした');
      return;
    }

    this.buildStage();
    this.buildHud();
    this.setupInput();
    this.setupTeardown();
    this.showNextPreview();
  }

  private resetState(): void {
    this.pieces = [];
    this.textureKeys = [];
    this.droppedBodies = [];
    this.remaining = TOTAL_BLOCKS;
    this.nextIndex = 0;
    this.finished = false;
    this.goalReachedAt = null;
    this.preview = null;
    this.bestTop = null;
  }

  /** 目標までの到達度(0〜100%)。 */
  private progressPercent(): number {
    if (this.bestTop === null) return 0;
    const total = FLOOR_Y - GOAL_Y;
    const reached = FLOOR_Y - this.bestTop;
    return Math.max(0, Math.min(100, Math.round((reached / total) * 100)));
  }

  /** 到達した高さに印を引く。届かなくても「どこまでいけたか」が分かるようにする。 */
  private updateBestMarker(): void {
    this.bestMarker.clear();
    if (this.bestTop === null) return;
    this.bestMarker.lineStyle(3, COLORS.primary, 0.8);
    this.bestMarker.beginPath();
    this.bestMarker.moveTo(0, this.bestTop);
    this.bestMarker.lineTo(GAME_WIDTH, this.bestTop);
    this.bestMarker.strokePath();
  }

  /** 撮影結果から、かたまりごとのスプライトと輪郭を作る。 */
  private buildPieces(captured: NonNullable<typeof session.captured>): void {
    for (const blob of captured.blobs) {
      const piece = buildCutoutPiece(captured.mask, blob, captured.labels, {
        source: captured.image,
        sourceWidth: captured.image.width,
        sourceHeight: captured.image.height,
      });
      if (!piece) continue;

      const key = `tower-piece-${this.pieces.length}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      this.textures.addCanvas(key, piece.sprite.canvas);

      this.pieces.push(piece);
      this.textureKeys.push(key);
    }
  }

  private buildStage(): void {
    // 床
    this.add.rectangle(GAME_WIDTH / 2, FLOOR_Y + 20, GAME_WIDTH, 40, COLORS.wall);
    this.matter.add.rectangle(GAME_WIDTH / 2, FLOOR_Y + 20, GAME_WIDTH, 40, {
      isStatic: true,
      friction: 0.9,
    });

    // 目標ライン
    const line = this.add.graphics();
    line.lineStyle(4, COLORS.accent, 0.9);
    line.beginPath();
    for (let x = 0; x < GAME_WIDTH; x += 24) {
      line.moveTo(x, GOAL_Y);
      line.lineTo(x + 14, GOAL_Y);
    }
    line.strokePath();

    this.add.text(24, GOAL_Y - 30, 'ここまで つみあげよう！', bodyStyle(24)).setColor('#209aa1');

    this.bestMarker = this.add.graphics();

    // 画面外へ落ちたブロックを消すため、世界の境界は作らない(左右は開けておく)
    this.matter.world.setBounds(
      -200,
      -2000,
      GAME_WIDTH + 400,
      GAME_HEIGHT + 2400,
      64,
      false,
      false,
      false,
      false,
    );
  }

  private buildHud(): void {
    // 中央の案内文と重ならないよう左上に置く
    this.remainingText = this.add.text(24, 20, '', bodyStyle(26)).setOrigin(0, 0);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, 26, 'タップした ところに おちるよ！', bodyStyle(28))
      .setOrigin(0.5);

    this.updateRemainingText();

    createButton(
      this,
      110,
      GAME_HEIGHT - 44,
      'やめる',
      () => {
        playTap();
        this.scene.start('Title');
      },
      {
        width: 180,
        height: 60,
        fontSize: 26,
        color: COLORS.accent,
        pressedColor: COLORS.accentDark,
      },
    );
  }

  private updateRemainingText(): void {
    this.remainingText.setText(`のこり ${this.remaining}こ / たかさ ${this.progressPercent()}%`);
  }

  private setupInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.finished || this.remaining <= 0) return;
      // 下端のボタン付近は落下させない
      if (pointer.y > GAME_HEIGHT - 80) return;
      this.dropBlock(pointer.x);
    });
  }

  private setupTeardown(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const key of this.textureKeys) {
        if (this.textures.exists(key)) this.textures.remove(key);
      }
      this.textureKeys = [];
    });
  }

  /** 次に落ちるブロックを上部に薄く見せる。 */
  private showNextPreview(): void {
    this.preview?.destroy();
    this.preview = null;
    if (this.remaining <= 0) return;

    const key = this.textureKeys[this.nextIndex % this.textureKeys.length]!;
    this.preview = this.add
      .image(GAME_WIDTH / 2, 110, key)
      .setAlpha(0.45)
      .setScale(this.scaleFor(this.nextIndex % this.pieces.length) * 0.6);
  }

  /** 画面に対して手ごろな大きさになる倍率。 */
  private scaleFor(index: number): number {
    const piece = this.pieces[index]!;
    return BLOCK_HEIGHT / piece.sprite.height;
  }

  private dropBlock(x: number): void {
    const index = this.nextIndex % this.pieces.length;
    const piece = this.pieces[index]!;
    const key = this.textureKeys[index]!;
    const scale = this.scaleFor(index);

    // 輪郭を Matter の頂点列へ。スプライト中心を原点にする。
    const vertices = piece.contour.map((point) => ({
      x: (point.x - piece.sprite.width / 2) * scale,
      y: (point.y - piece.sprite.height / 2) * scale,
    }));

    const clampedX = Phaser.Math.Clamp(x, 80, GAME_WIDTH - 80);

    let block: Phaser.Physics.Matter.Image;
    try {
      block = this.matter.add.image(clampedX, -80, key, undefined, {
        shape: { type: 'fromVerts', verts: vertices, flagInternal: true },
        friction: 0.8,
        frictionStatic: 1,
        restitution: 0.02,
      });
    } catch {
      // 輪郭が複雑すぎて剛体化できない場合は、四角で代用して進行を止めない
      block = this.matter.add.image(clampedX, -80, key, undefined, {
        friction: 0.8,
        restitution: 0.02,
      });
    }

    block.setScale(scale);
    block.setAngle(Phaser.Math.Between(-8, 8));

    this.droppedBodies.push(block);
    this.remaining -= 1;
    this.nextIndex += 1;
    this.updateRemainingText();
    playTap();

    this.showNextPreview();

    if (this.remaining <= 0) {
      this.statusText.setText('ぜんぶ おとしたよ！ くずれないで〜');
    }
  }

  update(): void {
    if (this.finished) return;

    // 画面外へ落ちたものは片付ける
    this.droppedBodies = this.droppedBodies.filter((block) => {
      if (block.y > GAME_HEIGHT + 400) {
        block.destroy();
        return false;
      }
      return true;
    });

    // 落下中のブロックは高さに数えない。積み上がって落ち着いた分だけで判定する。
    const topY = this.highestSettledPoint();
    if (topY !== null && (this.bestTop === null || topY < this.bestTop)) {
      this.bestTop = topY;
      this.updateBestMarker();
      this.updateRemainingText();
    }
    const reached = topY !== null && topY <= GOAL_Y;

    if (reached) {
      this.goalReachedAt ??= performance.now();
      if (performance.now() - this.goalReachedAt >= HOLD_MS) {
        this.succeed();
      }
      return;
    }

    this.goalReachedAt = null;

    // ブロックを使い切ったら、届かなくても「どこまでいけたか」を見せて終わる。
    // 失敗で突き放さず、もういちどやりたくなるようにする。
    if (this.remaining <= 0 && this.isSettled()) {
      this.showResult();
    }
  }

  /**
   * 積み上がって落ち着いたブロックだけの最上端。
   *
   * 落下中のブロックは画面上部を通過するので、それを数えてしまうと
   * 落とした瞬間にクリア扱いになってしまう。
   */
  private highestSettledPoint(): number | null {
    let top: number | null = null;
    for (const block of this.droppedBodies) {
      if (!this.isBlockSettled(block)) continue;
      const bounds = block.getBounds();
      if (top === null || bounds.top < top) top = bounds.top;
    }
    return top;
  }

  private isBlockSettled(block: Phaser.Physics.Matter.Image): boolean {
    const body = block.body as MatterJS.BodyType | null;
    if (!body) return false;
    return Math.abs(body.velocity.x) < 0.4 && Math.abs(body.velocity.y) < 0.4;
  }

  /** すべてのブロックがほぼ止まっているか。 */
  private isSettled(): boolean {
    return this.droppedBodies.every((block) => this.isBlockSettled(block));
  }

  private succeed(): void {
    this.finished = true;
    playFanfare(true);
    this.showBanner('クリア！\nゴールまで つめたね！', COLORS.primary);
  }

  /** ブロックを使い切ったときの結果表示。 */
  private showResult(): void {
    this.finished = true;
    const percent = this.progressPercent();
    playFanfare(percent >= 70);
    this.showBanner(
      `ここまで つめたよ！\nゴールまで ${percent}%`,
      percent >= 70 ? COLORS.primary : COLORS.wall,
    );
  }

  private showFailure(message: string): void {
    this.finished = true;
    playFanfare(false);
    this.showBanner(message, COLORS.wall);
  }

  private showBanner(message: string, color: number): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, 260, color, 0.92);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, message, titleStyle(48))
      .setOrigin(0.5)
      .setColor('#ffffff');

    createButton(
      this,
      GAME_WIDTH / 2 - 170,
      GAME_HEIGHT / 2 + 70,
      'もういちど',
      () => {
        playTap();
        this.scene.start('TowerIntro');
      },
      { width: 280, height: 72, fontSize: 30 },
    );

    createButton(
      this,
      GAME_WIDTH / 2 + 170,
      GAME_HEIGHT / 2 + 70,
      'タイトルへ',
      () => {
        playTap();
        this.scene.start('Title');
      },
      {
        width: 280,
        height: 72,
        fontSize: 30,
        color: COLORS.accent,
        pressedColor: COLORS.accentDark,
      },
    );
  }
}
