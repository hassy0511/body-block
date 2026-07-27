import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// GitHub Pages のプロジェクトページ (https://<owner>.github.io/body-block/) を想定した base 設定
export default defineConfig({
  base: '/body-block/',
  build: {
    rollupOptions: {
      input: {
        main: `${root}index.html`,
        verify: `${root}verify.html`,
      },
    },
  },
});
