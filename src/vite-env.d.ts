/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** MediaPipe の WASM ランタイムの取得元。未設定なら公式 CDN。 */
  readonly VITE_MEDIAPIPE_WASM_BASE?: string;
  /** MediaPipe のモデル資産の取得元。未設定なら公式 CDN。 */
  readonly VITE_MEDIAPIPE_MODEL_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
