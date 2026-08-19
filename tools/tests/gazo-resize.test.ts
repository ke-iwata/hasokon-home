import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_TYPES,
  computeTargetSize,
  ORIENTATION_PROBE_STORED_SIZE,
  orientationProbeBytes,
  orientationToApply,
  probeSaysBrowserApplies,
  visibleSize,
  downscaleSteps,
  extensionFor,
  formatBytes,
  isSupportedType,
  kilobytesToBytes,
  mimeTypeFor,
  orientationTransform,
  orientedSize,
  outputFileName,
  QUALITY_MAX,
  QUALITY_MIN,
  readExifOrientation,
  reductionPercent,
  searchQualityForTargetSize,
  supportsQuality,
} from '@/lib/gazo-resize';

/**
 * 画像リサイズ・圧縮のテスト（仕様: docs/features/gazo-resize-asshuku.md）。
 *
 * Canvas の描画そのものはブラウザ依存なのでテストしない。
 * 仕様書の「テスト」の項にあるとおり、**寸法の丸め**と
 * **目標サイズ二分探索の収束条件**、それに EXIF の向きの読み取りを固定する。
 */

describe('computeTargetSize', () => {
  const source = { width: 4000, height: 3000 };

  it('mode: none は元のサイズをそのまま返す（形式変換・圧縮だけしたいとき）', () => {
    expect(computeTargetSize(source, { mode: 'none' })).toEqual({ width: 4000, height: 3000 });
  });

  it('幅だけ指定すると高さは比率から決まる', () => {
    expect(computeTargetSize(source, { mode: 'dimensions', width: 800 })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('高さだけ指定すると幅は比率から決まる', () => {
    expect(computeTargetSize(source, { mode: 'dimensions', height: 600 })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('割り切れないときは四捨五入し、比率固定でも1px未満は作らない', () => {
    // 1000x333 の画像を幅10pxに → 高さ 3.33 → 3px
    expect(computeTargetSize({ width: 1000, height: 333 }, { mode: 'dimensions', width: 10 })).toEqual(
      { width: 10, height: 3 },
    );
    // 極端に細長い画像でも高さ0にはしない
    expect(
      computeTargetSize({ width: 10000, height: 100 }, { mode: 'dimensions', width: 10 }),
    ).toEqual({ width: 10, height: 1 });
  });

  it('幅と高さの両方を指定すると、比率を保ったまま枠に収まる大きさになる', () => {
    // 4:3 の画像を 800x800 の枠に入れる → 幅が先に当たる
    expect(
      computeTargetSize(source, { mode: 'dimensions', width: 800, height: 800 }),
    ).toEqual({ width: 800, height: 600 });
    // 縦長の枠なら高さが先に当たる
    expect(
      computeTargetSize(source, { mode: 'dimensions', width: 2000, height: 600 }),
    ).toEqual({ width: 800, height: 600 });
  });

  it('比率固定を外すと指定どおりに引き伸ばす', () => {
    expect(
      computeTargetSize(source, {
        mode: 'dimensions',
        width: 800,
        height: 800,
        keepRatio: false,
      }),
    ).toEqual({ width: 800, height: 800 });
  });

  it('比率固定を外して片方だけ指定したときは、もう片方は元のまま', () => {
    expect(
      computeTargetSize(source, { mode: 'dimensions', width: 800, keepRatio: false }),
    ).toEqual({ width: 800, height: 3000 });
  });

  it('percent は割合で縮める', () => {
    expect(computeTargetSize(source, { mode: 'percent', percent: 25 })).toEqual({
      width: 1000,
      height: 750,
    });
    expect(computeTargetSize({ width: 1001, height: 501 }, { mode: 'percent', percent: 50 })).toEqual(
      // 500.5 → 501、250.5 → 251（四捨五入）
      { width: 501, height: 251 },
    );
  });

  it('longEdge は長辺を合わせる（横長でも縦長でも）', () => {
    expect(computeTargetSize(source, { mode: 'longEdge', longEdge: 1600 })).toEqual({
      width: 1600,
      height: 1200,
    });
    expect(
      computeTargetSize({ width: 3000, height: 4000 }, { mode: 'longEdge', longEdge: 1600 }),
    ).toEqual({ width: 1200, height: 1600 });
  });

  it('既定では元より大きくしない（拡大しても画質は上がらないため）', () => {
    expect(computeTargetSize({ width: 400, height: 300 }, { mode: 'percent', percent: 200 })).toEqual(
      { width: 400, height: 300 },
    );
    expect(
      computeTargetSize({ width: 400, height: 300 }, { mode: 'longEdge', longEdge: 2000 }),
    ).toEqual({ width: 400, height: 300 });
    expect(
      computeTargetSize({ width: 400, height: 300 }, { mode: 'dimensions', width: 1200 }),
    ).toEqual({ width: 400, height: 300 });
  });

  it('noUpscale: false を渡したときだけ拡大する', () => {
    expect(
      computeTargetSize({ width: 400, height: 300 }, { mode: 'percent', percent: 200, noUpscale: false }),
    ).toEqual({ width: 800, height: 600 });
  });

  it('指定が無い・0以下・元サイズが不正なら null（「等倍」に化けさせない）', () => {
    expect(computeTargetSize(source, { mode: 'dimensions' })).toBeNull();
    expect(computeTargetSize(source, { mode: 'dimensions', width: 0 })).toBeNull();
    expect(computeTargetSize(source, { mode: 'dimensions', width: -100 })).toBeNull();
    expect(computeTargetSize(source, { mode: 'percent', percent: 0 })).toBeNull();
    expect(computeTargetSize(source, { mode: 'percent' })).toBeNull();
    expect(computeTargetSize(source, { mode: 'longEdge', longEdge: Number.NaN })).toBeNull();
    expect(computeTargetSize({ width: 0, height: 100 }, { mode: 'percent', percent: 50 })).toBeNull();
    expect(
      computeTargetSize({ width: Number.NaN, height: 100 }, { mode: 'none' }),
    ).toBeNull();
  });
});

describe('downscaleSteps', () => {
  it('2倍以内の縮小は刻まない', () => {
    expect(downscaleSteps({ width: 1000, height: 800 }, { width: 600, height: 480 })).toEqual([
      { width: 600, height: 480 },
    ]);
  });

  it('大きく縮めるときは半分ずつ寄せてから目標サイズにする', () => {
    // 4000 → 2000 → 1000 → 500（目標）
    expect(downscaleSteps({ width: 4000, height: 3000 }, { width: 500, height: 375 })).toEqual([
      { width: 2000, height: 1500 },
      { width: 1000, height: 750 },
      { width: 500, height: 375 },
    ]);
  });

  it('途中のサイズが目標を下回らない（最後は必ず目標ちょうど）', () => {
    const target = { width: 120, height: 90 };
    const steps = downscaleSteps({ width: 4000, height: 3000 }, target);
    for (const step of steps) {
      expect(step.width).toBeGreaterThanOrEqual(target.width);
      expect(step.height).toBeGreaterThanOrEqual(target.height);
    }
    expect(steps.at(-1)).toEqual(target);
  });

  it('縦横で縮小の度合いが違っても、どちらかが2倍を超えているあいだは刻む', () => {
    // 幅は等倍・高さだけ大きく縮める（比率固定を外したとき）
    const steps = downscaleSteps({ width: 800, height: 4000 }, { width: 800, height: 400 });
    expect(steps.length).toBeGreaterThan(1);
    expect(steps.every((s) => s.width === 800)).toBe(true);
    expect(steps.at(-1)).toEqual({ width: 800, height: 400 });
  });

  it('拡大するときは刻まない', () => {
    expect(downscaleSteps({ width: 400, height: 300 }, { width: 800, height: 600 })).toEqual([
      { width: 800, height: 600 },
    ]);
  });

  it('不正なサイズでは空を返す（呼び出し側が描画に進まないようにする）', () => {
    expect(downscaleSteps({ width: 0, height: 300 }, { width: 100, height: 100 })).toEqual([]);
    expect(downscaleSteps({ width: 400, height: 300 }, { width: 0, height: 100 })).toEqual([]);
  });
});

describe('searchQualityForTargetSize', () => {
  /**
   * 品質を上げるとサイズが増える、という単調な擬似エンコーダ。
   * 実際の JPEG も品質に対して単調に増える（探索の前提そのもの）。
   */
  const encoder = (bytesAtFullQuality: number) => {
    const calls: number[] = [];
    const measure = (quality: number) => {
      calls.push(quality);
      return Math.round(bytesAtFullQuality * quality * quality);
    };
    return { calls, measure };
  };

  it('上限品質で既に目標以下なら、品質を下げずにそのまま採る', async () => {
    const { calls, measure } = encoder(100_000);
    const result = await searchQualityForTargetSize(measure, 200_000);
    expect(result.quality).toBe(QUALITY_MAX);
    expect(result.reached).toBe(true);
    expect(result.attempts).toBe(1);
    expect(calls).toEqual([QUALITY_MAX]);
  });

  it('下限品質でも目標を超えるなら reached: false（勝手に寸法は変えない）', async () => {
    const { measure } = encoder(10_000_000);
    const result = await searchQualityForTargetSize(measure, 100_000);
    expect(result.quality).toBe(QUALITY_MIN);
    expect(result.reached).toBe(false);
    expect(result.size).toBeGreaterThan(100_000);
    expect(result.attempts).toBe(2);
  });

  it('目標以下に収まる中で最も高い品質を返す', async () => {
    const target = 300_000;
    const { measure } = encoder(1_000_000);
    const result = await searchQualityForTargetSize(measure, target);

    expect(result.reached).toBe(true);
    expect(result.size).toBeLessThanOrEqual(target);
    // 0.01 上げると超えてしまう＝これ以上は上げられない品質になっている
    expect(measure(Math.round((result.quality + 0.01) * 100) / 100)).toBeGreaterThan(target);
  });

  it('エンコード回数は steps + 2 を超えない（1回ごとに実際のエンコードが走るため）', async () => {
    const { measure } = encoder(1_000_000);
    const result = await searchQualityForTargetSize(measure, 300_000, { steps: 4 });
    expect(result.attempts).toBeLessThanOrEqual(6);
  });

  it('品質は小数第2位までに丸める（刻めなくなったら打ち切る）', async () => {
    const { calls, measure } = encoder(1_000_000);
    await searchQualityForTargetSize(measure, 300_000, { steps: 30 });
    for (const quality of calls) {
      expect(quality).toBe(Math.round(quality * 100) / 100);
    }
    // 0.3〜0.95 を小数第2位で刻む以上、無限には試せない
    expect(calls.length).toBeLessThan(12);
  });

  it('探索の範囲は指定で狭められる', async () => {
    const { calls, measure } = encoder(1_000_000);
    const result = await searchQualityForTargetSize(measure, 300_000, { min: 0.5, max: 0.6 });
    expect(result.quality).toBeGreaterThanOrEqual(0.5);
    expect(result.quality).toBeLessThanOrEqual(0.6);
    for (const quality of calls) {
      expect(quality).toBeGreaterThanOrEqual(0.5);
      expect(quality).toBeLessThanOrEqual(0.6);
    }
  });

  it('非同期のエンコーダ（canvas.toBlob）でも同じ結果になる', async () => {
    const sync = encoder(1_000_000);
    const async = encoder(1_000_000);
    const expected = await searchQualityForTargetSize(sync.measure, 300_000);
    const actual = await searchQualityForTargetSize(
      (quality) => Promise.resolve(async.measure(quality)),
      300_000,
    );
    expect(actual).toEqual(expected);
  });
});

describe('サイズの表示', () => {
  it('kilobytesToBytes は 1KB = 1024バイトで換算する', () => {
    expect(kilobytesToBytes(200)).toBe(204_800);
    expect(kilobytesToBytes(0)).toBe(1); // 0バイトの目標は作れない
  });

  it('formatBytes は桁に応じて単位を変える', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(204_800)).toBe('200 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3.5 MB');
    expect(formatBytes(Number.NaN)).toBe('-');
  });

  it('reductionPercent は削減率を出し、増えたときは負の数になる', () => {
    expect(reductionPercent(1000, 250)).toBe(75);
    expect(reductionPercent(1000, 1000)).toBe(0);
    // PNG → PNG のように「軽くならなかった」ことを隠さない
    expect(reductionPercent(1000, 1500)).toBe(-50);
    expect(reductionPercent(0, 100)).toBe(0);
  });
});

describe('出力形式', () => {
  it('MIME タイプと拡張子', () => {
    expect(mimeTypeFor('jpeg')).toBe('image/jpeg');
    expect(mimeTypeFor('png')).toBe('image/png');
    expect(mimeTypeFor('webp')).toBe('image/webp');
    expect(extensionFor('jpeg')).toBe('jpg');
    expect(extensionFor('png')).toBe('png');
    expect(extensionFor('webp')).toBe('webp');
  });

  it('PNG はロスレスなので品質を指定できない', () => {
    expect(supportsQuality('jpeg')).toBe(true);
    expect(supportsQuality('webp')).toBe(true);
    expect(supportsQuality('png')).toBe(false);
  });

  it('入力として受け付ける形式（HEIC は初版では受け付けない）', () => {
    for (const type of ACCEPTED_TYPES) expect(isSupportedType(type)).toBe(true);
    expect(isSupportedType('IMAGE/JPEG')).toBe(true);
    expect(isSupportedType('image/heic')).toBe(false);
    expect(isSupportedType('application/pdf')).toBe(false);
    expect(isSupportedType('')).toBe(false);
  });

  it('保存するファイル名には -resized が付く（元のファイルと取り違えないため）', () => {
    expect(outputFileName('IMG_0001.JPG', 'jpeg')).toBe('IMG_0001-resized.jpg');
    expect(outputFileName('写真.png', 'webp')).toBe('写真-resized.webp');
    expect(outputFileName('a.b.c.png', 'png')).toBe('a.b.c-resized.png');
    expect(outputFileName('no-extension', 'jpeg')).toBe('no-extension-resized.jpg');
    expect(outputFileName('', 'jpeg')).toBe('image-resized.jpg');
  });
});

/* ------------------------------------------------------------------ *
 * EXIF の向き
 * ------------------------------------------------------------------ */

/**
 * Orientation だけを持つ最小の JPEG を組み立てる。
 *
 * SOI → （任意の前置きセグメント）→ APP1（Exif）→ SOS の順。
 * 実ファイルを置かずにバイト列で作るのは、テストデータが何を表しているかを
 * その場で読めるようにするため。
 */
function jpegWithOrientation(
  orientation: number,
  options: { littleEndian?: boolean; leadingSegment?: boolean } = {},
): Uint8Array {
  const little = options.littleEndian ?? true;
  const tiff: number[] = [];
  const u16 = (value: number) => (little ? [value & 0xff, value >> 8] : [value >> 8, value & 0xff]);
  const u32 = (value: number) =>
    little
      ? [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]
      : [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];

  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d])); // "II" / "MM"
  tiff.push(...u16(0x002a)); // TIFF の目印（42）
  tiff.push(...u32(8)); // IFD0 の位置（TIFF ヘッダ先頭からの相対）
  tiff.push(...u16(1)); // エントリ数
  tiff.push(...u16(0x0112)); // タグ: Orientation
  tiff.push(...u16(3)); // 型: SHORT
  tiff.push(...u32(1)); // 個数
  tiff.push(...u16(orientation), 0x00, 0x00); // 値（12バイトのエントリ内に直接入る）
  tiff.push(...u32(0)); // 次の IFD は無い

  const app1Body = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]; // "Exif\0\0" + TIFF
  const length = app1Body.length + 2;

  const bytes: number[] = [0xff, 0xd8];
  if (options.leadingSegment) {
    // APP0（JFIF）相当の前置き。読み飛ばせることを確かめるため
    bytes.push(0xff, 0xe0, 0x00, 0x04, 0x00, 0x00);
  }
  bytes.push(0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...app1Body);
  bytes.push(0xff, 0xda); // SOS（画像データの開始）
  return new Uint8Array(bytes);
}

describe('readExifOrientation', () => {
  it('リトルエンディアン（II）の EXIF から向きを読む', () => {
    for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(readExifOrientation(jpegWithOrientation(orientation))).toBe(orientation);
    }
  });

  it('ビッグエンディアン（MM）の EXIF からも読む', () => {
    expect(readExifOrientation(jpegWithOrientation(6, { littleEndian: false }))).toBe(6);
  });

  it('APP1 の前に別のセグメントがあっても読み飛ばす', () => {
    expect(readExifOrientation(jpegWithOrientation(8, { leadingSegment: true }))).toBe(8);
  });

  it('EXIF が無い・JPEG でない・壊れているときは null', () => {
    expect(readExifOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda]))).toBeNull(); // EXIFなし
    expect(readExifOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // PNG
    expect(readExifOrientation(new Uint8Array([]))).toBeNull();
    expect(readExifOrientation(new Uint8Array([0xff, 0xd8]))).toBeNull(); // 中身なし
  });

  it('範囲外の値（0や9）は null にする', () => {
    expect(readExifOrientation(jpegWithOrientation(0))).toBeNull();
    expect(readExifOrientation(jpegWithOrientation(9))).toBeNull();
  });

  it('"Exif" で始まらない APP1（XMPなど）は EXIF として読まない', () => {
    const bytes = Array.from(jpegWithOrientation(6));
    // "Exif" の E を別の文字に変える → EXIF として扱われない
    bytes[bytes.indexOf(0x45)] = 0x68;
    expect(readExifOrientation(new Uint8Array(bytes))).toBeNull();
  });
});

describe('orientationTransform / orientedSize', () => {
  it('向き1（そのまま）は回転も反転もしない', () => {
    expect(orientationTransform(1)).toEqual({ rotate: 0, flipX: false, swapsAxes: false });
    expect(orientationTransform(null)).toEqual({ rotate: 0, flipX: false, swapsAxes: false });
  });

  it('スマホの縦撮り（向き6）は時計回りに90度回す', () => {
    expect(orientationTransform(6)).toEqual({ rotate: 90, flipX: false, swapsAxes: true });
    expect(orientationTransform(8)).toEqual({ rotate: 270, flipX: false, swapsAxes: true });
    expect(orientationTransform(3)).toEqual({ rotate: 180, flipX: false, swapsAxes: false });
  });

  it('鏡像で保存されている向き（2・4・5・7）は左右反転を伴う', () => {
    for (const orientation of [2, 4, 5, 7]) {
      expect(orientationTransform(orientation).flipX).toBe(true);
    }
    for (const orientation of [1, 3, 6, 8]) {
      expect(orientationTransform(orientation).flipX).toBe(false);
    }
  });

  it('90度・270度のときだけ縦横が入れ替わる', () => {
    const size = { width: 4000, height: 3000 };
    expect(orientedSize(size, 1)).toEqual({ width: 4000, height: 3000 });
    expect(orientedSize(size, 3)).toEqual({ width: 4000, height: 3000 });
    expect(orientedSize(size, 6)).toEqual({ width: 3000, height: 4000 });
    expect(orientedSize(size, 8)).toEqual({ width: 3000, height: 4000 });
    expect(orientedSize(size, 5)).toEqual({ width: 3000, height: 4000 });
    expect(orientedSize(size, null)).toEqual({ width: 4000, height: 3000 });
  });

  it('向きを反映した寸法でリサイズすると、縦撮りの写真が縦のまま縮む', () => {
    // 画素としては横向き（4000x3000）に入っている縦撮り写真
    const stored = { width: 4000, height: 3000 };
    const visible = orientedSize(stored, 6);
    expect(computeTargetSize(visible, { mode: 'longEdge', longEdge: 1000 })).toEqual({
      width: 750,
      height: 1000,
    });
  });
});

/**
 * ブラウザが EXIF の向きを自分で反映するかの判定。
 *
 * `createImageBitmap(blob, { imageOrientation: 'none' })` は仕様上「反映しない生の画素」を
 * 返すはずだが、**Chromium 141 はこの指定を無視して常に反映する**（whatwg/html#7210。
 * この環境の Chromium 141.0.7390.37 で実測）。反映済みの画像にこちらでも回転を掛けると
 * 二重補正になり、縦撮りの写真がかえって横倒しになる。
 * オプションの意味ではなく、判定用JPEGの実測で決める。
 */
describe('ブラウザの自動回転の判定', () => {
  it('判定用JPEGは、EXIF を読める最小のJPEGになっている（向き6・画素2×1）', () => {
    const bytes = orientationProbeBytes();
    expect(bytes[0]).toBe(0xff); // SOI
    expect(bytes[1]).toBe(0xd8);
    expect(readExifOrientation(bytes)).toBe(6);
    // ページに埋め込む定数なので、大きくなっていないことも見張る
    expect(bytes.length).toBeLessThan(1024);
    expect(ORIENTATION_PROBE_STORED_SIZE).toEqual({ width: 2, height: 1 });
  });

  it('縦長（1×2）で返ってきたら、ブラウザが向きを反映している', () => {
    expect(probeSaysBrowserApplies({ width: 1, height: 2 })).toBe(true);
    expect(probeSaysBrowserApplies(ORIENTATION_PROBE_STORED_SIZE)).toBe(false);
  });

  it('ブラウザが反映するなら、こちらでは回さない（二重補正を避ける）', () => {
    for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8, null]) {
      expect(orientationToApply(orientation, true)).toBe(1);
    }
  });

  it('ブラウザが反映しないなら、EXIF から読んだ向きをこちらで掛ける', () => {
    expect(orientationToApply(6, false)).toBe(6);
    expect(orientationToApply(3, false)).toBe(3);
    expect(orientationToApply(null, false)).toBeNull();
  });

  it('見た目上の寸法は、ブラウザが反映済みならそのまま', () => {
    // 縦撮り（画素は 4000x3000・向き6）を反映済みで返すブラウザ → 3000x4000 が届く
    expect(visibleSize({ width: 3000, height: 4000 }, 6, true)).toEqual({
      width: 3000,
      height: 4000,
    });
  });

  it('見た目上の寸法は、ブラウザが反映しないときだけ縦横を読み替える', () => {
    expect(visibleSize({ width: 4000, height: 3000 }, 6, false)).toEqual({
      width: 3000,
      height: 4000,
    });
    expect(visibleSize({ width: 4000, height: 3000 }, 3, false)).toEqual({
      width: 4000,
      height: 3000,
    });
  });

  it('どちらのブラウザでも、最後に得られる見た目の寸法は一致する', () => {
    // 反映するブラウザは 3000x4000 を返し、反映しないブラウザは 4000x3000 を返す。
    // 判定を通せば、どちらも同じ「縦 3000x4000」になる
    expect(visibleSize({ width: 3000, height: 4000 }, 6, true)).toEqual(
      visibleSize({ width: 4000, height: 3000 }, 6, false),
    );
  });
});
