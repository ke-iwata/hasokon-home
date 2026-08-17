import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  gcd,
  simplify,
  nearestCommonRatio,
  scaleByWidth,
  scaleByHeight,
  lookupTable,
  LOOKUP_16_9,
  LOOKUP_COMPACT,
  LOOKUP_WIDTHS_16_9,
  LOOKUP_WIDTHS_COMPACT,
} from '@/lib/aspect-ratio';

describe('gcd', () => {
  it('gcd(1920, 1080) = 120', () => {
    expect(gcd(1920, 1080)).toBe(120);
  });

  it('境界: gcd(a, 0) = a、gcd(0, 0) = 0', () => {
    expect(gcd(12, 0)).toBe(12);
    expect(gcd(0, 12)).toBe(12);
    expect(gcd(0, 0)).toBe(0);
  });

  it('負の数は絶対値で計算する', () => {
    expect(gcd(-48, 36)).toBe(12);
  });
});

describe('simplify（最簡分数の比）', () => {
  it('1920x1080 → 16:9', () => {
    expect(simplify(1920, 1080)).toEqual({ w: 16, h: 9 });
  });

  it('1280x1024 → 5:4', () => {
    expect(simplify(1280, 1024)).toEqual({ w: 5, h: 4 });
  });

  it('互いに素な値（1919x1080）はそのまま', () => {
    expect(simplify(1919, 1080)).toEqual({ w: 1919, h: 1080 });
  });

  it('0や負の入力は null', () => {
    expect(simplify(0, 1080)).toBeNull();
    expect(simplify(1920, 0)).toBeNull();
    expect(simplify(-1920, 1080)).toBeNull();
  });
});

describe('nearestCommonRatio（よく使う比率との照合）', () => {
  it('1920x1080 は 16:9 にぴったり一致', () => {
    const m = nearestCommonRatio(1920, 1080);
    expect(m?.label).toBe('16:9');
    expect(m?.exact).toBe(true);
    expect(m?.diffPercent).toBe(0);
  });

  it('1919x1080 は 16:9 に近い（完全一致ではない）', () => {
    const m = nearestCommonRatio(1919, 1080);
    expect(m?.label).toBe('16:9');
    expect(m?.exact).toBe(false);
    expect(m?.diffPercent).toBeGreaterThan(0);
    expect(m?.diffPercent).toBeLessThan(1);
  });

  it('1280x1024 は 5:4 にぴったり一致', () => {
    const m = nearestCommonRatio(1280, 1024);
    expect(m?.label).toBe('5:4');
    expect(m?.exact).toBe(true);
  });

  it('1080x1920（縦動画）は 9:16', () => {
    const m = nearestCommonRatio(1080, 1920);
    expect(m?.label).toBe('9:16');
    expect(m?.exact).toBe(true);
  });

  it('0入力は null', () => {
    expect(nearestCommonRatio(0, 1080)).toBeNull();
    expect(nearestCommonRatio(1920, 0)).toBeNull();
  });
});

describe('scaleByWidth / scaleByHeight（比率を保った変換）', () => {
  it('16:9 で幅1280 → 高さ720', () => {
    expect(scaleByWidth(1920, 1080, 1280)).toBe(720);
  });

  it('端数は四捨五入する（16:9 で幅1000 → 563）', () => {
    expect(scaleByWidth(1920, 1080, 1000)).toBe(563);
  });

  it('scaleByHeight: 16:9 で高さ720 → 幅1280', () => {
    expect(scaleByHeight(1920, 1080, 720)).toBe(1280);
  });

  it('元サイズが0なら null、新しい幅が0なら 0', () => {
    expect(scaleByWidth(0, 1080, 1280)).toBeNull();
    expect(scaleByWidth(1920, 0, 1280)).toBeNull();
    expect(scaleByWidth(1920, 1080, 0)).toBe(0);
  });
});

/**
 * 逆引き早見表（仕様: docs/features/aspect-ratio-gyakubiki-seo.md）。
 *
 * 表の値は `scaleByWidth()` から作られるので、計算機の答えと表の値が食い違わない。
 * ここでは代表値の正しさに加えて、その「食い違わない」性質そのものを見張る。
 */
describe('lookupTable（逆引き早見表）', () => {
  it('16:9 の代表的な幅で、既知の高さになる', () => {
    const heights = new Map(LOOKUP_16_9.rows.map((r) => [r.width, r.height]));
    expect(heights.get(1280)).toBe(720);
    expect(heights.get(1920)).toBe(1080);
    expect(heights.get(3840)).toBe(2160);
    expect(heights.get(2560)).toBe(1440);
    expect(heights.get(640)).toBe(360);
    expect(heights.get(960)).toBe(540);
  });

  it('割り切れない幅は四捨五入され、exact: false が立つ', () => {
    // 854×9÷16 = 480.375 → 480、1366×9÷16 = 768.375 → 768
    const rows = new Map(LOOKUP_16_9.rows.map((r) => [r.width, r]));
    expect(rows.get(854)).toEqual({ width: 854, height: 480, exact: false });
    expect(rows.get(1366)).toEqual({ width: 1366, height: 768, exact: false });
    expect(rows.get(1920)?.exact).toBe(true);
  });

  it('全行の高さが scaleByWidth() と一致する（表と計算機がずれない）', () => {
    for (const table of [LOOKUP_16_9, ...LOOKUP_COMPACT]) {
      for (const row of table.rows) {
        expect(row.height, `${table.label} 幅${row.width}`).toBe(
          scaleByWidth(table.ratio.w, table.ratio.h, row.width)
        );
      }
    }
  });

  // 四捨五入で入るずれは、21:9の幅640（274px）の 0.105% が最大。
  it('全行が nearestCommonRatio でその比率と判定される（ずれても0.2%未満）', () => {
    for (const table of [LOOKUP_16_9, ...LOOKUP_COMPACT]) {
      for (const row of table.rows) {
        const m = nearestCommonRatio(row.width, row.height);
        expect(m?.label, `${table.label} 幅${row.width}`).toBe(table.label);
        expect(m?.diffPercent, `${table.label} 幅${row.width}`).toBeLessThan(0.2);
        expect(m?.exact).toBe(row.exact);
      }
    }
  });

  it('9:16は16:9の縦横読み替えで得られる（ページの3列目の根拠）', () => {
    for (const row of LOOKUP_16_9.rows) {
      const m = nearestCommonRatio(row.height, row.width);
      expect(m?.label, `幅${row.width}`).toBe('9:16');
    }
  });

  it('幅の一覧は昇順で重複がない', () => {
    for (const widths of [LOOKUP_WIDTHS_16_9, LOOKUP_WIDTHS_COMPACT]) {
      expect(widths).toEqual([...new Set(widths)].sort((a, b) => a - b));
    }
  });

  it('簡易表は 4:3・3:2・21:9 の3つで、行の幅が揃っている（横並び表示の前提）', () => {
    expect(LOOKUP_COMPACT.map((t) => t.label)).toEqual(['4:3', '3:2', '21:9']);
    for (const table of LOOKUP_COMPACT) {
      expect(table.rows.map((r) => r.width)).toEqual(LOOKUP_WIDTHS_COMPACT);
    }
  });

  it('比率や幅が無効なら例外を投げる（黙って0の行を作らない）', () => {
    expect(() => lookupTable({ w: 0, h: 9 }, [1920])).toThrow();
    expect(() => lookupTable({ w: 16, h: 9 }, [-1])).toThrow();
  });
});

/**
 * ページ側の受け皿（仕様: docs/features/aspect-ratio-gyakubiki-seo.md）。
 *
 * 表そのものは lib のテストで見張っているので、ここは
 * 「導線とメタデータが検索意図に向いたままか」だけを見る。
 * FAQ本文から張っているアンカーは、見出しの id を消すと黙ってリンク切れになる。
 */
describe('アスペクト比ページ（逆引き早見表の導線）', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../app/aspect-ratio/page.tsx', import.meta.url)),
    'utf8'
  );

  it('逆引き早見表の見出しに id があり、本文からのアンカーが生きている', () => {
    expect(source).toContain('id="gyakubiki"');
    expect(source).toContain('href="#gyakubiki"');
  });

  it('lib の逆引き表を読み込んで描画している（値のハードコードをしない）', () => {
    expect(source).toContain("from '@/lib/aspect-ratio'");
    expect(source).toContain('LOOKUP_16_9');
    expect(source).toContain('LOOKUP_COMPACT');
  });

  it('title と description に「早見表」「変換」「一覧」が入っている', () => {
    const [, title] = source.match(/const title = '([^']+)'/) ?? [];
    const [, description] = source.match(/const description =\s*'([^']+)'/) ?? [];
    expect(title).toBeTruthy();
    expect(description).toBeTruthy();
    for (const word of ['早見表', '変換', '一覧']) {
      expect(`${title}${description}`, `「${word}」が無い`).toContain(word);
    }
  });
});
