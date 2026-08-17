import { describe, expect, it } from 'vitest';
import {
  CHARS_PER_SHEET,
  countText,
  evaluateTarget,
  manuscriptSheets,
  normalizeNewlines,
} from '@/lib/mojisu-count';

/**
 * 文字数カウント（docs/features/mojisu-count.md）のテスト。
 *
 * 見張っているのは**数え方の約束**そのもの。
 * 「絵文字を2文字と数えない」「CRLFを2文字と数えない」「全角スペースも
 * 空白として除く」は、実装を書き換えたときに黙って壊れるとページの説明と
 * FAQが嘘になるので、境界値を固定してある。
 */

describe('normalizeNewlines', () => {
  it('CRLF・単独のCRをLFに揃える', () => {
    expect(normalizeNewlines('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });

  it('CRLFが連続していても1つずつLFになる', () => {
    expect(normalizeNewlines('a\r\n\r\nb')).toBe('a\n\nb');
  });
});

describe('countText 文字数', () => {
  it('空文字はすべて0（行数も0行）', () => {
    expect(countText('')).toEqual({
      chars: 0,
      charsNoSpace: 0,
      charsNoBreak: 0,
      lines: 0,
      paragraphs: 0,
      full: 0,
      half: 0,
      bytes: 0,
    });
  });

  it('スペース・改行を含む数と含まない数の両方を返す', () => {
    const c = countText('あ い\nう');
    expect(c.chars).toBe(5); // あ / 空白 / い / 改行 / う
    expect(c.charsNoSpace).toBe(3);
    expect(c.charsNoBreak).toBe(4); // 改行だけを除く
  });

  it('全角スペース（U+3000）も空白として除く', () => {
    const c = countText('　あ　い');
    expect(c.chars).toBe(4);
    expect(c.charsNoSpace).toBe(2);
  });

  it('タブも空白として除く', () => {
    expect(countText('a\tb').charsNoSpace).toBe(2);
  });

  it('絵文字（サロゲートペア）を1文字と数える', () => {
    expect(countText('🎲').chars).toBe(1);
    expect(countText('あ🎲い').chars).toBe(3);
  });

  it('追加面の漢字（𩸽）も1文字と数える', () => {
    expect(countText('𩸽').chars).toBe(1);
    // UTF-16の length では2になる。ここが食い違わないことがこのツールの前提
    expect('𩸽'.length).toBe(2);
  });

  it('結合文字は仕様どおり分解した数で数える（書記素単位にはしない）', () => {
    // 「か」+ 濁点（U+3099）。見た目は1文字だが2コードポイント
    expect(countText('\u304B\u3099').chars).toBe(2); // か + 結合濁点
    // 合成済みの「が」は1文字
    expect(countText('\u304C').chars).toBe(1); // 合成済みの が
  });

  it('CRLFの改行を2文字と数えない', () => {
    const crlf = countText('あ\r\nい');
    expect(crlf.chars).toBe(3);
    expect(crlf.lines).toBe(2);
    expect(crlf).toEqual(countText('あ\nい'));
  });
});

describe('countText 全角・半角の内訳', () => {
  it('全角と半角を数え分け、合計は改行を除いた文字数と一致する', () => {
    const c = countText('あいうAB');
    expect(c.full).toBe(3);
    expect(c.half).toBe(2);
    expect(c.full + c.half).toBe(c.charsNoBreak);
  });

  it('半角カナは半角、全角記号は全角として数える', () => {
    expect(countText('ｱｲｳ').half).toBe(3);
    expect(countText('！？').full).toBe(2);
  });

  it('絵文字は全角として数える（表示幅が漢字と同じため）', () => {
    expect(countText('🎲').full).toBe(1);
  });

  it('改行は内訳に入らない（幅を持たないため）', () => {
    const c = countText('あ\nい');
    expect(c.full).toBe(2);
    expect(c.half).toBe(0);
    expect(c.full + c.half).toBe(c.charsNoBreak);
  });
});

describe('countText 行数・段落数', () => {
  it('改行がなければ1行', () => {
    expect(countText('あいう').lines).toBe(1);
  });

  it('末尾の改行は行を増やさない', () => {
    expect(countText('あ\n').lines).toBe(1);
    expect(countText('あ\nい\n').lines).toBe(2);
  });

  it('途中の空行は1行として数える', () => {
    expect(countText('あ\n\nい').lines).toBe(3);
  });

  it('段落は空行で区切る（改行1つでは区切らない）', () => {
    expect(countText('あ\nい').paragraphs).toBe(1);
    expect(countText('あ\n\nい').paragraphs).toBe(2);
  });

  it('空行が連続していても段落は増えない', () => {
    expect(countText('あ\n\n\n\nい').paragraphs).toBe(2);
  });

  it('空白だけの行も空行として扱う', () => {
    expect(countText('あ\n　\nい').paragraphs).toBe(2);
    expect(countText('あ\n \t\nい').paragraphs).toBe(2);
  });

  it('空白しかないテキストは0段落', () => {
    expect(countText('　\n \n').paragraphs).toBe(0);
  });
});

describe('countText バイト数（UTF-8）', () => {
  it('半角英数字は1バイト、日本語は3バイト', () => {
    expect(countText('abc').bytes).toBe(3);
    expect(countText('あいう').bytes).toBe(9);
  });

  it('絵文字（サロゲートペア）は4バイト', () => {
    expect(countText('🎲').bytes).toBe(4);
  });

  it('CRLFは正規化後のLF（1バイト）で数える', () => {
    expect(countText('a\r\nb').bytes).toBe(3);
  });
});

describe('manuscriptSheets', () => {
  it('400字でちょうど1枚', () => {
    expect(CHARS_PER_SHEET).toBe(400);
    expect(manuscriptSheets(400)).toBe(1);
  });

  it('小数1桁に丸める', () => {
    expect(manuscriptSheets(600)).toBe(1.5);
    expect(manuscriptSheets(2000)).toBe(5);
    expect(manuscriptSheets(430)).toBe(1.1); // 1.075 → 1.1
  });

  it('0以下は0枚', () => {
    expect(manuscriptSheets(0)).toBe(0);
    expect(manuscriptSheets(-10)).toBe(0);
  });
});

describe('evaluateTarget', () => {
  it('目標未満なら残り文字数と達成率を返す', () => {
    expect(evaluateTarget(1500, 2000)).toEqual({
      target: 2000,
      count: 1500,
      remaining: 500,
      over: 0,
      percent: 75,
      reached: false,
    });
  });

  it('ちょうど目標に達したら達成とみなす', () => {
    const p = evaluateTarget(2000, 2000);
    expect(p).not.toBeNull();
    expect(p?.reached).toBe(true);
    expect(p?.remaining).toBe(0);
    expect(p?.over).toBe(0);
    expect(p?.percent).toBe(100);
  });

  it('超過分を返し、達成率は100%を超える', () => {
    const p = evaluateTarget(2200, 2000);
    expect(p?.over).toBe(200);
    expect(p?.remaining).toBe(0);
    expect(p?.percent).toBe(110);
  });

  it('達成率は小数1桁に丸める', () => {
    expect(evaluateTarget(1, 3)?.percent).toBe(33.3);
  });

  it('目標が0以下・数値でないときは null（目標未設定）', () => {
    expect(evaluateTarget(100, 0)).toBeNull();
    expect(evaluateTarget(100, -5)).toBeNull();
    expect(evaluateTarget(100, Number.NaN)).toBeNull();
  });
});
