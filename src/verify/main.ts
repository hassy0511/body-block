// 技術検証ページのエントリポイント。SPEC_MODE1.md §6 技術検証チェックリスト参照。
//
// カメラプレビュー + セグメンテーションマスクのリアルタイム重畳表示 +
// 静止画キャプチャ→切り抜き結果表示 + モデル切り替えの最小構成。
// 画像は一切外部送信しない(SPEC.md §2.1)。全処理はブラウザ内で完結する。
import './style.css';
import { CameraController } from '../core/camera';
import { PersonSegmenter, type SegmenterModelId } from '../core/segmenter';
import { processMask, type ProcessedMask } from '../core/mask';

const PREVIEW_FPS = 8;
const PREVIEW_INTERVAL_MS = 1000 / PREVIEW_FPS;

const videoEl = document.querySelector<HTMLVideoElement>('#preview-video')!;
const overlayCanvas = document.querySelector<HTMLCanvasElement>('#overlay-canvas')!;
const resultCanvas = document.querySelector<HTMLCanvasElement>('#result-canvas')!;
const modelSelect = document.querySelector<HTMLSelectElement>('#model-select')!;
const switchCameraBtn = document.querySelector<HTMLButtonElement>('#switch-camera-btn')!;
const captureBtn = document.querySelector<HTMLButtonElement>('#capture-btn')!;
const invertCheckbox = document.querySelector<HTMLInputElement>('#invert-mask')!;
const denoiseCheckbox = document.querySelector<HTMLInputElement>('#denoise')!;
const previewLabel = document.querySelector<HTMLParagraphElement>('#preview-label')!;
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

/** 生のカテゴリマスクにノイズ処理・ラベリングを適用する。 */
function runMaskPipeline(
  categoryData: Uint8Array,
  maskWidth: number,
  maskHeight: number,
): ProcessedMask {
  return processMask(categoryData, maskWidth, maskHeight, isPerson, {
    targetWidth: 256,
    morphologyIterations: 1,
    minAreaRatio: 0.005,
    humanEvidenceCategories: segmenter.humanEvidenceCategories,
  });
}

/** 二値マスクを半透明色で overlay に塗る。 */
function drawBinaryOverlay(binary: Uint8Array, width: number, height: number): void {
  if (overlayCanvas.width !== width || overlayCanvas.height !== height) {
    overlayCanvas.width = width;
    overlayCanvas.height = height;
  }
  const ctx = overlayCanvas.getContext('2d');
  if (!ctx) return;

  const image = ctx.createImageData(width, height);
  const pixels = image.data;

  for (let i = 0; i < binary.length; i += 1) {
    const offset = i * 4;
    if (binary[i] === 1) {
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
  ctx.clearRect(0, 0, width, height);
  ctx.putImageData(image, 0, 0);
}

/** ノイズ処理をかけずに、生のカテゴリマスクをそのまま二値化して塗る。 */
function drawRawOverlay(categoryData: Uint8Array, width: number, height: number): void {
  const binary = new Uint8Array(categoryData.length);
  for (let i = 0; i < categoryData.length; i += 1) {
    binary[i] = isPerson(categoryData[i]!) ? 1 : 0;
  }
  drawBinaryOverlay(binary, width, height);
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
    if (denoiseCheckbox.checked) {
      const processed = runMaskPipeline(data, mask.width, mask.height);
      drawBinaryOverlay(processed.mask.data, processed.mask.width, processed.mask.height);
      previewLabel.textContent = `プレビュー + マスク重畳（かたまり ${processed.accepted.length}個）`;
    } else {
      drawRawOverlay(data, mask.width, mask.height);
      previewLabel.textContent = 'プレビュー + マスク重畳（ノイズ処理なし）';
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

    // ノイズ処理を通す場合は縮小済みマスクを、通さない場合は生マスクを参照する
    const processed = denoiseCheckbox.checked
      ? runMaskPipeline(categoryData, mask.width, mask.height)
      : null;
    const refData = processed ? processed.mask.data : categoryData;
    const refWidth = processed ? processed.mask.width : mask.width;
    const refHeight = processed ? processed.mask.height : mask.height;

    // マスク解像度と撮影解像度が異なるため、最近傍でサンプリングする
    for (let y = 0; y < height; y += 1) {
      const refY = Math.min(refHeight - 1, Math.floor((y / height) * refHeight));
      for (let x = 0; x < width; x += 1) {
        const refX = Math.min(refWidth - 1, Math.floor((x / width) * refWidth));
        const value = refData[refY * refWidth + refX]!;
        const keep = processed ? value === 1 : isPerson(value);
        if (!keep) continue;

        const offset = (y * width + x) * 4;
        personPixels += 1;
        cutout.data[offset] = source.data[offset]!;
        cutout.data[offset + 1] = source.data[offset + 1]!;
        cutout.data[offset + 2] = source.data[offset + 2]!;
        cutout.data[offset + 3] = 255;
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

    if (processed) {
      const rejected =
        processed.rejectedByEvidence.length > 0
          ? ` / 服だけの塊として除外 ${processed.rejectedByEvidence.length}件`
          : '';
      log(
        `検出した塊: ${processed.accepted.length}個` +
          ` (小さすぎて除外 ${processed.rejectedBySize.length}件${rejected})`,
      );
    }
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
    const evidence = segmenter.humanEvidenceCategories
      ? '服だけの塊を除外できます'
      : 'カテゴリを区別できないため服だけの塊は除外できません';
    log(`モデル読み込み完了: ${modelId} / delegate=${segmenter.currentDelegate} / ${elapsed}ms`);
    log(`このモデルは${evidence}。`);
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
