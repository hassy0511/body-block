// モード5「いきものずかん」。SPEC_MODE5.md 参照。
//
// 撮った体が「いきもの」になって画面いっぱいの水槽をふよふよ泳ぐ。
// 勝ち負け・制限時間・スコアのない、低年齢向けの鑑賞モード。

import Phaser from 'phaser';
import { buildCutoutPiece } from '../core/cutout';
import { registerDecomp } from '../core/physics';
import { playTap } from '../core/sound';
import { spawnCutoutBlock } from '../game/blockFactory';
import { CameraPanel, type CapturedFrame } from '../game/cameraPanel';
import { addBackground, createButton, bodyStyle, COLORS, GAME_WIDTH, GAME_HEIGHT } from '../ui/ui';

/** 撮影までの秒数。鑑賞モードなので短めでよい。 */
const SHOT_TIME_LIMIT_SEC = 5;

/** カメラは左上に小さく浮かべる。水槽は画面全体。 */
const CAM_X = 24;
const CAM_Y = 24;
const CAM_WIDTH = 340;
const CAM_HEIGHT = Math.round((CAM_WIDTH * 9) / 16);

/** 生き物の上限。超えたら古い順に消える(テクスチャも破棄する)。 */
const MAX_CREATURES = 12;
/** 生き物の大きさ上限(px)。 */
const MAX_HEIGHT = 150;
/** 泳ぐ速さの上限。ゆったりに保つ。 */
const SPEED_LIMIT = 2.4;

interface Creature {
  image: Phaser.Physics.Matter.Image;
  textureKey: string;
}

export class ZukanScene extends Phaser.Scene {
  private panel!: CameraPanel;
  private creatures: Creature[] = [];
  private busy = false;

  private countText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private callLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('Zukan');
  }

  create(): void {
    addBackground(this);
    registerDecomp();

    this.creatures = [];
    this.busy = false;

    this.buildTank();
    this.buildHud();

    this.panel = new CameraPanel(this, {
      x: CAM_X,
      y: CAM_Y,
      width: CAM_WIDTH,
      height: CAM_HEIGHT,
      guideCount: 0,
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const creature of this.creatures) {
        if (this.textures.exists(creature.textureKey)) this.textures.remove(creature.textureKey);
      }
      this.creatures = [];
    });

    void this.panel.start().then((ok) => {
      this.statusText.setText(
        ok
          ? '「なかまを よぶ」で さつえい！\nうつった すがたが およぎだすよ'
          : 'カメラを つかえませんでした。きょかを かくにんしてね',
      );
    });
  }

  // ---------- 水槽 ----------

  private buildTank(): void {
    // 水。上を明るく下を深くして、それらしく
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT * 0.25, GAME_WIDTH, GAME_HEIGHT * 0.5, 0xbfe6f5);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT * 0.75, GAME_WIDTH, GAME_HEIGHT * 0.5, 0x9fd4ec);
    // 砂
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 22, GAME_WIDTH, 44, 0xe8d8a8).setDepth(1);

    // 見えない壁。生き物が外へ出ないようにする
    const walls = [
      { x: GAME_WIDTH / 2, y: -30, w: GAME_WIDTH * 2, h: 60 },
      { x: GAME_WIDTH / 2, y: GAME_HEIGHT + 30, w: GAME_WIDTH * 2, h: 60 },
      { x: -30, y: GAME_HEIGHT / 2, w: 60, h: GAME_HEIGHT * 2 },
      { x: GAME_WIDTH + 30, y: GAME_HEIGHT / 2, w: 60, h: GAME_HEIGHT * 2 },
    ];
    for (const wall of walls) {
      this.matter.add.rectangle(wall.x, wall.y, wall.w, wall.h, {
        isStatic: true,
        restitution: 0.8,
        friction: 0,
      });
    }

    // あぶく。ゆっくり上っていく飾り
    for (let i = 0; i < 8; i += 1) {
      const bubble = this.add
        .circle(
          Phaser.Math.Between(60, GAME_WIDTH - 60),
          GAME_HEIGHT + 20,
          Phaser.Math.Between(4, 10),
          0xffffff,
          0.3,
        )
        .setDepth(2);
      this.tweens.add({
        targets: bubble,
        y: -20,
        duration: Phaser.Math.Between(7000, 14000),
        delay: Phaser.Math.Between(0, 6000),
        repeat: -1,
        onRepeat: () => bubble.setX(Phaser.Math.Between(60, GAME_WIDTH - 60)),
      });
    }
  }

  // ---------- HUD ----------

  private buildHud(): void {
    this.countText = this.add
      .text(CAM_X, CAM_Y + CAM_HEIGHT + 14, 'なかま: 0ひき', bodyStyle(26))
      .setOrigin(0, 0)
      .setDepth(20);

    const callButton = createButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 150,
      'なかまを よぶ',
      () => this.beginShot(),
      { width: 320, height: 90, fontSize: 30 },
    ).setDepth(20);
    this.callLabel = callButton.getData('label') as Phaser.GameObjects.Text;

    createButton(
      this,
      140,
      GAME_HEIGHT - 56,
      'カメラきりかえ',
      () => {
        playTap();
        if (this.panel.isCountingDown) return;
        void this.panel.switchFacing().catch(() => {
          this.statusText.setText('カメラを きりかえられませんでした');
        });
      },
      {
        width: 240,
        height: 62,
        fontSize: 22,
        color: COLORS.accent,
        pressedColor: COLORS.accentDark,
      },
    ).setDepth(20);

    createButton(
      this,
      GAME_WIDTH - 110,
      GAME_HEIGHT - 56,
      'やめる',
      () => {
        playTap();
        this.scene.start('Title');
      },
      {
        width: 180,
        height: 62,
        fontSize: 22,
        color: COLORS.accent,
        pressedColor: COLORS.accentDark,
      },
    ).setDepth(20);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 240, 'カメラを じゅんびちゅう...', bodyStyle(22))
      .setOrigin(0.5)
      .setAlign('center')
      .setWordWrapWidth(GAME_WIDTH - 60)
      .setDepth(20);
  }

  // ---------- 撮影 ----------

  private beginShot(): void {
    if (this.busy || !this.panel.ready) return;
    this.busy = true;
    this.callLabel.setText('とりくみちゅう');
    this.statusText.setText('カメラの まえに きてね！');

    this.panel.beginCountdown(
      SHOT_TIME_LIMIT_SEC,
      (frame) => this.onCaptured(frame),
      (message) => this.onFailed(message),
    );
  }

  private onFailed(message: string): void {
    this.busy = false;
    this.callLabel.setText('なかまを よぶ');
    this.statusText.setText(message);
  }

  private onCaptured(frame: CapturedFrame): void {
    const { processed, image } = frame;
    if (processed.accepted.length === 0) {
      this.onFailed('うつっていないみたい。もういちど！');
      return;
    }

    const viewScale = CAM_WIDTH / image.width;
    let born = 0;

    for (const blob of processed.accepted) {
      const piece = buildCutoutPiece(processed.mask, blob, processed.labels, {
        source: image,
        sourceWidth: image.width,
        sourceHeight: image.height,
      });
      if (!piece) continue;

      const scale = Math.min(viewScale, MAX_HEIGHT / piece.sprite.height);
      // 写っていた横位置あたりから、カメラの下へ泳ぎ出す
      const x = Phaser.Math.Clamp(
        CAM_X + (piece.origin.x + piece.contourCentroid.x) * viewScale,
        80,
        GAME_WIDTH - 80,
      );
      const spawned = spawnCutoutBlock(this, piece, {
        x,
        y: CAM_Y + CAM_HEIGHT + 90,
        scale,
        // カメラ表示(PANEL_DEPTH)より奥。カメラの下をくぐって泳ぐ
        depth: 5,
        body: { frictionAir: 0.04, friction: 0, restitution: 0.8, density: 0.002 },
      });
      if (!spawned) continue;

      // 水中に漂わせる。重力は効かせない
      spawned.block.setIgnoreGravity(true);
      spawned.block.setVelocity(
        Phaser.Math.FloatBetween(-1.5, 1.5),
        Phaser.Math.FloatBetween(0.5, 1.5),
      );
      spawned.block.setData('nudgeAt', performance.now() + Phaser.Math.Between(800, 2000));

      this.creatures.push({ image: spawned.block, textureKey: spawned.textureKey });
      born += 1;
    }

    if (born === 0) {
      this.onFailed('うまく きりぬけませんでした。もういちど！');
      return;
    }

    // 上限を超えたら古い順にさよなら
    while (this.creatures.length > MAX_CREATURES) {
      const oldest = this.creatures.shift();
      if (oldest) {
        oldest.image.destroy();
        if (this.textures.exists(oldest.textureKey)) this.textures.remove(oldest.textureKey);
      }
    }

    playTap();
    this.busy = false;
    this.callLabel.setText('なかまを よぶ');
    this.statusText.setText('なかまが ふえたよ！');
    this.countText.setText(`なかま: ${this.creatures.length}ひき`);
  }

  // ---------- 泳ぎ ----------

  update(): void {
    this.panel.update();

    const now = performance.now();
    for (const creature of this.creatures) {
      const image = creature.image;
      const body = image.body as MatterJS.BodyType | null;
      if (!body) continue;

      // 数秒ごとに小さく向きを変える。毎フレーム乱数を足すと痙攣して見える
      if (now >= (image.getData('nudgeAt') as number)) {
        image.setVelocity(
          body.velocity.x + Phaser.Math.FloatBetween(-0.9, 0.9),
          body.velocity.y + Phaser.Math.FloatBetween(-0.9, 0.9),
        );
        image.setAngularVelocity(Phaser.Math.FloatBetween(-0.015, 0.015));
        image.setData('nudgeAt', now + Phaser.Math.Between(1200, 2800));
      }

      // 速さの上限。ゆったりに保つ
      const speed = Math.hypot(body.velocity.x, body.velocity.y);
      if (speed > SPEED_LIMIT) {
        const ratio = SPEED_LIMIT / speed;
        image.setVelocity(body.velocity.x * ratio, body.velocity.y * ratio);
      }

      // 傾きすぎたら、ゆっくり戻す向きに回す
      const angle = Phaser.Math.Angle.WrapDegrees(image.angle);
      if (Math.abs(angle) > 30) {
        image.setAngularVelocity(angle > 0 ? -0.02 : 0.02);
      }
    }
  }
}
