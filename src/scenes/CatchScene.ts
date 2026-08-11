// モード7「あめあめキャッチ」。SPEC_MODE7.md 参照。
//
// おわんのポーズで撮影 → 体ブロックが舞台に置かれる →
// 上からアメがたくさん降ってくる → 体の上に乗った数が点数。
// 順番に挑戦して、いちばん多くキャッチした人の勝ち。
//
// 「どんな形なら受け止められるか」を考えるのが本体なので、
// 置いたブロックは固定してアメの重さで崩れないようにする。

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

/** カメラ枠と舞台の幅。大きく写って受け止めやすいよう広めにする。 */
const STAGE_WIDTH = 560;
const STAGE_X = Math.round((GAME_WIDTH - STAGE_WIDTH) / 2);
const STAGE_RIGHT = STAGE_X + STAGE_WIDTH;

const CAM_X = STAGE_X;
const CAM_Y = 96;
const CAM_WIDTH = STAGE_WIDTH;
const CAM_HEIGHT = Math.round((STAGE_WIDTH * 9) / 16);

const ARENA_TOP = CAM_Y + CAM_HEIGHT;
const FLOOR_Y = GAME_HEIGHT - 190;

/** 1回に降るアメの数と間隔。 */
const CANDY_TOTAL = 24;
const CANDY_INTERVAL_MS = 150;
const CANDY_RADIUS = 13;
const CANDY_COLORS = ['#ff6f91', '#ffc75f', '#7bd389', '#6fb7ff'];

/**
 * 「キャッチできた」と数える高さ。
 * 床に直接転がったアメは中心が床から半径ぶんの高さにあるので、
 * それより十分高い位置で止まったもの = 体の上に乗ったものだけを数える。
 */
const CAUGHT_Y = FLOOR_Y - 40;

type Phase = 'build' | 'settling' | 'rain' | 'over';

export class CatchScene extends Phaser.Scene {
  private panel!: CameraPanel;
  private blocks: Phaser.Physics.Matter.Image[] = [];
  private candies: Phaser.Physics.Matter.Image[] = [];
  private textureKeys: string[] = [];

  private challengers = 1;
  private round = 1;
  private scores: number[] = [];

  private phase: Phase = 'build';
  private busy = false;
  private settleStartedAt = 0;
  private candiesSpawned = 0;
  private nextCandyAt = 0;
  private lastSpawnAt = 0;
  private candiesSettledSince: number | null = null;

  private statusText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private startLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('Catch');
  }

  init(data: { challengers?: number }): void {
    this.challengers = data.challengers ?? 1;
  }

  create(): void {
    addBackground(this);
    registerDecomp();

    this.blocks = [];
    this.candies = [];
    this.textureKeys = [];
    this.round = 1;
    this.scores = [];
    this.phase = 'build';
    this.busy = false;

    this.buildStage();
    this.buildHud();

    this.panel = new CameraPanel(this, {
      x: CAM_X,
      y: CAM_Y,
      width: CAM_WIDTH,
      height: CAM_HEIGHT,
      // 1人ずつ挑戦するモードなのでガイド枠は出さない
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
          ? 'うでで おわんを つくって うけとめよう！\n「スタート！」で さつえい'
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
      0xfdeef6,
    );

    this.add.rectangle(centerX, FLOOR_Y + 20, STAGE_WIDTH, 40, COLORS.wall);
    this.matter.add.rectangle(centerX, FLOOR_Y + 30, STAGE_WIDTH, 60, {
      isStatic: true,
      friction: 0.8,
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
        0xeec4d8,
      );
    }
  }

  private buildHud(): void {
    this.add
      .text(GAME_WIDTH / 2, 26, 'あめあめキャッチ', titleStyle(38))
      .setOrigin(0.5)
      .setDepth(20);

    this.countText = this.add.text(16, 62, '', bodyStyle(24)).setOrigin(0, 0).setDepth(20);

    this.scoreText = this.add
      .text(GAME_WIDTH - 16, 62, '', bodyStyle(22))
      .setOrigin(1, 0)
      .setAlign('right')
      .setDepth(20);

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
    this.countText.setText(
      this.challengers > 1
        ? `${this.round}にんめ / ${this.challengers}にん`
        : 'キャッチに ちょうせん！',
    );
    this.scoreText.setText(
      this.scores.map((score, index) => `${index + 1}にんめ: ${score}こ`).join('\n'),
    );
  }

  private beginShot(): void {
    if (this.phase !== 'build' || this.busy) return;
    if (!this.panel.ready) return;

    this.busy = true;
    this.startLabel.setText('とりくみちゅう');
    this.statusText.setText('うけとめる ポーズを とって！');

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

    this.busy = false;
    this.phase = 'settling';
    this.settleStartedAt = performance.now();
    this.startLabel.setText('あめタイム！');
    this.statusText.setText('アメが ふってくるよ〜！');
  }

  /** 切り抜きを、カメラに写っていたその位置・その大きさで落とす(タワーと同じ)。 */
  private dropPiece(piece: CutoutPiece, viewScale: number): boolean {
    const key = `catch-piece-${this.textureKeys.length}`;
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
    return block.getData('hasMoved') === true;
  }

  private spawnCandy(): void {
    const x = Phaser.Math.Between(STAGE_X + CANDY_RADIUS + 4, STAGE_RIGHT - CANDY_RADIUS - 4);
    const variant = Phaser.Math.Between(0, CANDY_COLORS.length - 1);
    const candy = this.matter.add.image(
      x,
      ARENA_TOP + CANDY_RADIUS,
      this.candyTexture(variant),
      undefined,
      {
        shape: { type: 'circle', radius: CANDY_RADIUS },
        restitution: 0.2,
        friction: 0.5,
        frictionStatic: 0.7,
        density: 0.002,
      },
    );
    candy.setDepth(PANEL_DEPTH + 6);
    this.candies.push(candy);
    this.candiesSpawned += 1;
    this.lastSpawnAt = performance.now();
  }

  /** アメの絵。色ごとに1枚だけ作って使い回す。 */
  private candyTexture(variant: number): string {
    const key = `catch-candy-${variant}`;
    if (this.textures.exists(key)) return key;

    const size = CANDY_RADIUS * 2;
    const texture = this.textures.createCanvas(key, size, size);
    if (!texture) return key;
    const ctx = texture.getContext();
    ctx.fillStyle = CANDY_COLORS[variant]!;
    ctx.beginPath();
    ctx.arc(CANDY_RADIUS, CANDY_RADIUS, CANDY_RADIUS - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.beginPath();
    ctx.arc(CANDY_RADIUS - 4, CANDY_RADIUS - 4, CANDY_RADIUS / 3, 0, Math.PI * 2);
    ctx.fill();
    texture.refresh();
    this.textureKeys.push(key);
    return key;
  }

  update(): void {
    this.panel.update();
    if (this.phase === 'settling') this.tickSettling();
    if (this.phase === 'rain') this.tickRain();
  }

  private tickSettling(): void {
    const elapsed = performance.now() - this.settleStartedAt;
    const allSettled = this.blocks.every((block) => this.isBlockSettled(block));
    if ((elapsed > 600 && allSettled) || elapsed > 5000) {
      // アメの重さで姿勢が崩れないよう、ここで固定する
      for (const block of this.blocks) block.setStatic(true);
      this.phase = 'rain';
      this.candiesSpawned = 0;
      this.nextCandyAt = performance.now() + 400;
      this.candiesSettledSince = null;
    }
  }

  private tickRain(): void {
    const now = performance.now();

    if (this.candiesSpawned < CANDY_TOTAL) {
      if (now >= this.nextCandyAt) {
        this.nextCandyAt = now + CANDY_INTERVAL_MS;
        this.spawnCandy();
      }
      return;
    }

    // 全部降りきったら、アメが落ち着くのを待って数える
    const allSettled = this.candies.every((candy) => {
      const body = candy.body as MatterJS.BodyType | null;
      if (!body) return true;
      return Math.hypot(body.velocity.x, body.velocity.y) < 0.3;
    });
    if (allSettled) {
      this.candiesSettledSince ??= now;
    } else {
      this.candiesSettledSince = null;
    }

    const waited = this.candiesSettledSince !== null && now - this.candiesSettledSince > 800;
    // 揺れ続けるアメがあっても終わるように時間でも打ち切る
    if (waited || now - this.lastSpawnAt > 6000) {
      this.finishRound();
    }
  }

  private finishRound(): void {
    const caught = this.candies.filter((candy) => candy.y < CAUGHT_Y).length;
    this.scores.push(caught);
    this.updateHud();
    playFanfare(caught >= 5);

    if (this.round < this.challengers) {
      this.phase = 'build';
      this.round += 1;
      this.statusText.setText(`${caught}こ キャッチ！ つぎは ${this.round}にんめの ばん！`);
      this.startLabel.setText('スタート！');
      this.updateHud();
      // 前の人のブロックとアメを片付けて、まっさらな舞台で挑戦させる
      this.time.delayedCall(1500, () => this.clearField());
    } else {
      this.showResult();
    }
  }

  private clearField(): void {
    for (const candy of this.candies) candy.destroy();
    this.candies = [];
    for (const block of this.blocks) block.destroy();
    this.blocks = [];
  }

  private showResult(): void {
    this.phase = 'over';

    let message: string;
    if (this.challengers === 1) {
      const caught = this.scores[0] ?? 0;
      const comment = caught >= 8 ? 'すごい！' : caught >= 4 ? 'いいかんじ！' : 'またちょうせん！';
      message = `${caught}こ キャッチ！\n${comment}`;
    } else {
      const best = Math.max(...this.scores);
      const winners = this.scores
        .map((score, index) => ({ score, index }))
        .filter((entry) => entry.score === best)
        .map((entry) => `${entry.index + 1}にんめ`);
      message =
        winners.length === 1
          ? `ゆうしょうは ${winners[0]}！\n${best}こ キャッチ！`
          : `ひきわけ！ ${winners.join(' と ')}\n${best}こ キャッチ！`;
    }

    playFanfare(true);

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
