// 起動時にセグメンテーションモデルを読み込む。
// モデルは約16MB あり初回は待たされるため、進行状況を見せる(VERIFICATION.md の結論)。

import Phaser from 'phaser';
import { PersonSegmenter } from '../core/segmenter';
import { session } from '../game/session';
import { addBackground, bodyStyle, titleStyle, GAME_WIDTH, GAME_HEIGHT } from '../ui/ui';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    addBackground(this);

    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2 - 70,
        'からだブロック凹凸\nうつしてポン！',
        titleStyle(46),
      )
      .setOrigin(0.5);

    const status = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 70, 'よみこみちゅう...', bodyStyle(32))
      .setOrigin(0.5);

    // 「…」が動いて止まって見えないようにする
    let dots = 0;
    const timer = this.time.addEvent({
      delay: 400,
      loop: true,
      callback: () => {
        dots = (dots + 1) % 4;
        status.setText(`よみこみちゅう${'.'.repeat(dots)}`);
      },
    });

    void this.loadSegmenter(status, timer);
  }

  private async loadSegmenter(
    status: Phaser.GameObjects.Text,
    timer: Phaser.Time.TimerEvent,
  ): Promise<void> {
    const segmenter = new PersonSegmenter();
    try {
      await segmenter.loadModel('multiclass');
      session.segmenter = segmenter;
      timer.remove();
      this.scene.start('Title');
    } catch {
      timer.remove();
      status.setText(
        'よみこみに しっぱいしました\nつうしんかんきょうを たしかめて\nリロードしてね',
      );
      status.setStyle(bodyStyle(28));
    }
  }
}
