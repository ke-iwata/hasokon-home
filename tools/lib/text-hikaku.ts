/**
 * テキスト比較（差分チェック）のロジック（純関数のみ。DOM/React に依存しない）
 *
 * 仕様: docs/features/text-hikaku.md
 *
 * 流れ:
 * 1. 改行コード（CRLF／LF／CR）を吸収して行に分ける
 * 2. 無視のスイッチに合わせて行を正規化する。正規化した書記素 1 つごとに
 *    「元の行の [start, end)（UTF-16 の位置）」を持つ（位置の対応表）。色付けは元の文字に戻して描く
 * 3. 行の対応を Myers の O(ND) 差分で取る（線形空間の中央 snake 方式。D が 5,000 を超えたら打ち切る）
 * 4. 削除と追加が隣り合う区間は、一致率（Dice 係数）40% 以上の行どうしを対にして「変更」とし、
 *    対の中を書記素単位で再び Myers で比べる
 *
 * 外部ライブラリは使わない（依存を増やさない。docs/features/dependency-vulnerability-audit.md）。
 */

import { convertWidth } from './hankaku-zenkaku';
import { invisibleChar, type InvisibleChar } from './invisible-chars';

// ---------------------------------------------------------------------------
// 上限・定数（仕様「比較の約束」5）
// ---------------------------------------------------------------------------

/** 片側の文字数の上限（コードポイントで数える） */
export const MAX_CHARS = 200_000;
/** 片側の行数の上限 */
export const MAX_LINES = 10_000;
/** 行の編集距離 D の打ち切り */
export const MAX_LINE_D = 5_000;
/** 文字単位で比べる 1 対の書記素数の上限（片側） */
export const MAX_PAIR_GRAPHEMES = 2_000;
/** 文字単位の比較の編集距離 D の上限 */
export const MAX_CHAR_D = 500;
/** 削除と追加を「変更」の対にする一致率の下限（Dice 係数） */
export const PAIR_THRESHOLD = 0.4;
/** 対を探すとき、相手を何行先まで見るか */
const PAIR_LOOKAHEAD = 3;

/** 両方の欄の合計がこの文字数以下なら、入力が止まってから自動で比べる */
export const AUTO_COMPARE_MAX_CHARS = 20_000;
/** 自動で比べるまでの待ち時間 */
export const DEBOUNCE_MS = 300;
/** これを超えたら「比べています…」と中止ボタンを出す */
export const SLOW_NOTICE_MS = 2_000;
/** 「変わった行だけ表示」で残す前後の行数 */
export const COLLAPSE_CONTEXT = 2;
/** unified 形式の前後の行数（diff -u と同じ） */
export const UNIFIED_CONTEXT = 3;

// ---------------------------------------------------------------------------
// 無視のスイッチ
// ---------------------------------------------------------------------------

export interface IgnoreOptions {
  /** 行頭・行末の空白を削り、連続する空白を 1 つとみなす */
  whitespace: boolean;
  /** 全角・半角を区別しない（hankaku-zenkaku の対応表で半角にそろえる） */
  width: boolean;
  /** 大文字・小文字を区別しない（A-Z だけ） */
  case: boolean;
  /** 空白だけの行を比べる前に除く */
  blankLines: boolean;
}

export const NO_IGNORE: IgnoreOptions = { whitespace: false, width: false, case: false, blankLines: false };

export const IGNORE_LABELS: Record<keyof IgnoreOptions, string> = {
  whitespace: '空白の違い',
  width: '全角・半角',
  case: '大文字・小文字',
  blankLines: '空行',
};

const IGNORE_KEYS = Object.keys(IGNORE_LABELS) as (keyof IgnoreOptions)[];

/** 入っている無視のスイッチの名前（「空白の違い・全角・半角を無視すると同じです」用） */
export function activeIgnoreLabels(opts: IgnoreOptions): string[] {
  return IGNORE_KEYS.filter((k) => opts[k]).map((k) => IGNORE_LABELS[k]);
}

// ---------------------------------------------------------------------------
// 書記素
// ---------------------------------------------------------------------------

export interface Grapheme {
  g: string;
  /** 元の文字列の中の [start, end)（UTF-16 の位置） */
  start: number;
  end: number;
}

const segmenter: Intl.Segmenter | undefined =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('ja', { granularity: 'grapheme' }) : undefined;

/**
 * 書記素に分ける（Intl.Segmenter の grapheme）。絵文字・結合文字・異体字セレクタを途中で割らない。
 * Segmenter の無い環境ではコードポイント単位にする
 */
export function splitGraphemes(text: string): Grapheme[] {
  const out: Grapheme[] = [];
  if (segmenter) {
    for (const s of segmenter.segment(text)) {
      out.push({ g: s.segment, start: s.index, end: s.index + s.segment.length });
    }
    return out;
  }
  let i = 0;
  for (const ch of text) {
    out.push({ g: ch, start: i, end: i + ch.length });
    i += ch.length;
  }
  return out;
}

/** コードポイントで数えた文字数 */
export function countCodePoints(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    // 上位サロゲートの次の下位サロゲートは数えない
    if (c >= 0xdc00 && c <= 0xdfff && i > 0) {
      const p = text.charCodeAt(i - 1);
      if (p >= 0xd800 && p <= 0xdbff) continue;
    }
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// 行と改行コード
// ---------------------------------------------------------------------------

export type EolKind = 'CRLF' | 'LF' | 'CR';

export interface SplitText {
  lines: string[];
  /** 使われている改行コード。混ざっていれば 'mixed'、改行が無ければ null */
  eol: EolKind | 'mixed' | null;
  /** 最後の行のあとに改行があるか */
  endsWithNewline: boolean;
}

/** 改行コードを吸収して行に分ける。空の文字列は 0 行 */
export function splitLines(text: string): SplitText {
  if (text === '') return { lines: [], eol: null, endsWithNewline: false };
  const kinds = new Set<EolKind>();
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\r') {
      lines.push(text.slice(start, i));
      if (text[i + 1] === '\n') {
        kinds.add('CRLF');
        i++;
      } else {
        kinds.add('CR');
      }
      start = i + 1;
    } else if (c === '\n') {
      lines.push(text.slice(start, i));
      kinds.add('LF');
      start = i + 1;
    }
  }
  const endsWithNewline = start === text.length;
  if (!endsWithNewline) lines.push(text.slice(start));
  const eol = kinds.size === 0 ? null : kinds.size > 1 ? 'mixed' : [...kinds][0];
  return { lines, eol, endsWithNewline };
}

// ---------------------------------------------------------------------------
// 正規化と位置の対応表
// ---------------------------------------------------------------------------

/** 正規化した書記素 1 つと、それに対応する元の行の範囲 */
export interface Unit {
  g: string;
  start: number;
  end: number;
}

const WS = new Set([' ', '\t', '　', ' ']);
const isBlank = (line: string) => /^[ \t　 ]*$/.test(line);

/**
 * 1 行を正規化する。順は 空白 → 全角・半角 → 大文字・小文字（仕様「無視のスイッチ」）。
 *
 * 文字数が変わる正規化では、まとめた側の 1 つに元の範囲全体を対応させる。
 * 削った行頭・行末の空白は、直後（行頭）・直前（行末）の書記素の範囲に含める
 */
export function normalizeLine(line: string, opts: IgnoreOptions): Unit[] {
  let units: Unit[] = splitGraphemes(line).map((g) => ({ g: g.g, start: g.start, end: g.end }));

  if (opts.whitespace) {
    const out: Unit[] = [];
    const ws: boolean[] = [];
    for (const u of units) {
      if (WS.has(u.g)) {
        if (ws[ws.length - 1]) {
          out[out.length - 1].end = u.end;
        } else {
          out.push({ g: ' ', start: u.start, end: u.end });
          ws.push(true);
        }
      } else {
        out.push(u);
        ws.push(false);
      }
    }
    if (ws[0]) {
      const lead = out.shift()!;
      ws.shift();
      if (out.length > 0) out[0].start = lead.start;
    }
    if (ws[ws.length - 1]) {
      const tail = out.pop()!;
      ws.pop();
      if (out.length > 0) out[out.length - 1].end = tail.end;
    }
    units = out;
  }

  if (opts.width) {
    const out: Unit[] = [];
    for (const u of units) {
      const g = convertWidth(u.g, 'toHalf');
      // 「ｶ」「ﾞ」が別の書記素に割れていても、「ガ」（→ ｶﾞ）と 1 つで対応させる
      if ((g === 'ﾞ' || g === 'ﾟ') && out.length > 0) {
        const prev = out[out.length - 1];
        prev.g += g;
        prev.end = u.end;
        continue;
      }
      out.push({ g, start: u.start, end: u.end });
    }
    units = out;
  }

  if (opts.case) {
    // toLowerCase() は使わない（ギリシャ文字・キリル文字・全角英字まで小文字にしてしまう）
    units = units.map((u) => ({ ...u, g: u.g.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32)) }));
  }

  return units;
}

// ---------------------------------------------------------------------------
// Myers の O(ND) 差分
// ---------------------------------------------------------------------------

/** 0 = 同じ、1 = 削除（左だけ）、2 = 追加（右だけ） */
export type Op = 0 | 1 | 2;

type Seq = ArrayLike<number>;

/**
 * 編集距離 D（削除と追加の数の和の最小）を返す。maxD を超えたら -1。
 * 記録は O(N+M)（経路は残さない）、時間は O((N+M)·D)
 */
export function editDistance(a: Seq, b: Seq, maxD: number): number {
  let a0 = 0;
  let b0 = 0;
  let a1 = a.length;
  let b1 = b.length;
  while (a0 < a1 && b0 < b1 && a[a0] === b[b0]) {
    a0++;
    b0++;
  }
  while (a1 > a0 && b1 > b0 && a[a1 - 1] === b[b1 - 1]) {
    a1--;
    b1--;
  }
  const n = a1 - a0;
  const m = b1 - b0;
  if (n === 0 || m === 0) return n + m <= maxD ? n + m : -1;
  const max = Math.min(maxD, n + m);
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  for (let d = 0; d <= max; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[a0 + x] === b[b0 + y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) return d;
    }
  }
  return -1;
}

/**
 * 最短の編集の手順を返す（線形空間：中央の snake で区間を 2 つに割って再帰する）。
 * 先に editDistance で D の上限を確かめてから呼ぶこと
 */
export function diffSequences(a: Seq, b: Seq): Op[] {
  const out: Op[] = [];
  diffRange(a, b, 0, a.length, 0, b.length, out);
  return out;
}

function diffRange(a: Seq, b: Seq, a0: number, a1: number, b0: number, b1: number, out: Op[]): void {
  while (a0 < a1 && b0 < b1 && a[a0] === b[b0]) {
    out.push(0);
    a0++;
    b0++;
  }
  let suffix = 0;
  while (a1 > a0 && b1 > b0 && a[a1 - 1] === b[b1 - 1]) {
    a1--;
    b1--;
    suffix++;
  }
  if (a0 === a1) {
    for (let j = b0; j < b1; j++) out.push(2);
  } else if (b0 === b1) {
    for (let i = a0; i < a1; i++) out.push(1);
  } else {
    const split = bisect(a, b, a0, a1, b0, b1);
    if (!split || (split[0] === a0 && split[1] === b0) || (split[0] === a1 && split[1] === b1)) {
      // 起きないはずだが、無限に再帰しないよう全部を削除＋追加にする
      for (let i = a0; i < a1; i++) out.push(1);
      for (let j = b0; j < b1; j++) out.push(2);
    } else {
      diffRange(a, b, a0, split[0], b0, split[1], out);
      diffRange(a, b, split[0], a1, split[1], b1, out);
    }
  }
  for (let i = 0; i < suffix; i++) out.push(0);
}

/** 前後から同時に伸ばし、重なった点（最短経路の上の 1 点）を返す */
function bisect(a: Seq, b: Seq, a0: number, a1: number, b0: number, b1: number): [number, number] | null {
  const n = a1 - a0;
  const m = b1 - b0;
  const maxD = Math.ceil((n + m) / 2);
  const off = maxD;
  const len = 2 * maxD + 2;
  const v1 = new Int32Array(len).fill(-1);
  const v2 = new Int32Array(len).fill(-1);
  v1[off + 1] = 0;
  v2[off + 1] = 0;
  const delta = n - m;
  const front = delta % 2 !== 0;
  let k1start = 0;
  let k1end = 0;
  let k2start = 0;
  let k2end = 0;
  for (let d = 0; d < maxD; d++) {
    for (let k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
      const k1o = off + k1;
      let x1 = k1 === -d || (k1 !== d && v1[k1o - 1] < v1[k1o + 1]) ? v1[k1o + 1] : v1[k1o - 1] + 1;
      let y1 = x1 - k1;
      while (x1 < n && y1 < m && a[a0 + x1] === b[b0 + y1]) {
        x1++;
        y1++;
      }
      v1[k1o] = x1;
      if (x1 > n) k1end += 2;
      else if (y1 > m) k1start += 2;
      else if (front) {
        const k2o = off + delta - k1;
        if (k2o >= 0 && k2o < len && v2[k2o] !== -1) {
          const x2 = n - v2[k2o];
          if (x1 >= x2) return [a0 + x1, b0 + y1];
        }
      }
    }
    for (let k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
      const k2o = off + k2;
      let x2 = k2 === -d || (k2 !== d && v2[k2o - 1] < v2[k2o + 1]) ? v2[k2o + 1] : v2[k2o - 1] + 1;
      let y2 = x2 - k2;
      while (x2 < n && y2 < m && a[a1 - x2 - 1] === b[b1 - y2 - 1]) {
        x2++;
        y2++;
      }
      v2[k2o] = x2;
      if (x2 > n) k2end += 2;
      else if (y2 > m) k2start += 2;
      else if (!front) {
        const k1o = off + delta - k2;
        if (k1o >= 0 && k1o < len && v1[k1o] !== -1) {
          const x1 = v1[k1o];
          const y1 = off + x1 - k1o;
          if (x1 >= n - x2) return [a0 + x1, b0 + y1];
        }
      }
    }
  }
  return null;
}

/** 文字列の配列を、比較用の整数の配列に直す（同じ文字列は同じ番号） */
function intern(lists: string[][]): Int32Array[] {
  const ids = new Map<string, number>();
  return lists.map((list) => {
    const arr = new Int32Array(list.length);
    for (let i = 0; i < list.length; i++) {
      let id = ids.get(list[i]);
      if (id === undefined) {
        id = ids.size;
        ids.set(list[i], id);
      }
      arr[i] = id;
    }
    return arr;
  });
}

// ---------------------------------------------------------------------------
// 結果の形
// ---------------------------------------------------------------------------

/** 1 行の中の色付けの一片。changed なら濃く塗る。invisible なら印を出す */
export interface Segment {
  text: string;
  changed: boolean;
  invisible?: InvisibleChar;
}

export interface LineRef {
  /** 1 から数えた元の行番号 */
  no: number;
  text: string;
}

export type Row =
  | { kind: 'equal'; left: LineRef; right: LineRef }
  | { kind: 'change'; left: LineRef; right: LineRef; leftSegs: Segment[]; rightSegs: Segment[]; charLevel: boolean }
  | { kind: 'delete'; left: LineRef; segs: Segment[] }
  | { kind: 'insert'; right: LineRef; segs: Segment[] }
  /** 「空行を無視」で比べずに除いた行（灰色で見せるだけ） */
  | { kind: 'skipped'; left?: LineRef; right?: LineRef };

export interface Summary {
  added: number;
  deleted: number;
  changed: number;
  /** 改行を除いた書記素の数 */
  leftChars: number;
  rightChars: number;
  /** 違いが 1 つも無い（無視のスイッチを効かせたうえで） */
  identical: boolean;
  /** 無視のスイッチが無くても、行の中身がまったく同じ */
  identicalRaw: boolean;
  /** 改行コードの違い（両方に改行があって種類が違うときだけ） */
  eolDiffers: { left: EolKind | 'mixed'; right: EolKind | 'mixed' } | null;
  /** 最後の行に改行が無いのが片方だけのとき、その側 */
  missingFinalNewline: 'left' | 'right' | null;
  /** 違いに含まれていた見えない文字（重複なし） */
  invisibles: InvisibleChar[];
}

export type CompareResult =
  | { status: 'too-long'; side: 'left' | 'right'; chars: number; lines: number }
  | { status: 'too-many-diffs' }
  | { status: 'ok'; rows: Row[]; hunks: number[]; summary: Summary };

// ---------------------------------------------------------------------------
// 比べる
// ---------------------------------------------------------------------------

interface PreparedLine {
  ref: LineRef;
  units: Unit[];
  key: string;
}

/** 2 行を対にできるか。できるなら、文字単位の手順（省いたときは undefined） */
export function pairLines(left: Unit[], right: Unit[]): { pair: false } | { pair: true; ops?: Op[] } {
  const a = left.length;
  const b = right.length;
  if (a === 0 && b === 0) return { pair: true, ops: [] };
  // 長すぎる行は文字単位を省いて、行全体を変更として塗る
  if (a > MAX_PAIR_GRAPHEMES || b > MAX_PAIR_GRAPHEMES) return { pair: true };
  const [x, y] = intern([left.map((u) => u.g), right.map((u) => u.g)]);
  // 一致率 = (a + b − D) / (a + b) ≥ 0.4 ⇔ D ≤ 0.6(a + b)。整数で比べる
  const cap = Math.floor(((a + b) * 3) / 5); // 1 − PAIR_THRESHOLD = 3/5
  const d = editDistance(x, y, cap);
  if (d < 0) return { pair: false };
  if (d > MAX_CHAR_D) return { pair: true };
  return { pair: true, ops: diffSequences(x, y) };
}

/** 一致率（Dice 係数）= 共通部分（LCS）の書記素数 × 2 ÷ 2 行の書記素数の合計。どちらも空なら 1 */
export function similarity(left: string, right: string): number {
  const a = splitGraphemes(left).map((g) => g.g);
  const b = splitGraphemes(right).map((g) => g.g);
  if (a.length + b.length === 0) return 1;
  const [x, y] = intern([a, b]);
  const d = editDistance(x, y, a.length + b.length);
  return (a.length + b.length - d) / (a.length + b.length);
}

/** 塗る一片を、見えない文字ごとに割る（違いの中の見えない文字に印を出すため） */
function markInvisible(segs: Segment[], found: Map<string, InvisibleChar>): Segment[] {
  const out: Segment[] = [];
  for (const seg of segs) {
    if (!seg.changed) {
      out.push(seg);
      continue;
    }
    let buf = '';
    for (const ch of seg.text) {
      const inv = invisibleChar(ch);
      if (inv) {
        if (buf) out.push({ text: buf, changed: true });
        buf = '';
        out.push({ text: ch, changed: true, invisible: inv });
        found.set(inv.char, inv);
      } else {
        buf += ch;
      }
    }
    if (buf) out.push({ text: buf, changed: true });
  }
  return out;
}

/** 正規化した単位の「変わった」印を、元の行の範囲に戻して一片の列にする */
function segmentsFor(text: string, units: Unit[], changed: boolean[]): Segment[] {
  if (units.length === 0) return text ? [{ text, changed: true }] : [];
  const out: Segment[] = [];
  const push = (s: number, e: number, c: boolean) => {
    if (s >= e) return;
    const last = out[out.length - 1];
    if (last && last.changed === c) last.text += text.slice(s, e);
    else out.push({ text: text.slice(s, e), changed: c });
  };
  // 範囲の外（起きないはずだが念のため）は変わっていない扱いで埋める
  push(0, units[0].start, false);
  for (let i = 0; i < units.length; i++) push(units[i].start, units[i].end, changed[i]);
  push(units[units.length - 1].end, text.length, false);
  return out;
}

function changeRow(l: PreparedLine, r: PreparedLine, ops: Op[] | undefined, found: Map<string, InvisibleChar>): Row {
  if (!ops) {
    return {
      kind: 'change',
      left: l.ref,
      right: r.ref,
      leftSegs: markInvisible(l.ref.text ? [{ text: l.ref.text, changed: true }] : [], found),
      rightSegs: markInvisible(r.ref.text ? [{ text: r.ref.text, changed: true }] : [], found),
      charLevel: false,
    };
  }
  const lc = new Array<boolean>(l.units.length).fill(false);
  const rc = new Array<boolean>(r.units.length).fill(false);
  let i = 0;
  let j = 0;
  for (const op of ops) {
    if (op === 0) {
      i++;
      j++;
    } else if (op === 1) {
      lc[i++] = true;
    } else {
      rc[j++] = true;
    }
  }
  return {
    kind: 'change',
    left: l.ref,
    right: r.ref,
    leftSegs: markInvisible(segmentsFor(l.ref.text, l.units, lc), found),
    rightSegs: markInvisible(segmentsFor(r.ref.text, r.units, rc), found),
    charLevel: true,
  };
}

function wholeLine(text: string, found: Map<string, InvisibleChar>): Segment[] {
  return text ? markInvisible([{ text, changed: true }], found) : [];
}

/** 削除と追加が隣り合う区間を、対（変更）・削除・追加の行に並べる */
function pairBlock(dels: PreparedLine[], ins: PreparedLine[], found: Map<string, InvisibleChar>): Row[] {
  const rows: Row[] = [];
  const del = (l: PreparedLine): Row => ({ kind: 'delete', left: l.ref, segs: wholeLine(l.ref.text, found) });
  const add = (r: PreparedLine): Row => ({ kind: 'insert', right: r.ref, segs: wholeLine(r.ref.text, found) });
  let i = 0;
  let j = 0;
  while (i < dels.length && j < ins.length) {
    const p = pairLines(dels[i].units, ins[j].units);
    if (p.pair) {
      rows.push(changeRow(dels[i], ins[j], p.ops, found));
      i++;
      j++;
      continue;
    }
    // 少し先の追加行と対になるなら、その手前の追加行を先に出す（行が挿し込まれた形）
    let matched = false;
    for (let jj = j + 1; jj < Math.min(ins.length, j + 1 + PAIR_LOOKAHEAD); jj++) {
      if (pairLines(dels[i].units, ins[jj].units).pair) {
        while (j < jj) rows.push(add(ins[j++]));
        matched = true;
        break;
      }
    }
    if (matched) continue;
    rows.push(del(dels[i++]));
  }
  while (i < dels.length) rows.push(del(dels[i++]));
  while (j < ins.length) rows.push(add(ins[j++]));
  return rows;
}

function prepare(split: SplitText, opts: IgnoreOptions): { used: PreparedLine[]; skipped: LineRef[]; chars: number } {
  const used: PreparedLine[] = [];
  const skipped: LineRef[] = [];
  let chars = 0;
  split.lines.forEach((text, idx) => {
    const ref = { no: idx + 1, text };
    chars += splitGraphemes(text).length;
    if (opts.blankLines && isBlank(text)) {
      skipped.push(ref);
      return;
    }
    const units = normalizeLine(text, opts);
    used.push({ ref, units, key: units.map((u) => u.g).join('') });
  });
  return { used, skipped, chars };
}

/** 2 つの文章を比べる */
export function compareTexts(leftText: string, rightText: string, opts: IgnoreOptions = NO_IGNORE): CompareResult {
  for (const [side, text] of [
    ['left', leftText],
    ['right', rightText],
  ] as const) {
    const chars = countCodePoints(text);
    if (chars > MAX_CHARS) return { status: 'too-long', side, chars, lines: splitLines(text).lines.length };
  }
  const ls = splitLines(leftText);
  const rs = splitLines(rightText);
  if (ls.lines.length > MAX_LINES) return { status: 'too-long', side: 'left', chars: countCodePoints(leftText), lines: ls.lines.length };
  if (rs.lines.length > MAX_LINES) return { status: 'too-long', side: 'right', chars: countCodePoints(rightText), lines: rs.lines.length };

  const L = prepare(ls, opts);
  const R = prepare(rs, opts);
  const [a, b] = intern([L.used.map((l) => l.key), R.used.map((l) => l.key)]);
  if (editDistance(a, b, MAX_LINE_D) < 0) return { status: 'too-many-diffs' };
  const ops = diffSequences(a, b);

  const found = new Map<string, InvisibleChar>();
  const core: Row[] = [];
  let i = 0;
  let j = 0;
  let k = 0;
  while (k < ops.length) {
    if (ops[k] === 0) {
      core.push({ kind: 'equal', left: L.used[i++].ref, right: R.used[j++].ref });
      k++;
      continue;
    }
    const dels: PreparedLine[] = [];
    const ins: PreparedLine[] = [];
    while (k < ops.length && ops[k] !== 0) {
      if (ops[k] === 1) dels.push(L.used[i++]);
      else ins.push(R.used[j++]);
      k++;
    }
    core.push(...pairBlock(dels, ins, found));
  }

  const rows = weaveSkipped(core, L.skipped, R.skipped);

  let added = 0;
  let deleted = 0;
  let changed = 0;
  for (const r of rows) {
    if (r.kind === 'insert') added++;
    else if (r.kind === 'delete') deleted++;
    else if (r.kind === 'change') changed++;
  }

  const identicalRaw =
    ls.lines.length === rs.lines.length && ls.lines.every((line, idx) => line === rs.lines[idx]);
  const eolDiffers = ls.eol && rs.eol && ls.eol !== rs.eol ? { left: ls.eol, right: rs.eol } : null;
  const missingFinalNewline =
    ls.lines.length > 0 && rs.lines.length > 0 && ls.endsWithNewline !== rs.endsWithNewline
      ? ls.endsWithNewline
        ? 'right'
        : 'left'
      : null;

  return {
    status: 'ok',
    rows,
    hunks: hunkStarts(rows),
    summary: {
      added,
      deleted,
      changed,
      leftChars: L.chars,
      rightChars: R.chars,
      identical: added + deleted + changed === 0,
      identicalRaw,
      eolDiffers,
      missingFinalNewline,
      invisibles: [...found.values()],
    },
  };
}

/** 「空行を無視」で除いた行を、元の位置に差し戻す（比べはしない） */
function weaveSkipped(core: Row[], leftSkipped: LineRef[], rightSkipped: LineRef[]): Row[] {
  if (leftSkipped.length === 0 && rightSkipped.length === 0) return core;
  const out: Row[] = [];
  let li = 0;
  let ri = 0;
  for (const row of core) {
    const leftNo = 'left' in row && row.left ? row.left.no : undefined;
    const rightNo = 'right' in row && row.right ? row.right.no : undefined;
    if (leftNo !== undefined) while (li < leftSkipped.length && leftSkipped[li].no < leftNo) out.push({ kind: 'skipped', left: leftSkipped[li++] });
    if (rightNo !== undefined) while (ri < rightSkipped.length && rightSkipped[ri].no < rightNo) out.push({ kind: 'skipped', right: rightSkipped[ri++] });
    out.push(row);
  }
  while (li < leftSkipped.length) out.push({ kind: 'skipped', left: leftSkipped[li++] });
  while (ri < rightSkipped.length) out.push({ kind: 'skipped', right: rightSkipped[ri++] });
  return out;
}

export function isDiffRow(row: Row): boolean {
  return row.kind === 'change' || row.kind === 'delete' || row.kind === 'insert';
}

/** 違いのまとまりの先頭の行の番号（`次の違い` で飛ぶ先）。比べずに除いた行は間に挟まっても切らない */
export function hunkStarts(rows: Row[]): number[] {
  const out: number[] = [];
  let prevDiff = false;
  rows.forEach((row, idx) => {
    if (row.kind === 'skipped') return;
    const d = isDiffRow(row);
    if (d && !prevDiff) out.push(idx);
    prevDiff = d;
  });
  return out;
}

// ---------------------------------------------------------------------------
// 表示の補助
// ---------------------------------------------------------------------------

export type CollapsedItem = { type: 'row'; index: number } | { type: 'gap'; count: number };

/** 「変わった行だけ表示」：違いの前後 context 行だけ残し、ほかは「◯行同じ」に畳む */
export function collapseRows(rows: Row[], context = COLLAPSE_CONTEXT): CollapsedItem[] {
  const keep = new Array<boolean>(rows.length).fill(false);
  rows.forEach((row, idx) => {
    if (!isDiffRow(row)) return;
    for (let t = Math.max(0, idx - context); t <= Math.min(rows.length - 1, idx + context); t++) keep[t] = true;
  });
  const out: CollapsedItem[] = [];
  let gap = 0;
  rows.forEach((_, idx) => {
    if (keep[idx]) {
      if (gap) out.push({ type: 'gap', count: gap });
      gap = 0;
      out.push({ type: 'row', index: idx });
    } else {
      gap++;
    }
  });
  if (gap) out.push({ type: 'gap', count: gap });
  return out;
}

/**
 * unified diff の形式（行頭に - と +）。メールやチャットにそのまま貼れる。
 * 違いが無ければ空文字。「空行を無視」で除いた行は出さない
 */
export function formatUnified(
  rows: Row[],
  labels: [string, string] = ['元の文章', '新しい文章'],
  context = UNIFIED_CONTEXT,
): string {
  const core = rows.filter((r) => r.kind !== 'skipped');
  const diffIdx = core.map((r, idx) => (isDiffRow(r) ? idx : -1)).filter((idx) => idx >= 0);
  if (diffIdx.length === 0) return '';

  // 前後 context 行を含めた範囲を作り、重なるものはまとめる
  const ranges: [number, number][] = [];
  for (const idx of diffIdx) {
    const s = Math.max(0, idx - context);
    const e = Math.min(core.length - 1, idx + context);
    const last = ranges[ranges.length - 1];
    if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e);
    else ranges.push([s, e]);
  }

  const out = [`--- ${labels[0]}`, `+++ ${labels[1]}`];
  // 範囲の手前までに出てきた左右の行番号（件数 0 の範囲の開始位置に使う）
  const lastNoBefore = (idx: number, side: 'left' | 'right'): number => {
    for (let t = idx - 1; t >= 0; t--) {
      const r = core[t] as Row & { left?: LineRef; right?: LineRef };
      const ref = side === 'left' ? r.left : r.right;
      if (ref) return ref.no;
    }
    return 0;
  };

  for (const [s, e] of ranges) {
    const body: string[] = [];
    let oldStart = 0;
    let newStart = 0;
    let oldCount = 0;
    let newCount = 0;
    const noteOld = (no: number) => {
      if (oldCount === 0) oldStart = no;
      oldCount++;
    };
    const noteNew = (no: number) => {
      if (newCount === 0) newStart = no;
      newCount++;
    };
    let t = s;
    while (t <= e) {
      const r = core[t];
      if (r.kind === 'equal') {
        body.push(` ${r.left.text}`);
        noteOld(r.left.no);
        noteNew(r.right.no);
        t++;
        continue;
      }
      // 違いの続く間は、左（−）をまとめて出してから右（＋）を出す
      const minus: string[] = [];
      const plus: string[] = [];
      while (t <= e && isDiffRow(core[t])) {
        const d = core[t];
        if (d.kind === 'change' || d.kind === 'delete') {
          minus.push(`-${d.left.text}`);
          noteOld(d.left.no);
        }
        if (d.kind === 'change' || d.kind === 'insert') {
          plus.push(`+${d.right.text}`);
          noteNew(d.right.no);
        }
        t++;
      }
      body.push(...minus, ...plus);
    }
    if (oldCount === 0) oldStart = lastNoBefore(s, 'left');
    if (newCount === 0) newStart = lastNoBefore(s, 'right');
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`, ...body);
  }
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// 計測（tool_use の action。文字列そのもの・行数の実数は送らない）
// ---------------------------------------------------------------------------

export type SizeBucket = 'lines-lt100' | 'lines-lt1000' | 'lines-gte1000';

/** 比べた回の規模の区分（多いほうの行数） */
export function sizeBucket(lines: number): SizeBucket {
  if (lines < 100) return 'lines-lt100';
  if (lines < 1000) return 'lines-lt1000';
  return 'lines-gte1000';
}

const IGNORE_SHORT: Record<keyof IgnoreOptions, string> = {
  whitespace: 'ws',
  width: 'width',
  case: 'case',
  blankLines: 'blank',
};

/** 比べた回の action（例：`compare-lines-lt100-ignore-ws+width-split`） */
export function compareAction(bucket: SizeBucket, opts: IgnoreOptions, view: 'split' | 'unified'): string {
  const ignored = IGNORE_KEYS.filter((k) => opts[k]).map((k) => IGNORE_SHORT[k]);
  return ['compare', bucket, ignored.length ? `ignore-${ignored.join('+')}` : 'ignore-none', view].join('-');
}

/** 片側の文字列の行数（改行を吸収して数える） */
export function lineCount(text: string): number {
  return splitLines(text).lines.length;
}
