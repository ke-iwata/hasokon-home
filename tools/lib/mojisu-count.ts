/**
 * 文字数カウントのロジック
 *
 * 仕様: docs/features/mojisu-count.md
 *
 * 数え方の約束（画面とFAQでも同じことを書いている）。ここを変えると
 * 「Wordと何文字ずれるか」の説明が嘘になるので、直すときはページ側も直すこと。
 *
 * 1. **文字数はコードポイント単位**（`Array.from()` で分解する）。
 *    UTF-16の `String.length` はサロゲートペア（絵文字・𩸽 などの追加面の漢字）を
 *    2文字と数えてしまい、見た目の1文字と食い違う
 * 2. **結合文字・異体字セレクタは深追いしない**。「が」＝「か」＋濁点（U+3099）のように
 *    分解して入力された文字は2、肌の色や性別を指定した絵文字（ZWJ連結）は
 *    構成するコードポイントの数だけ数える。書記素単位（`Intl.Segmenter`）に
 *    寄せると、こんどは「Wordの文字数」と別の方向にずれるため採らない
 * 3. **改行コードは CR / LF / CRLF を LF に正規化してから数える**。
 *    Windows由来のテキストを貼り付けたときに、改行1つが2文字に数えられるのを防ぐ
 *
 * 全角・半角の判定は `hankaku-zenkaku` の `countChars()` をそのまま使う
 * （同じサイトの中で「全角何文字」の定義が2つあると説明できなくなるため）。
 */
import { countChars } from './hankaku-zenkaku';

/** 400字詰め原稿用紙の1枚あたりの文字数（20×20の升目） */
export const CHARS_PER_SHEET = 400;

/** 数えた結果 */
export interface TextCount {
  /** 文字数（スペース・タブ・改行を**含む**） */
  chars: number;
  /** 文字数（スペース・タブ・改行を**含まない**。全角スペースも除く） */
  charsNoSpace: number;
  /** 文字数（改行だけを除く。原稿用紙換算に使う値） */
  charsNoBreak: number;
  /** 行数。空行も1行と数えるが、末尾の改行1つは行を増やさない */
  lines: number;
  /** 段落数。空行（空白だけの行を含む）で区切られたかたまりの数 */
  paragraphs: number;
  /** 全角として扱う文字の数（改行を除いた本文が対象。full + half = charsNoBreak） */
  full: number;
  /** 半角として扱う文字の数 */
  half: number;
  /** UTF-8 でのバイト数（改行はLFに正規化した状態で数える） */
  bytes: number;
}

/** 目標文字数に対する進み具合 */
export interface TargetProgress {
  /** 目標文字数 */
  target: number;
  /** 数えた文字数（どの数え方を渡したかは呼び出し側の責任） */
  count: number;
  /** 目標まで残り何文字か。超過しているときは0 */
  remaining: number;
  /** 目標を超えた分。届いていないときは0 */
  over: number;
  /** 達成率（%。小数1桁。上限なし） */
  percent: number;
  /** 目標に達したか（ちょうどは達成とみなす） */
  reached: boolean;
}

/** 改行コードを LF に揃える。CRLF → LF、単独のCR → LF */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * 空白文字か。
 *
 * 半角スペース・タブ・改行のほか、全角スペース（U+3000）も除外の対象にする。
 * 日本語の文章では字下げに全角スペースを使うため、「スペースを含まない文字数」で
 * 全角スペースが1文字として残ると期待とずれる。
 */
const isSpace = (ch: string) => /^[\s　]$/u.test(ch);

/**
 * 文字数・行数・バイト数をまとめて数える。
 *
 * @param input 数える対象のテキスト（テキストエリアの値をそのまま渡してよい）
 * @returns 各種の件数。空文字のときは全項目0（行数も0行）
 */
export function countText(input: string): TextCount {
  const text = normalizeNewlines(input);
  const chars = Array.from(text);

  let charsNoSpace = 0;
  let breaks = 0;
  for (const ch of chars) {
    if (ch === '\n') breaks += 1;
    if (!isSpace(ch)) charsNoSpace += 1;
  }

  // 全角・半角の内訳は改行を除いた本文で数える（改行に幅はないため）。
  // これで full + half が charsNoBreak と必ず一致する
  const { full, half } = countChars(text.replace(/\n/g, ''));

  return {
    chars: chars.length,
    charsNoSpace,
    charsNoBreak: chars.length - breaks,
    lines: countLines(text),
    paragraphs: countParagraphs(text),
    full,
    half,
    bytes: new TextEncoder().encode(text).length,
  };
}

/**
 * 行数を数える。
 *
 * 末尾の改行1つは行を増やさない。文章の最後でEnterを押しただけで
 * 「1行増えた」と出るのを避けるため（テキストファイルの慣習と同じ扱い）。
 * 途中の空行は1行として数える。
 */
function countLines(text: string): number {
  if (text === '') return 0;
  return text.replace(/\n$/, '').split('\n').length;
}

/**
 * 段落数を数える。
 *
 * 空行（空白だけの行も空行として扱う）で区切られたかたまりの数。
 * 1行あけて書く文章を1段落と数えたいので、改行1つでは区切らない。
 */
function countParagraphs(text: string): number {
  return text
    .split(/\n[\s　]*\n/u)
    .filter((block) => block.trim() !== '')
    .length;
}

/**
 * 400字詰め原稿用紙の枚数に換算する（小数1桁）。
 *
 * **升目のシミュレーションはしない。** 単純に 文字数 ÷ 400 で出す。
 * 実際の原稿用紙は改行のたびに行末の升目が空くため、厳密には枚数が増えるが、
 * 「だいたい何枚か」を知りたいという需要に対して仕様が複雑になりすぎる。
 * この割り切りはページにも明記してある。
 *
 * @param charCount 文字数（呼び出し側が「改行を除いた文字数」を渡す）
 * @returns 枚数。負の数は0にする
 */
export function manuscriptSheets(charCount: number): number {
  if (charCount <= 0) return 0;
  return Math.round((charCount / CHARS_PER_SHEET) * 10) / 10;
}

/**
 * 目標文字数に対する残りと達成率を出す。
 *
 * @param count 現在の文字数
 * @param target 目標文字数。0以下・非有限のときは null（目標未設定として扱う）
 */
export function evaluateTarget(count: number, target: number): TargetProgress | null {
  if (!Number.isFinite(target) || target <= 0) return null;

  const diff = count - target;
  return {
    target,
    count,
    remaining: diff >= 0 ? 0 : -diff,
    over: diff > 0 ? diff : 0,
    percent: Math.round((count / target) * 1000) / 10,
    reached: diff >= 0,
  };
}
