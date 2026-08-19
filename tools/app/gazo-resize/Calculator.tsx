'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeTargetSize,
  downscaleSteps,
  formatBytes,
  isSupportedType,
  kilobytesToBytes,
  MAX_FILES,
  mimeTypeFor,
  orientationToApply,
  orientationProbeBytes,
  orientationTransform,
  orientedSize,
  outputFileName,
  probeSaysBrowserApplies,
  visibleSize,
  QUALITY_MAX,
  QUALITY_MIN,
  DEFAULT_QUALITY,
  readExifOrientation,
  reductionPercent,
  searchQualityForTargetSize,
  supportsQuality,
  type OutputFormat,
  type ResizeMode,
  type ResizeSpec,
  type Size,
} from '@/lib/gazo-resize';
import { trackToolUse } from '@/lib/analytics';

/**
 * 画像リサイズ・圧縮のUI。
 *
 * **画像はどこにも送られない。** ファイルは `<input type="file">` から
 * `createImageBitmap` に渡してブラウザ内で描き直しているだけで、
 * ネットワークに出す処理はこのファイルにも lib にも無い。
 *
 * 寸法の決め方・多段縮小の刻み・目標サイズの二分探索は `lib/gazo-resize.ts`
 * の純関数に置いてある（ここは入力と表示だけ）。
 */

/** 出力形式の選択。`auto` は入力と同じ形式を保つ */
type FormatChoice = 'auto' | OutputFormat;

/** 圧縮の指定方法 */
type CompressMode = 'quality' | 'targetSize';

interface Result {
  blob: Blob;
  /** プレビュー用のURL（差し替え・破棄のときに revoke する） */
  url: string;
  size: Size;
  format: OutputFormat;
  /** 採用した品質。PNG など品質を持たない形式では null */
  quality: number | null;
  /** 目標サイズを指定したとき、そこに収まったか */
  reachedTarget: boolean;
}

interface Item {
  id: string;
  file: File;
  /** EXIF の向きを反映した見た目上の元サイズ。読み込み前は null */
  source: Size | null;
  status: 'loading' | 'ready' | 'working' | 'done' | 'error';
  message?: string;
  result?: Result;
}

/** 入力の MIME から、そのまま保ったときの出力形式を決める */
function keepFormat(type: string): OutputFormat {
  const lower = type.toLowerCase();
  if (lower === 'image/png') return 'png';
  if (lower === 'image/webp') return 'webp';
  if (lower === 'image/jpeg') return 'jpeg';
  // GIF・BMP は toBlob で出せないので PNG にする（透過を落とさないため）
  return 'png';
}

/** canvas を作る。0pxのcanvasは描画できないので最低1pxにしてある */
function createCanvas(size: Size): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, size.width);
  canvas.height = Math.max(1, size.height);
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('このブラウザでは画像を処理できません（Canvasが使えません）');
  return ctx;
}

/**
 * EXIF の向きを反映して描き起こす。
 *
 * 変換は「回転 → 左右反転 → 中央へ移動」の順に効く（Canvas は後に呼んだ変換ほど
 * 描画対象の近くに掛かる）。ここで描き直した時点で EXIF は結果として消え、
 * 位置情報も撮影日時も出力には残らない。
 *
 * 渡すのは「**こちらで掛けるべき**向き」（`orientationToApply()` の戻り値）。
 * ブラウザが復号時に既に反映している場合は 1 が渡り、ここでは何もしない。
 */
function drawOriented(bitmap: ImageBitmap, orientation: number | null): HTMLCanvasElement {
  const transform = orientationTransform(orientation);
  const size = orientedSize({ width: bitmap.width, height: bitmap.height }, orientation);
  const canvas = createCanvas(size);
  const ctx = context2d(canvas);
  ctx.translate(size.width / 2, size.height / 2);
  if (transform.flipX) ctx.scale(-1, 1);
  if (transform.rotate !== 0) ctx.rotate((transform.rotate * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  return canvas;
}

/** 多段縮小。1回で大きく縮めるとジャギー・モアレが出るので半分ずつ寄せる */
function drawResized(source: HTMLCanvasElement, target: Size): HTMLCanvasElement {
  let current = source;
  for (const step of downscaleSteps({ width: source.width, height: source.height }, target)) {
    if (step.width === current.width && step.height === current.height) continue;
    const canvas = createCanvas(step);
    const ctx = context2d(canvas);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, step.width, step.height);
    current = canvas;
  }
  return current;
}

/** canvas.toBlob の Promise 版 */
function encode(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('画像を書き出せませんでした'))),
      mime,
      quality,
    );
  });
}

/**
 * このブラウザの `createImageBitmap()` が EXIF の向きを自分で反映するか。
 *
 * **オプション（`imageOrientation`）は信用できない。** Chromium は 141 の時点でも
 * `'none'` を無視して常に EXIF を反映して返す（whatwg/html#7210）。
 * 反映済みの画像にこちらでも回転を掛けると二重補正になり、縦撮りの写真が
 * かえって横倒しになるため、判定用の極小JPEG（画素2×1・Orientation=6）を
 * 1度だけ復号して実際の挙動を見る。結果はタブの生存中ずっと変わらないので使い回す。
 */
let orientationProbe: Promise<boolean> | null = null;
function browserAppliesExifOrientation(): Promise<boolean> {
  orientationProbe ??= (async () => {
    try {
      const blob = new Blob([orientationProbeBytes()], { type: 'image/jpeg' });
      const bitmap = await createImageBitmap(blob);
      const applies = probeSaysBrowserApplies({ width: bitmap.width, height: bitmap.height });
      bitmap.close();
      return applies;
    } catch {
      // 判定できないときは「ブラウザに任せる」側に倒す。
      // 二重に回して壊すより、回さずに元のまま出すほうが実害が小さい
      return true;
    }
  })();
  return orientationProbe;
}

/** ブラウザにファイルを保存させる。生成物は手元にしかないので送信は起きない */
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const buttonStyle = (enabled: boolean, primary = false): React.CSSProperties => ({
  padding: primary ? '10px 22px' : '6px 14px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  fontSize: 'var(--fs-sm)',
  fontWeight: 600,
  cursor: enabled ? 'pointer' : 'default',
  opacity: enabled ? 1 : 0.5,
});

const MODE_LABEL: Record<ResizeMode, string> = {
  dimensions: '幅・高さで指定',
  percent: 'パーセントで指定',
  longEdge: '長辺で指定',
  none: '変えない（圧縮・変換だけ）',
};

export default function Calculator() {
  const [items, setItems] = useState<Item[]>([]);
  const [mode, setMode] = useState<ResizeMode>('longEdge');
  const [width, setWidth] = useState('1280');
  const [height, setHeight] = useState('');
  const [percent, setPercent] = useState('50');
  const [longEdge, setLongEdge] = useState('1600');
  const [keepRatio, setKeepRatio] = useState(true);
  const [format, setFormat] = useState<FormatChoice>('auto');
  const [compressMode, setCompressMode] = useState<CompressMode>('quality');
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [targetKb, setTargetKb] = useState('300');
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  // 作ったプレビュー用URLはすべてここに集めて、破棄漏れが起きないようにする
  const urls = useRef<string[]>([]);

  const releaseUrls = useCallback(() => {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current = [];
  }, []);

  useEffect(() => releaseUrls, [releaseUrls]);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const incoming = Array.from(files);
      const supported = incoming.filter((file) => isSupportedType(file.type));
      const rejected = incoming.length - supported.length;

      // 上限は「いま並んでいる枚数」から決める。id はここで振り、
      // 読み込みが終わったときは id で該当の行だけを差し替える
      const room = Math.max(0, MAX_FILES - items.length);
      const accepted = supported.slice(0, room);
      const overflow = supported.length - accepted.length;
      const added: Item[] = accepted.map((file) => ({
        id: `f${nextId.current++}`,
        file,
        source: null,
        status: 'loading',
      }));
      setItems((prev) => [...prev, ...added]);

      const messages: string[] = [];
      if (rejected > 0) {
        messages.push(
          `${rejected}件は対応していない形式のため読み込みませんでした（JPEG・PNG・WebP・GIF・BMPに対応。HEICは未対応です）。`,
        );
      }
      if (overflow > 0) {
        messages.push(`一度に処理できるのは${MAX_FILES}枚までです（${overflow}件は追加していません）。`);
      }
      setNotice(messages.length > 0 ? messages.join(' ') : null);

      // 元の寸法を先に出しておく（処理前に「何px→何px」が見えるように）
      for (const entry of added) {
        try {
          const bitmap = await createImageBitmap(entry.file);
          const orientation = await readOrientation(entry.file);
          const size = visibleSize(
            { width: bitmap.width, height: bitmap.height },
            orientation,
            await browserAppliesExifOrientation(),
          );
          bitmap.close();
          setItems((prev) =>
            prev.map((item) =>
              item.id === entry.id ? { ...item, source: size, status: 'ready' } : item,
            ),
          );
        } catch {
          setItems((prev) =>
            prev.map((item) =>
              item.id === entry.id
                ? { ...item, status: 'error', message: '画像として読み込めませんでした' }
                : item,
            ),
          );
        }
      }
    },
    [items.length],
  );

  const spec: ResizeSpec = {
    mode,
    width: width === '' ? null : Number(width),
    height: height === '' ? null : Number(height),
    percent: percent === '' ? null : Number(percent),
    longEdge: longEdge === '' ? null : Number(longEdge),
    keepRatio,
  };

  const targetBytes = targetKb === '' ? null : kilobytesToBytes(Number(targetKb));

  /** 1枚を処理する。ここが実際の描画とエンコード */
  const processItem = async (item: Item): Promise<Result> => {
    const orientation = await readOrientation(item.file);
    const applies = await browserAppliesExifOrientation();
    const bitmap = await createImageBitmap(item.file);
    try {
      // ブラウザが既に向きを直しているなら、ここでは回さない（二重補正を避ける）
      const oriented = drawOriented(bitmap, orientationToApply(orientation, applies));
      const target = computeTargetSize(
        { width: oriented.width, height: oriented.height },
        spec,
      );
      if (target === null) throw new Error('リサイズの大きさを入力してください');

      const canvas = drawResized(oriented, target);
      const outFormat: OutputFormat = format === 'auto' ? keepFormat(item.file.type) : format;
      const mime = mimeTypeFor(outFormat);

      let blob: Blob;
      let usedQuality: number | null = null;
      let reachedTarget = true;

      if (!supportsQuality(outFormat)) {
        // PNG はロスレス。品質を渡しても効かないので渡さない
        blob = await encode(canvas, mime);
      } else if (compressMode === 'targetSize' && targetBytes !== null) {
        // 品質→バイト数だけを lib の二分探索に渡す。エンコード結果は使い回す
        const cache = new Map<number, Blob>();
        const search = await searchQualityForTargetSize(async (q) => {
          const encoded = await encode(canvas, mime, q);
          cache.set(q, encoded);
          return encoded.size;
        }, targetBytes);
        blob = cache.get(search.quality) ?? (await encode(canvas, mime, search.quality));
        usedQuality = search.quality;
        reachedTarget = search.reached;
      } else {
        blob = await encode(canvas, mime, quality);
        usedQuality = quality;
      }

      // WebP の書き出しに対応していないブラウザは、黙って PNG を返してくる
      const actual: OutputFormat =
        blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpeg' : 'png';
      const url = URL.createObjectURL(blob);
      urls.current.push(url);

      return {
        blob,
        url,
        size: { width: canvas.width, height: canvas.height },
        format: actual,
        quality: supportsQuality(actual) ? usedQuality : null,
        reachedTarget,
      };
    } finally {
      bitmap.close();
    }
  };

  const onRun = async () => {
    // 読み込みに失敗したものは処理しない（`canRun` の判定と揃える）
    const targets = items.filter((item) => item.status !== 'error');
    if (running || targets.length === 0) return;
    setRunning(true);
    releaseUrls();
    const ids = new Set(targets.map((item) => item.id));
    setItems((prev) =>
      prev.map((item) =>
        ids.has(item.id)
          ? { ...item, status: 'working', result: undefined, message: undefined }
          : item,
      ),
    );
    trackToolUse('gazo-resize', `run-${mode}`);

    // 1枚ずつ順番に処理する。大きな画像を同時に展開するとメモリを使い切るため
    for (const item of targets) {
      try {
        const result = await processItem(item);
        setItems((prev) =>
          prev.map((entry) => (entry.id === item.id ? { ...entry, status: 'done', result } : entry)),
        );
      } catch (error) {
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: 'error',
                  message: error instanceof Error ? error.message : '処理に失敗しました',
                }
              : entry,
          ),
        );
      }
    }
    setRunning(false);
  };

  const onDownloadAll = async () => {
    const done = items.filter((item) => item.result);
    for (const item of done) {
      if (!item.result) continue;
      download(item.result.blob, outputFileName(item.file.name, item.result.format));
      // 連続ダウンロードはブラウザに間引かれることがあるので少し間を空ける
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    trackToolUse('gazo-resize', 'download-all');
  };

  const onClear = () => {
    releaseUrls();
    setItems([]);
    setNotice(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const doneCount = items.filter((item) => item.status === 'done').length;
  const canRun = !running && items.some((item) => item.status !== 'loading' && item.status !== 'error');

  return (
    <div className="card">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
        }}
        style={{
          border: `2px dashed ${dragging ? 'var(--accent, #4a6cf7)' : 'var(--border)'}`,
          borderRadius: 12,
          padding: '22px 16px',
          textAlign: 'center',
          background: dragging ? 'var(--surface)' : 'transparent',
        }}
      >
        <p style={{ margin: '0 0 10px' }}>
          <strong>画像をここにドラッグ&ドロップ</strong>（最大{MAX_FILES}枚）
        </p>
        <input
          ref={inputRef}
          id="gazo-files"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
          multiple
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) void addFiles(e.target.files);
          }}
          style={{ width: 'auto' }}
        />
        <p className="hint" style={{ marginBottom: 0 }}>
          選んだ画像は<strong>アップロードされません</strong>。
          お使いのブラウザの中だけで縮小・圧縮され、当サイトのサーバーには何も送られません。
        </p>
      </div>

      {notice && <div className="note">{notice}</div>}

      <div className="field" style={{ marginTop: 18 }}>
        <label htmlFor="gazo-mode">大きさの指定</label>
        <select
          id="gazo-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as ResizeMode)}
          style={{ maxWidth: 320 }}
        >
          {(Object.keys(MODE_LABEL) as ResizeMode[]).map((value) => (
            <option key={value} value={value}>
              {MODE_LABEL[value]}
            </option>
          ))}
        </select>
      </div>

      {mode === 'dimensions' && (
        <>
          <div className="field-row">
            <label>
              幅（px）
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder="例: 1280"
              />
            </label>
            <label>
              高さ（px）
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="空欄なら比率から自動"
              />
            </label>
          </div>
          <div className="field">
            <label style={{ fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={keepRatio}
                onChange={(e) => setKeepRatio(e.target.checked)}
                style={{ width: 'auto', marginRight: 6 }}
              />
              縦横の比率を保つ（両方入れたときは、その枠に収まる大きさにします）
            </label>
          </div>
        </>
      )}

      {mode === 'percent' && (
        <div className="field">
          <label htmlFor="gazo-percent">元のサイズに対する割合（%）</label>
          <input
            id="gazo-percent"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            style={{ maxWidth: 200 }}
          />
        </div>
      )}

      {mode === 'longEdge' && (
        <div className="field">
          <label htmlFor="gazo-long-edge">長辺（px）</label>
          <input
            id="gazo-long-edge"
            type="number"
            inputMode="numeric"
            min={1}
            value={longEdge}
            onChange={(e) => setLongEdge(e.target.value)}
            style={{ maxWidth: 200 }}
          />
          <p className="hint">
            縦の写真も横の写真もまとめて同じ大きさに揃えたいときに向いています（長いほうの辺を合わせます）。
          </p>
        </div>
      )}

      <div className="field">
        <label htmlFor="gazo-format">保存する形式</label>
        <select
          id="gazo-format"
          value={format}
          onChange={(e) => setFormat(e.target.value as FormatChoice)}
          style={{ maxWidth: 320 }}
        >
          <option value="auto">元と同じ形式のまま</option>
          <option value="jpeg">JPEG（写真向け・いちばん軽い）</option>
          <option value="png">PNG（ロスレス・透過を保てる）</option>
          <option value="webp">WebP（同じ画質でJPEGより軽い）</option>
        </select>
      </div>

      <div className="field">
        <span className="field-label">軽くし方</span>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {(
            [
              ['quality', '画質で指定'],
              ['targetSize', 'ファイルサイズで指定'],
            ] as [CompressMode, string][]
          ).map(([value, label]) => (
            <label key={value} style={{ fontWeight: compressMode === value ? 700 : 400 }}>
              <input
                type="radio"
                name="gazo-compress"
                value={value}
                checked={compressMode === value}
                onChange={() => setCompressMode(value)}
                style={{ width: 'auto', marginRight: 6 }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {compressMode === 'quality' ? (
        <div className="field">
          <label htmlFor="gazo-quality">画質（{Math.round(quality * 100)}）</label>
          <input
            id="gazo-quality"
            type="range"
            min={QUALITY_MIN * 100}
            max={QUALITY_MAX * 100}
            step={1}
            value={Math.round(quality * 100)}
            onChange={(e) => setQuality(Number(e.target.value) / 100)}
            style={{ maxWidth: 320 }}
          />
          <p className="hint">
            80前後なら、元の写真と並べても違いはほとんど分かりません。PNGはロスレスなので画質の指定は効きません。
          </p>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="gazo-target">目標ファイルサイズ（KB以下）</label>
          <input
            id="gazo-target"
            type="number"
            inputMode="numeric"
            min={1}
            value={targetKb}
            onChange={(e) => setTargetKb(e.target.value)}
            style={{ maxWidth: 200 }}
          />
          <p className="hint">
            指定したサイズに収まる範囲でいちばん高い画質を探します（画質を変えて数回書き出すため、少し時間がかかります）。
            提出先に「2MB以内」などの制限があるときに使ってください。
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
        <button type="button" onClick={onRun} disabled={!canRun} style={buttonStyle(canRun, true)}>
          {running ? '処理中…' : `${items.length > 0 ? `${items.length}枚を` : ''}リサイズ・圧縮する`}
        </button>
        {doneCount > 1 && (
          <button type="button" onClick={() => void onDownloadAll()} style={buttonStyle(true)}>
            すべて保存（{doneCount}枚）
          </button>
        )}
        {items.length > 0 && (
          <button type="button" onClick={onClear} style={buttonStyle(true)}>
            クリア
          </button>
        )}
      </div>

      {items.length === 0 && (
        <div className="panel quiet">
          <p style={{ margin: 0 }}>
            画像を選ぶと、ここに元のサイズと処理後のサイズが並びます。処理はすべてこの端末の中で行われます。
          </p>
        </div>
      )}

      {items.map((item) => (
        <div className="panel" key={item.id}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {item.result && (
              /* next/image は最適化サーバーを前提にした部品で、静的書き出し＋端末内で
                 作った Blob URL には使えない。プレビューは素の <img> で出す */
              <img
                src={item.result.url}
                alt={`${item.file.name} の処理後`}
                width={120}
                style={{ borderRadius: 8, maxWidth: 120, height: 'auto' }}
              />
            )}
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{item.file.name}</div>
              <dl className="kv">
                <div>
                  <dt>元</dt>
                  <dd>
                    {item.source ? `${item.source.width} × ${item.source.height} px・` : ''}
                    {formatBytes(item.file.size)}
                  </dd>
                </div>
                {item.result && (
                  <>
                    <div>
                      <dt>処理後</dt>
                      <dd>
                        {item.result.size.width} × {item.result.size.height} px・
                        {formatBytes(item.result.blob.size)}（{item.result.format.toUpperCase()}
                        {item.result.quality !== null
                          ? `・画質${Math.round(item.result.quality * 100)}`
                          : ''}
                        ）
                      </dd>
                    </div>
                    <div>
                      <dt>削減</dt>
                      <dd>
                        {reductionPercent(item.file.size, item.result.blob.size) >= 0
                          ? `${reductionPercent(item.file.size, item.result.blob.size)}% 小さくなりました`
                          : `${Math.abs(reductionPercent(item.file.size, item.result.blob.size))}% 大きくなりました`}
                      </dd>
                    </div>
                  </>
                )}
              </dl>

              {item.status === 'working' && <p className="hint">処理中…</p>}
              {item.status === 'error' && <div className="note">{item.message}</div>}
              {item.result && !item.result.reachedTarget && (
                <div className="note">
                  いちばん低い画質でも目標のファイルサイズに届きませんでした。大きさ（幅・長辺）を小さくするか、形式をJPEG・WebPにしてください。
                </div>
              )}
              {item.result && (
                <button
                  type="button"
                  onClick={() => {
                    if (!item.result) return;
                    download(item.result.blob, outputFileName(item.file.name, item.result.format));
                    trackToolUse('gazo-resize', 'download');
                  }}
                  style={{ ...buttonStyle(true), marginTop: 8 }}
                >
                  保存
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * EXIF の向きを読む。JPEG 以外は EXIF を持たないので読みに行かない。
 * 先頭 256KB だけ読むのは、向きのタグが必ずファイル先頭のメタデータ領域にあるため
 * （数十MBの写真を丸ごとメモリに載せない）。
 */
async function readOrientation(file: File): Promise<number | null> {
  if (file.type.toLowerCase() !== 'image/jpeg') return null;
  try {
    const head = await file.slice(0, 256 * 1024).arrayBuffer();
    return readExifOrientation(new Uint8Array(head));
  } catch {
    return null;
  }
}
