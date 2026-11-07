import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MAX_CHARS,
  MAX_CHAR_D,
  MAX_LINES,
  MAX_LINE_D,
  MAX_PAIR_GRAPHEMES,
  NO_IGNORE,
  activeIgnoreLabels,
  collapseRows,
  compareAction,
  compareTexts,
  decodeText,
  diffSequences,
  editDistance,
  formatUnified,
  normalizeLine,
  pairLines,
  similarity,
  sizeBucket,
  splitGraphemes,
  splitLines,
  type CompareResult,
  type IgnoreOptions,
  type Op,
  type Row,
  type Segment,
} from '@/lib/text-hikaku';
import { INVISIBLE_CHARS, SPACE_CHAR_NAMES } from '@/lib/invisible-chars';
import { checkJson } from '@/lib/json-seikei';

/** 仕様: docs/features/text-hikaku.md「比較の約束」1〜7 */

const opt = (o: Partial<IgnoreOptions>): IgnoreOptions => ({ ...NO_IGNORE, ...o });

function ok(r: CompareResult) {
  if (r.status !== 'ok') throw new Error(`status ${r.status}`);
  return r;
}

/** 塗られた部分だけを繋げる */
const changedText = (segs: Segment[]) =>
  segs
    .filter((s) => s.changed)
    .map((s) => s.text)
    .join('');

const kinds = (rows: Row[]) => rows.map((r) => r.kind);

/** 手順を当てはめて、左から右が作れるか */
function apply(a: number[], b: number[], ops: Op[]): boolean {
  const out: number[] = [];
  let i = 0;
  let j = 0;
  for (const op of ops) {
    if (op === 0) {
      if (a[i] !== b[j]) return false;
      out.push(a[i]);
      i++;
      j++;
    } else if (op === 1) i++;
    else out.push(b[j++]);
  }
  return i === a.length && j === b.length && out.join(',') === b.join(',');
}

/** LCS の長さ（素朴な DP。突き合わせ用） */
function lcs(a: number[], b: number[]): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[a.length][b.length];
}

/** 再現できる乱数 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('約束1: 行の対応は Myers の最短の編集', () => {
  it('ランダムな列で、手順が正しく、編集の数が最短（N + M − 2·LCS）', () => {
    const r = rng(42);
    for (let t = 0; t < 300; t++) {
      const a = Array.from({ length: Math.floor(r() * 25) }, () => Math.floor(r() * 4));
      const b = Array.from({ length: Math.floor(r() * 25) }, () => Math.floor(r() * 4));
      const ops = diffSequences(a, b);
      expect(apply(a, b, ops)).toBe(true);
      const d = ops.filter((o) => o !== 0).length;
      const best = a.length + b.length - 2 * lcs(a, b);
      expect(d).toBe(best);
      expect(editDistance(a, b, 1000)).toBe(best);
    }
  });

  it('editDistance は上限を超えたら -1', () => {
    expect(editDistance([1, 2, 3], [4, 5, 6], 5)).toBe(-1);
    expect(editDistance([1, 2, 3], [4, 5, 6], 6)).toBe(6);
    expect(editDistance([], [], 0)).toBe(0);
  });

  it('外部ライブラリを import しない（依存を増やさない）', () => {
    const src = readFileSync(fileURLToPath(new URL('../lib/text-hikaku.ts', import.meta.url)), 'utf8');
    const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.every((p) => p.startsWith('./'))).toBe(true);
  });

  it('行の追加・削除を取り違えない', () => {
    const r = ok(compareTexts('a\nb\nc\n', 'a\nx\nb\nc\n'));
    expect(kinds(r.rows)).toEqual(['equal', 'insert', 'equal', 'equal']);
    expect(r.summary).toMatchObject({ added: 1, deleted: 0, changed: 0, identical: false });
  });
});

describe('約束2: 変更の対と一致率', () => {
  it('一致率は Dice 係数（共通部分 ×2 ÷ 合計）。どちらも空なら 100%', () => {
    expect(similarity('', '')).toBe(1);
    expect(similarity('abcd', 'abxd')).toBeCloseTo(6 / 8);
    expect(similarity('abc', 'xyz')).toBe(0);
  });

  it('40% 以上なら変更、下回れば削除＋追加', () => {
    // 'abcde' と 'abxyz'：共通 2 → 4/10 = 40% で対になる
    expect(ok(compareTexts('abcde', 'abxyz')).rows[0].kind).toBe('change');
    // 'abcde' と 'axyzw'：共通 1 → 2/10 = 20% で別の行
    expect(kinds(ok(compareTexts('abcde', 'axyzw')).rows)).toEqual(['delete', 'insert']);
  });

  it('変更の行の中は、変わった文字だけを塗る（日本語でも）', () => {
    const r = ok(compareTexts('本契約の期間は1年とする。', '本契約の期間は2年とする。'));
    const row = r.rows[0];
    expect(row.kind).toBe('change');
    if (row.kind !== 'change') return;
    expect(changedText(row.leftSegs)).toBe('1');
    expect(changedText(row.rightSegs)).toBe('2');
    expect(row.leftSegs.map((s) => s.text).join('')).toBe('本契約の期間は1年とする。');
  });

  it('全く別の行を黄色で並べない。挿し込まれた行の後ろの似た行と対にする', () => {
    const r = ok(compareTexts('東京都港区芝公園4-2-8', '新しく足した一行\n東京都港区芝公園4-2-9'));
    expect(kinds(r.rows)).toEqual(['insert', 'change']);
  });

  it('空の行と中身のある行は対にしない', () => {
    expect(pairLines([], normalizeLine('abc', NO_IGNORE)).pair).toBe(false);
  });
});

describe('約束3: 書記素単位', () => {
  it('絵文字・結合文字・異体字セレクタを割らない', () => {
    expect(splitGraphemes('👨‍👩‍👧').length).toBe(1);
    expect(splitGraphemes('が').length).toBe(1);
    expect(splitGraphemes('葛\u{E0100}').length).toBe(1);
    expect(splitGraphemes('🇯🇵').length).toBe(1);
  });

  it('絵文字が変わったら、その絵文字まるごとを塗る', () => {
    const row = ok(compareTexts('今日は👍です', '今日は👎です')).rows[0];
    if (row.kind !== 'change') throw new Error('change ではない');
    expect(changedText(row.leftSegs)).toBe('👍');
    expect(changedText(row.rightSegs)).toBe('👎');
  });

  it('結合文字の濁点だけが違えば、その 1 文字を塗る（か＋゙ を途中で割らない）', () => {
    const row = ok(compareTexts('かがみ', 'がかみ')).rows[0];
    if (row.kind !== 'change') throw new Error('change ではない');
    expect(changedText(row.rightSegs)).toBe('が');
  });
});

describe('約束4: 見えない文字の印', () => {
  it('全角スペースが違いの原因なら、印を付けて知らせる', () => {
    const r = ok(compareTexts('山田 太郎', '山田　太郎'));
    const row = r.rows[0];
    if (row.kind !== 'change') throw new Error('change ではない');
    const inv = row.rightSegs.find((s) => s.invisible);
    expect(inv?.invisible?.name).toBe('全角スペース');
    expect(inv?.text).toBe('　');
    expect(r.summary.invisibles.map((c) => c.name)).toEqual(['全角スペース']);
  });

  it('ゼロ幅スペース・NBSP・タブ・BOM にも印が付く', () => {
    for (const ch of ['​', ' ', '\t', '﻿', '‌', '‍']) {
      const r = ok(compareTexts('abcdef', `abc${ch}def`));
      expect(r.summary.invisibles.map((c) => c.char)).toEqual([ch]);
    }
  });

  it('変わっていない部分の全角スペースには印を付けない', () => {
    const r = ok(compareTexts('東京都　港区 1', '東京都　港区 2'));
    expect(r.summary.invisibles).toEqual([]);
  });

  it('呼び名は JSON 整形と同じ一覧を共有する', () => {
    const names = new Map(INVISIBLE_CHARS.map((c) => [c.char, c.name]));
    for (const [ch, name] of SPACE_CHAR_NAMES) expect(names.get(ch)).toBe(name);
    // JSON 整形の挙動は変えない（全角スペースの呼び名が出る）
    const res = checkJson('{"a":　1}');
    expect(JSON.stringify(res)).toContain('全角スペース');
  });
});

describe('約束5: 上限と打ち切り', () => {
  it(`片側 ${MAX_CHARS.toLocaleString()} 字を超えたら比べない`, () => {
    const r = compareTexts('a'.repeat(MAX_CHARS + 1), 'b');
    expect(r).toMatchObject({ status: 'too-long', side: 'left', chars: MAX_CHARS + 1 });
    expect(compareTexts('a', 'a'.repeat(MAX_CHARS)).status).toBe('ok');
  });

  it(`片側 ${MAX_LINES.toLocaleString()} 行を超えたら比べない`, () => {
    const r = compareTexts('x', 'a\n'.repeat(MAX_LINES + 1));
    expect(r).toMatchObject({ status: 'too-long', side: 'right', lines: MAX_LINES + 1 });
    expect(compareTexts('a\n'.repeat(MAX_LINES), 'a\n'.repeat(MAX_LINES)).status).toBe('ok');
  });

  it(`行の編集距離 D が ${MAX_LINE_D.toLocaleString()} を超えたら「違いが多すぎます」`, () => {
    // 左 2,501 行・右 2,500 行がすべて違う → D = 5,001
    const left = Array.from({ length: 2501 }, (_, i) => `L${i}`).join('\n');
    const right = Array.from({ length: 2500 }, (_, i) => `R${i}`).join('\n');
    expect(compareTexts(left, right).status).toBe('too-many-diffs');
    // ちょうど 5,000 は比べる
    const right2 = Array.from({ length: 2499 }, (_, i) => `R${i}`).join('\n');
    expect(compareTexts(left, right2).status).toBe('ok');
  });

  it('1 万行どうしで違いが少なければ比べられる', () => {
    const left = Array.from({ length: MAX_LINES }, (_, i) => `行 ${i}`);
    const right = left.map((l, i) => (i % 10 === 0 ? `${l} 改` : l));
    const r = ok(compareTexts(left.join('\n'), right.join('\n')));
    expect(r.summary.changed).toBe(1000);
    expect(r.hunks.length).toBe(1000);
  });

  it(`文字単位は 1 対ごとに書記素 ${MAX_PAIR_GRAPHEMES.toLocaleString()} 個まで。超えたら行全体を変更として塗る`, () => {
    const long = 'あ'.repeat(MAX_PAIR_GRAPHEMES + 1);
    const row = ok(compareTexts(long, `${long}い`)).rows[0];
    expect(row.kind).toBe('change');
    if (row.kind !== 'change') return;
    expect(row.charLevel).toBe(false);
    expect(changedText(row.rightSegs)).toBe(`${long}い`);
  });

  it(`文字単位の D が ${MAX_CHAR_D} を超えたら行全体を変更として塗る`, () => {
    const base = 'x'.repeat(1000);
    const other = 'x'.repeat(600) + 'y'.repeat(501);
    const p = pairLines(normalizeLine(base, NO_IGNORE), normalizeLine(other, NO_IGNORE));
    expect(p).toEqual({ pair: true });
    const p2 = pairLines(normalizeLine(base, NO_IGNORE), normalizeLine('x'.repeat(990), NO_IGNORE));
    expect(p2.pair && p2.ops?.length).toBe(1000);
  });
});

describe('約束6: 境界値', () => {
  it('両方が空なら同じ', () => {
    const r = ok(compareTexts('', ''));
    expect(r.rows).toEqual([]);
    expect(r.summary.identical).toBe(true);
  });

  it('片方が空なら、全部追加／全部削除', () => {
    expect(ok(compareTexts('', 'a\nb')).summary).toMatchObject({ added: 2, deleted: 0 });
    expect(ok(compareTexts('a\nb', '')).summary).toMatchObject({ added: 0, deleted: 2 });
  });

  it('末尾の改行の有無だけが違うときは、同じで「最後の行に改行がありません」', () => {
    const r = ok(compareTexts('a\nb\n', 'a\nb'));
    expect(r.summary.identical).toBe(true);
    expect(r.summary.missingFinalNewline).toBe('right');
  });

  it('改行コードの違いは常に吸収して知らせる。混在も扱える', () => {
    const r = ok(compareTexts('a\r\nb\r\n', 'a\nb\n'));
    expect(r.summary.identical).toBe(true);
    expect(r.summary.eolDiffers).toEqual({ left: 'CRLF', right: 'LF' });
    expect(splitLines('a\r\nb\nc\rd')).toEqual({ lines: ['a', 'b', 'c', 'd'], eol: 'mixed', endsWithNewline: false });
    expect(ok(compareTexts('a\r\nb\nc', 'a\nb\r\nc')).summary.eolDiffers).toBeNull();
  });

  it('無視のスイッチ：全角・半角を区別しないと、ｶﾞｲﾄﾞ と ガイド本 は 本 だけが塗られる', () => {
    const row = ok(compareTexts('ｶﾞｲﾄﾞ', 'ガイド本', opt({ width: true }))).rows[0];
    if (row.kind !== 'change') throw new Error('change ではない');
    expect(changedText(row.leftSegs)).toBe('');
    expect(changedText(row.rightSegs)).toBe('本');
    // 表示は元の文字のまま
    expect(row.leftSegs.map((s) => s.text).join('')).toBe('ｶﾞｲﾄﾞ');
  });

  it('無視のスイッチ：空白の違いを無視すると、a␣␣␣b と a b c は「 c」だけが塗られる', () => {
    const row = ok(compareTexts('a   b', 'a b c', opt({ whitespace: true }))).rows[0];
    if (row.kind !== 'change') throw new Error('change ではない');
    expect(changedText(row.leftSegs)).toBe('');
    expect(changedText(row.rightSegs)).toBe(' c');
  });

  it('空白の無視：行頭・行末の空白・全角スペース・タブ・NBSP の違いは同じとみなす', () => {
    const r = ok(compareTexts('  東京都　港区\t', '東京都  港区', opt({ whitespace: true })));
    expect(r.summary.identical).toBe(true);
    expect(r.summary.identicalRaw).toBe(false);
    // 削った行頭の空白は直後の書記素の範囲に含める
    const u = normalizeLine('  ab ', opt({ whitespace: true }));
    expect(u).toEqual([
      { g: 'a', start: 0, end: 3 },
      { g: 'b', start: 3, end: 5 },
    ]);
  });

  it('全角・半角：NFKC ではなく半角⇔全角ツールの対応表（① や ㈱ は同じにしない）', () => {
    expect(ok(compareTexts('ＡＢＣ１２３', 'ABC123', opt({ width: true }))).summary.identical).toBe(true);
    expect(ok(compareTexts('①', '1', opt({ width: true }))).summary.identical).toBe(false);
    expect(ok(compareTexts('㈱', '(株)', opt({ width: true }))).summary.identical).toBe(false);
  });

  it('大文字・小文字：A-Z だけ（ギリシャ文字・全角英字は単独では同じにしない）', () => {
    expect(ok(compareTexts('Hello', 'hELLO', opt({ case: true }))).summary.identical).toBe(true);
    expect(ok(compareTexts('Σ', 'σ', opt({ case: true }))).summary.identical).toBe(false);
    expect(ok(compareTexts('Ａ', 'ａ', opt({ case: true }))).summary.identical).toBe(false);
    expect(ok(compareTexts('Ａ', 'a', opt({ case: true, width: true }))).summary.identical).toBe(true);
  });

  it('空行を無視：空白だけの行を比べずに除き、灰色の行として元の位置に残す', () => {
    const r = ok(compareTexts('a\n\nb', 'a\nb\n  \n', opt({ blankLines: true })));
    expect(r.summary.identical).toBe(true);
    expect(kinds(r.rows)).toEqual(['equal', 'skipped', 'equal', 'skipped']);
  });

  it('入っている無視のスイッチの名前', () => {
    expect(activeIgnoreLabels(opt({ whitespace: true, width: true }))).toEqual(['空白の違い', '全角・半角']);
  });
});

describe('約束7: 貼った文字列を HTML として扱わない', () => {
  it('<script> や <img onerror> は文字のまま一片に入る', () => {
    const r = ok(compareTexts('<p>a</p>', '<script>alert(1)</script>\n<img src=x onerror=alert(1)>'));
    const all = r.rows.flatMap((row) => ('segs' in row ? row.segs : 'rightSegs' in row ? row.rightSegs : []));
    expect(all.map((s) => s.text).join('')).toContain('<script>alert(1)</script>');
  });

  it('画面は dangerouslySetInnerHTML を使わない（JSON-LD の script を除く）', () => {
    const dir = fileURLToPath(new URL('../app/text-hikaku/', import.meta.url));
    for (const f of readdirSync(dir)) {
      const src = readFileSync(`${dir}${f}`, 'utf8');
      const uses = src.match(/dangerouslySetInnerHTML/g) ?? [];
      if (f === 'page.tsx') expect(uses.length, f).toBe(1);
      else expect(uses.length, f).toBe(0);
    }
  });

  it('画面は通信しない（fetch・XMLHttpRequest・sendBeacon を書かない）', () => {
    const dir = fileURLToPath(new URL('../app/text-hikaku/', import.meta.url));
    for (const f of readdirSync(dir)) {
      const src = readFileSync(`${dir}${f}`, 'utf8');
      expect(src, f).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage/);
    }
  });
});

describe('表示の補助', () => {
  it('次の違いの飛び先は、違いのまとまりの先頭', () => {
    const r = ok(compareTexts('a\nbb\nc\nd\nee', 'a\nbx\nc\nd\nex\nf'));
    expect(r.hunks.map((i) => r.rows[i].kind)).toEqual(['change', 'change']);
    expect(r.hunks).toEqual([1, 4]);
  });

  it('変わった行だけ表示：前後 2 行を残して畳む', () => {
    const left = Array.from({ length: 20 }, (_, i) => `${i}`).join('\n');
    const right = left.replace('\n10\n', '\n10x\n');
    const items = collapseRows(ok(compareTexts(left, right)).rows);
    expect(items).toEqual([
      { type: 'gap', count: 8 },
      ...[8, 9, 10, 11, 12].map((index) => ({ type: 'row', index })),
      { type: 'gap', count: 7 },
    ]);
  });

  it('結果のコピーは unified diff の形式', () => {
    const r = ok(compareTexts('a\nb\nc\nd\ne\nf\ng\nh\n', 'a\nb\nc\nd\nE\nf\ng\nh\ni\n'));
    expect(formatUnified(r.rows)).toBe(
      ['--- 元の文章', '+++ 新しい文章', '@@ -2,7 +2,8 @@', ' b', ' c', ' d', '-e', '+E', ' f', ' g', ' h', '+i', ''].join('\n'),
    );
    expect(formatUnified(ok(compareTexts('a', 'a')).rows)).toBe('');
  });

  it('unified：片方が空の範囲は件数 0 で、直前の行番号を書く', () => {
    const r = ok(compareTexts('', 'x\ny'));
    expect(formatUnified(r.rows)).toBe('--- 元の文章\n+++ 新しい文章\n@@ -0,0 +1,2 @@\n+x\n+y\n');
  });
});

describe('計測', () => {
  it('規模の区分は行数の実数を送らない', () => {
    expect(sizeBucket(0)).toBe('lines-lt100');
    expect(sizeBucket(99)).toBe('lines-lt100');
    expect(sizeBucket(100)).toBe('lines-lt1000');
    expect(sizeBucket(999)).toBe('lines-lt1000');
    expect(sizeBucket(1000)).toBe('lines-gte1000');
  });

  it('action は区分・無視のスイッチ・表示の形だけ', () => {
    expect(compareAction('lines-lt100', NO_IGNORE, 'split')).toBe('compare-lines-lt100-ignore-none-split');
    expect(compareAction('lines-gte1000', opt({ whitespace: true, width: true }), 'unified')).toBe(
      'compare-lines-gte1000-ignore-ws+width-unified',
    );
  });
});

describe('ファイルの文字コード', () => {
  /** 「テスト,東京」を Shift_JIS で書いたバイト列 */
  const SJIS = new Uint8Array([0x83, 0x65, 0x83, 0x58, 0x83, 0x67, 0x2c, 0x93, 0x8c, 0x8b, 0x9e]);

  it('UTF-8 はそのまま読み、BOM は取り除く', () => {
    const bytes = new TextEncoder().encode('テスト,東京');
    expect(decodeText(bytes)).toEqual({ text: 'テスト,東京', encoding: 'utf-8' });
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes]))).toEqual({ text: 'テスト,東京', encoding: 'utf-8' });
  });

  it('UTF-8 として正しくなければ Shift_JIS で読み直す（Excel の CSV）', () => {
    expect(decodeText(SJIS)).toEqual({ text: 'テスト,東京', encoding: 'shift_jis' });
  });

  it('BOM つきの UTF-16 も読める', () => {
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x42, 0x30]))).toEqual({ text: 'あ', encoding: 'utf-16le' });
    expect(decodeText(new Uint8Array([0xfe, 0xff, 0x30, 0x42]))).toEqual({ text: 'あ', encoding: 'utf-16be' });
  });

  it('画面はファイルを readAsText（UTF-8 決め打ち）で読まない', () => {
    const src = readFileSync(fileURLToPath(new URL('../app/text-hikaku/Calculator.tsx', import.meta.url)), 'utf8');
    expect(src).not.toMatch(/readAsText/);
    expect(src).toMatch(/decodeText/);
  });
});

describe('出どころの表示', () => {
  it('bisect() の JSDoc に diff-match-patch とライセンスを書いてある', () => {
    const src = readFileSync(fileURLToPath(new URL('../lib/text-hikaku.ts', import.meta.url)), 'utf8');
    const doc = src.slice(0, src.indexOf('function bisect('));
    expect(doc.slice(doc.lastIndexOf('/**'))).toMatch(/diff-match-patch[\s\S]*Apache License 2\.0/);
  });
});
