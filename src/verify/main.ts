// 技術検証ページのエントリポイント。SPEC_MODE1.md §6 技術検証チェックリスト参照。
//
// カメラプレビュー + セグメンテーションマスクのリアルタイム重畳表示 +
// 静止画キャプチャ→切り抜き結果表示 + モデル切り替えの最小構成。
// 画像は一切外部送信しない(SPEC.md §2.1)。全処理はブラウザ内で完結する。
import './style.css';
import { CameraController } from '../core/camera';
import { PersonSegmenter, type SegmenterModelId } from '../core/segmenter';

const PREVIEW_FPS = 8;
const PREVIEW_INTERVAL_MS = 1000 / PREVIEW_FPS;

const videoEl = document.querySelector<HTMLVideoElement>('#preview-video')!;
const overlayCanvas = document.querySelector<HTMLCanvasElement>('#overlay-canvas')!;
const resultCanvas = document.querySelector<HTMLCanvasElement>('#result-canvas')!;
const modelSelect = document.querySelector<HTMLSelectElement>('#model-select')!;
const switchCameraBtn = document.querySelector<HTMLButtonElement>('#switch-camera-btn')!;
const captureBtn = document.querySelector<HTMLButtonElement>('#capture-btn')!;
const invertCheckbox = document.querySelector<HTMLInputElement>('#invert-mask')!;
const statusLog = document.querySelector<HTMLPreElement>('#status-log')!;

const camera = new CameraController(videoEl);
const segmenter = new PersonSegmenter();

// 静止画キャプチャ用のオフスクリーンキャンバス(DOM には出さない)
const captureCanvas = document.createElement('canvas');

let previewTimerId: number | null = null;
let isSegmenting = false;
let frameTimestamp = 0;

function log(message: string): void {
  const time = new Date().toLocaleTimeString('ja-JP');
  statusLog.textContent = `[${time}] ${message}\n${statusLog.textContent ?? ''}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 現在のモデルの極性で人物判定する。手動反転トグルが入っていれば反転させる。 */
function isPerson(categoryValue: number): boolean {
  return segmenter.isPerson(categoryValue) !== invertCheckbox.checked;
}

/** overlay canvas を video と同じ鏡像状態に揃える。 */
function syncOverlayTransform(): void {
  overlayCanvas.style.transform = videoEl.style.transform;
}

/**
 * カテゴリマスクを走査し、人物ピクセルだけを半透明色で overlay に塗る。
 * 同時に人物ピクセル数を返す(抜け具合の目安として表示する)。
 */
function drawMaskOverlay(
  ctx: CanvasRenderingContext2D,
  categoryData: Uint8Array,
  maskWidth: number,
  maskHeight: number,
): number {
  const image = ctx.createImageData(maskWidth, maskHeight);
  const pixels = image.data;
  let personPixels = 0;

  for (let i = 0; i < categoryData.length; i += 1) {
    const offset = i * 4;
    if (isPerson(categoryData[i]!)) {
      personPixels += 1;
      pixels[offset] = 0;
      pixels[offset + 1] = 200;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = 110;
    } else {
      pixels[offset + 3] = 0;
    }
  }

  // putImageData は変換行列を無視するため、ここで反転はできない。
  // 鏡像表示は overlay canvas 側の CSS transform で video と揃えている。
  ctx.clearRect(0, 0, maskWidth, maskHeight);
  ctx.putImageData(image, 0, 0);

  return personPixels;
}

function renderPreviewFrame(): void {
  if (isSegmenting || videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  if (!segmenter.currentModel) return;

  isSegmenting = true;
  try {
    frameTimestamp += PREVIEW_INTERVAL_MS;
    const result = segmenter.segment(videoEl, frameTimestamp);
    const mask = result.categoryMask;
    if (!mask) return;

    const data = mask.getAsUint8Array();
    if (overlayCanvas.width !== mask.width || overlayCanvas.height !== mask.height) {
      overlayCanvas.width = mask.width;
      overlayCanvas.height = mask.height;
    }
    const ctx = overlayCanvas.getContext('2d');
    if (ctx) {
      drawMaskOverlay(ctx, data, mask.width, mask.height);
    }
    result.close();
  } catch (error) {
    log(`プレビュー推論に失敗: ${errorMessage(error)}`);
  } finally {
    isSegmenting = false;
  }
}

function startPreviewLoop(): void {
  stopPreviewLoop();
  previewTimerId = window.setInterval(renderPreviewFrame, PREVIEW_INTERVAL_MS);
}

function stopPreviewLoop(): void {
  if (previewTimerId !== null) {
    window.clearInterval(previewTimerId);
    previewTimerId = null;
  }
}

/**
 * 静止画1枚をフル解像度でキャプチャし、人物部分だけを切り抜いて表示する。
 * 撮影→表示までの処理時間を計測してログに出す(SPEC_MODE1.md §6)。
 */
function captureAndCutout(): void {
  const startedAt = performance.now();

  const width = videoEl.videoWidth;
  const height = videoEl.videoHeight;
  if (width === 0 || height === 0) {
    log('カメラ映像がまだ準備できていません。');
    return;
  }

  captureCanvas.width = width;
  captureCanvas.height = height;
  const captureCtx = captureCanvas.getContext('2d');
  if (!captureCtx) return;

  captureCtx.save();
  if (camera.facingMode === 'user') {
    captureCtx.translate(width, 0);
    captureCtx.scale(-1, 1);
  }
  captureCtx.drawImage(videoEl, 0, 0, width, height);
  captureCtx.restore();

  try {
    frameTimestamp += PREVIEW_INTERVAL_MS;
    const result = segmenter.segment(captureCanvas, frameTimestamp);
    const mask = result.categoryMask;
    if (!mask) {
      log('マスクを取得できませんでした。');
      return;
    }

    const categoryData = mask.getAsUint8Array();
    const source = captureCtx.getImageData(0, 0, width, height);
    const cutout = captureCtx.createImageData(width, height);
    let personPixels = 0;

    // マスク解像度と撮影解像度が異なるため、最近傍でサンプリングする
    for (let y = 0; y < height; y += 1) {
      const maskY = Math.min(mask.height - 1, Math.floor((y / height) * mask.height));
      for (let x = 0; x < width; x += 1) {
        const maskX = Math.min(mask.width - 1, Math.floor((x / width) * mask.width));
        const offset = (y * width + x) * 4;
        if (isPerson(categoryData[maskY * mask.width + maskX]!)) {
          personPixels += 1;
          cutout.data[offset] = source.data[offset]!;
          cutout.data[offset + 1] = source.data[offset + 1]!;
          cutout.data[offset + 2] = source.data[offset + 2]!;
          cutout.data[offset + 3] = 255;
        }
      }
    }

    resultCanvas.width = width;
    resultCanvas.height = height;
    const resultCtx = resultCanvas.getContext('2d');
    if (resultCtx) {
      resultCtx.clearRect(0, 0, width, height);
      resultCtx.putImageData(cutout, 0, 0);
    }

    result.close();

    const elapsed = Math.round(performance.now() - startedAt);
    const ratio = ((personPixels / (width * height)) * 100).toFixed(1);
    log(`キャプチャ完了: ${width}x${height} / 人物ピクセル ${ratio}% / 処理時間 ${elapsed}ms`);
  } catch (error) {
    log(`キャプチャに失敗: ${errorMessage(error)}`);
  }
}

async function loadModel(modelId: SegmenterModelId): Promise<void> {
  stopPreviewLoop();
  captureBtn.disabled = true;
  modelSelect.disabled = true;
  log(`モデルを読み込み中: ${modelId} ...`);

  const startedAt = performance.now();
  try {
    await segmenter.loadModel(modelId);
    const elapsed = Math.round(performance.now() - startedAt);
    log(`モデル読み込み完了: ${modelId} / delegate=${segmenter.currentDelegate} / ${elapsed}ms`);
    captureBtn.disabled = false;
    startPreviewLoop();
  } catch (error) {
    log(`モデル読み込みに失敗: ${errorMessage(error)}`);
  } finally {
    modelSelect.disabled = false;
  }
}

async function init(): Promise<void> {
  log('カメラを起動しています...');
  try {
    await camera.start('user');
    syncOverlayTransform();
    switchCameraBtn.disabled = false;
    log(`カメラ起動完了: ${videoEl.videoWidth}x${videoEl.videoHeight}`);
  } catch (error) {
    log(`カメラの起動に失敗: ${errorMessage(error)}`);
    return;
  }

  await loadModel(modelSelect.value as SegmenterModelId);
}

modelSelect.addEventListener('change', () => {
  void loadModel(modelSelect.value as SegmenterModelId);
});

switchCameraBtn.addEventListener('click', () => {
  switchCameraBtn.disabled = true;
  void camera
    .switchFacing()
    .then(() => {
      syncOverlayTransform();
      log(`カメラを切り替えました: ${camera.facingMode}`);
    })
    .catch((error: unknown) => log(`カメラ切り替えに失敗: ${errorMessage(error)}`))
    .finally(() => {
      switchCameraBtn.disabled = false;
    });
});

captureBtn.addEventListener('click', captureAndCutout);

window.addEventListener('pagehide', () => {
  stopPreviewLoop();
  camera.stop();
  segmenter.dispose();
});

void init();
