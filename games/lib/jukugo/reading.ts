/**
 * 読みの照合（ひらがなへの正規化と、熟語の中での音の変わり方）
 *
 * 仕様: docs/features/game-jukugo-anaume.md の「読み入力」「熟語の表」
 */

import { readingsOf } from './kanji';

/** カタカナ → ひらがな。前後の空白は落とす */
export function toHiragana(input: string): string {
  return input
    .trim()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

/** ひらがな（と長音・小書き）だけでできているか */
export function isHiragana(s: string): boolean {
  return /^[ぁ-ゖー]+$/.test(s);
}

const VOICED: Record<string, string> = {
  か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご',
  さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
  た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど',
  は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ',
};
const HALF_VOICED: Record<string, string> = { は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ' };

/** 熟語の中で起きうる形（連濁・半濁音・促音）をすべて並べる */
export function soundVariants(reading: string): string[] {
  const heads = [reading];
  const first = reading[0];
  if (VOICED[first]) heads.push(VOICED[first] + reading.slice(1));
  if (HALF_VOICED[first]) heads.push(HALF_VOICED[first] + reading.slice(1));
  const out = new Set<string>();
  for (const h of heads) {
    out.add(h);
    // 学校（がく → がっ）・一生（いち → いっ）・活発（かつ → かっ）
    if (h.length >= 2 && /[つちくき]$/.test(h)) out.add(h.slice(0, -1) + 'っ');
  }
  return [...out];
}

/**
 * 熟語の中での字の読み `inWord` が、字の表の音訓のどれかから説明できるか。
 *
 * - 音訓そのまま・連濁・半濁音・促音
 * - 訓読みの語幹に送りの1音が付いたもの（合図：あ → あい、植木：う → うえ）
 */
export function matchesKanjiReading(ch: string, inWord: string): boolean {
  for (const r of readingsOf(ch)) {
    for (const v of soundVariants(r)) {
      if (v === inWord) return true;
      if (inWord.length === v.length + 1 && inWord.startsWith(v)) return true;
    }
  }
  return false;
}
