/**
 * 正規表現チェッカーの「日本語の部品」と「使う先の違い」の表（データ）。
 *
 * 仕様: docs/features/seiki-hyogen-checker.md「日本語の部品」「使う先の違い」
 *
 * - 部品は `u`／`v` フラグ前提の式。各部品に「当たるべき例・当たらない例」を持たせ、
 *   `tests/regex-check.test.ts` が `u` と `v` の両方で回す
 * - 方言の表は出典つきで持つ。**関数の対応は更新されうるので、確かめたら `DIALECT_CHECKED_AT` を進める**
 *
 * 【データ更新箇所】部品（`REGEX_PARTS`）・方言の表（`DIALECT_ROWS`）・確認日（`DIALECT_CHECKED_AT`）
 */

/** 使う先（JavaScript・Excel・Google スプレッドシート） */
export type RegexTarget = 'js' | 'excel' | 'sheets';

export const TARGETS: readonly { id: RegexTarget; label: string; short: string }[] = [
  { id: 'js', label: 'JavaScript（ブラウザ）', short: 'JavaScript' },
  { id: 'excel', label: 'Excel（Microsoft 365）', short: 'Excel' },
  { id: 'sheets', label: 'Google スプレッドシート', short: 'スプレッドシート' },
];

export function targetLabel(t: RegexTarget): string {
  return TARGETS.find((x) => x.id === t)!.short;
}

export interface RegexPart {
  id: string;
  /** ボタンの文字 */
  label: string;
  /** 差し込む式（`u`／`v` フラグ前提） */
  pattern: string;
  /** 本文に書く注意 */
  note: string;
  /** 全体に当たるべき例（`^(?:式)+$` で確かめる） */
  shouldMatch: readonly string[];
  /** 全体には当たらない例 */
  shouldNotMatch: readonly string[];
  /**
   * 例を `^(?:式)+$`（文字の並び）で確かめるか、`^式$`（1 個の形）で確かめるか。
   * 郵便番号・電話番号・メールは形なので 'whole'
   */
  check: 'chars' | 'whole';
}

/** 日本語の部品（ボタンで差し込む）。順番は画面のボタンの並び */
export const REGEX_PARTS: readonly RegexPart[] = [
  {
    id: 'hiragana',
    label: 'ひらがな',
    pattern: '\\p{Script=Hiragana}',
    note: '[ぁ-ん] では ゔ・ゕ・ゖ が落ちます。長音「ー」はひらがなに入りません（入れたいときは [\\p{Script=Hiragana}ー]）。',
    shouldMatch: ['ひらがな', 'ゔぁいおりん', 'ゕゖ'],
    shouldNotMatch: ['カタカナ', 'らーめん', '漢字', 'abc'],
    check: 'chars',
  },
  {
    id: 'katakana',
    label: 'カタカナ（長音・半角の濁点を含む）',
    pattern: '[\\p{Script=Katakana}ーｰﾞﾟ]',
    note:
      '長音「ー」、半角の長音「ｰ」（U+FF70）、半角の濁点・半濁点「ﾞ」「ﾟ」（U+FF9E・U+FF9F）はどれも Common で Katakana に入らないので足しています（[\\p{Script=Katakana}ーｰ] では「ｶｰﾄﾞ」が当たりません）。半角カナ（ｱ）は Katakana に入ります。\\p{Script_Extensions=Katakana} は中黒「・」も入るので使いません。長音や半角を外したいときは [ァ-ヺー]。',
    shouldMatch: ['ｶﾞｰﾄﾞ', 'ﾊﾟﾝ', 'カード', 'ヴァイオリン', 'ｶｰﾄﾞ'],
    shouldNotMatch: ['かーど', 'カード・ゲーム', '漢字', 'abc'],
    check: 'chars',
  },
  {
    id: 'kanji',
    label: '漢字',
    pattern: '\\p{Script=Han}',
    note:
      '々・〇 は Han に入りますが、〆（Common）・ヶ（Katakana）は入りません。地名・人名を拾うなら [\\p{Script=Han}〆ヶ] の形にします（2026-11-16 に Node.js 22 で確認）。',
    shouldMatch: ['漢字', '佐々木', '〇'],
    shouldNotMatch: ['霞ヶ関', '〆切', 'かな', 'カナ'],
    check: 'chars',
  },
  {
    id: 'zenkaku-digit',
    label: '全角数字',
    pattern: '[０-９]',
    note: '\\d は u フラグでも ASCII の 0〜9 だけに当たり、全角数字には当たりません。',
    shouldMatch: ['０１２３', '９'],
    shouldNotMatch: ['0123', '一二三', '①'],
    check: 'chars',
  },
  {
    id: 'space',
    label: '全角・半角スペース',
    pattern: '[ 　]',
    note: '\\s は全角スペースにも、タブ・改行・ノーブレークスペースにも当たります。スペースだけに絞るときはこちら。',
    shouldMatch: [' ', '　', ' 　 '],
    shouldNotMatch: ['\t', '\n', 'a'],
    check: 'chars',
  },
  {
    id: 'yubin',
    label: '郵便番号',
    pattern: '\\d{3}-?\\d{4}',
    note: 'ハイフンの全角（－）・長音（ー）は別に書きます（例：\\d{3}[-－ー]?\\d{4}）。',
    shouldMatch: ['100-0001', '1000001'],
    shouldNotMatch: ['100－0001', '10-0001', '１００-０００１'],
    check: 'whole',
  },
  {
    id: 'keitai',
    label: '携帯電話番号',
    pattern: '0[6-9]0-?\\d{4}-?\\d{4}',
    note:
      '形の確認であって、実在の確認ではありません。060 は 2024-12-20（令和6年12月20日）の電気通信番号計画の変更で携帯電話の番号帯（060-1〜060-9）に加わりました（総務省「携帯電話番号への060番号の追加」）。令和8年7月以降の予定だった提供開始は、2026-07-08 に携帯電話各社が延期を公表し、総務省は令和8年度末までの対応を促しています（2026-11-17 確認）。',
    shouldMatch: ['090-1234-5678', '08012345678', '070-1234-5678', '060-1234-5678'],
    shouldNotMatch: ['050-1234-5678', '03-1234-5678', '0120-123-456'],
    check: 'whole',
  },
  {
    id: 'email',
    label: 'メールアドレス（ざっくり）',
    pattern: '[^\\s@]+@[^\\s@]+\\.[^\\s@]+',
    note: '厳密な判定は正規表現ではやりません（RFC 5322 のアドレスの決まりは正規表現 1 本に収まりません）。形がだいたい合っているかの目安です。',
    shouldMatch: ['taro@example.com', 'a.b+c@sub.example.co.jp'],
    shouldNotMatch: ['taro@example', 'taro example.com', 'a@b@c.com'],
    check: 'whole',
  },
];

/** 方言の表と使う先の関数の対応を最後に確かめた日 */
export const DIALECT_CHECKED_AT = '2026-11-17';

/** 方言の表の 1 行（○ は使える、文字列はその書き方の言い換え、`null` は使えない） */
export interface DialectRow {
  id: string;
  label: string;
  js: string;
  excel: string | null;
  sheets: string | null;
}

/** 使う先の違い（本文の表と、注意の判定の両方に使う） */
export const DIALECT_ROWS: readonly DialectRow[] = [
  { id: 'lookbehind', label: '後読み (?<=…)・(?<!…)', js: '○', excel: '○', sheets: null },
  { id: 'lookahead', label: '先読み (?=…)・(?!…)', js: '○', excel: '○', sheets: null },
  { id: 'backref', label: '後方参照 \\1・\\k<名前>', js: '○', excel: '○', sheets: null },
  {
    id: 'named-group',
    label: '名前つきグループ (?<名前>…)',
    js: '○',
    excel: '○',
    sheets: '(?P<名前>…)（RE2 は 2023 年から (?<名前>…) も読むが、スプレッドシートでの扱いは未確認）',
  },
  {
    id: 'script',
    label: '\\p{Script=Hiragana}',
    js: '○（u・v フラグ）',
    excel: '\\p{Hiragana}',
    sheets: '\\p{Hiragana}（ヘルプは「Unicode 文字クラスのマッチング以外の RE2 を使用できます」と書いている。シートで確かめる）',
  },
  {
    id: 'flags',
    label: 'フラグ',
    js: '/…/gimsuv',
    excel: '関数の引数（大文字小文字）・式中の (?i)',
    sheets: '式中の (?i) だけ',
  },
];

/** 出典（本文に出す。取得日つき） */
export const REGEX_SOURCES: readonly { label: string; url: string }[] = [
  { label: 'ECMAScript® Language Specification（ECMA-262）RegExp', url: 'https://tc39.es/ecma262/#sec-regexp-regular-expression-objects' },
  { label: 'MDN「正規表現」', url: 'https://developer.mozilla.org/ja/docs/Web/JavaScript/Guide/Regular_expressions' },
  { label: 'Microsoft サポート「REGEXTEST 関数」', url: 'https://support.microsoft.com/ja-jp/office/regextest-%E9%96%A2%E6%95%B0-7d38200b-5e5c-4196-b4e6-9bff73afbd31' },
  { label: 'Microsoft サポート「REGEXREPLACE 関数」', url: 'https://support.microsoft.com/ja-jp/office/regexreplace-%E9%96%A2%E6%95%B0-9c030bb2-5e47-4efc-bad5-4582d7100897' },
  { label: 'Google ドキュメント エディタ ヘルプ「REGEXMATCH」', url: 'https://support.google.com/docs/answer/3098292?hl=ja' },
  { label: 'Google ドキュメント エディタ ヘルプ「REGEXREPLACE」', url: 'https://support.google.com/docs/answer/3098245?hl=ja' },
  { label: 'RE2 Syntax', url: 'https://github.com/google/re2/wiki/Syntax' },
  { label: 'Unicode Standard Annex #24（Unicode Script Property）', url: 'https://www.unicode.org/reports/tr24/' },
  { label: '総務省「携帯電話番号への060番号の追加」', url: 'https://www.soumu.go.jp/main_sosiki/joho_tsusin/top/tel_number/060keitai.html' },
];
