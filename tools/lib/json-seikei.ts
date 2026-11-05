/**
 * JSON 整形・チェックのロジック（純関数のみ。DOM/React に依存しない）
 *
 * 仕様: docs/features/json-seikei.md
 *
 * ## データを黙って変えない
 *
 * `JSON.stringify(JSON.parse(x))` で整形すると、大きな整数の ID が丸められ、
 * `1.0` が `1` に、`"é"` が `é` に、重複キーの前の値が消える。
 * エンジニア向けのツールではこれが致命的なので、**自前の走査器で読んだ木から書き出す**。
 * 数値と文字列は元の書き方（`raw`）のまま持ち、書き出しでもそのまま使う。
 * `JSON.parse` は成功・失敗の最終判定にだけ使う。
 *
 * ## 位置は自前で出す
 *
 * `JSON.parse` の例外メッセージはブラウザごとに書式が違う（位置を出さないこともある）。
 * 例外の文字列に頼らず、走査器が「何行目の何文字目で、たぶんこれが原因」を返す。
 * 列は行頭からの UTF-16 の位置 + 1（日本語は 1 文字 = 1 列。絵文字だけ 2 列に数える）。
 *
 * 文法は RFC 8259 / ECMA-404 のとおり。
 */

// ---------------------------------------------------------------------------
// 【データ更新箇所】上限・しきい値
// ---------------------------------------------------------------------------

/** これを超える入力は処理しない（ブラウザが固まるため） */
export const MAX_INPUT_BYTES = 5 * 1024 * 1024;
/** これを超える入力は、入力が止まってから DEBOUNCE_MS 後に処理する */
export const DEBOUNCE_THRESHOLD_BYTES = 2 * 1024 * 1024;
export const DEBOUNCE_MS = 300;
/** これを超える入力は色付けをやめ、全角の位置を一覧だけで出す */
export const HIGHLIGHT_LIMIT_BYTES = 200 * 1024;
/** 色付けをやめたときに一覧で出す全角の位置の数 */
export const HIGHLIGHT_LIST_MAX = 20;
/** 入れ子の上限。これより深いと走査器の再帰が止まるので、エラーにする */
export const MAX_DEPTH = 512;

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

/** 走査器が読んだ木。数値と文字列は元の書き方のまま持つ */
export type JsonNode =
  | { kind: 'object'; members: JsonMember[] }
  | { kind: 'array'; items: JsonNode[] }
  /** raw は引用符の内側（エスケープは元のまま） */
  | { kind: 'string'; raw: string }
  | { kind: 'number'; raw: string }
  | { kind: 'literal'; raw: 'true' | 'false' | 'null' };

export interface JsonMember {
  /** キーの引用符の内側（エスケープは元のまま） */
  key: string;
  /** キーのある行（1 始まり）。重複キーの知らせに使う */
  line: number;
  value: JsonNode;
}

/** 入力の中の位置（1 始まり） */
export interface Position {
  line: number;
  column: number;
}

/** 構文は正しいが知らせたいこと（重複キー・精度・BOM） */
export interface Notice {
  kind: 'duplicate-key' | 'precision' | 'bom';
  message: string;
  /** 関係する行（1 始まり） */
  lines: number[];
}

export interface JsonStats {
  /** 入れ子の深さ（最上位がオブジェクト・配列なら 1） */
  depth: number;
  /** オブジェクトのキーの総数（重複も数える） */
  keys: number;
  /** UTF-8 のバイト数 */
  bytes: number;
}

export type JsonCheck =
  | {
      ok: true;
      /** JSON.parse の結果（最終判定に使ったもの） */
      value: unknown;
      tree: JsonNode;
      stats: JsonStats;
      notices: Notice[];
      bomRemoved: boolean;
    }
  | {
      ok: false;
      /** パーサーが気づいた位置 */
      line: number;
      column: number;
      message: string;
      /** 原因の見当 */
      hint?: string;
      /** 強調する行。カンマ忘れは「気づいた行」の 1 行上 */
      markLine: number;
      /** 「全角を直す」で直せるものがあるか */
      fixable: boolean;
      bomRemoved: boolean;
      /** 5MB 超で処理しなかった */
      tooLarge?: boolean;
    };

export type IndentKind = '2' | '4' | 'tab';

export const INDENT_OPTIONS: { value: IndentKind; label: string }[] = [
  { value: '2', label: 'スペース 2' },
  { value: '4', label: 'スペース 4' },
  { value: 'tab', label: 'タブ' },
];

export const DEFAULT_INDENT: IndentKind = '2';

// ---------------------------------------------------------------------------
// 小物
// ---------------------------------------------------------------------------

const BOM = '﻿';

/** UTF-8 のバイト数（TextEncoder を使わず数える。5MB を毎回コピーしないため） */
export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/** 入力が上限を超えているか（文字数で先に足切りしてからバイト数を数える） */
export function isTooLarge(text: string): boolean {
  if (text.length > MAX_INPUT_BYTES) return true;
  return utf8Bytes(text) > MAX_INPUT_BYTES;
}

/** 1.2KB のような表示 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** 先頭の BOM を取り除く */
export function stripBom(text: string): { text: string; removed: boolean } {
  return text.startsWith(BOM) ? { text: text.slice(1), removed: true } : { text, removed: false };
}

/** 文字の見せ方（エラー文に入れる） */
function describeChar(ch: string): string {
  const code = ch.codePointAt(0) ?? 0;
  if (ch === ' ') return '半角スペース';
  if (ch === '\t') return 'タブ';
  if (ch === '\n' || ch === '\r') return '改行';
  if (code < 0x20) return `制御文字（U+${code.toString(16).toUpperCase().padStart(4, '0')}）`;
  const named = ZENKAKU_NAMES.get(ch);
  if (named) return `${named}「${ch}」`;
  return `「${ch}」`;
}

/** キーの raw を比較用の値に直す（"a" と "a" を同じキーとみなすため） */
function decodeKey(raw: string): string {
  if (!raw.includes('\\')) return raw;
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

// ---------------------------------------------------------------------------
// 全角の混入
// ---------------------------------------------------------------------------

/** 全角・紛らわしい文字の呼び名（エラー文・一覧に使う） */
const ZENKAKU_NAMES = new Map<string, string>([
  ['　', '全角スペース'],
  [' ', 'ノーブレークスペース'],
  ['“', '全角の引用符'],
  ['”', '全角の引用符'],
  ['＂', '全角の引用符'],
  ['：', '全角コロン'],
  ['，', '全角カンマ'],
  ['、', '読点'],
  ['｛', '全角の波かっこ'],
  ['｝', '全角の波かっこ'],
  ['［', '全角の角かっこ'],
  ['］', '全角の角かっこ'],
  ['－', '全角マイナス'],
  ['−', '全角マイナス'],
  ['ー', '長音'],
  ...[...'０１２３４５６７８９'].map((d) => [d, '全角数字'] as [string, string]),
]);

/** 文字列の外で、半角に直す記号・空白 */
const OUTSIDE_FIX = new Map<string, string>([
  ['　', ' '],
  [' ', ' '],
  ['：', ':'],
  ['，', ','],
  ['、', ','],
  ['｛', '{'],
  ['｝', '}'],
  ['［', '['],
  ['］', ']'],
]);

/** 直したあと「キーか値が来る位置」になる記号（全角のまま書かれたものも含む） */
const VALUE_POSITION_AFTER = new Set(['{', ',', ':', '[', '：', '，', '、', '｛', '［']);

/** 走査中に空白として読み飛ばす文字（全角スペースなども含む） */
function isLooseSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '　' || ch === ' ';
}

function isFullDigit(ch: string): boolean {
  return ch >= '０' && ch <= '９';
}

function isAnyDigit(ch: string | undefined): boolean {
  return ch !== undefined && ((ch >= '0' && ch <= '9') || isFullDigit(ch));
}

/** 全角の混入 1 か所 */
export interface ZenkakuMark extends Position {
  /** 入力（BOM を含む元の文字列）の中の位置 */
  offset: number;
  char: string;
  /** 「全角スペース」など */
  name: string;
}

export interface ZenkakuScan {
  /** 直したあとの文字列 */
  fixed: string;
  /** 直した文字（引用符の組は 2 か所と数える） */
  replaced: ZenkakuMark[];
  /** 見つけたが直さないもの（長音の ー・閉じていない引用符） */
  unfixed: (ZenkakuMark & { reason: 'choon' | 'unclosed-quote' })[];
}

/**
 * 全角の混入を探して直す。
 *
 * - 半角の `"` で始まった文字列の**中身は変えない**（`"東京都　港区"` の全角スペースなど）
 * - 文字列の外の全角スペース・ノーブレークスペース・： ， 、 ｛ ｝ ［ ］ を半角に
 * - 文字列の外の数値の全角数字・全角マイナス（－ −）を半角に。長音の ー は直さない
 * - 全角の引用符は「全角の引用符の判定」（仕様書）のとおり、キーか値が来る位置で
 *   開いて同じ行で閉じているものだけを `"` に直す。中身は変えない
 */
export function scanZenkaku(input: string): ZenkakuScan {
  const replaced: ZenkakuMark[] = [];
  const unfixed: ZenkakuScan['unfixed'] = [];
  const out: string[] = [];
  /** out に写し終えた位置。直す文字が来たときだけ、その手前までをまとめて写す（5MB を 1 文字ずつ積まないため） */
  let copied = 0;
  const put = (at: number, text: string, next: number) => {
    out.push(input.slice(copied, at), text);
    copied = next;
  };

  let line = 1;
  let lineStart = 0;
  /** 半角の " の文字列の中か */
  let inString = false;
  let escaped = false;
  /** 文字列の外で最後に見た空白以外の文字（キーか値が来る位置かの判定用）。'' は入力の先頭 */
  let lastSignificant = '';

  const mark = (offset: number, char: string): ZenkakuMark => ({
    offset,
    char,
    name: ZENKAKU_NAMES.get(char) ?? char,
    line,
    column: offset - lineStart + 1,
  });

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') {
        inString = false;
        lastSignificant = '"';
      } else if (ch === '\n') {
        // 文字列の途中の改行は JSON では誤り。行の数え方だけ合わせて、文字列は閉じたとみなす
        inString = false;
        line++;
        lineStart = i + 1;
      }
      continue;
    }

    if (ch === '\n') {
      line++;
      lineStart = i + 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    // 全角の引用符（開き）
    if ((ch === '“' || ch === '＂') && (lastSignificant === '' || VALUE_POSITION_AFTER.has(lastSignificant))) {
      const close = findFullwidthClose(input, i + 1, ch);
      if (close === -1) {
        unfixed.push({ ...mark(i, ch), reason: 'unclosed-quote' });
        lastSignificant = ch;
        continue;
      }
      replaced.push(mark(i, ch));
      replaced.push(mark(close, input[close]));
      put(i, '"', i + 1);
      put(close, '"', close + 1);
      i = close;
      lastSignificant = '"';
      continue;
    }

    const symbol = OUTSIDE_FIX.get(ch);
    if (symbol !== undefined) {
      replaced.push(mark(i, ch));
      put(i, symbol, i + 1);
      if (!isLooseSpace(ch)) lastSignificant = ch;
      continue;
    }

    if (isFullDigit(ch)) {
      replaced.push(mark(i, ch));
      put(i, String.fromCharCode(ch.charCodeAt(0) - 0xfee0), i + 1);
      lastSignificant = ch;
      continue;
    }

    if ((ch === '－' || ch === '−') && isAnyDigit(input[i + 1])) {
      replaced.push(mark(i, ch));
      put(i, '-', i + 1);
      lastSignificant = ch;
      continue;
    }

    if (ch === 'ー' && isAnyDigit(input[i + 1])) {
      unfixed.push({ ...mark(i, ch), reason: 'choon' });
      lastSignificant = ch;
      continue;
    }

    if (!isLooseSpace(ch)) lastSignificant = ch;
  }

  out.push(input.slice(copied));
  return { fixed: out.join(''), replaced, unfixed };
}

/**
 * 全角の引用符の閉じを探す。同じ行の中だけ。
 * “ で開いたなら ” を優先し、無ければ ＂。＂ で開いたなら ” か ＂ の先に出たほう。
 */
function findFullwidthClose(input: string, from: number, open: string): number {
  let firstAny = -1;
  for (let j = from; j < input.length; j++) {
    const c = input[j];
    if (c === '\n') break;
    if (c === '”') return j;
    if (c === '＂' && firstAny === -1) {
      if (open === '＂') return j;
      firstAny = j;
    }
  }
  return firstAny;
}

// ---------------------------------------------------------------------------
// 走査器
// ---------------------------------------------------------------------------

/** 走査器のエラー（位置・文・見当） */
class ParseError extends Error {
  constructor(
    message: string,
    public line: number,
    public column: number,
    public hint?: string,
    public markLine?: number,
  ) {
    super(message);
  }
}

/**
 * 半角の " で開いて全角の ” で閉じた文字列（"太郎”）の見当。日本語入力でいちばん起きやすい形。
 * 仕様の判定 1 のとおり、半角の " の中の ” は中身なので直さず、言うだけにする
 */
function fullwidthCloseHint(content: string): string | undefined {
  return /[”＂]/.test(content) ? '閉じの引用符が全角（”）になっていないか確かめてください' : undefined;
}

const NON_JSON_VALUES = ['-Infinity', 'Infinity', 'NaN', 'undefined'];

const HINT = {
  trailingComma: '最後の要素のあとにカンマがあります（JSON では使えません）',
  missingCommaAbove: '1 行上の行末にカンマが抜けていないか確かめてください',
  missingComma: '値と値のあいだにカンマ（,）が抜けていないか確かめてください',
  singleQuote: '文字列は " で囲みます（\' は使えません）',
  unquotedKey: 'キーは " で囲みます',
  comment: 'JSON にはコメントを書けません',
  nonJsonValue: 'JSON に無い値です。null か数値・文字列にしてください',
} as const;

interface ParseResult {
  tree: JsonNode;
  depth: number;
  keys: number;
  duplicates: { key: string; at: Position[] }[];
  imprecise: number[];
}

/**
 * RFC 8259 の文法で読む。誤りがあれば ParseError を投げる。
 * 再帰下降で、深さは MAX_DEPTH まで。
 */
class Parser {
  private i = 0;
  private line = 1;
  private lineStart = 0;
  /** 直前に読み終えた値の、最後の文字のある行（カンマ忘れの強調に使う） */
  private lastValueLine = 1;
  private maxDepth = 0;
  private keys = 0;
  private duplicates: { key: string; at: Position[] }[] = [];
  private imprecise: number[] = [];

  constructor(private readonly s: string) {}

  parse(): ParseResult {
    this.skipSpace();
    if (this.i >= this.s.length) {
      throw new ParseError('JSON が空です', this.line, this.column());
    }
    const tree = this.value(0);
    this.skipSpace();
    if (this.i < this.s.length) {
      const ch = this.s[this.i];
      if (ch === '/') this.fail(`${describeChar(ch)}があります`, HINT.comment);
      if (ch === ',') {
        this.fail('最後の値のあとにカンマがあります', HINT.trailingComma);
      }
      // 値のあとに改行して次の値（最上位を配列で囲み忘れたとき・カンマ忘れ）
      this.fail(`値のあとに余分な文字${describeChar(ch)}があります`);
    }
    return {
      tree,
      depth: this.maxDepth,
      keys: this.keys,
      duplicates: this.duplicates,
      imprecise: this.imprecise,
    };
  }

  private column(at = this.i): number {
    return at - this.lineStart + 1;
  }

  private fail(message: string, hint?: string, markLine?: number, at = this.i): never {
    throw new ParseError(message, this.line, this.column(at), hint, markLine);
  }

  private skipSpace(): void {
    const s = this.s;
    while (this.i < s.length) {
      const c = s.charCodeAt(this.i);
      if (c === 0x20 || c === 0x09 || c === 0x0d) this.i++;
      else if (c === 0x0a) {
        this.i++;
        this.line++;
        this.lineStart = this.i;
      } else break;
    }
  }

  /** 値が来るべき位置で、値として読めない文字を見たときのエラー */
  private failValueExpected(context: string): never {
    const s = this.s;
    const ch = s[this.i];
    if (ch === undefined) this.fail(`入力が途中で終わっています（${context}）`);
    if (ch === "'") this.fail(`${describeChar(ch)}で始まる値があります`, HINT.singleQuote);
    if (ch === '/') this.fail(`${describeChar(ch)}があります`, HINT.comment);
    for (const word of NON_JSON_VALUES) {
      if (s.startsWith(word, this.i)) this.fail(`「${word}」は JSON の値ではありません`, HINT.nonJsonValue);
    }
    if (ch === ',') this.fail(`${context}がありません（カンマが続いています）`);
    if (ch === '}' || ch === ']') this.fail(`${context}がありません`);
    this.fail(`${describeChar(ch)}は値として読めません`);
  }

  private value(depth: number): JsonNode {
    const s = this.s;
    const ch = s[this.i];
    let node: JsonNode;
    if (ch === '{') node = this.object(depth + 1);
    else if (ch === '[') node = this.array(depth + 1);
    else if (ch === '"') node = { kind: 'string', raw: this.string() };
    else if (ch === '-' || (ch >= '0' && ch <= '9')) node = this.number();
    else if (s.startsWith('true', this.i)) {
      this.i += 4;
      node = { kind: 'literal', raw: 'true' };
    } else if (s.startsWith('false', this.i)) {
      this.i += 5;
      node = { kind: 'literal', raw: 'false' };
    } else if (s.startsWith('null', this.i)) {
      this.i += 4;
      node = { kind: 'literal', raw: 'null' };
    } else this.failValueExpected('値');
    this.lastValueLine = this.line;
    return node;
  }

  private enter(depth: number): void {
    if (depth > MAX_DEPTH) this.fail(`入れ子が深すぎます（${MAX_DEPTH} 階層まで）`);
    if (depth > this.maxDepth) this.maxDepth = depth;
  }

  /** 要素のあとに `,` か閉じかっこが来なかったときのエラー */
  private failAfterElement(close: '}' | ']', where: string): never {
    const ch = this.s[this.i];
    if (ch === undefined) this.fail(`${where}が閉じていません（${close} がありません）`);
    if (ch === '/') this.fail(`${describeChar(ch)}があります`, HINT.comment);
    const startsValue =
      ch === '"' || ch === "'" || ch === '{' || ch === '[' || ch === '-' || /[0-9A-Za-z_$]/.test(ch);
    if (startsValue) {
      if (this.line > this.lastValueLine) {
        this.fail(
          `${describeChar(ch)}の前にカンマ（,）か ${close} が必要です`,
          HINT.missingCommaAbove,
          this.lastValueLine,
        );
      }
      this.fail(`${describeChar(ch)}の前にカンマ（,）か ${close} が必要です`, HINT.missingComma);
    }
    this.fail(`${describeChar(ch)}があります。カンマ（,）か ${close} が必要です`);
  }

  private object(depth: number): JsonNode {
    this.enter(depth);
    this.i++; // {
    const members: JsonMember[] = [];
    const seen = new Map<string, Position[]>();
    this.skipSpace();
    if (this.s[this.i] === '}') {
      this.i++;
      return { kind: 'object', members };
    }
    for (;;) {
      this.skipSpace();
      const ch = this.s[this.i];
      if (ch !== '"') {
        if (ch === '}') {
          // 直前にカンマ。カンマの位置を指す
          this.failTrailingComma();
        }
        if (ch === undefined) this.fail('オブジェクトが閉じていません（} がありません）');
        if (ch === "'") this.fail(`キーが${describeChar(ch)}で始まっています`, HINT.singleQuote);
        if (ch === '/') this.fail(`${describeChar(ch)}があります`, HINT.comment);
        if (/[A-Za-z_$0-9]/.test(ch)) this.fail('キーが " で囲まれていません', HINT.unquotedKey);
        this.fail(`${describeChar(ch)}があります。キー（"…"）が必要です`);
      }
      const keyLine = this.line;
      const keyColumn = this.column();
      const key = this.string();
      this.skipSpace();
      if (this.s[this.i] !== ':') {
        const c = this.s[this.i];
        if (c === undefined) this.fail('入力が途中で終わっています（: がありません）');
        this.fail(`${describeChar(c)}があります。キーのあとにコロン（:）が必要です`);
      }
      this.i++;
      this.skipSpace();
      const value = this.value(depth);
      members.push({ key, line: keyLine, value });
      this.keys++;
      const decoded = decodeKey(key);
      const at = seen.get(decoded);
      const pos = { line: keyLine, column: keyColumn };
      if (at) at.push(pos);
      else seen.set(decoded, [pos]);

      this.skipSpace();
      const next = this.s[this.i];
      if (next === ',') {
        this.commaAt = { line: this.line, column: this.column() };
        this.i++;
        continue;
      }
      if (next === '}') {
        this.i++;
        break;
      }
      this.failAfterElement('}', 'オブジェクト');
    }
    for (const [key, at] of seen) {
      if (at.length > 1) this.duplicates.push({ key, at });
    }
    return { kind: 'object', members };
  }

  /** 最後に読んだカンマの位置（末尾のカンマのエラーで指す） */
  private commaAt: Position = { line: 1, column: 1 };

  private failTrailingComma(): never {
    throw new ParseError(
      '閉じかっこの直前にカンマがあります',
      this.commaAt.line,
      this.commaAt.column,
      HINT.trailingComma,
      this.commaAt.line,
    );
  }

  private array(depth: number): JsonNode {
    this.enter(depth);
    this.i++; // [
    const items: JsonNode[] = [];
    this.skipSpace();
    if (this.s[this.i] === ']') {
      this.i++;
      return { kind: 'array', items };
    }
    for (;;) {
      this.skipSpace();
      if (this.s[this.i] === ']' && items.length > 0) this.failTrailingComma();
      items.push(this.value(depth));
      this.skipSpace();
      const next = this.s[this.i];
      if (next === ',') {
        this.commaAt = { line: this.line, column: this.column() };
        this.i++;
        continue;
      }
      if (next === ']') {
        this.i++;
        break;
      }
      this.failAfterElement(']', '配列');
    }
    return { kind: 'array', items };
  }

  /** 文字列を読み、引用符の内側をそのまま返す */
  private string(): string {
    const s = this.s;
    const start = ++this.i; // 開きの "
    for (;;) {
      if (this.i >= s.length) {
        this.fail('文字列が閉じていません（" がありません）', fullwidthCloseHint(s.slice(start, this.i)), undefined, start - 1);
      }
      const c = s.charCodeAt(this.i);
      if (c === 0x22) {
        const raw = s.slice(start, this.i);
        this.i++;
        return raw;
      }
      if (c === 0x5c) {
        const e = s[this.i + 1];
        if (e === 'u') {
          if (!/^[0-9A-Fa-f]{4}$/.test(s.slice(this.i + 2, this.i + 6))) {
            this.fail('\\u のあとには 16 進数 4 桁が必要です');
          }
          this.i += 6;
          continue;
        }
        if (e !== undefined && '"\\/bfnrt'.includes(e)) {
          this.i += 2;
          continue;
        }
        this.fail(
          `使えないエスケープ「\\${e ?? ''}」があります`,
          'バックスラッシュ（\\）そのものを入れるときは \\\\ と書きます',
        );
      }
      if (c === 0x0a || c === 0x0d) {
        this.fail(
          '文字列の途中で改行しています',
          fullwidthCloseHint(s.slice(start, this.i)) ?? '文字列の閉じの " が抜けていないか確かめてください',
        );
      }
      if (c < 0x20) {
        this.fail(`文字列の中に${describeChar(s[this.i])}があります`, 'タブは \\t、改行は \\n と書きます');
      }
      this.i++;
    }
  }

  private number(): JsonNode {
    const s = this.s;
    const start = this.i;
    const line = this.line;
    if (s[this.i] === '-') {
      this.i++;
      if (s.startsWith('Infinity', this.i)) {
        this.fail('「-Infinity」は JSON の値ではありません', HINT.nonJsonValue, undefined, start);
      }
    }
    const isDigit = (ch: string | undefined) => ch !== undefined && ch >= '0' && ch <= '9';
    if (s[this.i] === '0') {
      this.i++;
      if (isDigit(s[this.i])) this.fail('数値の先頭に 0 を付けることはできません', undefined, undefined, start);
    } else if (isDigit(s[this.i])) {
      while (isDigit(s[this.i])) this.i++;
    } else {
      this.fail('マイナスのあとに数字が必要です');
    }
    let integer = true;
    if (s[this.i] === '.') {
      integer = false;
      this.i++;
      if (!isDigit(s[this.i])) this.fail('小数点のあとに数字が必要です');
      while (isDigit(s[this.i])) this.i++;
    }
    if (s[this.i] === 'e' || s[this.i] === 'E') {
      integer = false;
      this.i++;
      if (s[this.i] === '+' || s[this.i] === '-') this.i++;
      if (!isDigit(s[this.i])) this.fail('指数（e）のあとに数字が必要です');
      while (isDigit(s[this.i])) this.i++;
    }
    const raw = s.slice(start, this.i);
    if (losesPrecision(raw, integer)) this.imprecise.push(line);
    return { kind: 'number', raw };
  }
}

/** 有効桁の上限（これを超える小数は JavaScript の数で表しきれない） */
const MAX_SIGNIFICANT_DIGITS = 17;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * JavaScript で読むと精度が落ちる数か。
 * 整数は Number.isSafeInteger の範囲を超えるもの、小数は有効桁 17 桁を超えるもの、
 * 指数が大きすぎて Infinity になるもの。
 */
export function losesPrecision(raw: string, integer = !/[.eE]/.test(raw)): boolean {
  if (integer) {
    const abs = raw.startsWith('-') ? raw.slice(1) : raw;
    if (abs.length < 16) return false;
    return BigInt(abs) > MAX_SAFE;
  }
  if (!Number.isFinite(Number(raw))) return true;
  const mantissa = raw.replace(/^-/, '').replace(/[eE].*$/, '');
  const [intPart, fracPart = ''] = mantissa.split('.');
  const digits = (intPart + fracPart.replace(/0+$/, '')).replace(/^0+/, '');
  return digits.length > MAX_SIGNIFICANT_DIGITS;
}

// ---------------------------------------------------------------------------
// チェック（画面から呼ぶ入口）
// ---------------------------------------------------------------------------

/** 行の一覧の書き方（3 行目・7 行目） */
function linesLabel(lines: number[], max = 3): string {
  const shown = lines.slice(0, max).map((l) => `${l} 行目`).join('・');
  return lines.length > max ? `${shown} ほか ${lines.length - max} か所` : shown;
}

/** 位置の一覧の書き方。同じ行に 2 つあるときだけ文字目まで書く */
function positionsLabel(at: Position[], max = 3): string {
  const sameLine = new Set(at.map((p) => p.line)).size < at.length;
  if (!sameLine) return linesLabel(at.map((p) => p.line), max);
  const shown = at
    .slice(0, max)
    .map((p) => `${p.line} 行目 ${p.column} 文字目`)
    .join('・');
  return at.length > max ? `${shown} ほか ${at.length - max} か所` : shown;
}

/** 重複キーの知らせの上限（多すぎると画面が埋まる） */
const MAX_DUPLICATE_NOTICES = 5;

/** 全角の混入の見当の文 */
function zenkakuHint(scan: ZenkakuScan): string | undefined {
  const parts: string[] = [];
  if (scan.replaced.length > 0) {
    const names = [...new Set(scan.replaced.map((m) => m.name))];
    const first = scan.replaced[0];
    parts.push(
      `${names.slice(0, 3).join('・')}${names.length > 3 ? 'など' : ''}が混ざっています（最初は ${first.line} 行目 ${first.column} 文字目）。「全角を直す」で半角にできます`,
    );
  }
  const choon = scan.unfixed.find((m) => m.reason === 'choon');
  if (choon) {
    parts.push(`長音の ー が入っています（${choon.line} 行目）。マイナスは半角の - にしてください`);
  }
  const unclosed = scan.unfixed.find((m) => m.reason === 'unclosed-quote');
  if (unclosed) {
    parts.push(`全角の引用符 ${unclosed.char} が閉じていません（${unclosed.line} 行目）`);
  }
  return parts.length > 0 ? parts.join('。') : undefined;
}

/**
 * JSON を読んで、正しいか・どこが誤りか・知らせることを返す。
 *
 * - 先頭の BOM は黙って取り除き、注記を 1 つ出す（位置は取り除いたあとで数える）
 * - 5MB を超える入力は処理しない
 */
export function checkJson(input: string): JsonCheck {
  if (isTooLarge(input)) {
    return {
      ok: false,
      line: 1,
      column: 1,
      message: `${formatBytes(MAX_INPUT_BYTES)} を超える JSON は扱えません（重いのでブラウザが固まります）`,
      markLine: 0,
      fixable: false,
      bomRemoved: false,
      tooLarge: true,
    };
  }
  const { text, removed: bomRemoved } = stripBom(input);

  let parsed: ParseResult;
  try {
    parsed = new Parser(text).parse();
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    const scan = scanZenkaku(text);
    const zHint = zenkakuHint(scan);
    return {
      ok: false,
      line: e.line,
      column: e.column,
      message: e.message,
      // 全角が混ざっているときは、それが原因であることがほとんどなので先に言う
      hint: zHint ?? e.hint,
      markLine: e.markLine ?? e.line,
      fixable: scan.replaced.length > 0,
      bomRemoved,
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // 走査器が通したのに JSON.parse が落ちることは無いはず。あれば最終判定に従う
    return {
      ok: false,
      line: 1,
      column: 1,
      message: 'JSON として読めませんでした',
      markLine: 1,
      fixable: false,
      bomRemoved,
    };
  }

  const notices: Notice[] = [];
  if (bomRemoved) {
    notices.push({
      kind: 'bom',
      message: '先頭の BOM（U+FEFF）を取り除いて読みました。出力には付けません',
      lines: [1],
    });
  }
  for (const dup of parsed.duplicates.slice(0, MAX_DUPLICATE_NOTICES)) {
    notices.push({
      kind: 'duplicate-key',
      message: `"${dup.key}" が ${dup.at.length} 回出てきます（${positionsLabel(dup.at)}）。多くのプログラムは後ろの値だけを使います`,
      lines: dup.at.map((p) => p.line),
    });
  }
  if (parsed.duplicates.length > MAX_DUPLICATE_NOTICES) {
    notices.push({
      kind: 'duplicate-key',
      message: `重複しているキーがほかに ${parsed.duplicates.length - MAX_DUPLICATE_NOTICES} 種類あります`,
      lines: parsed.duplicates.slice(MAX_DUPLICATE_NOTICES).map((d) => d.at[0].line),
    });
  }
  if (parsed.imprecise.length > 0) {
    notices.push({
      kind: 'precision',
      message: `JavaScript で読むと精度が落ちる数があります（${linesLabel(parsed.imprecise)}）。このツールは書き方を変えずに出力します`,
      lines: parsed.imprecise,
    });
  }

  return {
    ok: true,
    value,
    tree: parsed.tree,
    stats: { depth: parsed.depth, keys: parsed.keys, bytes: utf8Bytes(text) },
    notices,
    bomRemoved,
  };
}

// ---------------------------------------------------------------------------
// 書き出し
// ---------------------------------------------------------------------------

function indentUnit(kind: IndentKind): string {
  return kind === 'tab' ? '\t' : ' '.repeat(Number(kind));
}

/**
 * 木を書き出す。数値・文字列は元の書き方のまま。
 * `indent` を null にすると 1 行に圧縮する（空白なし）。
 */
export function writeJson(tree: JsonNode, indent: IndentKind | null): string {
  const unit = indent === null ? '' : indentUnit(indent);
  const out: string[] = [];
  const write = (node: JsonNode, level: number) => {
    switch (node.kind) {
      case 'string':
        out.push('"', node.raw, '"');
        return;
      case 'number':
      case 'literal':
        out.push(node.raw);
        return;
      case 'array': {
        if (node.items.length === 0) {
          out.push('[]');
          return;
        }
        out.push('[');
        node.items.forEach((item, index) => {
          if (index > 0) out.push(',');
          if (unit) out.push('\n', unit.repeat(level + 1));
          write(item, level + 1);
        });
        if (unit) out.push('\n', unit.repeat(level));
        out.push(']');
        return;
      }
      case 'object': {
        if (node.members.length === 0) {
          out.push('{}');
          return;
        }
        out.push('{');
        node.members.forEach((member, index) => {
          if (index > 0) out.push(',');
          if (unit) out.push('\n', unit.repeat(level + 1));
          out.push('"', member.key, unit ? '": ' : '":');
          write(member.value, level + 1);
        });
        if (unit) out.push('\n', unit.repeat(level));
        out.push('}');
        return;
      }
    }
  };
  write(tree, 0);
  return out.join('');
}

/**
 * オブジェクトのキーを再帰的に辞書順（UTF-16 の順）に並べ替えた木を返す。
 * 配列の順は変えない。重複キーは元の順を保って両方残す（安定な並べ替え）。
 */
export function sortKeys(tree: JsonNode): JsonNode {
  switch (tree.kind) {
    case 'array':
      return { kind: 'array', items: tree.items.map(sortKeys) };
    case 'object': {
      const members = tree.members
        .map((m) => ({ member: { ...m, value: sortKeys(m.value) }, key: decodeKey(m.key) }))
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        .map((x) => x.member);
      return { kind: 'object', members };
    }
    default:
      return tree;
  }
}

/** 整形・圧縮・並べ替えの 3 つの操作 */
export type OutputMode = 'format' | 'minify' | 'sort';

/** 画面の 3 つのボタンが呼ぶ入口 */
export function renderOutput(tree: JsonNode, mode: OutputMode, indent: IndentKind): string {
  if (mode === 'minify') return writeJson(tree, null);
  if (mode === 'sort') return writeJson(sortKeys(tree), indent);
  return writeJson(tree, indent);
}
