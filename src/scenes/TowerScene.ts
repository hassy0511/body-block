// モード2「たいそうタワー」。SPEC_MODE2.md 参照。
//
// 画面上部にカメラ、下に積み上げの舞台を置いた1画面構成。
// 撮るたびに、その姿がそのまま下へ落ちて積み上がる。
// 撮影と落下が同じ画面で続くのがこのモードの面白さなので、
// シーンを行き来させず、ここで完結させる。

import Phaser from 'phaser';
import { buildCutoutPiece, type CutoutPiece } from '../core/cutout';
import { registerDecomp } from '../core/physics';
import { playFanfare, playTap } from '../core/sound';
import { session } from '../game/session';
import { CameraPanel, type CapturedFrame } from '../game/cameraPanel';
import {
  addBackground,
  createButton,
  titleStyle,
  bodyStyle,
  COLORS,
  GAME_WIDTH,
  GAME_HEIGHT,
} from '../ui/ui';

/** 撮影できる回数。 */
const TOTAL_SHOTS = 6;
/** ポーズを作るための制限時間(秒)。 */
const SHOT_TIME_LIMIT_SEC = 8;

/** カメラの表示領域(画面上部)。 */
const CAM_X = 0;
const CAM_Y = 92;
const CAM_WIDTH = GAME_WIDTH;
const CAM_HEIGHT = 330;

/** 積み上げの舞台。カメラの下から床まで。 */
const ARENA_TOP = CAM_Y + CAM_HEIGHT;
const FLOOR_Y = GAME_HEIGHT - 200;
/**
 * ここまで積めたらクリア。舞台の上端(カメラのすぐ下)を目標にする。
 * 「舞台を埋めきる」が目標なので分かりやすく、
 * 塔がカメラの表示に重なるところまで伸びることもない。
 */
const GOAL_Y = ARENA_TOP + 40;

/** 落とすブロックの高さ(px)。 */
const BLOCK_HEIGHT = 150;
/** クリア判定に必要な「崩れずに保つ」時間(ミリ秒)。 */
const HOLD_MS = 1200;

export class TowerScene extends Phaser.Scene {
  private panel!: CameraPanel;
  private blocks: Phaser.Physics.Matter.Image[] = [];
  private textureKeys: string[] = [];

  private remaining = TOTAL_SHOTS;
  private finished = false;
  private busy = false;
  private goalReachedAt: number | null = null;
  private bestTop: number | null = null;

  private statusText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private bestMarker!: Phaser.GameObjects.Graphics;
  private startButton!: Phaser.GameObjects.Container;
  private startLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('Tower');
  }

  create(): void {
    addBackground(this);
    registerDecomp();

    this.blocks = [];
    this.textureKeys = [];
    this.remaining = TOTAL_SHOTS;
    this.finished = false;
    this.busy = false;
    this.goalReachedAt = null;
    this.bestTop = null;

    this.buildStage();
    this.buildHud();

    this.panel = new CameraPanel(this, {
      x: CAM_X,
      y: CAM_Y,
      width: CAM_WIDTH,
      height: CAM_HEIGHT,
      guideCount: session.playerCount,
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
          ? `「スタート！」を おしてから ${SHOT_TIME_LIMIT_SEC}びょう。ポーズを とってね`
          : 'カメラを つかえませんでした。きょかを かくにんしてね',
      );
    });
  }

  private buildStage(): void {
    // 舞台の下地
    this.add.rectangle(
      GAME_WIDTH / 2,
      (ARENA_TOP + GAME_HEIGHT) / 2,
      GAME_WIDTH,
      GAME_HEIGHT - ARENA_TOP,
      0xfdead0,
    );

    // 床
    this.add.rectangle(GAME_WIDTH / 2, FLOOR_Y + 20, GAME_WIDTH, 40, COLORS.wall);
    this.matter.add.rectangle(GAME_WIDTH / 2, FLOOR_Y + 30, GAME_WIDTH, 60, {
      isStatic: true,
      friction: 1,
      frictionStatic: 1,
    });

    // 左右の壁。ブロックが画面外へ逃げないようにする
    this.matter.add.rectangle(-30, GAME_HEIGHT / 2, 60, GAME_HEIGHT * 2, {
      isStatic: true,
      friction: 0.2,
    });
    this.matter.add.rectangle(GAME_WIDTH + 30, GAME_HEIGHT / 2, 60, GAME_HEIGHT * 2, {
      isStatic: true,
      friction: 0.2,
    });

    // 目標ライン
    const line = this.add.graphics();
    line.lineStyle(4, COLORS.accent, 0.9);
    line.beginPath();
    for (let x = 0; x < GAME_WIDTH; x += 22) {
      line.moveTo(x, GOAL_Y);
      line.lineTo(x + 12, GOAL_Y);
    }
    line.strokePath();
    this.add.text(16, GOAL_Y + 6, 'ここまで つみあげよう！', bodyStyle(22)).setColor('#209aa1');

    this.bestMarker = this.add.graphics();
  }

  private buildHud(): void {
    this.add
      .text(GAME_WIDTH / 2, 26, 'たいそうタワー', titleStyle(38))
      .setOrigin(0.5)
      .setDepth(20);

    this.countText = this.add.text(16, 62, '', bodyStyle(24)).setOrigin(0, 0).setDepth(20);
    this.updateCountText();

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 130, 'カメラを じゅんびちゅう...', bodyStyle(22))
      .setOrigin(0.5)
      .setWordWrapWidth(GAME_WIDTH - 40)
      .setDepth(20);

    this.startButton = createButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 62,
      'スタート！',
      () => this.beginShot(),
      { width: 250, height: 74, fontSize: 30 },
    );
    this.startLabel = this.startButton.getData('label') as Phaser.GameObjects.Text;

    // 内カメラだと自分の姿を見ながら立ち位置を決められ、
    // 外カメラだと離れて全身を撮りやすい。どちらも使うので切り替えを残す。
    createButton(
      this,
      118,
      GAME_HEIGHT - 62,
      'カメラきりかえ',
      () => {
        playTap();
        // カウントダウン中に切り替えると、写る向きと落ちる位置がずれる
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

  private updateCountText(): void {
    this.countText.setText(`のこり ${this.remaining}かい / たかさ ${this.progressPercent()}%`);
  }

  private progressPercent(): number {
    if (this.bestTop === null) return 0;
    const total = FLOOR_Y - GOAL_Y;
    const reached = FLOOR_Y - this.bestTop;
    return Math.max(0, Math.min(100, Math.round((reached / total) * 100)));
  }

  private beginShot(): void {
    if (this.finished || this.busy || this.remaining <= 0) return;
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

    let dropped = 0;
    for (const blob of processed.accepted) {
      const piece = buildCutoutPiece(processed.mask, blob, processed.labels, {
        source: image,
        sourceWidth: image.width,
        sourceHeight: image.height,
      });
      if (!piece) continue;

      // 立っていた場所から落とす。どこに立つかがこのゲームの選択になるので、
      // カメラに写っていた横位置をそのまま画面上の落下位置に対応させる。
      const dropX = CAM_X + (blob.centroidX / processed.mask.width) * CAM_WIDTH;
      if (this.dropPiece(piece, dropX)) dropped += 1;
    }

    if (dropped === 0) {
      this.onFailed('からだを ブロックに できませんでした。もういちど！');
      return;
    }

    this.remaining -= 1;
    this.updateCountText();
    this.busy = false;

    if (this.remaining > 0) {
      this.startLabel.setText('つぎを とる！');
      this.statusText.setText('つみあがったね！ つぎの ポーズを とろう');
    } else {
      this.startLabel.setText('おわり');
      this.statusText.setText('ぜんぶ とったよ！ くずれないで〜');
    }
  }

  /** 切り抜きを、写っていた横位置から落とす。 */
  private dropPiece(piece: CutoutPiece, dropX: number): boolean {
    const key = `tower-piece-${this.textureKeys.length}`;
    if (this.textures.exists(key)) this.textures.remove(key);
    this.textures.addCanvas(key, piece.sprite.canvas);
    this.textureKeys.push(key);

    const scale = BLOCK_HEIGHT / piece.sprite.height;
    const centroid = piece.contourCentroid;

    // Matter は頂点列の重心を剛体の原点にするので、輪郭を重心基準へ寄せる。
    // 絵の原点も同じ点に合わせることで、絵と当たり判定が一致する。
    //
    // ここで scale を掛けてはいけない。Phaser の setScale は剛体も一緒に拡縮するため、
    // 掛けてしまうと二重に縮んで、見た目より遥かに小さい当たり判定になる。
    const vertices = piece.contour.map((point) => ({
      x: point.x - centroid.x,
      y: point.y - centroid.y,
    }));

    // 写っていた横位置のまま真下へ落とす。
    // ブロックの幅ぶんは画面内に収まるよう端で丸める。
    const halfWidth = (piece.sprite.width * scale) / 2;
    const x = Phaser.Math.Clamp(dropX, halfWidth, GAME_WIDTH - halfWidth);
    const y = ARENA_TOP - BLOCK_HEIGHT * 0.6;

    // 先に置いたものほど重く、摩擦も強くする。
    // 土台が軽いと新しいブロックに押されて崩れてしまうため。
    const order = this.blocks.length;
    const density = 0.006 * (1 + (TOTAL_SHOTS - order) * 0.35);

    let block: Phaser.Physics.Matter.Image;
    try {
      block = this.matter.add.image(x, y, key, undefined, {
        shape: { type: 'fromVerts', verts: vertices, flagInternal: true },
        friction: 0.95,
        frictionStatic: 1.2,
        frictionAir: 0.02,
        restitution: 0,
        density,
      });
    } catch {
      // 凸分割に失敗する形もあるので、その場合は矩形で代用して進行を止めない
      block = this.matter.add.image(x, y, key, undefined, {
        friction: 0.95,
        frictionStatic: 1.2,
        restitution: 0,
        density,
      });
    }

    block.setScale(scale);
    // 剛体の原点(輪郭の重心)に合わせて絵をずらす
    block.setOrigin(centroid.x / piece.sprite.width, centroid.y / piece.sprite.height);
    block.setAngle(Phaser.Math.Between(-5, 5));
    block.setData('hasMoved', false);

    this.blocks.push(block);
    playTap();
    return true;
  }

  update(): void {
    this.panel.update();
    if (this.finished) return;

    // 画面外へ落ちたものは片付ける
    this.blocks = this.blocks.filter((block) => {
      if (block.y > GAME_HEIGHT + 400) {
        block.destroy();
        return false;
      }
      return true;
    });

    const topY = this.highestSettledPoint();
    // 記録は「塔全体が落ち着いているとき」だけ更新する。
    // 落下の途中で一瞬つり合った高さを数えると、実態より高く出てしまう。
    if (topY !== null && this.isSettled() && (this.bestTop === null || topY < this.bestTop)) {
      this.bestTop = topY;
      this.updateBestMarker();
      this.updateCountText();
    }

    if (topY !== null && topY <= GOAL_Y) {
      this.goalReachedAt ??= performance.now();
      if (performance.now() - this.goalReachedAt >= HOLD_MS) this.succeed();
      return;
    }
    this.goalReachedAt = null;

    if (this.remaining <= 0 && !this.busy && !this.panel.isCountingDown && this.isSettled()) {
      this.showResult();
    }
  }

  private updateBestMarker(): void {
    this.bestMarker.clear();
    if (this.bestTop === null || this.bestTop < ARENA_TOP) return;
    this.bestMarker.lineStyle(3, COLORS.primary, 0.8);
    this.bestMarker.beginPath();
    this.bestMarker.moveTo(0, this.bestTop);
    this.bestMarker.lineTo(GAME_WIDTH, this.bestTop);
    this.bestMarker.strokePath();
  }

  /**
   * 積み上がって落ち着いたブロックだけの最上端。
   * 落下中のものを数えると、落とした瞬間にクリア扱いになってしまう。
   */
  private highestSettledPoint(): number | null {
    let top: number | null = null;
    for (const block of this.blocks) {
      if (!this.isBlockSettled(block)) continue;
      const bounds = block.getBounds();
      if (top === null || bounds.top < top) top = bounds.top;
    }
    return top;
  }

  private isBlockSettled(block: Phaser.Physics.Matter.Image): boolean {
    const body = block.body as MatterJS.BodyType | null;
    if (!body) return false;

    const moving = Math.abs(body.velocity.x) >= 0.4 || Math.abs(body.velocity.y) >= 0.4;
    if (moving) {
      block.setData('hasMoved', true);
      return false;
    }

    // 作られた直後のブロックはまだ一度も物理が回っておらず速度 0 なので、
    // そのままだと「落ちる前の高さ」で積み上がったことになってしまう。
    // 一度でも動いたものだけを、積み上がったブロックとして数える。
    return block.getData('hasMoved') === true;
  }

  private isSettled(): boolean {
    return this.blocks.every((block) => this.isBlockSettled(block));
  }

  private succeed(): void {
    this.finished = true;
    playFanfare(true);
    this.showBanner('クリア！\nゴールまで つめたね！', COLORS.primary);
  }

  private showResult(): void {
    this.finished = true;
    const percent = this.progressPercent();
    playFanfare(percent >= 70);
    this.showBanner(
      `ここまで つめたよ！\nゴールまで ${percent}%`,
      percent >= 70 ? COLORS.primary : COLORS.wall,
    );
  }

  private showBanner(message: string, color: number): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, 300, color, 0.94);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, message, titleStyle(40))
      .setOrigin(0.5)
      .setColor('#ffffff');

    createButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + 40,
      'もういちど',
      () => {
        playTap();
        this.scene.restart();
      },
      { width: 300, height: 70, fontSize: 30 },
    );

    createButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + 125,
      'タイトルへ',
      () => {
        playTap();
        this.scene.start('Title');
      },
      {
        width: 300,
        height: 70,
        fontSize: 30,
        color: COLORS.accent,
        pressedColor: COLORS.accentDark,
      },
    );
  }
}
