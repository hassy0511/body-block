// モード6「コロコロゴール！」。SPEC_MODE6.md 参照。
//
// 上のシューターからボールが転がり落ちてくる。
// みんなで交代にポーズを撮って体ブロックの「みち」を作り、
// 床のゴールかごまでボールを導く協力パズル。
//
// タワーと同じ「写った位置・写った大きさで落ちる」仕組みを使うが、
// 落ち着いたブロックは固定する。崩れる心配をなくし、
// 「どこに置くか」だけを考えさせるため。

import Phaser from 'phaser';
import { buildCutoutPiece, type CutoutPiece } from '../core/cutout';
import { registerDecomp } from '../core/physics';
import { playFanfare, playTap } from '../core/sound';
import { session } from '../game/session';
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

/** 撮影できる回数(=置けるブロックの回数)。 */
const TOTAL_SHOTS = 6;
/** ポーズを作るための制限時間(秒)。 */
const SHOT_TIME_LIMIT_SEC = 8;

/** カメラ枠と舞台の幅。広く覆える方が道を作りやすいのでシェルターと同じ幅。 */
const STAGE_WIDTH = 560;
const STAGE_X = Math.round((GAME_WIDTH - STAGE_WIDTH) / 2);
const STAGE_RIGHT = STAGE_X + STAGE_WIDTH;

const CAM_X = STAGE_X;
const CAM_Y = 96;
const CAM_WIDTH = STAGE_WIDTH;
const CAM_HEIGHT = Math.round((STAGE_WIDTH * 9) / 16);

const ARENA_TOP = CAM_Y + CAM_HEIGHT;
const FLOOR_Y = GAME_HEIGHT - 190;

const BALL_RADIUS = 18;
/** かごの内側の半分の幅。ボールより十分広くして「狙えば入る」大きさにする。 */
const BASKET_HALF = 52;
const BASKET_WALL = 14;
const BASKET_HEIGHT = 96;

/** ボールをあきらめる条件: ほぼ止まったまま(ms) / 出してからの上限(ms)。 */
const BALL_STUCK_MS = 1400;
const BALL_MAX_MS = 10000;

type Phase = 'build' | 'settling' | 'rolling' | 'over';

export class RollScene extends Phaser.Scene {
  private panel!: CameraPanel;
  private blocks: Phaser.Physics.Matter.Image[] = [];
  private textureKeys: string[] = [];
  private ball: Phaser.Physics.Matter.Image | null = null;

  private phase: Phase = 'build';
  private remaining = TOTAL_SHOTS;
  private busy = false;

  private chuteX = 0;
  private basketX = 0;

  private settleStartedAt = 0;
  private ballStartedAt = 0;
  private ballSlowSince: number | null = null;

  private statusText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private startLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('Roll');
  }

  create(): void {
    addBackground(this);
    registerDecomp();

    this.blocks = [];
    this.textureKeys = [];
    this.ball = null;
    this.phase = 'build';
    this.remaining = TOTAL_SHOTS;
    this.busy = false;

    // 出口とゴールは毎回変える。左右どちらのパターンも遊べるようにする
    const chuteOnLeft = Math.random() < 0.5;
    this.chuteX = chuteOnLeft ? STAGE_X + 46 : STAGE_RIGHT - 46;
    const centerX = STAGE_X + STAGE_WIDTH / 2;
    this.basketX = chuteOnLeft
      ? Phaser.Math.Between(centerX + 40, STAGE_RIGHT - 90)
      : Phaser.Math.Between(STAGE_X + 90, centerX - 40);

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
      // カメラ起動が返ってくる前にシーンを離れていたら何もしない。
      // 破棄ずみのテキストへ書き込むと例外になる(実機で発生した)
      if (!this.statusText.scene) return;
      this.statusText.setText(
        ok
          ? 'ブロックの みちで ボールを かごまで はこぼう！\n「スタート！」で さつえい'
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
      0xeaf7e6,
    );

    // 床
    this.add.rectangle(centerX, FLOOR_Y + 20, STAGE_WIDTH, 40, COLORS.wall);
    this.matter.add.rectangle(centerX, FLOOR_Y + 30, STAGE_WIDTH, 60, {
      isStatic: true,
      friction: 0.3,
      frictionStatic: 0.5,
    });

    // 左右の壁
    for (const wallX of [STAGE_X - 30, STAGE_RIGHT + 30]) {
      this.matter.add.rectangle(wallX, GAME_HEIGHT / 2, 60, GAME_HEIGHT * 2, {
        isStatic: true,
        friction: 0.1,
      });
      this.add.rectangle(
        wallX,
        (ARENA_TOP + FLOOR_Y + 40) / 2,
        8,
        FLOOR_Y + 40 - ARENA_TOP,
        0xbfdcb4,
      );
    }

    this.buildChute();
    this.buildBasket();
  }

  /** ボールの出口。どこから出てくるかが一目で分かるようにする。 */
  private buildChute(): void {
    this.add
      .rectangle(this.chuteX, ARENA_TOP + 10, 88, 20, COLORS.accent)
      .setDepth(PANEL_DEPTH + 4);
    this.add
      .text(this.chuteX, ARENA_TOP + 34, '▼ ボール', bodyStyle(20))
      .setOrigin(0.5, 0)
      .setColor('#209aa1')
      .setDepth(PANEL_DEPTH + 4);
  }

  /**
   * ゴールのかご。壁をボールより高くして、床を転がってきただけでは
   * 入れないようにする(上から落とさないと入らない = みち作りが必要になる)。
   */
  private buildBasket(): void {
    const wallCenterY = FLOOR_Y - BASKET_HEIGHT / 2;
    for (const side of [-1, 1]) {
      const x = this.basketX + side * (BASKET_HALF + BASKET_WALL / 2);
      this.matter.add.rectangle(x, wallCenterY, BASKET_WALL, BASKET_HEIGHT, {
        isStatic: true,
        friction: 0.1,
      });
      this.add.rectangle(x, wallCenterY, BASKET_WALL, BASKET_HEIGHT, 0xd97c2a);
    }
    // かごの底(見た目)
    this.add.rectangle(this.basketX, FLOOR_Y - 6, BASKET_HALF * 2, 12, 0xd97c2a);
    this.add
      .text(this.basketX, FLOOR_Y - BASKET_HEIGHT - 34, 'ゴール', bodyStyle(22))
      .setOrigin(0.5)
      .setColor('#d97c2a');
  }

  private buildHud(): void {
    this.add
      .text(GAME_WIDTH / 2, 26, 'コロコロゴール！', titleStyle(38))
      .setOrigin(0.5)
      .setDepth(20);

    this.countText = this.add.text(16, 62, '', bodyStyle(24)).setOrigin(0, 0).setDepth(20);
    this.updateCountText();

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

  private updateCountText(): void {
    this.countText.setText(`のこり ${this.remaining}かい`);
  }

  private beginShot(): void {
    if (this.phase !== 'build' || this.busy || this.remaining <= 0) return;
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

    this.remaining -= 1;
    this.updateCountText();
    this.busy = false;
    this.phase = 'settling';
    this.settleStartedAt = performance.now();
    this.startLabel.setText('ころがりちゅう');
    this.statusText.setText('ブロックが おちたら ボールが でるよ！');
  }

  /** 切り抜きを、カメラに写っていたその位置・その大きさで落とす(タワーと同じ)。 */
  private dropPiece(piece: CutoutPiece, viewScale: number): boolean {
    const key = `roll-piece-${this.textureKeys.length}`;
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
      friction: 0.6,
      frictionStatic: 0.8,
      frictionAir: 0.02,
      restitution: 0,
      density: 0.01,
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
    block.setData('hasMoved', false);

    this.blocks.push(block);
    playTap();
    return true;
  }

  private isBlockSettled(block: Phaser.Physics.Matter.Image): boolean {
    const body = block.body as MatterJS.BodyType | null;
    if (!body) return false;
    if (body.isStatic) return true;

    const moving = Math.abs(body.velocity.x) >= 0.4 || Math.abs(body.velocity.y) >= 0.4;
    if (moving) {
      block.setData('hasMoved', true);
      return false;
    }
    // 作られた直後は物理が回っておらず速度0なので、一度動いたものだけを見る
    return block.getData('hasMoved') === true;
  }

  /**
   * 落ち着いたブロックを固定する。
   * 固定しないと、次のブロックやボールに押されて道が崩れてしまい、
   * 「どこに置くか」を考える遊びにならない。
   */
  private freezeBlocks(): void {
    for (const block of this.blocks) {
      block.setStatic(true);
    }
  }

  private spawnBall(): void {
    const key = this.ballTexture();
    const ball = this.matter.add.image(this.chuteX, ARENA_TOP + 40, key, undefined, {
      shape: { type: 'circle', radius: BALL_RADIUS },
      restitution: 0.3,
      friction: 0.05,
      frictionAir: 0.008,
      density: 0.004,
    });
    ball.setDepth(PANEL_DEPTH + 6);
    // 出口から中央へ向けて軽く転がり出させる
    ball.setVelocity(this.chuteX < GAME_WIDTH / 2 ? 1.5 : -1.5, 0);
    this.ball = ball;
    this.ballStartedAt = performance.now();
    this.ballSlowSince = null;
  }

  /** ボールの絵。丸を1枚だけ作って使い回す。 */
  private ballTexture(): string {
    const key = 'roll-ball';
    if (this.textures.exists(key)) return key;

    const size = BALL_RADIUS * 2;
    const texture = this.textures.createCanvas(key, size, size);
    if (!texture) return key;
    const ctx = texture.getContext();
    ctx.fillStyle = '#e0533d';
    ctx.beginPath();
    ctx.arc(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd9bc';
    ctx.beginPath();
    ctx.arc(BALL_RADIUS - 5, BALL_RADIUS - 6, BALL_RADIUS / 3, 0, Math.PI * 2);
    ctx.fill();
    texture.refresh();
    this.textureKeys.push(key);
    return key;
  }

  update(): void {
    this.panel.update();
    if (this.phase === 'settling') this.tickSettling();
    if (this.phase === 'rolling') this.tickRolling();
  }

  private tickSettling(): void {
    const elapsed = performance.now() - this.settleStartedAt;
    const allSettled = this.blocks.every((block) => this.isBlockSettled(block));
    // まれに引っかかって揺れ続ける形があるので、時間でも打ち切る
    if ((elapsed > 600 && allSettled) || elapsed > 5000) {
      this.freezeBlocks();
      this.spawnBall();
      this.phase = 'rolling';
    }
  }

  private tickRolling(): void {
    const ball = this.ball;
    if (!ball) return;

    // かごの壁より下・かごの内側に入ったらゴール
    if (
      Math.abs(ball.x - this.basketX) <= BASKET_HALF - 6 &&
      ball.y > FLOOR_Y - BASKET_HEIGHT + 20
    ) {
      this.succeed();
      return;
    }

    const now = performance.now();
    const body = ball.body as MatterJS.BodyType | null;
    const speed = body ? Math.hypot(body.velocity.x, body.velocity.y) : 0;
    if (speed < 0.2) {
      this.ballSlowSince ??= now;
    } else {
      this.ballSlowSince = null;
    }

    const stuck = this.ballSlowSince !== null && now - this.ballSlowSince > BALL_STUCK_MS;
    if (stuck || now - this.ballStartedAt > BALL_MAX_MS) {
      ball.destroy();
      this.ball = null;
      if (this.remaining > 0) {
        this.phase = 'build';
        this.startLabel.setText('つぎを とる！');
        this.statusText.setText('とどかなかった… つぎの ブロックで みちを のばそう！');
      } else {
        this.showResult();
      }
    }
  }

  private succeed(): void {
    this.phase = 'over';
    const used = TOTAL_SHOTS - this.remaining;
    playFanfare(true);
    this.showBanner(`ゴーーール！\nブロック ${used}こで はこべたよ！`, COLORS.primary);
  }

  private showResult(): void {
    this.phase = 'over';
    playFanfare(false);
    this.showBanner('とどかなかった…\nつぎは どこに おく？', COLORS.wall);
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
