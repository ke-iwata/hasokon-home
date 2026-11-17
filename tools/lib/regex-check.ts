/**
 * 正規表現チェッカーの判定（純粋関数）。
 *
 * 仕様: docs/features/seiki-hyogen-checker.md「判定の約束」「安全の約束」
 *
 * - 判定は**ブラウザの `RegExp` そのもの**で行う（自前の正規表現エンジンを書かない）
 * - 使う先が Excel・スプレッドシートでも当たり方は JavaScript で見せ、違いは「注意」の言葉で出す
 * - 照合（`runMatch`）は Web Worker（app/seiki-hyogen/regex.worker.ts）から呼ぶ。1 秒で打ち切るのは画面側
 */
import { invisibleChar, type InvisibleChar } from './invisible-chars';
import { DIALECT_CHECKED_AT, targetLabel, type RegexTarget } from './regex-parts';

/** 試す文章の上限（超えたら先頭だけで試す） */
export const MAX_TEXT_CHARS = 200_000;
/** 色を塗る・一覧に出す当たりの上限 */
export const HIGHLIGHT_LIMIT = 1_000;
/** 1 回の照合の時間切れ（ミリ秒） */
export const MATCH_TIMEOUT_MS = 1_000;
/** 入力が止まってから照合するまで（ミリ秒） */
export const DEBOUNCE_MS = 150;

// ---------------------------------------------------------------------------
// フラグ
// ---------------------------------------------------------------------------

/** フラグの選び方。`u` と `v` はどちらか一方（`new RegExp(…, 'uv')` は SyntaxError） */
export interface FlagState {
  g: boolean;
  i: boolean;
  m: boolean;
  s: boolean;
  unicode: 'u' | 'v' | 'none';
}

export const DEFAULT_FLAGS: FlagState = { g: true, i: false, m: false, s: false, unicode: 'u' };

export function flagsToString(f: FlagState): string {
  return `${f.g ? 'g' : ''}${f.i ? 'i' : ''}${f.m ? 'm' : ''}${f.s ? 's' : ''}${f.unicode === 'none' ? '' : f.unicode}`;
}

/**
 * フラグの文字列を読む。知らない文字（`y`・`d` など）は捨てる。`u` と `v` が両方あれば後に書かれたほう
 */
export function parseFlags(s: string): FlagState {
  const f: FlagState = { g: false, i: false, m: false, s: false, unicode: 'none' };
  for (const c of s) {
    if (c === 'g' || c === 'i' || c === 'm' || c === 's') f[c] = true;
    else if (c === 'u' || c === 'v') f.unicode = c;
  }
  return f;
}

/**
 * パターンの欄に `/…/gu` の形で貼られたら、スラッシュとフラグを分けて返す。
 * そうでなければ undefined（そのままパターンとして使う）
 */
export function splitSlashForm(input: string): { pattern: string; flags: FlagState } | undefined {
  const m = /^\/([\s\S]+)\/([a-z]*)$/.exec(input.trim());
  if (!m) return undefined;
  // フラグの位置に知らない文字があるのは、ただの「/」で終わるパターンかもしれないので読み直さない
  if (!/^[gimsuvdy]*$/.test(m[2])) return undefined;
  return { pattern: m[1].replace(/\\\//g, '/'), flags: parseFlags(m[2]) };
}

// ---------------------------------------------------------------------------
// 構文エラーの日本語化
// ---------------------------------------------------------------------------

export type RegexErrorKind =
  | 'unclosed-group'
  | 'unclosed-class'
  | 'unmatched-paren'
  | 'nothing-to-repeat'
  | 'range-order'
  | 'invalid-escape'
  | 'lookaround'
  | 'duplicate-name'
  | 'property'
  | 'group-name'
  | 'trailing-backslash'
  | 'other';

export interface RegexError {
  kind: RegexErrorKind;
  message: string;
}

const ERROR_TEXT: Record<RegexErrorKind, string> = {
  'unclosed-group': '「(」が閉じていません。対応する「)」を書いてください。',
  'unclosed-class': '「[」が閉じていません。対応する「]」を書いてください（「[」そのものを探すなら \\[ と書きます）。',
  'unmatched-paren': '対応する「(」の無い「)」があります（「)」そのものを探すなら \\) と書きます）。',
  'nothing-to-repeat': '「*」「+」「?」「{…}」の前に、繰り返すものがありません（記号そのものを探すなら \\* \\+ \\? と書きます）。',
  'range-order': '{2,1} や [z-a] のように、回数や範囲の大小が逆になっています。',
  'invalid-escape':
    'u・v フラグでは使えないエスケープがあります（文字クラスの外の \\- や、意味の無い \\q など）。記号そのものを探すなら、文字クラスの中（[\\-]）に入れるか、u・v フラグを外してください。',
  lookaround: '後読み・先読み（(?<=…)・(?<!…)・(?=…)・(?!…)）の書き方に誤りがあります。u・v フラグでは、後読み・先読みの直後に * + ? は付けられません。',
  'duplicate-name': '名前つきグループの名前が重複しています（(?<名前>…) の名前は 1 つのパターンの中で 1 回だけ）。',
  property: '\\p{…} の中身が読めません（例：\\p{Script=Hiragana}・\\p{L}）。綴りと、u・v フラグが付いているかを確かめてください。',
  'group-name': 'グループの名前が正しくありません（名前は英字・数字・_ で、数字から始められません。\\k<名前> は定義した名前だけ使えます）。',
  'trailing-backslash': 'パターンが「\\」で終わっています。「\\」そのものを探すなら \\\\ と書きます。',
  other: 'パターンの書き方に誤りがあります。',
};

/** エンジンごとの例外の文（V8・SpiderMonkey・JavaScriptCore）から種類を当てる */
const ERROR_PATTERNS: readonly [RegexErrorKind, RegExp][] = [
  ['duplicate-name', /duplicate (capture group|group specifier) name/i],
  ['unclosed-group', /unterminated group|unterminated parenthetical|missing \)/i],
  ['unclosed-class', /unterminated character class|missing terminating \]/i],
  ['unmatched-paren', /unmatched '\)'|unmatched \)|unbalanced parenthes/i],
  ['range-order', /out of order/i],
  ['property', /property name|property expression|invalid property/i],
  ['group-name', /capture group name|named capture|group name|group specifier/i],
  ['trailing-backslash', /\\ at end of pattern|escape at end/i],
  ['invalid-escape', /invalid (identity |unicode |escaped|class )?escape|invalid escaped character|invalid unicode escape/i],
  ['nothing-to-repeat', /nothing to repeat|invalid quantifier|quantifier without/i],
];

const LOOKAROUND = /\(\?(<[=!]|[=!])/;

/** 例外の文を日本語の種類に直す */
export function classifyRegexError(pattern: string, rawMessage: string): RegexError {
  let kind: RegexErrorKind = 'other';
  for (const [k, re] of ERROR_PATTERNS) {
    if (re.test(rawMessage)) {
      kind = k;
      break;
    }
  }
  // 後読み・先読みに量指定子を付けた形（V8 は Invalid quantifier）
  if (kind === 'nothing-to-repeat' && /\(\?<?[=!][^)]*\)[*+?{]/.test(pattern)) kind = 'lookaround';
  if (kind === 'other' && LOOKAROUND.test(pattern)) kind = 'lookaround';
  return { kind, message: ERROR_TEXT[kind] };
}

/** パターンを組み立てる。誤りなら日本語のエラー */
export function compile(pattern: string, flags: string): { re: RegExp } | { error: RegexError } {
  try {
    return { re: new RegExp(pattern, flags) };
  } catch (e) {
    return { error: classifyRegexError(pattern, e instanceof Error ? e.message : String(e)) };
  }
}

// ---------------------------------------------------------------------------
// 文章の下ごしらえ
// ---------------------------------------------------------------------------

export interface PreparedText {
  text: string;
  /** \r\n・\r を \n に揃えたか */
  newlinesNormalized: boolean;
  /** 上限を超えて先頭だけにしたか */
  truncated: boolean;
}

/** 改行を `\n` に揃え、上限を超えたら先頭だけにする（判定の約束 8） */
export function prepareText(raw: string): PreparedText {
  const normalized = raw.replace(/\r\n?/g, '\n');
  const truncated = normalized.length > MAX_TEXT_CHARS;
  let text = truncated ? normalized.slice(0, MAX_TEXT_CHARS) : normalized;
  // サロゲートペアの途中で切らない
  if (truncated && /[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
  return { text, newlinesNormalized: normalized !== raw, truncated };
}

// ---------------------------------------------------------------------------
// 照合
// ---------------------------------------------------------------------------

export interface MatchItem {
  /** UTF-16 の位置 */
  index: number;
  end: number;
  text: string;
  /** 行（1 から） */
  line: number;
  /** 書記素で数えた列（1 から） */
  column: number;
  /** 番号つきグループ（1 から。当たらなかったグループは undefined） */
  groups: (string | undefined)[];
  /** 名前つきグループ */
  named: Record<string, string | undefined>;
}

export interface MatchResult {
  /** 当たりの総数 */
  total: number;
  /** 最初の HIGHLIGHT_LIMIT 件 */
  items: MatchItem[];
  /** グループ番号の順の名前（名前の無いグループは undefined。長さは groupCount） */
  groupNames: (string | undefined)[];
  /** 番号つきグループの数 */
  groupCount: number;
}

/** 捕まえるグループを左から順に読み、名前（無ければ undefined）を返す */
export function captureNames(pattern: string): (string | undefined)[] {
  const out: (string | undefined)[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') inClass = true;
    else if (c === '(') {
      if (pattern[i + 1] !== '?') out.push(undefined);
      else {
        const m = /^\(\?<([^=!>][^>]*)>/.exec(pattern.slice(i));
        if (m) out.push(m[1]);
      }
    }
  }
  return out;
}

/** パターンの中のグループの数と名前。数は空文字に当てて数える（`|` で空にも当たる形にする） */
function groupInfo(re: RegExp): { count: number; names: (string | undefined)[] } {
  const probe = new RegExp(`${re.source}|`, re.flags.replace('g', ''));
  const count = probe.exec('')!.length - 1;
  const names = captureNames(re.source);
  return { count, names: names.length === count ? names : new Array(count).fill(undefined) };
}

/**
 * 当たりを数え、最初の `limit` 件の中身を返す（判定の約束 3・4）。
 *
 * - `g` があれば `matchAll`（長さ 0 の当たりでも先へ進むので無限ループしない）
 * - `g` が無ければ `matchAll` は TypeError になるので、`exec` を 1 回だけ
 */
export function runMatch(re: RegExp, text: string, limit = HIGHLIGHT_LIMIT): MatchResult {
  const { count, names } = groupInfo(re);
  const raw: RegExpExecArray[] = [];
  let total = 0;
  if (re.global) {
    for (const m of text.matchAll(re)) {
      if (raw.length < limit) raw.push(m as RegExpExecArray);
      total++;
    }
  } else {
    const copy = new RegExp(re.source, re.flags);
    const m = copy.exec(text);
    if (m) {
      raw.push(m);
      total = 1;
    }
  }
  const pos = positions(text, raw.map((m) => m.index));
  const items = raw.map((m, k): MatchItem => ({
    index: m.index,
    end: m.index + m[0].length,
    text: m[0],
    line: pos[k].line,
    column: pos[k].column,
    groups: m.slice(1),
    named: m.groups ? { ...m.groups } : {},
  }));
  return { total, items, groupNames: names, groupCount: count };
}

const segmenter: Intl.Segmenter | undefined =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('ja', { granularity: 'grapheme' }) : undefined;

/**
 * UTF-16 の位置（昇順）を、行と書記素の列に直す（判定の約束 4）。
 * 位置が書記素の途中なら、その書記素の列にする
 */
export function positions(text: string, indexes: readonly number[]): { line: number; column: number }[] {
  const out: { line: number; column: number }[] = new Array(indexes.length);
  if (indexes.length === 0) return out;
  let k = 0;
  let line = 1;
  let column = 1;
  const iter: Iterable<{ index: number; segment: string }> = segmenter
    ? segmenter.segment(text)
    : Array.from(text, (segment, i) => ({ segment, index: i })); // Segmenter の無い環境の代わり（位置はずれうる）
  for (const { index, segment } of iter) {
    const segEnd = index + segment.length;
    while (k < indexes.length && indexes[k] < segEnd) {
      out[k++] = { line, column };
    }
    if (k >= indexes.length) return out;
    if (segment === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  // 文章の末尾（長さ 0 の当たり）
  while (k < indexes.length) out[k++] = { line, column };
  return out;
}

// ---------------------------------------------------------------------------
// 表示の片
// ---------------------------------------------------------------------------

export type DisplayPiece =
  | { kind: 'text'; text: string }
  | { kind: 'match'; text: string; n: number }
  | { kind: 'empty'; n: number }
  | { kind: 'invisible'; char: InvisibleChar; n?: number };

/**
 * 文章を「当たり」「当たっていない所」「見えない文字の印」の片に分ける（判定の約束 7・安全の約束 4・5）。
 * 画面はこれを React のテキストとして描くだけ（innerHTML を使わない）。
 * `items` は runMatch の items（最大 HIGHLIGHT_LIMIT 件）
 */
export function displayPieces(text: string, items: readonly Pick<MatchItem, 'index' | 'end'>[]): DisplayPiece[] {
  const out: DisplayPiece[] = [];
  const pushPlain = (s: string, n?: number) => {
    let buf = '';
    for (const ch of s) {
      const inv = invisibleChar(ch);
      if (inv) {
        if (buf) out.push(n === undefined ? { kind: 'text', text: buf } : { kind: 'match', text: buf, n });
        buf = '';
        out.push(n === undefined ? { kind: 'invisible', char: inv } : { kind: 'invisible', char: inv, n });
      } else buf += ch;
    }
    if (buf) out.push(n === undefined ? { kind: 'text', text: buf } : { kind: 'match', text: buf, n });
  };
  let cur = 0;
  items.forEach((m, n) => {
    // 当たりは重ならない（matchAll は前の当たりの後ろから探す）が、念のため後ろだけ見る
    const start = Math.max(m.index, cur);
    if (start > cur) pushPlain(text.slice(cur, start));
    if (m.end === m.index) out.push({ kind: 'empty', n });
    else if (m.end > start) pushPlain(text.slice(start, m.end), n);
    cur = Math.max(cur, m.end);
  });
  if (cur < text.length) pushPlain(text.slice(cur));
  return out;
}

/** 文章に含まれる見えない文字の呼び名（重複なし・出てきた順） */
export function invisibleNames(text: string): string[] {
  const seen = new Set<string>();
  for (const ch of text) {
    const inv = invisibleChar(ch);
    if (inv) seen.add(inv.name);
  }
  return [...seen];
}

// ---------------------------------------------------------------------------
// 置換
// ---------------------------------------------------------------------------

/**
 * 置換文字列の `$` を `String.prototype.replace` のとおりに展開する（ECMA-262 GetSubstitution）。
 * `$$` → `$`、`$&`、`` $` ``、`$'`、`$n`・`$nn`、`$<名前>`（名前つきグループがあるときだけ）
 */
export function expandReplacement(
  template: string,
  matched: string,
  position: number,
  input: string,
  captures: readonly (string | undefined)[],
  named: Record<string, string | undefined> | undefined,
): string {
  let out = '';
  const m = captures.length;
  for (let i = 0; i < template.length; i++) {
    const c = template[i];
    if (c !== '$' || i + 1 >= template.length) {
      out += c;
      continue;
    }
    const n = template[i + 1];
    if (n === '$') {
      out += '$';
      i++;
    } else if (n === '&') {
      out += matched;
      i++;
    } else if (n === '`') {
      out += input.slice(0, position);
      i++;
    } else if (n === "'") {
      out += input.slice(Math.min(position + matched.length, input.length));
      i++;
    } else if (n >= '0' && n <= '9') {
      const d1 = Number(n);
      const n2 = template[i + 2];
      const two = n2 !== undefined && n2 >= '0' && n2 <= '9' ? d1 * 10 + Number(n2) : -1;
      if (two >= 1 && two <= m) {
        out += captures[two - 1] ?? '';
        i += 2;
      } else if (d1 >= 1 && d1 <= m) {
        out += captures[d1 - 1] ?? '';
        i++;
      } else {
        out += '$';
      }
    } else if (n === '<' && named !== undefined) {
      const close = template.indexOf('>', i + 2);
      if (close === -1) {
        out += '$';
      } else {
        out += named[template.slice(i + 2, close)] ?? '';
        i = close;
      }
    } else {
      out += '$';
    }
  }
  return out;
}

export interface ReplacePiece {
  text: string;
  /** 置き換わった箇所か */
  changed: boolean;
}

/**
 * 置換の結果を、置き換わった箇所の印つきの片で返す（全文は片をつなげたもの。
 * `text.replace(re, replacement)` と同じ文字列になることをテストで固定している）
 */
export function replaceWithMarks(re: RegExp, text: string, replacement: string): ReplacePiece[] {
  const out: ReplacePiece[] = [];
  let cur = 0;
  const handle = (m: RegExpExecArray | RegExpMatchArray) => {
    const index = m.index ?? 0;
    if (index > cur) out.push({ text: text.slice(cur, index), changed: false });
    const rep = expandReplacement(replacement, m[0], index, text, m.slice(1), m.groups);
    out.push({ text: rep, changed: true });
    cur = index + m[0].length;
  };
  if (re.global) {
    for (const m of text.matchAll(re)) handle(m);
  } else {
    const m = new RegExp(re.source, re.flags).exec(text);
    if (m) handle(m);
  }
  if (cur < text.length) out.push({ text: text.slice(cur), changed: false });
  return out.filter((p) => p.text !== '' || p.changed);
}

// ---------------------------------------------------------------------------
// 使う先の違い・注意
// ---------------------------------------------------------------------------

export interface Warning {
  id: string;
  message: string;
}

/** 文字クラス・エスケープを読み飛ばしながらパターンを 1 文字ずつ見る */
function scan(pattern: string, visit: (i: number, inClass: boolean) => void): void {
  let inClass = 0;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') {
      visit(i, inClass > 0);
      i++;
      continue;
    }
    visit(i, inClass > 0);
    if (c === '[') inClass++;
    else if (c === ']' && inClass > 0) inClass--;
  }
}

/** パターンの中で使われている書き方（文字クラスの中は見ない） */
export function detectFeatures(pattern: string): Set<string> {
  const f = new Set<string>();
  scan(pattern, (i, inClass) => {
    if (inClass) return;
    const rest = pattern.slice(i);
    if (/^\(\?<[=!]/.test(rest)) f.add('lookbehind');
    else if (/^\(\?[=!]/.test(rest)) f.add('lookahead');
    else if (/^\(\?<[A-Za-z_$]/.test(rest)) f.add('named-group');
    else if (/^\\[1-9]/.test(rest) || /^\\k</.test(rest)) f.add('backref');
  });
  if (/\\[pP]\{(Script|sc|Script_Extensions|scx)=/.test(pattern)) f.add('script');
  return f;
}

/**
 * 入れ子の量指定子（`(a+)+`・`(\w*)*` など）を字面で見つける（安全の約束 2）。
 * 誤検知があるので、止めずに注意だけ出す
 */
export function hasNestedQuantifier(pattern: string): boolean {
  // グループごとに「中に上限の無い量指定子があるか」を積む
  const stack: boolean[] = [];
  let found = false;
  let inClass = false;
  for (let i = 0; i < pattern.length && !found; i++) {
    const c = pattern[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') {
      inClass = true;
      continue;
    }
    if (c === '(') {
      stack.push(false);
      continue;
    }
    const unbounded = c === '*' || c === '+' || (c === '{' && /^\{\d+,\}/.test(pattern.slice(i)));
    if (unbounded && stack.length > 0) stack[stack.length - 1] = true;
    if (c === ')') {
      const inner = stack.pop() ?? false;
      const next = pattern.slice(i + 1);
      const outer = /^(\*|\+|\{\d+,\})/.test(next);
      if (inner && outer) found = true;
      if (inner && stack.length > 0) stack[stack.length - 1] = true;
    }
  }
  return found;
}

/** 大文字小文字の対応が言語で割れる文字（トルコ語の İ・ı、長い s、ケルビン記号） */
const CASE_SPLIT = /[İıſK]/;
/** 全角英字 */
const FULLWIDTH_LATIN = /[Ａ-Ｚａ-ｚ]/;

export interface WarningInput {
  pattern: string;
  flags: FlagState;
  target: RegexTarget;
  text: string;
  replacement: string;
}

/** 使う先での注意と、パターン・文章の注意（判定の約束 5・6、安全の約束 2） */
export function warnings({ pattern, flags, target, text, replacement }: WarningInput): Warning[] {
  const w: Warning[] = [];
  const t = targetLabel(target);
  const feats = detectFeatures(pattern);

  if (target === 'sheets') {
    if (feats.has('lookbehind')) w.push({ id: 'lookbehind', message: `後読み (?<=…)・(?<!…) は${t}（RE2）では使えません。シートではエラーになります。` });
    if (feats.has('lookahead')) w.push({ id: 'lookahead', message: `先読み (?=…)・(?!…) は${t}（RE2）では使えません。シートではエラーになります。` });
    if (feats.has('backref')) w.push({ id: 'backref', message: `後方参照 \\1・\\k<名前> は${t}（RE2）では使えません。` });
    if (feats.has('named-group'))
      w.push({ id: 'named-group', message: `名前つきグループは${t}（RE2）では (?P<名前>…) と書くのが確実です。` });
  }
  if (target !== 'js') {
    if (feats.has('script'))
      w.push({
        id: 'script',
        message:
          `${t}では \\p{Script=Hiragana} ではなく \\p{Hiragana} と書きます（下の「そのまま貼れる形」は書き換え済み）。` +
          (target === 'sheets' ? 'Google のヘルプは「Unicode 文字クラスのマッチング以外の RE2 を使用できます」と書いているので、シートで当たるか確かめてください。' : ''),
      });
    if (flags.i)
      w.push({
        id: 'flag-i',
        message:
          target === 'excel'
            ? 'Excel では i フラグの代わりに、関数の大文字小文字の引数（REGEXTEST の 3 つめに 1）か、式の先頭の (?i) で指定します。'
            : 'スプレッドシートでは i フラグの代わりに、式の先頭に (?i) を付けます。',
      });
    if (flags.m || flags.s)
      w.push({ id: 'flag-ms', message: `${t}では m・s フラグの代わりに、式の先頭に (?m)・(?s) を付けます。` });
    if (flags.unicode === 'v') w.push({ id: 'flag-v', message: `v フラグの書き方（[\\p{L}--[a-z]] の引き算など）は JavaScript だけです。` });
    for (const [tok, label] of [
      ['$<', '$<名前>'],
      ['$&', '$&'],
      ['$`', '$`'],
      ["$'", "$'"],
    ] as const) {
      if (replacement.includes(tok) && !replacement.includes(`$${tok}`))
        w.push({ id: `rep-${label}`, message: `置換の ${label} は JavaScript だけの書き方です。${t}の REGEXREPLACE では $0（当たった全体）・$1〜 を使います。` });
    }
  }

  if (flags.i && CASE_SPLIT.test(text))
    w.push({ id: 'case-split', message: 'i フラグ：文章にトルコ語の İ・ı のような、大文字小文字の対応が言語で割れる文字があります。思った所に当たらないことがあります。' });
  if (flags.i && target !== 'js' && FULLWIDTH_LATIN.test(text + pattern))
    w.push({ id: 'case-fullwidth', message: `i フラグ：全角英字（Ａ／ａ）の当たり方が JavaScript と${t}で違うかもしれません。使う先で確かめてください。` });
  if (hasNestedQuantifier(pattern))
    w.push({ id: 'nested', message: '同じものの繰り返しを入れ子にしています（(a+)+ など）。長い文章では時間がかかりすぎることがあります。' });
  if (flags.unicode === 'none' && /\\[pP]\{/.test(pattern))
    w.push({ id: 'no-unicode', message: '\\p{…} は u か v フラグが無いと「p」の文字として読まれます。' });
  return w;
}

// ---------------------------------------------------------------------------
// そのまま貼れる形
// ---------------------------------------------------------------------------

/** JavaScript のリテラルにするため、文字クラスの外の「/」をエスケープする */
function escapeSlash(pattern: string): string {
  let out = '';
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') {
      out += c + (pattern[i + 1] ?? '');
      i++;
      continue;
    }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    out += c === '/' && !inClass ? '\\/' : c;
  }
  return out;
}

/** Excel・スプレッドシート向けに \p{Script=X} を \p{X} に直す */
export function toSheetPattern(pattern: string): string {
  return pattern.replace(/\\([pP])\{(?:Script|sc)=([A-Za-z_]+)\}/g, '\\$1{$2}');
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

export interface PasteForm {
  target: RegexTarget;
  label: string;
  code: string;
}

/** 「そのまま貼れる形」。`"` は `""` に直す */
export function pasteForms(pattern: string, flags: FlagState, replacement: string): PasteForm[] {
  const sheetPat = toSheetPattern(pattern);
  const inline = `${flags.m ? '(?m)' : ''}${flags.s ? '(?s)' : ''}`;
  const forms: PasteForm[] = [
    { target: 'js', label: 'JavaScript', code: `/${escapeSlash(pattern)}/${flagsToString(flags)}` },
    {
      target: 'excel',
      label: 'Excel（当たるか）',
      code: `=REGEXTEST(A1,${q(inline + sheetPat)}${flags.i ? ',1' : ''})`,
    },
    {
      target: 'sheets',
      label: 'スプレッドシート（当たるか）',
      code: `=REGEXMATCH(A1,${q((flags.i ? '(?i)' : '') + inline + sheetPat)})`,
    },
  ];
  if (replacement !== '') {
    forms.push(
      {
        target: 'excel',
        label: 'Excel（置換）',
        code: `=REGEXREPLACE(A1,${q(inline + sheetPat)},${q(replacement)}${flags.g ? '' : ',1'}${flags.i ? `${flags.g ? ',0' : ''},1` : ''})`,
      },
      {
        target: 'sheets',
        label: 'スプレッドシート（置換）',
        code: `=REGEXREPLACE(A1,${q((flags.i ? '(?i)' : '') + inline + sheetPat)},${q(replacement)})`,
      },
    );
  }
  return forms;
}

// ---------------------------------------------------------------------------
// 計測（中身は送らない）
// ---------------------------------------------------------------------------

export type CountBucket = '0' | '1-9' | '10+';

export function countBucket(n: number): CountBucket {
  if (n === 0) return '0';
  if (n < 10) return '1-9';
  return '10+';
}

/** tool_use の action。送るのは使う先と件数の区分だけ */
export function checkAction(target: RegexTarget, total: number): string {
  return `check-${target}-${countBucket(total)}`;
}

export function timeoutAction(target: RegexTarget): string {
  return `timeout-${target}`;
}

/** 「使う先」の選択を残す localStorage のキー（残すのはこれだけ。安全の約束 3） */
export const TARGET_STORAGE_KEY = 'seiki-hyogen:target';

export { DIALECT_CHECKED_AT };
