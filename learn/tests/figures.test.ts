import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writtenChapters } from '@/lib/curriculum';

/**
 * 図解の約束を見張るテスト。
 *
 * 章が増えるほど、図の数も増えて崩れやすくなる。
 * 「レイアウトが崩れていないか」は目では追いきれないので、
 * **書き方の約束のほうを機械で守る**（見え方そのものは Playwright で実測した）。
 */

const appDir = fileURLToPath(new URL('../app/', import.meta.url));
const chapterSrc = writtenChapters.map((c) => ({
  slug: c.slug,
  src: readFileSync(`${appDir}${c.slug}/page.tsx`, 'utf8'),
}));

/** `<Figure ...>` の開始タグを取り出す */
function figureTags(src: string): string[] {
  return [...src.matchAll(/<Figure\b[\s\S]*?>/g)].map((m) => m[0]);
}

describe('図解の約束', () => {
  it('図がある章では、すべての Figure に title がある（読み上げと代替文になる）', () => {
    for (const { slug, src } of chapterSrc) {
      for (const tag of figureTags(src)) {
        expect(tag, `${slug} の Figure に title が無い`).toMatch(/title=/);
      }
    }
  });

  it('title は図の中身を説明する長さがある（「グラフ」だけにしない）', () => {
    for (const { slug, src } of chapterSrc) {
      for (const tag of figureTags(src)) {
        const m = tag.match(/title=\{?["`]([^"`]+)/);
        // テンプレートリテラルで式が入るものは長さを測れないので、式の有無で判断する
        const isTemplate = /title=\{`/.test(tag);
        if (!isTemplate && m) {
          expect(m[1].length, `${slug}: 「${m[1]}」が短すぎる`).toBeGreaterThan(20);
        }
      }
    }
  });

  it('Figure は共通部品を import している（生の svg を章に直書きしない）', () => {
    for (const { slug, src } of chapterSrc) {
      if (!src.includes('<Figure')) continue;
      expect(src, `${slug}`).toMatch(/from '\.\.\/_chapter\/Figure'/);
    }
  });

  it('図の部品は必ず Figure の中で使う（読み上げ用の名前が付かなくなる）', () => {
    // Figure は role="img" と aria-label を付ける。外で使うと、図に名前が無くなる
    const parts = ['LineChart', 'Bars', 'Ladder', 'NestedBox', 'Timeline', 'OrderBook', 'Flow'];
    for (const { slug, src } of chapterSrc) {
      // <Figure ...> ... </Figure> の中身を取り除いた残りに部品が現れたら違反
      const outside = src.replace(/<Figure[\s\S]*?<\/Figure>/g, ' ');
      for (const part of parts) {
        expect(
          new RegExp(`<${part}\\b`).test(outside),
          `${slug}: <${part}> が Figure の外にある`,
        ).toBe(false);
      }
    }
  });

  it('章のページに生の <svg> を書かない（共通部品を通す）', () => {
    for (const { slug, src } of chapterSrc) {
      expect(src, `${slug} に生の svg がある`).not.toMatch(/<svg\b/);
    }
  });

  it('図解の部品は色をCSS変数から取る（明暗テーマに追随させるため）', () => {
    for (const file of ['_chapter/Figure.tsx', '_chapter/Diagram.tsx']) {
      const src = readFileSync(`${appDir}${file}`, 'utf8');
      // 生のカラーコードを書くと、暗いテーマで読めなくなる
      const hex = src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      expect(hex, `${file} に直書きの色がある: ${hex.join(', ')}`).toHaveLength(0);
    }
  });

  it('SVGは viewBox で組む（幅を固定しない）', () => {
    for (const file of ['_chapter/Figure.tsx', '_chapter/Diagram.tsx']) {
      const src = readFileSync(`${appDir}${file}`, 'utf8');
      const svgs = [...src.matchAll(/<svg\b[^>]*>/g)].map((m) => m[0]);
      expect(svgs.length, file).toBeGreaterThan(0);
      for (const tag of svgs) {
        expect(tag, `${file}: viewBox が無い`).toMatch(/viewBox=/);
        expect(tag, `${file}: width を固定している`).not.toMatch(/\bwidth="\d/);
      }
    }
  });
});

describe('図と本文で数字を二重に書かない', () => {
  // 最初の版は表を手打ちしていて3か所間違えた（docs/DECISIONS.md 2026-09-07）。
  // 図が増えると同じ数字を書く場所も増えるので、計算は lib/calc.ts に集約する
  it('折れ線を描く章は lib/calc.ts から系列を作っている', () => {
    // 折れ線は年ごとの値を並べたもので、必ず計算が要る。
    // 一方で弁済順位の積み木や制度の枠の図は決まった値のラベルなので、
    // 計算を通す必要はない（そこまで縛ると、図を足すたびに嘘の依存が増える）
    for (const { slug, src } of chapterSrc) {
      if (!src.includes('<LineChart')) continue;
      expect(src, `${slug} が calc を使っていない`).toMatch(/from '@\/lib\/calc'/);
      // points に座標の配列を直書きしていないこと。
      // 関数名までは縛らない（series() でも withdrawSeries() でもよい）
      expect(src, `${slug} が折れ線の座標を直書きしている`).not.toMatch(
        /points:\s*\[\s*\{\s*year:/,
      );
    }
  });

  it('複利の章の表に、金額が直書きされていない', () => {
    const src = chapterSrc.find((c) => c.slug === 'fukuri')!.src;
    // 「326.2万円」のような値が <td> に直接書かれていたら、計算から外れている
    expect(src).not.toMatch(/<td[^>]*>\s*\d+\.\d+万円/);
  });

  it('注文の章の板と本文が、同じ計算結果を見ている', () => {
    const src = chapterSrc.find((c) => c.slug === 'chumon')!.src;
    expect(src).toMatch(/sweepBook\(/);
    // 平均取得単価を直書きしていない（板を変えたら本文も変わるべき）
    expect(src).not.toMatch(/1,137\.5/);
  });
});
