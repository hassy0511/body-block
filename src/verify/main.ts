// 技術検証ページのエントリポイント。
// カメラプレビュー + セグメンテーションマスク重畳表示 + 静止画キャプチャ +
// モデル切り替え(Selfie Segmentation / Multiclass)の実装は環境構築後に着手する。
// SPEC_MODE1.md §6 技術検証チェックリスト参照。

const app = document.querySelector<HTMLDivElement>('#verify-app');
if (app) {
  app.textContent = '技術検証ページ: 準備中';
}
