import Phaser from 'phaser';

// 環境構築確認用の最小 Boot シーン。実装は未着手。
class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#222222');
    this.add
      .text(
        this.scale.width / 2,
        this.scale.height / 2,
        'からだブロック凹凸 うつしてポン！\n(準備中)',
        {
          fontSize: '24px',
          color: '#ffffff',
          align: 'center',
        },
      )
      .setOrigin(0.5);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 1280,
  height: 720,
  scene: [BootScene],
});
