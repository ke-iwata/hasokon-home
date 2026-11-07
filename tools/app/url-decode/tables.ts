import { CHARSET_LABELS, decodeText, encodeLine, type EncodeCharset } from '@/lib/url-decode';

/**
 * 本文の例。lib の関数を呼んで作る（本文に変換結果を手で書かないため。docs/features/thin-tool-content.md）
 */

/** 同じ「東京」を文字コードごとにエンコードした形 */
export const CHARSET_EXAMPLES = (['utf-8', 'shift_jis', 'euc-jp'] as EncodeCharset[]).map((charset) => ({
  charset: CHARSET_LABELS[charset],
  encoded: encodeLine('東京', { charset }).text,
}));

/** 「デコードしても直らない」の典型 */
export const TROUBLE_EXAMPLES = [
  {
    situation: 'Shift_JIS の古いURL',
    input: CHARSET_EXAMPLES[1].encoded,
    asUtf8: decodeText(CHARSET_EXAMPLES[1].encoded, { charset: 'utf-8' }).lines[0].text,
    tool: decodeText(CHARSET_EXAMPLES[1].encoded).lines[0].text,
    note: 'UTF-8 で読むと読めない文字になります。このツールは Shift_JIS・EUC-JP を自動で判別します',
  },
  {
    situation: '2回エンコードされている',
    input: '%25E6%259D%25B1%25E4%25BA%25AC',
    asUtf8: decodeText('%25E6%259D%25B1%25E4%25BA%25AC').lines[0].text,
    tool: decodeText(decodeText('%25E6%259D%25B1%25E4%25BA%25AC').lines[0].text).lines[0].text,
    note: '1回戻すとまた %XX が出ます。「もう1回デコード」で戻ります',
  },
  {
    situation: '途中で切れている',
    input: '%E6%9D%B1%E4%BA',
    asUtf8: decodeText('%E6%9D%B1%E4%BA').lines[0].text,
    tool: decodeText('%E6%9D%B1%E4%BA').lines[0].text,
    note: '最後の文字の3バイトのうち2バイトしか無い状態です。切れた位置に印を付けます',
  },
];
