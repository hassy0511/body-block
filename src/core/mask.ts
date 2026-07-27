// マスクのノイズ処理・連結成分ラベリング・塊の分析。CLAUDE.md §2.2 参照。
//
// 生のセグメンテーション結果は輪郭がギザついたり小さなノイズ塊が乗るため、
// 縮小 → モルフォロジー処理 → ラベリング の順で整えてから使う。

/** 縮小後のカテゴリマップ。値はモデルのカテゴリ値をそのまま保持する。 */
export interface CategoryGrid {
  data: Uint8Array;
  width: number;
  height: number;
}

/** 0 = 背景 / 1 = 人物 の二値マスク。 */
export interface BinaryMask {
  data: Uint8Array;
  width: number;
  height: number;
}

/** 連結成分ラベリングで得られた塊ひとつ分の情報。 */
export interface MaskBlob {
  label: number;
  pixelCount: number;
  centroidX: number;
  centroidY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** この塊に含まれるカテゴリ値ごとのピクセル数。 */
  categoryCounts: Map<number, number>;
}

export interface LabelResult {
  /** 各ピクセルの所属ラベル。0 = どの塊にも属さない。 */
  labels: Int32Array;
  blobs: MaskBlob[];
  width: number;
  height: number;
}

/**
 * カテゴリマップを最近傍で縮小する。処理コストを抑えるため以降はこの解像度で扱う。
 * targetWidth より元が小さい場合はそのまま返す。
 */
export function downscaleCategories(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
): CategoryGrid {
  if (sourceWidth <= targetWidth) {
    return { data: source, width: sourceWidth, height: sourceHeight };
  }

  const width = targetWidth;
  const height = Math.max(1, Math.round((sourceHeight / sourceWidth) * targetWidth));
  const data = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor((y / height) * sourceHeight));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x / width) * sourceWidth));
      data[y * width + x] = source[sourceY * sourceWidth + sourceX]!;
    }
  }

  return { data, width, height };
}

/** カテゴリマップを人物判定関数で二値化する。 */
export function toBinaryMask(
  grid: CategoryGrid,
  isPerson: (categoryValue: number) => boolean,
): BinaryMask {
  const data = new Uint8Array(grid.width * grid.height);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = isPerson(grid.data[i]!) ? 1 : 0;
  }
  return { data, width: grid.width, height: grid.height };
}

/** 3x3 の膨張。 */
function dilate(mask: BinaryMask): BinaryMask {
  return applyMorphology(mask, 'dilate');
}

/** 3x3 の収縮。 */
function erode(mask: BinaryMask): BinaryMask {
  return applyMorphology(mask, 'erode');
}

function applyMorphology(mask: BinaryMask, mode: 'dilate' | 'erode'): BinaryMask {
  const { data, width, height } = mask;
  const out = new Uint8Array(data.length);
  // 膨張は「近傍に1があれば1」、収縮は「近傍に0があれば0」。
  // 画像の外側は背景(0)として扱う。
  const dilating = mode === 'dilate';

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let result = dilating ? 0 : 1;

      for (let dy = -1; dy <= 1 && result === (dilating ? 0 : 1); dy += 1) {
        const ny = y + dy;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const outside = nx < 0 || ny < 0 || nx >= width || ny >= height;
          const value = outside ? 0 : data[ny * width + nx]!;

          if (dilating && value === 1) {
            result = 1;
            break;
          }
          if (!dilating && value === 0) {
            result = 0;
            break;
          }
        }
      }

      out[y * width + x] = result;
    }
  }

  return { data: out, width, height };
}

/**
 * オープニング(収縮→膨張)。小さなノイズ塊を消す。
 */
export function morphologyOpen(mask: BinaryMask, iterations = 1): BinaryMask {
  let result = mask;
  for (let i = 0; i < iterations; i += 1) result = erode(result);
  for (let i = 0; i < iterations; i += 1) result = dilate(result);
  return result;
}

/**
 * クロージング(膨張→収縮)。輪郭の小さな欠けを埋める。
 */
export function morphologyClose(mask: BinaryMask, iterations = 1): BinaryMask {
  let result = mask;
  for (let i = 0; i < iterations; i += 1) result = dilate(result);
  for (let i = 0; i < iterations; i += 1) result = erode(result);
  return result;
}

/**
 * 8近傍の連結成分ラベリング(flood fill)。塊ごとに分割する = 人ごとの分離。
 * categories を渡すと塊ごとのカテゴリ内訳も集計する。
 */
export function labelBlobs(mask: BinaryMask, categories?: CategoryGrid): LabelResult {
  const { data, width, height } = mask;
  const labels = new Int32Array(width * height);
  const blobs: MaskBlob[] = [];
  // 再帰だと大きな塊でスタックが溢れるため明示的なスタックで探索する
  const stack: number[] = [];
  let nextLabel = 0;

  for (let start = 0; start < data.length; start += 1) {
    if (data[start] !== 1 || labels[start] !== 0) continue;

    nextLabel += 1;
    const categoryCounts = new Map<number, number>();
    let pixelCount = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    labels[start] = nextLabel;
    stack.push(start);

    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % width;
      const y = (index - x) / width;

      pixelCount += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      if (categories) {
        const category = categories.data[index]!;
        categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
      }

      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const neighbor = ny * width + nx;
          if (data[neighbor] !== 1 || labels[neighbor] !== 0) continue;
          labels[neighbor] = nextLabel;
          stack.push(neighbor);
        }
      }
    }

    blobs.push({
      label: nextLabel,
      pixelCount,
      centroidX: sumX / pixelCount,
      centroidY: sumY / pixelCount,
      minX,
      minY,
      maxX,
      maxY,
      categoryCounts,
    });
  }

  return { labels, blobs, width, height };
}

export interface BlobFilterOptions {
  /** 全体面積に対するこの割合より小さい塊を捨てる。 */
  minAreaRatio?: number;
  /**
   * 人物の根拠になるカテゴリ値(髪・肌・顔など)。
   * 指定した場合、これらを一切含まない塊は「人ではないもの」として捨てる。
   * 服だけの塊(ハンガーに掛かった上着など)を除外するのが狙い。
   */
  humanEvidenceCategories?: readonly number[] | null;
  /** 根拠カテゴリが塊に占める最低割合。 */
  minEvidenceRatio?: number;
}

export interface BlobFilterResult {
  accepted: MaskBlob[];
  rejectedBySize: MaskBlob[];
  rejectedByEvidence: MaskBlob[];
}

/**
 * 面積と「人である根拠」で塊を絞り込む。
 */
export function filterBlobs(
  blobs: MaskBlob[],
  totalPixels: number,
  options: BlobFilterOptions = {},
): BlobFilterResult {
  const { minAreaRatio = 0.005, humanEvidenceCategories, minEvidenceRatio = 0.02 } = options;
  const minPixels = totalPixels * minAreaRatio;

  const accepted: MaskBlob[] = [];
  const rejectedBySize: MaskBlob[] = [];
  const rejectedByEvidence: MaskBlob[] = [];

  for (const blob of blobs) {
    if (blob.pixelCount < minPixels) {
      rejectedBySize.push(blob);
      continue;
    }

    if (humanEvidenceCategories && humanEvidenceCategories.length > 0) {
      let evidencePixels = 0;
      for (const category of humanEvidenceCategories) {
        evidencePixels += blob.categoryCounts.get(category) ?? 0;
      }
      if (evidencePixels < blob.pixelCount * minEvidenceRatio) {
        rejectedByEvidence.push(blob);
        continue;
      }
    }

    accepted.push(blob);
  }

  // 重心の X 座標順(左にいた人 = P1)。CLAUDE.md §2.2 の所有権割り当てに合わせる。
  accepted.sort((a, b) => a.centroidX - b.centroidX);

  return { accepted, rejectedBySize, rejectedByEvidence };
}

export interface ProcessMaskOptions extends BlobFilterOptions {
  /** 縮小後の横幅。 */
  targetWidth?: number;
  /** オープニング・クロージングの繰り返し回数。 */
  morphologyIterations?: number;
}

export interface ProcessedMask {
  /** 採用された塊だけを残した二値マスク。 */
  mask: BinaryMask;
  /** 各ピクセルの所属ラベル(採用されなかった塊は 0)。 */
  labels: Int32Array;
  accepted: MaskBlob[];
  rejectedBySize: MaskBlob[];
  rejectedByEvidence: MaskBlob[];
}

/**
 * 生のカテゴリマスクから、ノイズを除去して人物の塊だけを残したマスクを作る。
 * CLAUDE.md §2.2 のパイプライン前半にあたる。
 */
export function processMask(
  categoryData: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  isPerson: (categoryValue: number) => boolean,
  options: ProcessMaskOptions = {},
): ProcessedMask {
  const { targetWidth = 256, morphologyIterations = 1, ...filterOptions } = options;

  const grid = downscaleCategories(categoryData, sourceWidth, sourceHeight, targetWidth);
  let mask = toBinaryMask(grid, isPerson);
  mask = morphologyOpen(mask, morphologyIterations);
  mask = morphologyClose(mask, morphologyIterations);

  const labeled = labelBlobs(mask, grid);
  const filtered = filterBlobs(labeled.blobs, mask.width * mask.height, filterOptions);

  const acceptedLabels = new Set(filtered.accepted.map((blob) => blob.label));
  const cleanedData = new Uint8Array(mask.data.length);
  const cleanedLabels = new Int32Array(mask.data.length);

  for (let i = 0; i < cleanedData.length; i += 1) {
    const label = labeled.labels[i]!;
    if (label !== 0 && acceptedLabels.has(label)) {
      cleanedData[i] = 1;
      cleanedLabels[i] = label;
    }
  }

  return {
    mask: { data: cleanedData, width: mask.width, height: mask.height },
    labels: cleanedLabels,
    accepted: filtered.accepted,
    rejectedBySize: filtered.rejectedBySize,
    rejectedByEvidence: filtered.rejectedByEvidence,
  };
}
