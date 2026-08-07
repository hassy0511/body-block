import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = fileURLToPath(new URL('.', import.meta.url));

// 「どの版が表示されているか」を画面で確認できるようにする。
// キャッシュが古いままの端末をすぐ見分けるため
const buildId = (() => {
  let sha = 'dev';
  try {
    sha = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    // git がなければ dev のまま
  }
  return `${sha} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z`;
})();

// GitHub Pages のプロジェクトページ (https://<owner>.github.io/body-block/) を想定した base 設定
export default defineConfig({
  base: '/body-block/',
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  build: {
    rollupOptions: {
      input: {
        main: `${root}index.html`,
        verify: `${root}verify.html`,
        themes: `${root}themes.html`,
        pair: `${root}pair.html`,
      },
    },
  },
});
