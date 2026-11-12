/**
 * バイト列から文字コード（UTF-8・Shift_JIS・EUC-JP・ISO-2022-JP）を判別・採点する純関数。
 *
 * URLデコード（lib/url-decode.ts）と Base64（lib/base64.ts）が同じ関数を使う。
 * 「文字列 → バイト列」に分けるところは各ツールが持ち、ここはバイト列だけを受け取る。
 *
 * 仕様: docs/features/url-decode-encode.md・docs/features/base64-henkan.md「デコードの約束」3
 *
 * - 通信しない。変換はブラウザ（と Node）標準の `TextDecoder` だけで行う
 * - DOM・React に依存しない
 */

export type Charset = 'utf-8' | 'shift_jis' | 'euc-jp' | 'iso-2022-jp';

export const CHARSET_LABELS: Record<Charset, string> = {
  'utf-8': 'UTF-8',
  shift_jis: 'Shift_JIS',
  'euc-jp': 'EUC-JP',
  'iso-2022-jp': 'ISO-2022-JP',
};

/** デコードで選べる文字コード */
export const DECODE_CHARSETS: readonly Charset[] = ['utf-8', 'shift_jis', 'euc-jp', 'iso-2022-jp'];

/** 計測（tool_use）に使う文字コードの短い名前。入力・結果は送らない */
export const CHARSET_TRACK: Record<Charset, string> = {
  'utf-8': 'utf8',
  shift_jis: 'sjis',
  'euc-jp': 'eucjp',
  'iso-2022-jp': 'jis',
};

/** ASCII だけのバイト列か（どの文字コードでも同じに読める） */
export function isAsciiOnly(bytes: number[]): boolean {
  return bytes.every((b) => b < 0x80);
}

// ---------------------------------------------------------------------------
// UTF-8 の検査（途中で切れたものと、そもそも UTF-8 でないものを分ける）
// ---------------------------------------------------------------------------

export interface Utf8Issue {
  start: number;
  end: number;
  /** truncated＝正しく始まったが途中で切れた／invalid＝UTF-8 として始まりからおかしい */
  kind: 'truncated' | 'invalid';
}

function utf8SeqLength(b: number): number {
  if (b < 0x80) return 1;
  if (b >= 0xc2 && b <= 0xdf) return 2;
  if (b >= 0xe0 && b <= 0xef) return 3;
  if (b >= 0xf0 && b <= 0xf4) return 4;
  return 0;
}

/** WHATWG の UTF-8 decoder と同じ範囲の2バイト目の制限（過長・サロゲートを除く） */
function utf8SecondByteOk(lead: number, b: number): boolean {
  if (lead === 0xe0) return b >= 0xa0 && b <= 0xbf;
  if (lead === 0xed) return b >= 0x80 && b <= 0x9f;
  if (lead === 0xf0) return b >= 0x90 && b <= 0xbf;
  if (lead === 0xf4) return b >= 0x80 && b <= 0x8f;
  return b >= 0x80 && b <= 0xbf;
}

export function scanUtf8(bytes: number[]): Utf8Issue[] {
  const issues: Utf8Issue[] = [];
  let i = 0;
  while (i < bytes.length) {
    const len = utf8SeqLength(bytes[i]);
    if (len === 1) {
      i += 1;
      continue;
    }
    if (len === 0) {
      issues.push({ start: i, end: i + 1, kind: 'invalid' });
      i += 1;
      continue;
    }
    let j = 1;
    while (j < len && i + j < bytes.length) {
      const b = bytes[i + j];
      const ok = j === 1 ? utf8SecondByteOk(bytes[i], b) : b >= 0x80 && b <= 0xbf;
      if (!ok) break;
      j += 1;
    }
    if (j === len) {
      i += len;
      continue;
    }
    // 2バイト目から外れるなら UTF-8 ではない。正しく始まって途中で止まったなら「途中で切れた」
    // 1バイト目だけで止まったときは、次が ASCII・行の終わりなら「切れた」、
    // 別のバイト（Shift_JIS・EUC-JP の2バイト目など）なら UTF-8 ではない
    const next = bytes[i + j];
    const cut = j >= 2 || next === undefined || next < 0x80;
    issues.push({ start: i, end: i + j, kind: cut ? 'truncated' : 'invalid' });
    i += j;
  }
  return issues;
}

// ---------------------------------------------------------------------------
// 文字コードの判別
// ---------------------------------------------------------------------------

const decoders = new Map<string, TextDecoder>();
export function decoder(charset: Charset, fatal: boolean): TextDecoder {
  const key = `${charset}:${fatal}`;
  let d = decoders.get(key);
  if (!d) {
    // ignoreBOM：先頭の %EF%BB%BF を黙って消さず、見えない文字として印を付けるため
    d = new TextDecoder(charset, { fatal, ignoreBOM: true });
    decoders.set(key, d);
  }
  return d;
}

export function tryDecode(bytes: number[], charset: Charset): string | null {
  try {
    return decoder(charset, true).decode(Uint8Array.from(bytes));
  } catch {
    return null;
  }
}

let level1Kanji: Set<string> | null = null;
/**
 * JIS 第1水準の漢字の集合。Shift_JIS の 0x889F〜0x9872 を `TextDecoder` で一度読んで作る
 * （辞書のデータを持たないため）
 */
function jisLevel1(): Set<string> {
  if (level1Kanji) return level1Kanji;
  const set = new Set<string>();
  const d = decoder('shift_jis', false);
  for (let lead = 0x88; lead <= 0x98; lead++) {
    for (let trail = 0x40; trail <= 0xfc; trail++) {
      if (trail === 0x7f) continue;
      const code = (lead << 8) | trail;
      if (code < 0x889f || code > 0x9872) continue;
      const ch = d.decode(Uint8Array.of(lead, trail));
      if (ch.length === 1 && ch !== '�') set.add(ch);
    }
  }
  level1Kanji = set;
  return set;
}

/**
 * 日本語らしさの点（1文字あたりの平均）。ひらがな・カタカナ・第1水準の漢字・ASCII が多いほど高く、
 * 半角カナ・私用領域・第2水準だけの漢字・制御文字が続くほど低い。
 */
export function japaneseScore(text: string): number {
  const level1 = jisLevel1();
  let total = 0;
  let count = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    count += 1;
    if (cp >= 0x3041 && cp <= 0x30ff) total += 2;
    else if (level1.has(ch)) total += 2;
    else if (cp >= 0x20 && cp < 0x7f) total += 1;
    else if ((cp >= 0x3000 && cp <= 0x303f) || (cp >= 0xff01 && cp <= 0xff5e)) total += 1;
    else if (cp >= 0xff61 && cp <= 0xff9f) total -= 2;
    else if (cp >= 0xe000 && cp <= 0xf8ff) total -= 3;
    else if (cp >= 0x4e00 && cp <= 0x9fff) total -= 1;
    else if (cp === 0xfffd || cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) total -= 5;
  }
  return count === 0 ? 0 : total / count;
}

/** 2つの候補の点の差がこれより小さいときは、候補を並べて選んでもらう */
export const SCORE_MARGIN = 0.5;

export interface CharsetGuess {
  /** 使う文字コード（候補が2つ残るときは点の高いほう） */
  charset: Charset;
  /** 候補が2つ以上残ったときだけ2つ以上（点の高い順） */
  candidates: Charset[];
  /** どの文字コードでも読めなかった（UTF-8 として読めた分を出す） */
  unreadable: boolean;
  /** ASCII 以外のバイトが1つも無い（どの文字コードでも同じ） */
  asciiOnly: boolean;
}

/** 計測用の文字コードの区分（候補が並んだら ambiguous） */
export function trackCharset(guess: CharsetGuess): string {
  return guess.candidates.length > 1 ? 'ambiguous' : CHARSET_TRACK[guess.charset];
}

/**
 * バイト列の並び（ASCII 以外を含む塊ごと）から文字コードを判別する。
 * 塊が1つも無ければ ASCII だけ（どの文字コードでも同じ）。
 */
export function guessCharsetFromRuns(runs: readonly number[][]): CharsetGuess {
  const result = (charset: Charset, extra: Partial<CharsetGuess> = {}): CharsetGuess => ({
    charset,
    candidates: [charset],
    unreadable: false,
    asciiOnly: false,
    ...extra,
  });
  if (runs.length === 0) return result('utf-8', { asciiOnly: true });

  // 1. ESC $ B / ESC $ @ があれば ISO-2022-JP を先に試す（7ビットなので UTF-8 としても通ってしまう）
  const hasJisEscape = runs.some((r) => r.some((b, i) => b === 0x1b && r[i + 1] === 0x24 && (r[i + 2] === 0x42 || r[i + 2] === 0x40)));
  if (hasJisEscape && runs.every((r) => tryDecode(r, 'iso-2022-jp') !== null)) return result('iso-2022-jp');

  // 2. UTF-8 で読めれば確定（途中で切れたものは UTF-8 のまま印を付ける）
  const utf8Invalid = runs.some((r) => scanUtf8(r).some((x) => x.kind === 'invalid'));
  if (!utf8Invalid) return result('utf-8');

  // 3. Shift_JIS と EUC-JP を日本語らしさで比べる
  const scored = (['shift_jis', 'euc-jp'] as const)
    .map((cs) => {
      const texts = runs.map((r) => tryDecode(r, cs));
      if (texts.some((t) => t === null)) return null;
      return { charset: cs as Charset, score: japaneseScore(texts.join('')) };
    })
    .filter((x): x is { charset: Charset; score: number } => x !== null)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return result('utf-8', { unreadable: true });
  if (scored.length === 1 || scored[0].score - scored[1].score >= SCORE_MARGIN) return result(scored[0].charset);
  return result(scored[0].charset, { candidates: scored.map((s) => s.charset) });
}

/** 1本のバイト列から文字コードを判別する（Base64 のデコード結果など） */
export function guessCharsetOfBytes(bytes: ArrayLike<number>): CharsetGuess {
  const arr = Array.from(bytes);
  if (isAsciiOnly(arr) && !arr.includes(0x1b)) return guessCharsetFromRuns([]);
  return guessCharsetFromRuns([arr]);
}
