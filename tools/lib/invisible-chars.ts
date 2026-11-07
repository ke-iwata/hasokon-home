/**
 * 見えにくい空白・ゼロ幅の文字の呼び名。
 *
 * JSON 整形（lib/json-seikei.ts）とテキスト比較（lib/text-hikaku.ts）が同じ一覧を使う。
 * Excel・Word・チャットから貼ると混ざり、「見た目は同じなのに違う」の原因になる文字。
 *
 * - `SPACE_CHAR_NAMES` は両方のツールで使う（どちらかに足したら両方に効く）
 * - `INVISIBLE_CHAR_NAMES` はテキスト比較が印を付ける文字。空白類に、ゼロ幅の文字とタブを足したもの
 *
 * 仕様: docs/features/text-hikaku.md「比較の約束」4・docs/features/json-seikei.md
 */

/** 見た目は半角スペースとほぼ同じ空白（JSON 整形の「全角の混入」とテキスト比較の印で共有） */
export const SPACE_CHAR_NAMES: readonly (readonly [string, string])[] = [
  ['　', '全角スペース'],
  [' ', 'ノーブレークスペース'],
];

/** テキスト比較が「見えない文字」として印を付ける文字。呼び名と、画面に出す印 */
export interface InvisibleChar {
  char: string;
  name: string;
  /** 画面に出す印（元の文字の代わりに、薄い色で描く） */
  mark: string;
}

const MARKS: Record<string, string> = {
  '　': '␣',
  ' ': '⍽',
  '​': '[ZWSP]',
  '‌': '[ZWNJ]',
  '‍': '[ZWJ]',
  '﻿': '[BOM]',
  '\t': '⇥',
};

/** テキスト比較で足す、ゼロ幅の文字とタブ */
const EXTRA_INVISIBLE: readonly (readonly [string, string])[] = [
  ['​', 'ゼロ幅スペース'],
  ['‌', 'ゼロ幅非接合子'],
  ['‍', 'ゼロ幅接合子'],
  ['﻿', 'BOM（ゼロ幅ノーブレークスペース）'],
  ['\t', 'タブ'],
];

export const INVISIBLE_CHARS: readonly InvisibleChar[] = [...SPACE_CHAR_NAMES, ...EXTRA_INVISIBLE].map(
  ([char, name]) => ({ char, name, mark: MARKS[char] ?? `[U+${char.charCodeAt(0).toString(16).toUpperCase()}]` }),
);

const BY_CHAR = new Map(INVISIBLE_CHARS.map((c) => [c.char, c]));

/** 見えない文字なら、その呼び名と印。そうでなければ undefined */
export function invisibleChar(ch: string): InvisibleChar | undefined {
  return BY_CHAR.get(ch);
}

/**
 * 改行の呼び名と印。URLデコード（lib/url-decode.ts）が、デコード結果に出てきた `%0A`・`%0D` に印を付けるのに使う。
 * テキスト比較は行に分けてから比べる（行の中に改行が残らない）ので、`INVISIBLE_CHARS` には入れない。
 *
 * 仕様: docs/features/url-decode-encode.md「デコードの約束」5
 */
export const LINE_BREAK_CHARS: readonly InvisibleChar[] = [
  { char: '\n', name: '改行（LF）', mark: '↵' },
  { char: '\r', name: '改行（CR）', mark: '␍' },
];
