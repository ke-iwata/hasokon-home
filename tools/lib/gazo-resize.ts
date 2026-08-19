/**
 * 画像リサイズ・圧縮のロジック
 *
 * 仕様: docs/features/gazo-resize-asshuku.md
 *
 * **ここには Canvas も DOM も出てこない。** 実際の描画・エンコードはブラウザに
 * 任せ、寸法の決め方・多段縮小の刻み方・目標サイズへ寄せる二分探索・
 * EXIF の向きの読み取りだけを純関数として切り出してある
 * （描画結果そのものはブラウザ依存で、テストで固定できないため）。
 *
 * 画像そのものは利用者の端末から出ない。この設計を保つため、
 * ここに「送信する」処理を足さないこと。
 */

/** 出力できる形式。`canvas.toBlob` が扱えるものだけに絞っている */
export type OutputFormat = 'jpeg' | 'png' | 'webp';

/**
 * リサイズの指定方法。
 *
 * - `none` … 大きさは変えない（形式変換・圧縮だけしたいとき）
 * - `dimensions` … 幅・高さで指定する（比率固定が既定）
 * - `percent` … 元のサイズに対する割合で指定する
 * - `longEdge` … 長辺（幅と高さの大きいほう）の px で指定する
 */
export type ResizeMode = 'none' | 'dimensions' | 'percent' | 'longEdge';

/** 画像の寸法（px） */
export interface Size {
  width: number;
  height: number;
}

/** リサイズの指定 */
export interface ResizeSpec {
  mode: ResizeMode;
  /** `dimensions` の幅（px）。未指定なら高さから比率で決まる */
  width?: number | null;
  /** `dimensions` の高さ（px）。未指定なら幅から比率で決まる */
  height?: number | null;
  /** `percent` の割合（%）。100 で等倍 */
  percent?: number | null;
  /** `longEdge` の長辺（px） */
  longEdge?: number | null;
  /**
   * 比率を固定するか（既定 true）。
   * `dimensions` で幅と高さの両方を指定したとき、true なら指定の枠に**収まる**
   * 最大の大きさ（縦横比は保つ）、false なら指定どおりに引き伸ばす。
   */
  keepRatio?: boolean;
  /** 元より大きくしないか（既定 true）。拡大は画質が上がらないので既定で止める */
  noUpscale?: boolean;
}

/** 1ファイルあたりの上限。まとめて処理するときのメモリを現実的な範囲に収める */
export const MAX_FILES = 20;

/** 目標ファイルサイズの二分探索で使う品質の下限・上限 */
export const QUALITY_MIN = 0.3;
export const QUALITY_MAX = 0.95;

/** 品質スライダーの既定値。JPEG でおおむね見分けが付かない水準 */
export const DEFAULT_QUALITY = 0.82;

/** 読み込める入力の MIME タイプ */
export const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
] as const;

/** 入力として受け付ける形式か。HEIC はブラウザ対応が割れるので初版では受け付けない */
export function isSupportedType(type: string): boolean {
  return (ACCEPTED_TYPES as readonly string[]).includes(type.toLowerCase());
}

/** 出力形式の MIME タイプ */
export function mimeTypeFor(format: OutputFormat): string {
  return `image/${format}`;
}

/** 品質（0〜1）を指定できる形式か。PNG はロスレスなので指定しても効かない */
export function supportsQuality(format: OutputFormat): boolean {
  return format === 'jpeg' || format === 'webp';
}

/** 出力形式の拡張子 */
export function extensionFor(format: OutputFormat): string {
  return format === 'jpeg' ? 'jpg' : format;
}

/**
 * 保存するときのファイル名。
 *
 * 元のファイル名に `-resized` を足す。同じ形式で保存したときに
 * ダウンロードフォルダで元のファイルと取り違えないようにするため。
 */
export function outputFileName(originalName: string, format: OutputFormat): string {
  const dot = originalName.lastIndexOf('.');
  // 先頭のドット（`.gitignore` のような名前）は拡張子ではないので落とさない
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  const safe = base.trim() === '' ? 'image' : base;
  return `${safe}-resized.${extensionFor(format)}`;
}

/** 寸法として使える値か */
function isValidSize(size: Size): boolean {
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  );
}

/** px に丸める。0px の画像は作れないので最低1pxにする */
function toPixels(value: number): number {
  return Math.max(1, Math.round(value));
}

/**
 * リサイズ後の寸法を求める。
 *
 * 無効な入力（元サイズが0以下、指定が空・0以下）は null を返す。
 * 呼び出し側は null のときリサイズなしとして扱わず、「指定が足りない」と表示すること。
 *
 * @example
 * computeTargetSize({ width: 4000, height: 3000 }, { mode: 'longEdge', longEdge: 1600 })
 * // → { width: 1600, height: 1200 }
 */
export function computeTargetSize(source: Size, spec: ResizeSpec): Size | null {
  if (!isValidSize(source)) return null;

  const keepRatio = spec.keepRatio ?? true;
  const noUpscale = spec.noUpscale ?? true;
  const clamp = (size: Size): Size =>
    noUpscale
      ? {
          width: Math.min(size.width, source.width),
          height: Math.min(size.height, source.height),
        }
      : size;

  switch (spec.mode) {
    case 'none':
      return { width: source.width, height: source.height };

    case 'percent': {
      const percent = spec.percent;
      if (percent == null || !Number.isFinite(percent) || percent <= 0) return null;
      const scale = percent / 100;
      return clamp({
        width: toPixels(source.width * scale),
        height: toPixels(source.height * scale),
      });
    }

    case 'longEdge': {
      const longEdge = spec.longEdge;
      if (longEdge == null || !Number.isFinite(longEdge) || longEdge <= 0) return null;
      const scale = longEdge / Math.max(source.width, source.height);
      return clamp({
        width: toPixels(source.width * scale),
        height: toPixels(source.height * scale),
      });
    }

    case 'dimensions': {
      const width = spec.width != null && Number.isFinite(spec.width) && spec.width > 0 ? spec.width : null;
      const height =
        spec.height != null && Number.isFinite(spec.height) && spec.height > 0 ? spec.height : null;
      if (width === null && height === null) return null;

      if (!keepRatio) {
        // 比率を固定しないときは、片方だけの指定は「もう片方はそのまま」の意味になる
        return clamp({
          width: toPixels(width ?? source.width),
          height: toPixels(height ?? source.height),
        });
      }
      if (width !== null && height !== null) {
        // 両方あるときは指定の枠に収める（はみ出す辺が出ないほうの倍率を採る）
        const scale = Math.min(width / source.width, height / source.height);
        return clamp({
          width: toPixels(source.width * scale),
          height: toPixels(source.height * scale),
        });
      }
      if (width !== null) {
        return clamp({
          width: toPixels(width),
          height: toPixels((width * source.height) / source.width),
        });
      }
      const h = height as number;
      return clamp({
        width: toPixels((h * source.width) / source.height),
        height: toPixels(h),
      });
    }
  }
}

/**
 * 多段縮小の途中サイズ（最後の要素が目標サイズ）。
 *
 * 一度に大きく縮めると、間引かれた画素の情報が捨てられてジャギーやモアレが出る。
 * `createImageBitmap` の `resizeQuality: 'high'` が使えない環境では、
 * **半分ずつ寄せてから最後に目標サイズへ**縮めることで同等の滑らかさを得る。
 *
 * 拡大するときや2倍以内の縮小は刻む意味がないので、目標サイズ1つだけを返す。
 */
export function downscaleSteps(source: Size, target: Size): Size[] {
  if (!isValidSize(source) || !isValidSize(target)) return [];

  const steps: Size[] = [];
  let current = { width: source.width, height: source.height };
  // 半分にしても目標より大きいあいだは刻む。上限は念のための無限ループ避け
  while (
    steps.length < 16 &&
    (Math.floor(current.width / 2) > target.width || Math.floor(current.height / 2) > target.height)
  ) {
    current = {
      width: Math.max(target.width, Math.floor(current.width / 2)),
      height: Math.max(target.height, Math.floor(current.height / 2)),
    };
    steps.push(current);
  }
  steps.push({ width: target.width, height: target.height });
  return steps;
}

/** 目標ファイルサイズを探すときの調整 */
export interface QualitySearchOptions {
  /** 品質の下限（既定 QUALITY_MIN） */
  min?: number;
  /** 品質の上限（既定 QUALITY_MAX） */
  max?: number;
  /** 二分探索の回数（既定 6）。1回ごとにエンコードが走るので増やしすぎない */
  steps?: number;
}

/** 二分探索の結果 */
export interface QualitySearchResult {
  /** 採用した品質（0〜1） */
  quality: number;
  /** そのときのバイト数 */
  size: number;
  /** 目標サイズ以下に収まったか。false なら下限品質でも届かなかった */
  reached: boolean;
  /** エンコードを試した回数（進捗表示用） */
  attempts: number;
}

/** 品質は小数第2位までに丸める。細かく刻んでもファイルサイズはほとんど動かない */
function quantize(quality: number): number {
  return Math.round(quality * 100) / 100;
}

/**
 * 「目標ファイルサイズ（バイト）以下」に収まる**いちばん高い品質**を二分探索する。
 *
 * エンコードは呼び出し側（`canvas.toBlob`）に任せ、ここは品質→バイト数の
 * 関数として受け取る。品質を上げるとサイズが増えるという単調性だけを前提にしている。
 *
 * 収束の条件はこの3つ。
 *
 * 1. 上限品質で既に目標以下 → そのまま採用（無駄に品質を下げない）
 * 2. 下限品質でも目標を超える → 下限品質の結果を `reached: false` で返す
 *    （「これ以上小さくできない」ことを画面で伝えるため。勝手に寸法は縮めない）
 * 3. それ以外 → `steps` 回だけ半分に割り、**目標以下だった中で最も高い品質**を返す
 */
export async function searchQualityForTargetSize(
  measure: (quality: number) => number | Promise<number>,
  targetBytes: number,
  options: QualitySearchOptions = {},
): Promise<QualitySearchResult> {
  const min = quantize(options.min ?? QUALITY_MIN);
  const max = quantize(options.max ?? QUALITY_MAX);
  const steps = options.steps ?? 6;
  let attempts = 0;

  const sizeAtMax = await measure(max);
  attempts++;
  if (sizeAtMax <= targetBytes) {
    return { quality: max, size: sizeAtMax, reached: true, attempts };
  }

  const sizeAtMin = await measure(min);
  attempts++;
  if (sizeAtMin > targetBytes) {
    return { quality: min, size: sizeAtMin, reached: false, attempts };
  }

  let lo = min;
  let hi = max;
  let best: { quality: number; size: number } = { quality: min, size: sizeAtMin };

  for (let i = 0; i < steps; i++) {
    const mid = quantize((lo + hi) / 2);
    // 刻めなくなったら終わり（品質は小数第2位までしか区別しない）
    if (mid <= lo || mid >= hi) break;
    const size = await measure(mid);
    attempts++;
    if (size <= targetBytes) {
      best = { quality: mid, size };
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return { ...best, reached: true, attempts };
}

/** KB 表記の目標サイズをバイトに直す（1KB = 1024バイト） */
export function kilobytesToBytes(kb: number): number {
  return Math.max(1, Math.round(kb * 1024));
}

/**
 * バイト数を読みやすく整える。
 * 1024で割り、1000未満は整数、それ以上は小数第1位まで出す。
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 100 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 100 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * 削減率（%）。処理後のほうが大きくなったときは負の数を返す。
 * 「軽くならなかった」ことを隠さないため、0で下限を切らない。
 */
export function reductionPercent(before: number, after: number): number {
  if (!Number.isFinite(before) || before <= 0 || !Number.isFinite(after) || after < 0) return 0;
  return Math.round(((before - after) / before) * 1000) / 10;
}

/* ------------------------------------------------------------------ *
 * EXIF（撮影時のメタデータ）
 * ------------------------------------------------------------------ */

/**
 * EXIF の回転向き（Orientation, タグ 0x0112）を JPEG のバイト列から読む。
 *
 * Canvas で描き直すと EXIF は結果として消える（位置情報も撮影日時も残らない）。
 * ただし**向きだけは消えると困る**。スマホで縦に撮った写真は、画素としては
 * 横向きに保存されていて「向きは EXIF を見て回してね」という作りになっているため、
 * 読まずに描くと横倒しの画像が出来上がる。
 *
 * @returns 1〜8 の値。EXIF が無い・壊れている・JPEG でないときは null
 */
export function readExifOrientation(bytes: Uint8Array): number | null {
  // JPEG は必ず SOI（0xFFD8）で始まる
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null; // マーカーの並びが壊れている
    const marker = bytes[offset + 1];
    // SOS（画像データの開始）まで来たら、以降にメタデータは無い
    if (marker === 0xda || marker === 0xd9) return null;
    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (segmentLength < 2) return null;

    if (marker === 0xe1) {
      const app1 = offset + 4;
      // "Exif\0\0" で始まる APP1 だけが EXIF（XMP など別物の APP1 もある）
      const isExif =
        app1 + 6 <= bytes.length &&
        bytes[app1] === 0x45 &&
        bytes[app1 + 1] === 0x78 &&
        bytes[app1 + 2] === 0x69 &&
        bytes[app1 + 3] === 0x66 &&
        bytes[app1 + 4] === 0x00;
      if (isExif) {
        const orientation = readOrientationFromTiff(bytes, app1 + 6);
        if (orientation !== null) return orientation;
      }
    }
    offset += 2 + segmentLength;
  }
  return null;
}

/** APP1 の中の TIFF ヘッダから IFD0 を辿って Orientation を探す */
function readOrientationFromTiff(bytes: Uint8Array, tiffStart: number): number | null {
  if (tiffStart + 8 > bytes.length) return null;
  // バイト順は "II"（リトルエンディアン）か "MM"（ビッグエンディアン）
  const little =
    bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49
      ? true
      : bytes[tiffStart] === 0x4d && bytes[tiffStart + 1] === 0x4d
        ? false
        : null;
  if (little === null) return null;

  const u16 = (at: number): number =>
    little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1];
  const u32 = (at: number): number =>
    little
      ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
      : ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

  if (u16(tiffStart + 2) !== 0x002a) return null; // TIFF の目印（42）
  const ifdOffset = u32(tiffStart + 4);
  const ifd = tiffStart + ifdOffset;
  if (ifd + 2 > bytes.length) return null;

  const entries = u16(ifd);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > bytes.length) return null;
    if (u16(entry) !== 0x0112) continue;
    // 値は SHORT 1個。12バイトのエントリの後ろ4バイトに直接入っている
    const value = u16(entry + 8);
    return value >= 1 && value <= 8 ? value : null;
  }
  return null;
}

/** EXIF の向きを描画の操作に読み替えたもの */
export interface OrientationTransform {
  /** 時計回りの回転角（度） */
  rotate: 0 | 90 | 180 | 270;
  /** 左右反転するか（鏡像で保存されている場合） */
  flipX: boolean;
  /** 縦横が入れ替わるか（90度・270度回転のとき true） */
  swapsAxes: boolean;
}

/**
 * EXIF の向き（1〜8）を、描画で行う回転・反転に読み替える。
 * 範囲外・null は「そのまま」（回転なし）として扱う。
 */
export function orientationTransform(orientation: number | null): OrientationTransform {
  switch (orientation) {
    case 2:
      return { rotate: 0, flipX: true, swapsAxes: false };
    case 3:
      return { rotate: 180, flipX: false, swapsAxes: false };
    case 4:
      return { rotate: 180, flipX: true, swapsAxes: false };
    case 5:
      return { rotate: 90, flipX: true, swapsAxes: true };
    case 6:
      return { rotate: 90, flipX: false, swapsAxes: true };
    case 7:
      return { rotate: 270, flipX: true, swapsAxes: true };
    case 8:
      return { rotate: 270, flipX: false, swapsAxes: true };
    default:
      return { rotate: 0, flipX: false, swapsAxes: false };
  }
}

/** EXIF の向きを反映したあとの見た目上の寸法（90度・270度なら縦横が入れ替わる） */
export function orientedSize(size: Size, orientation: number | null): Size {
  return orientationTransform(orientation).swapsAxes
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height };
}
