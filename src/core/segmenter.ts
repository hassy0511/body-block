// MediaPipe Image Segmenter 呼び出し。SPEC.md §2.2, §2.3 参照。
//
// WASM ランタイムとモデル資産(.tflite)は Google 公式 CDN から取得する。
// これは MediaPipe のコード/学習済みモデルという「公開データ」を取得しているだけで、
// ユーザーのカメラ画像・切り抜き結果を外部へ送信するものではない(SPEC.md §2.1 に抵触しない)。
import {
  FilesetResolver,
  ImageSegmenter,
  type ImageSegmenterResult,
} from '@mediapipe/tasks-vision';

const TASKS_VISION_VERSION = '0.10.35';
const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;

export type SegmenterModelId = 'selfie' | 'multiclass';

const MODEL_ASSET_URLS: Record<SegmenterModelId, string> = {
  // 近距離・単純背景向け。カテゴリは背景(0) / 人物(1) の2値。
  selfie:
    'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
  // 背景(0) / 髪(1) / 肌(2) / 顔(3) / 服(4) / その他(5) の6カテゴリ。
  multiclass:
    'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
};

export type SegmenterDelegate = 'GPU' | 'CPU';

/** カテゴリ値が「背景以外(=人物)」かどうか。両モデルとも 0 = 背景で共通。 */
export function isPersonCategory(categoryValue: number): boolean {
  return categoryValue !== 0;
}

export class PersonSegmenter {
  private segmenter: ImageSegmenter | null = null;
  private modelId: SegmenterModelId | null = null;
  private delegate: SegmenterDelegate | null = null;

  get currentModel(): SegmenterModelId | null {
    return this.modelId;
  }

  get currentDelegate(): SegmenterDelegate | null {
    return this.delegate;
  }

  /**
   * モデルを(再)ロードする。GPU delegate での初期化に失敗した場合は CPU にフォールバックする。
   */
  async loadModel(modelId: SegmenterModelId): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);

    this.segmenter?.close();
    this.segmenter = null;

    try {
      this.segmenter = await this.createSegmenter(vision, modelId, 'GPU');
      this.delegate = 'GPU';
    } catch {
      this.segmenter = await this.createSegmenter(vision, modelId, 'CPU');
      this.delegate = 'CPU';
    }

    this.modelId = modelId;
  }

  private createSegmenter(
    vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
    modelId: SegmenterModelId,
    delegate: SegmenterDelegate,
  ): Promise<ImageSegmenter> {
    return ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_ASSET_URLS[modelId],
        delegate,
      },
      runningMode: 'VIDEO',
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });
  }

  /** 静止画・動画フレームいずれも `HTMLVideoElement` / `HTMLCanvasElement` を渡せる。 */
  segment(source: HTMLVideoElement | HTMLCanvasElement, timestampMs: number): ImageSegmenterResult {
    if (!this.segmenter) {
      throw new Error('segmenter is not loaded yet. call loadModel() first.');
    }
    return this.segmenter.segmentForVideo(source, timestampMs);
  }

  dispose(): void {
    this.segmenter?.close();
    this.segmenter = null;
    this.modelId = null;
    this.delegate = null;
  }
}
