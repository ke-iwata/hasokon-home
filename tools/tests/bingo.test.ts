import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FREE,
  INITIAL_STATE,
  LINES,
  PASSPHRASE_ALPHABET,
  STANDARD_MAX,
  STORAGE_KEY,
  addBingoDone,
  bingoTable,
  boardRows,
  cardFromRandom,
  checkCard,
  drawNext,
  fnv1a32,
  letterOf,
  makeCard,
  newPassphrase,
  normalizePassphrase,
  numberLabel,
  parseSaved,
  randomBelow,
  remainingNumbers,
  resetGame,
  serializeState,
  sfc32,
  shouldDrawOnKey,
  undoLast,
  type Card,
  type KeyContext,
  type Uint32Source,
} from '@/lib/bingo';
import { robotsFor, tools } from '@/lib/registry';

/**
 * ビンゴ抽選機とビンゴカード。
 * 仕様: docs/features/bingo-chusenki.md（「テスト」の節）
 */

/** 決まった値を順に返す乱数源 */
function seq(values: number[]): Uint32Source {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('用意した乱数を使い切った');
    return values[i++];
  };
}

describe('抽選', () => {
  it('75 回引くと 1〜75 がちょうど 1 回ずつ出て、76 回目は引けない', () => {
    let drawn: number[] = [];
    for (let i = 0; i < 75; i++) {
      const r = drawNext(drawn, 75);
      expect(r).not.toBeNull();
      drawn = r!.drawn;
    }
    expect([...drawn].sort((a, b) => a - b)).toEqual(Array.from({ length: 75 }, (_, k) => k + 1));
    expect(drawNext(drawn, 75)).toBeNull();
  });

  it('1 つ戻すと直前の番号が残りに戻る', () => {
    const a = drawNext([], 75)!;
    const b = drawNext(a.drawn, 75)!;
    expect(remainingNumbers(b.drawn, 75)).not.toContain(b.number);
    const back = undoLast(b.drawn);
    expect(back).toEqual(a.drawn);
    expect(remainingNumbers(back, 75)).toContain(b.number);
    expect(remainingNumbers(back, 75)).not.toContain(a.number);
  });

  it('範囲 1〜30 では 31 以上が出ない', () => {
    let drawn: number[] = [];
    for (let i = 0; i < 30; i++) drawn = drawNext(drawn, 30)!.drawn;
    expect(Math.max(...drawn)).toBe(30);
    expect(new Set(drawn).size).toBe(30);
    expect(drawNext(drawn, 30)).toBeNull();
  });

  it('まだ出ていない番号の中から選ぶ（乱数の値と残りの位置が対応する）', () => {
    // 残りは [1,2,4,5]（3 が出ている）。乱数 2 → 3 番目の 4
    expect(drawNext([3], 5, seq([2]))!.number).toBe(4);
  });
});

describe('乱数の偏り（棄却法）', () => {
  it('2^32 % n 個の端を捨てて引き直す', () => {
    const n = 75;
    const limit = 2 ** 32 - (2 ** 32 % n);
    // limit ちょうどとそれ以上は捨てられ、次の値が使われる
    expect(randomBelow(n, seq([limit, 2 ** 32 - 1, 7]))).toBe(7);
    // limit - 1 は使われる（剰余 74）
    expect(randomBelow(n, seq([limit - 1]))).toBe((limit - 1) % n);
    expect((limit - 1) % n).toBe(n - 1);
  });

  it('受け入れる範囲では 0〜n-1 がちょうど同じ回数ずつ出る（2^32 % n を捨てるので偏りがない）', () => {
    const n = 75;
    const limit = 2 ** 32 - (2 ** 32 % n);
    expect(limit % n).toBe(0);
  });

  it('2^32 の約数のときは何も捨てない', () => {
    expect(randomBelow(16, seq([2 ** 32 - 1]))).toBe(15);
  });

  it('範囲がおかしいと投げる', () => {
    expect(() => randomBelow(0)).toThrow(RangeError);
    expect(() => randomBelow(1.5)).toThrow(RangeError);
  });

  it('既定の乱数源は Web Crypto で、Math.random を使わない', () => {
    const src = readFileSync(fileURLToPath(new URL('../lib/bingo.ts', import.meta.url)), 'utf8');
    expect(src).toContain('getRandomValues');
    expect(src).not.toMatch(/Math\.random\(/);
    const ui = readFileSync(fileURLToPath(new URL('../app/bingo/Calculator.tsx', import.meta.url)), 'utf8');
    expect(ui).not.toMatch(/Math\.random\(/);
  });
});

describe('表示', () => {
  it('1〜75 のときだけ「B-7」の形', () => {
    expect(numberLabel(7, 75)).toBe('B-7');
    expect(numberLabel(16, 75)).toBe('I-16');
    expect(numberLabel(45, 75)).toBe('N-45');
    expect(numberLabel(75, 75)).toBe('O-75');
    expect(numberLabel(7, 30)).toBe('7');
    expect(numberLabel(7, 99)).toBe('7');
    expect(letterOf(76)).toBeNull();
  });

  it('盤面：1〜75 は B〜O の5行×15、それ以外は 10 列で折り返す', () => {
    const std = boardRows(75);
    expect(std.map((r) => r.letter)).toEqual(['B', 'I', 'N', 'G', 'O']);
    expect(std.every((r) => r.numbers.length === 15)).toBe(true);
    expect(std[4].numbers[14]).toBe(75);

    const small = boardRows(30);
    expect(small).toHaveLength(3);
    expect(small.every((r) => r.letter === null)).toBe(true);
    const odd = boardRows(43);
    expect(odd.map((r) => r.numbers.length)).toEqual([10, 10, 10, 10, 3]);
    expect(odd.flatMap((r) => r.numbers)).toEqual(Array.from({ length: 43 }, (_, k) => k + 1));
  });
});

describe('キー操作の誤爆防止', () => {
  const base: KeyContext = {
    key: ' ',
    repeat: false,
    inInput: false,
    onDrawButton: false,
    onOtherControl: false,
    dialogOpen: false,
    animating: false,
  };

  /** keydown と、フォーカスがあるボタンの click を合わせて、1 回のキーで何個引くか */
  function drawsFor(c: KeyContext): number {
    const byKeydown = shouldDrawOnKey(c) ? 1 : 0;
    // 「引く」ボタンにフォーカスがあるとき、Space / Enter はボタンの click を起こす（演出中はボタンが押せない）
    const byClick = c.onDrawButton && !c.repeat && !c.animating && !c.dialogOpen ? 1 : 0;
    return byKeydown + byClick;
  }

  it('何もフォーカスしていないときの Space / Enter で 1 個引く', () => {
    expect(drawsFor(base)).toBe(1);
    expect(drawsFor({ ...base, key: 'Enter' })).toBe(1);
  });

  it('入力欄にフォーカスがあるときは引かない', () => {
    expect(drawsFor({ ...base, inInput: true })).toBe(0);
  });

  it('確認ダイアログが開いているときは引かない', () => {
    expect(drawsFor({ ...base, dialogOpen: true })).toBe(0);
  });

  it('演出のあいだは引かない', () => {
    expect(drawsFor({ ...base, animating: true })).toBe(0);
  });

  it('「引く」ボタンにフォーカスして Space を押しても 1 個だけ（keydown 側は何もしない）', () => {
    expect(shouldDrawOnKey({ ...base, onDrawButton: true })).toBe(false);
    expect(drawsFor({ ...base, onDrawButton: true })).toBe(1);
    expect(drawsFor({ ...base, key: 'Enter', onDrawButton: true })).toBe(1);
  });

  it('押しっぱなし（repeat）では引かない', () => {
    expect(drawsFor({ ...base, repeat: true })).toBe(0);
  });

  it('ほかのボタンにフォーカスがあるときはそのボタンに任せる', () => {
    expect(shouldDrawOnKey({ ...base, onOtherControl: true })).toBe(false);
  });

  it('Space / Enter 以外のキーでは引かない', () => {
    expect(shouldDrawOnKey({ ...base, key: 'a' })).toBe(false);
    expect(shouldDrawOnKey({ ...base, key: 'ArrowDown' })).toBe(false);
  });
});

describe('合言葉', () => {
  it('紛らわしい文字（0・O・1・I・l）を含まない', () => {
    for (const ch of '0O1Il') expect(PASSPHRASE_ALPHABET).not.toContain(ch);
    expect(new Set(PASSPHRASE_ALPHABET).size).toBe(PASSPHRASE_ALPHABET.length);
    for (let i = 0; i < 200; i++) {
      const p = newPassphrase();
      expect(p).toMatch(/^[A-Z2-9]{6}$/);
      expect(p).not.toMatch(/[01OIl]/);
    }
  });

  it('大文字小文字・空白・全角を区別せずに読む', () => {
    expect(normalizePassphrase('k7m2qx')).toBe('K7M2QX');
    expect(normalizePassphrase(' K7M 2QX ')).toBe('K7M2QX');
    expect(normalizePassphrase('Ｋ７Ｍ２ＱＸ')).toBe('K7M2QX');
    expect(normalizePassphrase('K7M-2QX')).toBe('K7M2QX');
  });

  it('使えない文字・長さ違いは読まない', () => {
    expect(normalizePassphrase('K7M2Q0')).toBeNull();
    expect(normalizePassphrase('K7M2Q')).toBeNull();
    expect(normalizePassphrase('K7M2QXY')).toBeNull();
    expect(normalizePassphrase('')).toBeNull();
  });
});

describe('カード', () => {
  function assertStandard(card: Card) {
    expect(card).toHaveLength(25);
    expect(card[12]).toBe(FREE);
    for (let col = 0; col < 5; col++) {
      const values = [0, 1, 2, 3, 4].map((r) => card[r * 5 + col]).filter((n) => n !== FREE);
      expect(values).toHaveLength(col === 2 ? 4 : 5);
      expect(new Set(values).size).toBe(values.length);
      for (const n of values) {
        expect(n).toBeGreaterThanOrEqual(col * 15 + 1);
        expect(n).toBeLessThanOrEqual(col * 15 + 15);
      }
    }
  }

  it('各列がその列の範囲内・列の中で重複なし・中央が FREE', () => {
    for (let no = 1; no <= 100; no++) assertStandard(makeCard('K7M2QX', no));
  });

  it('同じ合言葉と番号なら同じカード、番号や合言葉が違えば違うカード', () => {
    expect(makeCard('K7M2QX', 12)).toEqual(makeCard('K7M2QX', 12));
    expect(makeCard('K7M2QX', 12)).not.toEqual(makeCard('K7M2QX', 13));
    expect(makeCard('K7M2QX', 12)).not.toEqual(makeCard('K7M2QY', 12));
  });

  it('同じ入力からは、いつ作っても同じ並び（種の作り方を変えると配ったカードが変わる）', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    const a = sfc32(1);
    const b = sfc32(1);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('1 セット 100 枚で重複がない', () => {
    const seen = new Set<string>();
    for (let no = 1; no <= 100; no++) seen.add(makeCard('K7M2QX', no).join(','));
    expect(seen.size).toBe(100);
  });

  it('番号ごとに独立：No.57 を単独で作ったカードと、No.1〜100 をまとめて作ったときの No.57 が一致する', () => {
    const alone = makeCard('ABCDEF', 57);
    const batch = Array.from({ length: 100 }, (_, i) => makeCard('ABCDEF', i + 1));
    expect(batch[56]).toEqual(alone);
    // あとから No.101〜110 を足しても、配った No.1〜100 は変わらない
    Array.from({ length: 10 }, (_, i) => makeCard('ABCDEF', 101 + i));
    expect(makeCard('ABCDEF', 57)).toEqual(alone);
  });

  it('乱数源から作るカードも標準の形', () => {
    const r = sfc32(42);
    for (let i = 0; i < 50; i++) assertStandard(cardFromRandom(r));
  });
});

describe('判定', () => {
  /** 決まった並びのカード：列 c・行 r に c*15 + r + 1 */
  const card: Card = Array.from({ length: 25 }, (_, i) => {
    const r = Math.floor(i / 5);
    const c = i % 5;
    return i === 12 ? FREE : c * 15 + r + 1;
  });

  it('縦横斜めの 12 列がある', () => {
    expect(LINES).toHaveLength(12);
  });

  it('12 列のそれぞれでビンゴを検出する', () => {
    for (const line of LINES) {
      const drawn = line.cells.map((i) => card[i]).filter((n) => n !== FREE);
      const result = checkCard(card, drawn);
      expect(result.status, line.name).toBe('bingo');
      expect(result.bingo.map((l) => l.name)).toContain(line.name);
    }
  });

  it('FREE を含む列（横3行目・縦N列・斜め2本）は 4 個でビンゴ', () => {
    const withFree = LINES.filter((l) => l.cells.includes(12));
    expect(withFree.map((l) => l.name)).toEqual(['横3行目', '縦 N 列', '斜め（左上から右下）', '斜め（右上から左下）']);
    for (const line of withFree) {
      const drawn = line.cells.filter((i) => i !== 12).map((i) => card[i]);
      expect(drawn).toHaveLength(4);
      expect(checkCard(card, drawn).status).toBe('bingo');
    }
  });

  it('リーチと待っている番号', () => {
    // 横1行目のうち4つ（B-1, I-16, N-31, G-46）。O-61 待ち
    const result = checkCard(card, [1, 16, 31, 46]);
    expect(result.status).toBe('reach');
    expect(result.reach.map((r) => r.line.name)).toEqual(['横1行目']);
    expect(result.waiting).toEqual([61]);
  });

  it('斜めは FREE があるので 3 個でリーチ', () => {
    // 斜め（左上から右下）は 1, 17, FREE, 49, 65
    const result = checkCard(card, [1, 17, 49]);
    expect(result.status).toBe('reach');
    expect(result.waiting).toEqual([65]);
  });

  it('何も揃っていなければ「まだ」。出ていない番号には印が付かない', () => {
    const result = checkCard(card, [75]);
    expect(result.status).toBe('none');
    expect(result.marked.filter(Boolean)).toHaveLength(1); // FREE だけ
  });

  it('戻した番号でビンゴが崩れたら、確かめ直すと「ビンゴではない」', () => {
    const drawn = [1, 16, 31, 46, 61];
    expect(checkCard(card, drawn).status).toBe('bingo');
    expect(checkCard(card, undoLast(drawn)).status).toBe('reach');
  });
});

describe('目安の表（本文の表）', () => {
  /** 仕様書の表（2026-11-09 のシミュレーション 4,000 回）。±1 に収まること */
  const SPEC: Record<number, [number, number | null]> = {
    1: [42, null],
    10: [26, 55],
    20: [22, 41],
    30: [21, 37],
    50: [19, 33],
    100: [16, 28],
  };

  it('固定シードのシミュレーションで、中央値が仕様書の表の ±1 に収まる', { timeout: 30000 }, () => {
    const table = bingoTable();
    expect(table.map((r) => r.cards)).toEqual([1, 10, 20, 30, 50, 100]);
    for (const row of table) {
      const [first, tenth] = SPEC[row.cards];
      expect(Math.abs(row.firstMedian - first), `${row.cards} 枚の最初のビンゴ`).toBeLessThanOrEqual(1);
      if (tenth === null) expect(row.tenthMedian).toBeNull();
      else expect(Math.abs(row.tenthMedian! - tenth), `${row.cards} 枚の 10 人目`).toBeLessThanOrEqual(1);
    }
  });

  it('本文は表の数字を手で書かず、tables.ts から引いている', () => {
    const page = readFileSync(fileURLToPath(new URL('../app/bingo/page.tsx', import.meta.url)), 'utf8');
    expect(page).toContain("from './tables'");
    // 本文の「◯個目」はすべて式から出す
    expect(page).not.toMatch(/\d+\s*個目/);
    // 出典のない経験則（人数の◯割など）を載せない
    expect(page).not.toMatch(/人数の\s*[0-9０-９一二三四五六七八九]+\s*割/);
  });
});

describe('保存（localStorage）', () => {
  it('鍵に版が付いている', () => {
    expect(STORAGE_KEY).toBe('hasokon:bingo:v1');
  });

  const saved = {
    ...INITIAL_STATE,
    drawn: [7, 33, 61],
    passphrase: 'K7M2QX',
    bingoDone: [12, 3],
    noAnimation: true,
    sound: true,
  };

  it('書いて読むと同じ', () => {
    expect(parseSaved(serializeState(saved))).toEqual({ ...saved, bingoDone: [3, 12] });
  });

  it('「最初からやり直す」で出た順とビンゴ済みが空になり、合言葉とスイッチ類は残る', () => {
    const reset = resetGame(saved);
    expect(reset.drawn).toEqual([]);
    expect(reset.bingoDone).toEqual([]);
    expect(reset.passphrase).toBe('K7M2QX');
    expect(reset.noAnimation).toBe(true);
    expect(reset.sound).toBe(true);
    expect(reset.max).toBe(STANDARD_MAX);
  });

  it('「1 つ戻す」ではビンゴ済みを消さない（戻すのは出た順だけ）', () => {
    const after = { ...saved, drawn: undoLast(saved.drawn) };
    expect(after.bingoDone).toEqual(saved.bingoDone);
  });

  it('範囲 1〜30 のとき「B-」の文字を出さない', () => {
    const s = parseSaved(serializeState({ ...INITIAL_STATE, max: 30, drawn: [7, 21] }))!;
    expect(s.drawn.map((n) => numberLabel(n, s.max))).toEqual(['7', '21']);
  });

  it('壊れた保存・古い形・範囲外の番号は読まない（落ちない）', () => {
    expect(parseSaved(null)).toBeNull();
    expect(parseSaved('not json')).toBeNull();
    expect(parseSaved('[]')).toBeNull();
    expect(parseSaved(JSON.stringify({ drawn: [1], max: 200 }))).toBeNull();
    expect(parseSaved(JSON.stringify({ drawn: [76], max: 75 }))).toBeNull();
    expect(parseSaved(JSON.stringify({ drawn: [3, 3], max: 75 }))).toBeNull();
  });

  it('合言葉が壊れていたら空にして読む。スイッチは既定（演出あり・音なし）', () => {
    const s = parseSaved(JSON.stringify({ drawn: [], max: 75, passphrase: 'bad!!' }))!;
    expect(s.passphrase).toBe('');
    expect(s.noAnimation).toBe(false);
    expect(s.sound).toBe(false);
  });

  it('ビンゴ済みは重複なく小さい順', () => {
    expect(addBingoDone([5, 12], 3)).toEqual([3, 5, 12]);
    expect(addBingoDone([5, 12], 5)).toEqual([5, 12]);
  });

  it('カードの中身は保存しない（保存する形にカードが無い）', () => {
    expect(Object.keys(INITIAL_STATE).sort()).toEqual(
      ['bingoDone', 'drawn', 'max', 'noAnimation', 'passphrase', 'sound'].sort(),
    );
  });
});

describe('registry とページ', () => {
  it('「決める・選ぶ」に wip で入っている', () => {
    const entry = tools.find((t) => t.slug === 'bingo');
    expect(entry).toBeDefined();
    expect(entry!.category).toBe('決める・選ぶ');
    expect(entry!.stage).toBe('wip');
    expect(entry!.icon).toBe('GridFour');
    expect(robotsFor('bingo')).toMatchObject({ index: false });
  });

  it('印刷は data-print="sheet" と白地・黒字・1マス18mm・数字26pt', () => {
    const css = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf8');
    const ui = readFileSync(fileURLToPath(new URL('../app/bingo/Calculator.tsx', import.meta.url)), 'utf8');
    expect(ui).toContain('data-print="sheet"');
    const print = css.slice(css.indexOf('ビンゴ抽選機（docs/features/bingo-chusenki.md）'));
    expect(print).toMatch(/\.bingo-sheet\s*\{[^}]*--surface:\s*#ffffff[^}]*--text:\s*#000000/);
    expect(print).toMatch(/repeat\(5,\s*18mm\)/);
    expect(print).toMatch(/grid-auto-rows:\s*18mm/);
    expect(print).toMatch(/font-size:\s*26pt/);
  });
});
