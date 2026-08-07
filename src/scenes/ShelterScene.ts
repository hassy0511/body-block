// モード3「まもって！シェルター」。SPEC_MODE3.md 参照。
//
// 床にいるたまごちゃんに、上からボールが降ってくる。
// 自分の体を撮って屋根にして守る。
//
// モード2 と同じ物理基盤を使うが、狙いは「高く積む」ではなく「広く覆う」。
// そのため舞台はモード2 より広く低い。

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

/** 撮影できる回数。 */
const TOTAL_SHOTS = 4;
/** ポーズを作るための制限時間(秒)。 */
const SHOT_TIME_LIMIT_SEC = 8;

/**
 * カメラ枠と舞台の幅。モード2 と同じく両者を揃えることで
 * 「カメラの左端に写った人は舞台の左端に落ちる」が成り立つ。
 *
 * モード2 より広いのは、この幅がブロックの大きさを決めているため
 * (SPEC_MODE2.md §5)。広く覆いたいこのモードでは大きいほうが都合がよい。
 */
const STAGE_WIDTH = 560;
const STAGE_X = Math.round((GAME_WIDTH - STAGE_WIDTH) / 2);
const STAGE_RIGHT = STAGE_X + STAGE_WIDTH;

const CAM_X = STAGE_X;
const CAM_Y = 96;
const CAM_WIDTH = STAGE_WIDTH;
const CAM_HEIGHT = Math.round((STAGE_WIDTH * 9) / 16);

const ARENA_TOP = CAM_Y + CAM_HEIGHT;
const FLOOR_Y = GAME_HEIGHT - 200;

/** 当たってよい回数。 */
const HEARTS = 3;
/** ボールが降る時間(ミリ秒)。 */
const WAVE_MS = 12000;
/** ボールの間隔(ミリ秒)。 */
const BALL_INTERVAL_MS = 620;
const BALL_RADIUS = 16;

/** たまごちゃんの大きさ。 */
const EGG_RADIUS = 26;

type Phase = 'build' | 'defend' | 'over';

export class ShelterScene extends Phaser.Scene {
  private panel!: CameraPanel;
  private blocks: Phaser.Physics.Matter.Image[] = [];
  private balls: Phaser.Physics.Matter.Image[] = [];
  private textureKeys: string[] = [];

  private phase: Phase = 'build';
  private remaining = TOTAL_SHOTS;
  private hearts = HEARTS;
  private spawned = 0;
  private hits = 0;
  private busy = false;

  private eggX = 0;
  private egg!: Phaser.GameObjects.Container;

  private waveEndsAt = 0;
  private nextBallAt = 0;

  private statusText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private heartText!: Phaser.GameObjects.Text;
  private startLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('Shelter');
  }

  create(): void {
    addBackground(this);
    registerDecomp();

    this.blocks = [];
    this.balls = [];
    this.textureKeys = [];
    this.phase = 'build';
    this.remaining = TOTAL_SHOTS;
    this.hearts = HEARTS;
    this.spawned = 0;
    this.hits = 0;
    this.busy = false;

    // どこにいるかを見てから立ち位置を決めるのが考えどころなので、毎回ずらす
    this.eggX = Phaser.Math.Between(STAGE_X + 80, STAGE_RIGHT - 80);

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
          ? 'たまごちゃんの うえを まもろう！\n「スタート！」で さつえい'
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
      0xe8f4ff,
    );

    this.add.rectangle(centerX, FLOOR_Y + 20, STAGE_WIDTH, 40, COLORS.wall);
    this.matter.add.rectangle(centerX, FLOOR_Y + 30, STAGE_WIDTH, 60, {
      isStatic: true,
      friction: 1,
      frictionStatic: 1,
    });

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
        0xbcd7ea,
      );
    }

    this.buildEgg();
  }

  /**
   * たまごちゃん。
   *
   * 剛体にはしない。剛体にするとボールが跳ね返って何度も当たり判定が起きるうえ、
   * 落ちてきた体に押しつぶされて動いてしまう(SPEC_MODE3.md §6)。
   */
  private buildEgg(): void {
    const y = FLOOR_Y - EGG_RADIUS;
    const body = this.add.ellipse(0, 0, EGG_RADIUS * 1.7, EGG_RADIUS * 2, 0xfff6d8);
    body.setStrokeStyle(3, 0xd9a441);
    const eyeLeft = this.add.circle(-8, -4, 4, 0x5a4634);
    const eyeRight = this.add.circle(8, -4, 4, 0x5a4634);
    const mouth = this.add.ellipse(0, 8, 10, 5, 0xd97c6a);

    this.egg = this.add
      .container(this.eggX, y, [body, eyeLeft, eyeRight, mouth])
      .setDepth(PANEL_DEPTH + 4);
  }

  private buildHud(): void {
    this.add
      .text(GAME_WIDTH / 2, 26, 'まもって！シェルター', titleStyle(36))
      .setOrigin(0.5)
      .setDepth(20);

    this.countText = this.add.text(16, 62, '', bodyStyle(24)).setOrigin(0, 0).setDepth(20);

    this.heartText = this.add
      .text(GAME_WIDTH - 16, 58, '', titleStyle(30))
      .setOrigin(1, 0)
      .setDepth(20);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 130, 'カメラを じゅんびちゅう...', bodyStyle(22))
      .setOrigin(0.5)
      .setWordWrapWidth(GAME_WIDTH - 40)
      .setDepth(20);

    this.updateHud();

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

  /** 当たらずに済んだ数。屋根の上で止まったままのボールも数に入れる。 */
  private get blocked(): number {
    return this.spawned - this.hits;
  }

  private updateHud(): void {
    this.countText.setText(
      this.phase === 'build' ? `のこり ${this.remaining}かい` : `ふせいだ ${this.blocked}こ`,
    );
    this.heartText.setText('♥'.repeat(this.hearts) + '・'.repeat(HEARTS - this.hearts));
    this.heartText.setColor(this.hearts > 1 ? '#e0533d' : '#b03020');
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

    // モード2 と同じ。写っていた位置・大きさのまま落とす
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
    this.busy = false;
    this.updateHud();

    if (this.remaining > 0) {
      this.startLabel.setText('つぎを とる！');
      this.statusText.setText('いいね！ すきまを うめよう');
    } else {
      this.startLabel.setText('ボールが くるよ');
      this.statusText.setText('じゅんび かんりょう！ ボールタイム！');
      this.startWave();
    }
  }

  /** 切り抜きを、カメラに写っていたその位置・その大きさで落とす(モード2 と同じ)。 */
  private dropPiece(piece: CutoutPiece, viewScale: number): boolean {
    const key = `shelter-piece-${this.textureKeys.length}`;
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

    let block: Phaser.Physics.Matter.Image;
    const options = {
      friction: 0.95,
      frictionStatic: 1.2,
      frictionAir: 0.02,
      restitution: 0,
      density: 0.01,
    };
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

  private startWave(): void {
    this.phase = 'defend';
    this.waveEndsAt = performance.now() + WAVE_MS;
    this.nextBallAt = performance.now() + 800;
    this.updateHud();
  }

  private spawnBall(): void {
    const x = Phaser.Math.Between(STAGE_X + BALL_RADIUS, STAGE_RIGHT - BALL_RADIUS);
    const key = this.ballTexture();
    const ball = this.matter.add.image(x, ARENA_TOP + BALL_RADIUS, key, undefined, {
      shape: { type: 'circle', radius: BALL_RADIUS },
      restitution: 0.45,
      friction: 0.05,
      density: 0.004,
    });
    ball.setDepth(PANEL_DEPTH + 6);
    this.balls.push(ball);
    this.spawned += 1;
  }

  /** ボールの絵。丸を1枚だけ作って使い回す。 */
  private ballTexture(): string {
    const key = 'shelter-ball';
    if (this.textures.exists(key)) return key;

    const size = BALL_RADIUS * 2;
    const texture = this.textures.createCanvas(key, size, size);
    if (!texture) return key;
    const ctx = texture.getContext();
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath();
    ctx.arc(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd9bc';
    ctx.beginPath();
    ctx.arc(BALL_RADIUS - 5, BALL_RADIUS - 5, BALL_RADIUS / 3, 0, Math.PI * 2);
    ctx.fill();
    texture.refresh();
    this.textureKeys.push(key);
    return key;
  }

  update(): void {
    this.panel.update();
    if (this.phase === 'over') return;

    this.cleanupBalls();

    if (this.phase !== 'defend') return;

    const now = performance.now();
    if (now < this.waveEndsAt && now >= this.nextBallAt) {
      this.nextBallAt = now + BALL_INTERVAL_MS;
      this.spawnBall();
    }

    this.checkEggHits();

    if (this.hearts <= 0) {
      this.finish(false);
      return;
    }
    // 時間だけで終わらせる。屋根の上で止まったボールは落ちてこないので、
    // 「ボールが無くなったら」を条件にすると永久に終わらない
    if (now >= this.waveEndsAt) {
      this.finish(true);
    }
  }

  /** 床まで届いたもの・画面外へ出たものを片付ける。残すと際限なく増えて重くなる。 */
  private cleanupBalls(): void {
    this.balls = this.balls.filter((ball) => {
      if (ball.y > GAME_HEIGHT + 200 || ball.y > FLOOR_Y - BALL_RADIUS * 1.5) {
        ball.destroy();
        return false;
      }
      return true;
    });
  }

  /** ボールがたまごちゃんに触れたか。距離だけで見る(§6)。 */
  private checkEggHits(): void {
    const hitRadius = EGG_RADIUS + BALL_RADIUS;
    this.balls = this.balls.filter((ball) => {
      const dx = ball.x - this.egg.x;
      const dy = ball.y - this.egg.y;
      if (dx * dx + dy * dy > hitRadius * hitRadius) return true;

      this.hearts -= 1;
      this.hits += 1;
      this.updateHud();
      this.flashEgg();
      ball.destroy();
      return false;
    });
  }

  private flashEgg(): void {
    this.tweens.killTweensOf(this.egg);
    this.egg.setAlpha(1);
    this.tweens.add({
      targets: this.egg,
      alpha: 0.25,
      duration: 90,
      yoyo: true,
      repeat: 2,
    });
  }

  private finish(survived: boolean): void {
    this.phase = 'over';
    for (const ball of this.balls) ball.destroy();
    this.balls = [];
    this.updateHud();
    playFanfare(survived);

    const color = survived ? COLORS.primary : COLORS.wall;
    // 守りきれなくても突き放さず、防いだ数を見せる(SPEC_MODE3.md §4)
    const message = survived
      ? `まもりきった！\nボールを ${this.blocked}こ ふせいだよ`
      : `たまごちゃんが びっくり…\nでも ボールを ${this.blocked}こ ふせいだよ`;

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, 340, color, 0.94).setDepth(30);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 70, message, titleStyle(38))
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
