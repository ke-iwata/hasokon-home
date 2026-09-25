/**
 * 半角⇔全角ページの「変換の範囲」と「起きやすい失敗」の行データ。
 *
 * 仕様: docs/features/thin-tool-content.md
 *
 * 「この文字は変換される／されない」を本文に手で書くと、対応表を増やしたときに
 * 説明だけが嘘になる。**変換されるかどうかは必ず convertWidth() を実際に通して出す**。
 * 変換の対象の種類は DEFAULT_OPTIONS と対応づける。
 * 一致は tests/hankaku-zenkaku.test.ts が見張る
 */

import {
  convertWidth,
  DEFAULT_OPTIONS,
  type Direction,
  type WidthOptions,
} from '@/lib/hankaku-zenkaku';

/** 'A' → 'U+0041'（サロゲートペアは考えない。対象が BMP の文字だけなので） */
export function codePoints(text: string): string {
  return [...text]
    .map((c) => `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`)
    .join(' ');
}

export interface OptionScope {
  key: keyof WidthOptions;
  /** 画面に出す種類の名前 */
  label: string;
  /** 半角側のコード位置 */
  halfRange: string;
  /** 全角側のコード位置 */
  fullRange: string;
  /** 既定でこの種類が変換の対象になっているか（DEFAULT_OPTIONS から引く） */
  defaultOn: boolean;
}

/** 変換の対象になる4種類と、それぞれが Unicode 上のどこを指すか */
export const OPTION_SCOPES: OptionScope[] = (
  [
    {
      key: 'alnum',
      label: '英数字',
      halfRange: 'U+0030〜U+0039・U+0041〜U+005A・U+0061〜U+007A',
      fullRange: 'U+FF10〜U+FF19・U+FF21〜U+FF3A・U+FF41〜U+FF5A',
    },
    {
      key: 'symbol',
      label: '記号',
      halfRange: 'U+0021〜U+007E のうち英数字以外',
      fullRange: 'U+FF01〜U+FF5E のうち英数字以外',
    },
    {
      key: 'kana',
      label: 'カタカナ',
      halfRange: 'U+FF61〜U+FF9F（半角カナ）',
      fullRange: 'U+30A1〜U+30FC（カタカナ）',
    },
    {
      key: 'space',
      label: 'スペース',
      halfRange: 'U+0020',
      fullRange: 'U+3000',
    },
  ] as const
).map((scope) => ({ ...scope, defaultOn: DEFAULT_OPTIONS[scope.key] }));

export interface PitfallRow {
  /** 表に出す文字 */
  sample: string;
  /** 文字の呼び名 */
  name: string;
  /** どちら向きの変換で問題になるか */
  direction: Direction;
  /** なぜそうなるのか（編集上の説明。挙動そのものは converted から出す） */
  reason: string;
}

export interface Pitfall extends PitfallRow {
  /** sample のコード位置 */
  sampleCode: string;
  /** convertWidth を実際に通した結果 */
  converted: string;
  /** converted のコード位置 */
  convertedCode: string;
  /** 変換されるか */
  changed: boolean;
  /** 変換で文字数が変わるか */
  lengthChanged: boolean;
}

const PITFALL_ROWS: PitfallRow[] = [
  {
    sample: '～',
    name: '全角チルダ',
    direction: 'toHalf',
    reason: 'ASCII の ~ に対応する全角形なので変換の対象です。',
  },
  {
    sample: '〜',
    name: '波ダッシュ',
    direction: 'toHalf',
    reason:
      '全角形ブロックの外にある別の文字です。日本語の「〜」はこちらが使われることが多く、見た目では全角チルダと区別できません。',
  },
  {
    sample: '－',
    name: '全角ハイフンマイナス',
    direction: 'toHalf',
    reason: 'ASCII の - に対応する全角形なので変換の対象です。',
  },
  {
    sample: '−',
    name: 'マイナス記号',
    direction: 'toHalf',
    reason:
      '数式用の別の文字です。住所や電話番号に混ざっていると、半角にしたつもりの箇所だけが残ります。',
  },
  {
    sample: '￥',
    name: '全角円記号',
    direction: 'toHalf',
    reason:
      '全角形ブロックの中にありますが、ASCII に対応する文字がない領域（U+FFE0〜U+FFE6）なので対象外です。',
  },
  {
    sample: '　',
    name: '全角スペース',
    direction: 'toHalf',
    reason:
      '見た目では空白としか分からないので、氏名の姓名の区切りなどで残りがちです。「スペース」のチェックを外すと残ります。',
  },
  {
    sample: 'ガ',
    name: '濁点付きのカタカナ',
    direction: 'toHalf',
    reason:
      '半角カナには濁点付きの1文字がなく、カナ本体と濁点の2文字に分かれます。文字数制限のある入力欄では、この増分で引っかかります。',
  },
  {
    sample: 'ｶﾞ',
    name: '半角カナ＋濁点',
    direction: 'toFull',
    reason: '往復させれば文字数は元に戻るので、全角に寄せてから数えるほうが確実です。',
  },
];

/** 「変換で起きやすい失敗」の行。挙動は convertWidth() を通して出す */
export const PITFALLS: Pitfall[] = PITFALL_ROWS.map((row) => {
  const converted = convertWidth(row.sample, row.direction);
  return {
    ...row,
    sampleCode: codePoints(row.sample),
    converted,
    convertedCode: codePoints(converted),
    changed: converted !== row.sample,
    lengthChanged: [...converted].length !== [...row.sample].length,
  };
});
