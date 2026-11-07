/**
 * URLデコード・エンコード（`%XX` ⇔ 文字）の純関数。
 *
 * 仕様: docs/features/url-decode-encode.md
 *
 * - **通信しない。** 文字コードの変換はブラウザ（と Node）が標準で持つ `TextDecoder` だけで行う。
 *   Shift_JIS・EUC-JP の逆引き表も、データファイルを持たずに `TextDecoder` で2バイトの全組み合わせを
 *   一度読んで作る（初めて使ったときに遅延生成）
 * - 位置（「何文字目」）は書記素（`Intl.Segmenter`）単位で数える。絵文字・結合文字を割らない
 * - DOM・React に依存しない
 */

// ---------------------------------------------------------------------------
// 上限・定数
// ---------------------------------------------------------------------------

/** 入力が止まってから変換するまで（ms） */
export const DEBOUNCE_MS = 200;
/** 自動で変換する上限（合わせての文字数）。超えたら「変換する」ボタン */
export const MAX_AUTO_CHARS = 100_000;
/** 自動で変換する上限（行数） */
export const MAX_AUTO_LINES = 1_000;
/** 「もう1回デコード」の上限（1回目を含めた回数） */
export const MAX_DECODE_ROUNDS = 5;

export type Charset = 'utf-8' | 'shift_jis' | 'euc-jp' | 'iso-2022-jp';

export const CHARSET_LABELS: Record<Charset, string> = {
  'utf-8': 'UTF-8',
  shift_jis: 'Shift_JIS',
  'euc-jp': 'EUC-JP',
  'iso-2022-jp': 'ISO-2022-JP',
};

/** デコードで選べる文字コード */
export const DECODE_CHARSETS: readonly Charset[] = ['utf-8', 'shift_jis', 'euc-jp', 'iso-2022-jp'];
/** エンコードで選べる文字コード（ISO-2022-JP の URL は実際にはまず無いので出さない） */
export type EncodeCharset = 'utf-8' | 'shift_jis' | 'euc-jp';
export const ENCODE_CHARSETS: readonly EncodeCharset[] = ['utf-8', 'shift_jis', 'euc-jp'];

/** 計測（tool_use）に使う文字コードの短い名前。入力・結果は送らない */
export const CHARSET_TRACK: Record<Charset, string> = {
  'utf-8': 'utf8',
  shift_jis: 'sjis',
  'euc-jp': 'eucjp',
  'iso-2022-jp': 'jis',
};

// ---------------------------------------------------------------------------
// 書記素
// ---------------------------------------------------------------------------

let segmenter: Intl.Segmenter | null = null;
function graphemes(text: string): { segment: string; index: number }[] {
  segmenter ??= new Intl.Segmenter('ja', { granularity: 'grapheme' });
  return Array.from(segmenter.segment(text), (s) => ({ segment: s.segment, index: s.index }));
}

/** 文字列の code unit の位置 → 何文字目（1始まり・書記素単位） */
export function graphemeNumberAt(text: string, offset: number): number {
  let n = 0;
  for (const g of graphemes(text)) {
    if (g.index > offset) break;
    n += 1;
  }
  return Math.max(1, n);
}

// ---------------------------------------------------------------------------
// 向きの自動判定
// ---------------------------------------------------------------------------

export type Direction = 'decode' | 'encode';
export type DetectedDirection = Direction | 'none';

const PERCENT_RE = /%[0-9A-Fa-f]{2}/;
const XN_RE = /(^|[.\s/@])xn--/i;
// eslint-disable-next-line no-control-regex
const NON_ASCII_RE = /[^\x00-\x7F]/;

/**
 * 入力を見て向きを決める。
 * `%XX` か `xn--` を含めばデコード、含まず日本語（ASCII 以外）を含めばエンコード、
 * どれも含まなければ `none`（勝手にエンコードしない）。
 */
export function detectDirection(input: string): { direction: DetectedDirection; reason: string } {
  if (PERCENT_RE.test(input)) return { direction: 'decode', reason: '%XX を含むため' };
  if (XN_RE.test(input)) return { direction: 'decode', reason: 'xn-- で始まる日本語ドメインを含むため' };
  if (NON_ASCII_RE.test(input)) return { direction: 'encode', reason: '日本語などの文字を含むため' };
  return { direction: 'none', reason: '変換するもの（%XX・日本語・xn--）はありません' };
}

// ---------------------------------------------------------------------------
// %XX → バイト列
// ---------------------------------------------------------------------------

/** `+` の扱い。auto はパス（`?` より前）で残し、クエリで空白に戻す */
export type PlusMode = 'auto' | 'space' | 'keep';

type Piece =
  | { kind: 'text'; text: string }
  | { kind: 'bytes'; bytes: number[]; src: number[] }
  | { kind: 'bad-percent'; raw: string; src: number };

/** `?` より後ろ（`#` より前）の位置か。auto の `+` の扱いに使う */
function plusAsSpaceAt(line: string, mode: PlusMode): (i: number) => boolean {
  if (mode === 'space') return () => true;
  if (mode === 'keep') return () => false;
  const q = line.indexOf('?');
  const hash = line.indexOf('#');
  if (q >= 0) return (i) => i > q && (hash < 0 || hash < q || i < hash);
  // `?` が無いときは、`a=b&c=d` の形（クエリの一部を貼った）なら空白に戻す
  if (/^[^/\s]*=/.test(line)) return () => true;
  return () => false;
}

/**
 * 1行を「そのままの文字」「バイト列」「壊れた %」に分ける。
 * ASCII の文字はバイト列に混ぜる（Shift_JIS の2バイト目は ASCII の範囲に入ることがあり、
 * 古いURLでは `%83A`（＝ア）のように2バイト目だけ % にしないで書かれているため）。
 */
function tokenize(line: string, plus: PlusMode): Piece[] {
  const pieces: Piece[] = [];
  const isSpace = plusAsSpaceAt(line, plus);
  let bytes: number[] = [];
  let src: number[] = [];
  const flush = () => {
    if (bytes.length) pieces.push({ kind: 'bytes', bytes, src });
    bytes = [];
    src = [];
  };
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '%') {
      const hex = line.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        src.push(i);
        i += 3;
        continue;
      }
      flush();
      // `%G1` は3文字、末尾の `%` / `%A` はあるだけを壊れた印にする
      const raw = line.slice(i, i + 1 + (/^[0-9A-Fa-f]/.test(hex) && hex.length === 1 ? 1 : 0));
      pieces.push({ kind: 'bad-percent', raw, src: i });
      i += raw.length;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code < 0x80) {
      bytes.push(ch === '+' && isSpace(i) ? 0x20 : code);
      src.push(i);
      i += 1;
      continue;
    }
    flush();
    // ASCII 以外はそのまま（すでにデコードされた日本語など）。サロゲートペアを割らない
    const cp = line.codePointAt(i)!;
    const text = String.fromCodePoint(cp);
    const last = pieces[pieces.length - 1];
    if (last?.kind === 'text') last.text += text;
    else pieces.push({ kind: 'text', text });
    i += text.length;
  }
  flush();
  return pieces;
}

/** ASCII だけのバイト列か（どの文字コードでも同じに読める） */
function isAsciiOnly(bytes: number[]): boolean {
  return bytes.every((b) => b < 0x80);
}

// ---------------------------------------------------------------------------
// UTF-8 の検査（途中で切れたものと、そもそも UTF-8 でないものを分ける）
// ---------------------------------------------------------------------------

interface Utf8Issue {
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

function scanUtf8(bytes: number[]): Utf8Issue[] {
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
function decoder(charset: Charset, fatal: boolean): TextDecoder {
  const key = `${charset}:${fatal}`;
  let d = decoders.get(key);
  if (!d) {
    d = new TextDecoder(charset, { fatal });
    decoders.set(key, d);
  }
  return d;
}

function tryDecode(bytes: number[], charset: Charset): string | null {
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

/** 入力全体（複数行）のバイト列から文字コードを判別する */
export function guessCharset(input: string, plus: PlusMode = 'auto'): CharsetGuess {
  const runs: number[][] = [];
  for (const line of splitLines(input)) {
    for (const p of tokenize(line, plus)) {
      if (p.kind === 'bytes' && !isAsciiOnly(p.bytes)) runs.push(p.bytes);
      else if (p.kind === 'bytes' && p.bytes.includes(0x1b)) runs.push(p.bytes);
    }
  }
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

// ---------------------------------------------------------------------------
// デコード
// ---------------------------------------------------------------------------

export interface Segment {
  text: string;
  /** broken＝壊れた `%`・途中で切れた文字／unreadable＝この文字コードで読めないバイト */
  mark?: 'broken' | 'unreadable' | 'unencodable';
}

export interface Problem {
  kind: 'bad-percent' | 'truncated' | 'unreadable' | 'unencodable';
  /** 入力の何文字目か（1始まり・書記素単位） */
  at: number;
  /** その部分の元の文字（`%E3%81` など） */
  raw: string;
  /** 原因の見当（日本語） */
  message: string;
}

export interface LineResult {
  segments: Segment[];
  /** 変換後の文字列（コピーする値） */
  text: string;
  problems: Problem[];
}

function rawOf(line: string, src: number[], start: number, end: number): string {
  const from = src[start];
  const last = src[end - 1];
  const to = line[last] === '%' ? last + 3 : last + 1;
  return line.slice(from, to);
}

function pushText(segments: Segment[], text: string, mark?: Segment['mark']) {
  if (!text) return;
  const last = segments[segments.length - 1];
  if (last && last.mark === mark) last.text += text;
  else segments.push(mark ? { text, mark } : { text });
}

/** 最初に読めなくなるバイトの位置（stream で1バイトずつ食わせて例外の出た位置） */
function firstUnreadable(bytes: number[], charset: Charset): number {
  const d = new TextDecoder(charset, { fatal: true });
  for (let i = 0; i < bytes.length; i++) {
    try {
      d.decode(Uint8Array.of(bytes[i]), { stream: true });
    } catch {
      return i;
    }
  }
  try {
    d.decode();
  } catch {
    return bytes.length - 1;
  }
  return -1;
}

function decodeBytes(line: string, piece: Extract<Piece, { kind: 'bytes' }>, charset: Charset, segments: Segment[], problems: Problem[]) {
  const { bytes, src } = piece;
  if (charset === 'utf-8') {
    const issues = scanUtf8(bytes);
    let pos = 0;
    for (const issue of issues) {
      pushText(segments, decoder('utf-8', false).decode(Uint8Array.from(bytes.slice(pos, issue.start))));
      const raw = rawOf(line, src, issue.start, issue.end);
      const at = graphemeNumberAt(line, src[issue.start]);
      if (issue.kind === 'truncated') {
        pushText(segments, raw, 'broken');
        problems.push({
          kind: 'truncated',
          at,
          raw,
          message: `入力の${at}文字目に途中で切れた文字があります（コピーのときに末尾が欠けた可能性）`,
        });
      } else {
        pushText(segments, raw, 'unreadable');
        problems.push({ kind: 'unreadable', at, raw, message: `入力の${at}文字目の ${raw} は UTF-8 では読めません` });
      }
      pos = issue.end;
    }
    pushText(segments, decoder('utf-8', false).decode(Uint8Array.from(bytes.slice(pos))));
    return;
  }
  const ok = tryDecode(bytes, charset);
  if (ok !== null) {
    pushText(segments, ok);
    return;
  }
  // 手で選んだ文字コードで読めないとき：読めるところまで読み、残りは印を付けて元のまま出す
  const bad = firstUnreadable(bytes, charset);
  // 読めなくなった位置の直前の文字の切れ目までを読む（1バイトずつ戻って fatal で通る所）
  let cut = bad;
  while (cut > 0 && tryDecode(bytes.slice(0, cut), charset) === null) cut -= 1;
  pushText(segments, tryDecode(bytes.slice(0, cut), charset) ?? '');
  const raw = rawOf(line, src, cut, bytes.length);
  const at = graphemeNumberAt(line, src[Math.max(cut, 0)]);
  pushText(segments, raw, 'unreadable');
  problems.push({ kind: 'unreadable', at, raw, message: `入力の${at}文字目から ${CHARSET_LABELS[charset]} では読めません` });
}

/** 1行をデコードする */
export function decodeLine(line: string, charset: Charset, plus: PlusMode = 'auto'): LineResult {
  const segments: Segment[] = [];
  const problems: Problem[] = [];
  for (const piece of tokenize(line, plus)) {
    if (piece.kind === 'text') pushText(segments, piece.text);
    else if (piece.kind === 'bad-percent') {
      const at = graphemeNumberAt(line, piece.src);
      pushText(segments, piece.raw, 'broken');
      problems.push({
        kind: 'bad-percent',
        at,
        raw: piece.raw,
        message:
          piece.raw === '%'
            ? `入力の${at}文字目の % のあとに16進数2桁がありません（途中で切れたか、% がそのまま使われています）`
            : `入力の${at}文字目の ${piece.raw} は途中で切れています（コピーのときに末尾が欠けた可能性）`,
      });
    } else decodeBytes(line, piece, charset, segments, problems);
  }
  return { segments, text: segments.map((s) => s.text).join(''), problems };
}

/**
 * 2回エンコードされているか。元の入力に `%25XX` があり、デコードした結果にまた `%XX` があるとき。
 * 自動では繰り返さない（`%25` を本当に `%` として使う URL があるため）
 */
export function looksDoubleEncoded(input: string, decoded: string): boolean {
  return /%25[0-9A-Fa-f]{2}/.test(input) && PERCENT_RE.test(decoded);
}

export function splitLines(input: string): string[] {
  return input.split(/\r\n|\n|\r/);
}

export interface DecodeResult {
  lines: LineResult[];
  guess: CharsetGuess;
  /** 使った文字コード（手で選んだときはそれ） */
  charset: Charset;
  doubleEncoded: boolean;
}

/** 複数行をまとめてデコードする。`charset` を渡せば自動判別より優先 */
export function decodeText(input: string, opts: { charset?: Charset; plus?: PlusMode } = {}): DecodeResult {
  const plus = opts.plus ?? 'auto';
  const guess = guessCharset(input, plus);
  const charset = opts.charset ?? guess.charset;
  const lines = splitLines(input).map((line) => decodeLine(line, charset, plus));
  const output = lines.map((l) => l.text).join('\n');
  return { lines, guess, charset, doubleEncoded: looksDoubleEncoded(input, output) };
}

// ---------------------------------------------------------------------------
// エンコード
// ---------------------------------------------------------------------------

/** component＝URL の部品として（encodeURIComponent 相当）／whole＝URL 全体として（encodeURI 相当） */
export type EncodeScope = 'component' | 'whole';
export type SpaceMode = '%20' | '+';

/** どちらの範囲でも残す文字（RFC 3986 の非予約文字と、encodeURIComponent が残す記号） */
const KEEP_COMPONENT = /[A-Za-z0-9\-_.!~*'()]/;
/** URL 全体のときに追加で残す文字（encodeURI が残す記号） */
const KEEP_WHOLE = /[;,/?:@&=+$#]/;

type ReverseTable = Map<string, number[]>;
const reverseTables = new Map<EncodeCharset, ReverseTable>();

/**
 * Shift_JIS の逆引き表。`TextDecoder` で2バイトの全組み合わせを pointer の順に読んで、
 * **WHATWG の Shift_JIS encoder と同じ選び方**にする：
 * pointer 8272〜8835（NEC 選定 IBM 拡張・0xED40〜0xEEFC）を除き、同じ文字は最初の pointer を採る。
 * 私用領域（0xF040〜0xF9FC の外字）は encoder が作らないので入れない。
 */
function buildShiftJisTable(): ReverseTable {
  const table: ReverseTable = new Map();
  const d = decoder('shift_jis', true);
  const leads = [...range(0x81, 0x9f), ...range(0xe0, 0xfc)];
  const trails = [...range(0x40, 0x7e), ...range(0x80, 0xfc)];
  for (const lead of leads) {
    for (const trail of trails) {
      const pointer = (lead - (lead < 0xa0 ? 0x81 : 0xc1)) * 188 + (trail - (trail < 0x7f ? 0x40 : 0x41));
      if (pointer >= 8272 && pointer <= 8835) continue;
      let ch: string;
      try {
        ch = d.decode(Uint8Array.of(lead, trail));
      } catch {
        continue;
      }
      const cp = ch.codePointAt(0)!;
      if (cp >= 0xe000 && cp <= 0xf8ff) continue;
      if (!table.has(ch)) table.set(ch, [lead, trail]);
    }
  }
  // 1バイト：半角カナ
  for (let cp = 0xff61; cp <= 0xff9f; cp++) table.set(String.fromCodePoint(cp), [cp - 0xff61 + 0xa1]);
  // encoder の特別扱い
  table.set('¥', [0x5c]);
  table.set('‾', [0x7e]);
  table.set('\u0080', [0x80]);
  return table;
}

/**
 * EUC-JP の逆引き表（WHATWG の EUC-JP encoder と同じ：JIS X 0208 の最初の pointer・半角カナは 0x8E）
 */
function buildEucJpTable(): ReverseTable {
  const table: ReverseTable = new Map();
  const d = decoder('euc-jp', true);
  for (let lead = 0xa1; lead <= 0xfe; lead++) {
    for (let trail = 0xa1; trail <= 0xfe; trail++) {
      let ch: string;
      try {
        ch = d.decode(Uint8Array.of(lead, trail));
      } catch {
        continue;
      }
      if (!table.has(ch)) table.set(ch, [lead, trail]);
    }
  }
  for (let cp = 0xff61; cp <= 0xff9f; cp++) table.set(String.fromCodePoint(cp), [0x8e, cp - 0xff61 + 0xa1]);
  table.set('¥', [0x5c]);
  table.set('‾', [0x7e]);
  return table;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** 逆引き表（初めて使うときに作る）。作る時間はテスト環境で 100ms 以内を確かめる */
export function reverseTable(charset: Exclude<EncodeCharset, 'utf-8'>): ReverseTable {
  let t = reverseTables.get(charset);
  if (!t) {
    t = charset === 'shift_jis' ? buildShiftJisTable() : buildEucJpTable();
    reverseTables.set(charset, t);
  }
  return t;
}

const utf8Encoder = new TextEncoder();

/** 1文字（コードポイント）をバイト列に。その文字コードに無ければ null */
function encodeChar(ch: string, charset: EncodeCharset): number[] | null {
  const cp = ch.codePointAt(0)!;
  if (cp < 0x80) return [cp];
  if (charset === 'utf-8') {
    if (cp >= 0xd800 && cp <= 0xdfff) return null; // 対になっていないサロゲート
    return Array.from(utf8Encoder.encode(ch));
  }
  const table = reverseTable(charset);
  // encoder の特別扱い：U+2212 −（MINUS SIGN）は U+FF0D －（全角ハイフンマイナス）と同じに扱う
  const key = cp === 0x2212 ? '－' : ch;
  return table.get(key) ?? null;
}

const hex2 = (b: number) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`;

export interface EncodeOptions {
  charset?: EncodeCharset;
  scope?: EncodeScope;
  space?: SpaceMode;
}

/** 1行をエンコードする。その文字コードに無い文字は変換せずに印を付ける */
export function encodeLine(line: string, opts: EncodeOptions = {}): LineResult {
  const charset = opts.charset ?? 'utf-8';
  const scope = opts.scope ?? 'component';
  const space = opts.space ?? '%20';
  const segments: Segment[] = [];
  const problems: Problem[] = [];
  let n = 0;
  for (const { segment } of graphemes(line)) {
    n += 1;
    let out = '';
    let missing = false;
    for (const ch of segment) {
      if (ch === ' ') {
        out += space === '+' ? '+' : '%20';
        continue;
      }
      if (ch === '+' && space === '+') {
        out += '%2B';
        continue;
      }
      if (KEEP_COMPONENT.test(ch) || (scope === 'whole' && KEEP_WHOLE.test(ch))) {
        out += ch;
        continue;
      }
      const bytes = encodeChar(ch, charset);
      if (!bytes) {
        missing = true;
        break;
      }
      // 2バイト目が ASCII の範囲に入ったとき（吉＝0x8B 0x67）は、ブラウザのフォーム送信と同じく
      // 残す文字ならそのまま書く（%8Bg）
      out += bytes
        .map((b) => {
          const c = String.fromCharCode(b);
          return b < 0x80 && (KEEP_COMPONENT.test(c) || (scope === 'whole' && KEEP_WHOLE.test(c))) ? c : hex2(b);
        })
        .join('');
    }
    if (missing) {
      pushText(segments, segment, 'unencodable');
      problems.push({
        kind: 'unencodable',
        at: n,
        raw: segment,
        message: `${n}文字目の「${segment}」は${CHARSET_LABELS[charset]}に無い文字です（変換せずに残しました）`,
      });
    } else pushText(segments, out);
  }
  return { segments, text: segments.map((s) => s.text).join(''), problems };
}

export function encodeText(input: string, opts: EncodeOptions = {}): LineResult[] {
  return splitLines(input).map((line) => encodeLine(line, opts));
}

// ---------------------------------------------------------------------------
// Punycode（RFC 3492）
// ---------------------------------------------------------------------------

const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  let d = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > ((BASE - TMIN) * TMAX) >> 1) {
    d = Math.floor(d / (BASE - TMIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - TMIN + 1) * d) / (d + SKEW));
}

function digitOf(c: number): number {
  if (c >= 0x30 && c <= 0x39) return c - 22; // 0-9 → 26-35
  if (c >= 0x41 && c <= 0x5a) return c - 0x41; // A-Z
  if (c >= 0x61 && c <= 0x7a) return c - 0x61; // a-z
  return BASE;
}

function digitChar(d: number): string {
  return String.fromCharCode(d + 22 + 75 * (d < 26 ? 1 : 0));
}

/** Punycode の文字列（`xn--` を除いた部分）を Unicode に。読めなければ null */
export function punycodeDecode(input: string): string | null {
  const output: number[] = [];
  const basicEnd = input.lastIndexOf('-');
  for (let j = 0; j < Math.max(basicEnd, 0); j++) {
    const c = input.charCodeAt(j);
    if (c >= 0x80) return null;
    output.push(c);
  }
  let n = INITIAL_N;
  let bias = INITIAL_BIAS;
  let i = 0;
  for (let idx = basicEnd > 0 ? basicEnd + 1 : 0; idx < input.length;) {
    const oldi = i;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (idx >= input.length) return null;
      const digit = digitOf(input.charCodeAt(idx++));
      if (digit >= BASE) return null;
      i += digit * w;
      if (i > 0x7fffffff) return null;
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
      if (digit < t) break;
      w *= BASE - t;
    }
    const len = output.length + 1;
    bias = adapt(i - oldi, len, oldi === 0);
    n += Math.floor(i / len);
    i %= len;
    if (n > 0x10ffff) return null;
    output.splice(i, 0, n);
    i += 1;
  }
  return String.fromCodePoint(...output);
}

/** Unicode を Punycode に（`xn--` は付けない） */
export function punycodeEncode(input: string): string {
  const cps = Array.from(input, (c) => c.codePointAt(0)!);
  let out = cps.filter((c) => c < 0x80).map((c) => String.fromCharCode(c)).join('');
  const b = out.length;
  let h = b;
  if (b > 0) out += '-';
  let n = INITIAL_N;
  let delta = 0;
  let bias = INITIAL_BIAS;
  while (h < cps.length) {
    const m = Math.min(...cps.filter((c) => c >= n));
    delta += (m - n) * (h + 1);
    n = m;
    for (const c of cps) {
      if (c < n) delta += 1;
      if (c === n) {
        let q = delta;
        for (let k = BASE; ; k += BASE) {
          const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
          if (q < t) break;
          out += digitChar(t + ((q - t) % (BASE - t)));
          q = Math.floor((q - t) / (BASE - t));
        }
        out += digitChar(q);
        bias = adapt(delta, h + 1, h === b);
        delta = 0;
        h += 1;
      }
    }
    delta += 1;
    n += 1;
  }
  return out;
}

/** ホストを日本語に戻す（`xn--` のラベルだけを Punycode のデコード） */
export function hostToUnicode(host: string): string {
  return host
    .split('.')
    .map((label) => {
      if (!/^xn--/i.test(label)) return label;
      return punycodeDecode(label.slice(4).toLowerCase()) ?? label;
    })
    .join('.');
}

/** ホストを `xn--` に（ラベルごとに。ASCII だけのラベルは小文字にするだけ） */
export function hostToAscii(host: string): string {
  return host
    .split('.')
    .map((label) => (NON_ASCII_RE.test(label) ? `xn--${punycodeEncode(label.normalize('NFC').toLowerCase())}` : label.toLowerCase()))
    .join('.');
}

// ---------------------------------------------------------------------------
// 見た目の似た文字（1つのラベルに複数の文字体系）
// ---------------------------------------------------------------------------

/**
 * 判定する文字体系と、画面での呼び名。`\p{Script_Extensions=…}` で判定する
 * （`ー` は Script=Common だが Script_Extensions ではひらがな・カタカナなので、
 * 「カタカナ＋Common」でぶれない）。ここに無い文字（数字・`-`・結合文字など）は数えない。
 */
const SCRIPTS: readonly { group: string; name: string; re: RegExp }[] = [
  { group: 'Latin', name: 'ラテン文字', re: /\p{Script_Extensions=Latin}/u },
  { group: 'Cyrillic', name: 'キリル文字', re: /\p{Script_Extensions=Cyrillic}/u },
  { group: 'Greek', name: 'ギリシャ文字', re: /\p{Script_Extensions=Greek}/u },
  { group: 'Japanese', name: '漢字・かな', re: /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}]/u },
  { group: 'Hangul', name: 'ハングル', re: /\p{Script_Extensions=Hangul}/u },
  { group: 'Armenian', name: 'アルメニア文字', re: /\p{Script_Extensions=Armenian}/u },
  { group: 'Georgian', name: 'ジョージア文字', re: /\p{Script_Extensions=Georgian}/u },
  { group: 'Arabic', name: 'アラビア文字', re: /\p{Script_Extensions=Arabic}/u },
  { group: 'Hebrew', name: 'ヘブライ文字', re: /\p{Script_Extensions=Hebrew}/u },
  { group: 'Thai', name: 'タイ文字', re: /\p{Script_Extensions=Thai}/u },
];
/** 混ざっていても普通にある組み合わせ（日本語＋ラテン文字＝`日本-shop.jp`、韓国語の漢字混じり） */
const ALLOWED_TOGETHER = new Set(['Latin', 'Japanese', 'Hangul']);

export interface HomographWarning {
  /** 注意の出たラベル（日本語に戻した形） */
  label: string;
  /** 見た目の似た別の文字（キリル文字の а など） */
  suspects: { char: string; scriptName: string }[];
  message: string;
}

function scriptsOf(ch: string) {
  return SCRIPTS.filter((s) => s.re.test(ch));
}

/** 1つのラベルに別の文字体系が混ざっていないか。混ざっていれば注意を返す */
export function checkLabel(label: string): HomographWarning | null {
  const byGroup = new Map<string, { name: string; chars: string[] }>();
  for (const { segment } of graphemes(label)) {
    const first = String.fromCodePoint(segment.codePointAt(0)!);
    for (const s of scriptsOf(first)) {
      const g = byGroup.get(s.group) ?? { name: s.name, chars: [] };
      g.chars.push(segment);
      byGroup.set(s.group, g);
    }
  }
  const groups = [...byGroup.keys()];
  if (groups.length < 2) return null;
  if (groups.every((g) => ALLOWED_TOGETHER.has(g))) return null;
  // 疑わしいのは、多いほうの文字体系に紛れた少ないほう。ラテン文字があれば、ラテン文字・日本語以外
  const sorted = [...byGroup.entries()].sort((a, b) => b[1].chars.length - a[1].chars.length);
  const main = byGroup.has('Latin') ? 'Latin' : sorted[0][0];
  const suspects: HomographWarning['suspects'] = [];
  for (const [group, { name, chars }] of byGroup) {
    if (group === main || (main === 'Latin' && ALLOWED_TOGETHER.has(group))) continue;
    for (const char of chars) if (!suspects.some((x) => x.char === char)) suspects.push({ char, scriptName: name });
  }
  const list = suspects.map((s) => `${s.scriptName}の ${s.char}`).join('・');
  return {
    label,
    suspects,
    message: `このドメインには見た目の似た別の文字（${list}）が混ざっています。本物のサイトではない可能性があります`,
  };
}

export function checkHost(hostUnicode: string): HomographWarning[] {
  return hostUnicode
    .split('.')
    .map(checkLabel)
    .filter((w): w is HomographWarning => w !== null);
}

/** 注意が出ないときも出す1行（whole-script confusable は拾えないため） */
export const NO_WARNING_IS_NOT_SAFE = '注意が出ないことは、本物のサイトである保証ではありません';

// ---------------------------------------------------------------------------
// 追跡用パラメータ
// ---------------------------------------------------------------------------

/**
 * 共有用の URL から外す追跡用パラメータ。【データ更新箇所】増やすときは PR で足す
 * （ネットから一覧を取ってこない）。
 *
 * **ページを動かすのに要るパラメータ（`id` `q` `page` `v` など）は入れない。**
 * 迷うもの（`ref` `source` など、サイトによっては中身に効くもの）も入れない。
 */
export const TRACKING_PARAMS: readonly { key: string; reason: string }[] = [
  { key: 'gclid', reason: 'Google 広告のクリック ID' },
  { key: 'gbraid', reason: 'Google 広告のクリック ID（iOS のアプリ経由）' },
  { key: 'wbraid', reason: 'Google 広告のクリック ID（iOS のウェブ経由）' },
  { key: 'dclid', reason: 'Google のディスプレイ広告（キャンペーンマネージャー）のクリック ID' },
  { key: 'fbclid', reason: 'Facebook・Instagram のクリック ID' },
  { key: 'msclkid', reason: 'Microsoft 広告（Bing）のクリック ID' },
  { key: 'yclid', reason: 'Yahoo!広告・Yandex 広告のクリック ID' },
  { key: 'twclid', reason: 'X（旧 Twitter）広告のクリック ID' },
  { key: 'ttclid', reason: 'TikTok 広告のクリック ID' },
  { key: 'li_fat_id', reason: 'LinkedIn 広告のクリック ID' },
  { key: 'igshid', reason: 'Instagram の共有元 ID' },
  { key: 'mc_cid', reason: 'Mailchimp のメール配信のキャンペーン ID' },
  { key: 'mc_eid', reason: 'Mailchimp のメール配信の受信者 ID' },
  { key: '_ga', reason: 'Google アナリティクスのサイトをまたぐ計測' },
  { key: '_gl', reason: 'Google アナリティクス・広告のサイトをまたぐ計測' },
];

/** 外すキーなら理由。`utm_` で始まるもの（大文字小文字を問わない）と上の一覧 */
export function trackingReason(key: string): string | null {
  const k = key.toLowerCase();
  if (k.startsWith('utm_')) return 'Google アナリティクスなどの流入元の印（utm_）';
  return TRACKING_PARAMS.find((p) => p.key === k)?.reason ?? null;
}

// ---------------------------------------------------------------------------
// URL の分解
// ---------------------------------------------------------------------------

export interface QueryParam {
  /** 元の文字（`%XX` のまま）。共有用 URL を組み立てるのに使う */
  raw: string;
  key: string;
  value: string;
  /** 値が無い（`?flag` のように `=` が無い） */
  noValue: boolean;
  /** 追跡用なら理由 */
  tracking: string | null;
}

export interface UrlParts {
  /** `https:` のように末尾の `:` まで */
  scheme: string;
  /** スキームが無かったので `https://` を補って読んだ */
  assumedScheme: boolean;
  /** `javascript:` `data:` `vbscript:`（開くとプログラムが動く） */
  dangerous: boolean;
  /** 日本語に戻したホスト（無ければ空） */
  hostUnicode: string;
  /** `xn--` のホスト */
  hostAscii: string;
  port: string;
  userinfo: boolean;
  /** `/` ごとにデコードしたパス（`+` は残す） */
  pathSegments: string[];
  query: QueryParam[];
  /** デコードしたフラグメント（`#` を除く） */
  fragment: string | null;
  /** `#:~:text=` でハイライトする文字（デコード済み） */
  textFragments: string[];
  homograph: HomographWarning[];
}

const DANGEROUS_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:']);
const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*:)/;
/** スキームの無い URL：先頭がドット入りのラベル（ドメインらしい形）で、空白を含まない */
const BARE_HOST_RE = /^[^\s/?#:@]+\.[^\s/?#:@.]+(?::\d+)?(?:[/?#]|$)/;

/** URL の分解に使う。スキームの無いものは `https://` を補う（変換結果には足さない） */
export function looksLikeUrl(line: string): { text: string; assumed: boolean } | null {
  const t = line.trim();
  if (!t || /\s/.test(t)) return null;
  if (SCHEME_RE.test(t)) {
    // `localhost:3000` のような「ホスト:ポート」はスキームではない
    if (/^[^:]+:\d+(?:[/?#]|$)/.test(t)) return { text: `https://${t}`, assumed: true };
    return { text: t, assumed: false };
  }
  if (BARE_HOST_RE.test(t)) return { text: `https://${t}`, assumed: true };
  return null;
}

/** 部品を1つデコードする（共通の文字コードで。壊れた `%` は元のまま） */
function decodePart(text: string, charset: Charset, plusAsSpace: boolean): string {
  return decodeLine(text, charset, plusAsSpace ? 'space' : 'keep').text;
}

/**
 * URL を分解する。読めなければ null。`new URL()` は「URL として読めるか」と `xn--` への変換にだけ使い、
 * 部品の切り出しは貼った文字から行う（`new URL()` はクエリの日本語を UTF-8 で % にしてしまい、
 * Shift_JIS の URL が読めなくなるため）。
 */
export function parseUrl(line: string, charset: Charset = 'utf-8'): UrlParts | null {
  const target = looksLikeUrl(line);
  if (!target) return null;
  let url: URL;
  try {
    url = new URL(target.text);
  } catch {
    return null;
  }
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*:)(\/\/[^/?#]*)?([^?#]*)(\?[^#]*)?(#.*)?$/s.exec(target.text);
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  const dangerous = DANGEROUS_SCHEMES.has(scheme);
  const authority = m[2]?.slice(2) ?? '';
  const userinfo = authority.includes('@');
  const hostPort = authority.slice(authority.lastIndexOf('@') + 1);
  const portMatch = /:(\d*)$/.exec(hostPort);
  const rawHost = portMatch && !hostPort.startsWith('[') ? hostPort.slice(0, portMatch.index) : hostPort;
  const hostDecoded = decodePart(rawHost, 'utf-8', false);
  const hostUnicode = hostToUnicode(hostDecoded).toLowerCase();
  const hostAscii = url.hostname;

  const path = m[3] ?? '';
  const pathSegments = dangerous || !m[2] ? (path ? [decodePart(path, charset, false)] : []) : path.split('/').slice(1).map((s) => decodePart(s, charset, false));

  const queryRaw = m[4]?.slice(1) ?? '';
  const query: QueryParam[] = queryRaw
    ? queryRaw
        .split('&')
        .filter((p) => p !== '')
        .map((raw) => {
          const eq = raw.indexOf('=');
          const key = decodePart(eq < 0 ? raw : raw.slice(0, eq), charset, true);
          const value = eq < 0 ? '' : decodePart(raw.slice(eq + 1), charset, true);
          return { raw, key, value, noValue: eq < 0, tracking: trackingReason(key) };
        })
    : [];

  const fragmentRaw = m[5]?.slice(1) ?? null;
  const textFragments: string[] = [];
  if (fragmentRaw !== null) {
    const directive = fragmentRaw.indexOf(':~:');
    if (directive >= 0) {
      for (const part of fragmentRaw.slice(directive + 3).split('&')) {
        if (part.startsWith('text=')) textFragments.push(decodePart(part.slice(5), 'utf-8', false));
      }
    }
  }

  return {
    scheme,
    assumedScheme: target.assumed,
    dangerous,
    hostUnicode,
    hostAscii,
    port: portMatch?.[1] ?? '',
    userinfo,
    pathSegments,
    query,
    fragment: fragmentRaw === null ? null : decodePart(fragmentRaw, charset, false),
    textFragments,
    homograph: hostUnicode ? checkHost(hostUnicode) : [],
  };
}

/**
 * 共有用のきれいな URL。追跡用パラメータを外す（`keep` に入れたキーは残す）。
 * **貼った形のまま**返す：`https://` を補わない・残すパラメータの書き方と順序を変えない・フラグメントは残す。
 */
export function cleanUrl(line: string, keep: ReadonlySet<string> = new Set()): { url: string; removed: string[] } {
  const t = line.trim();
  const m = /^([^?#]*)(\?[^#]*)?(#.*)?$/s.exec(t);
  if (!m || !m[2]) return { url: t, removed: [] };
  const removed: string[] = [];
  const kept = m[2]
    .slice(1)
    .split('&')
    .filter((raw) => {
      if (raw === '') return false;
      const eq = raw.indexOf('=');
      const key = decodePart(eq < 0 ? raw : raw.slice(0, eq), 'utf-8', true);
      if (trackingReason(key) && !keep.has(key)) {
        removed.push(key);
        return false;
      }
      return true;
    });
  return { url: `${m[1]}${kept.length ? `?${kept.join('&')}` : ''}${m[3] ?? ''}`, removed };
}
