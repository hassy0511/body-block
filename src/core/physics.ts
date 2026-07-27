// Matter.js まわりの下準備。CLAUDE.md §2 の物理演算は Phaser 内蔵の Matter を使う。

import decomp from 'poly-decomp';

let registered = false;

/**
 * 凹んだ形を凸形の集合へ分割するために poly-decomp を Matter へ渡す。
 *
 * 人型は手足の間が凹むため、これがないと Matter は凸包に丸めてしまい、
 * 股や脇の隙間が埋まった「のっぺりした塊」になってしまう。
 */
export function registerDecomp(): void {
  if (registered) return;
  // Matter は window.decomp を見に行くので、そこへ載せる
  (window as unknown as { decomp?: unknown }).decomp = decomp;
  registered = true;
}
