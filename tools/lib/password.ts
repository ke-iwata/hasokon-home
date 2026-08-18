/**
 * パスワード生成のロジック
 *
 * 仕様: docs/features/password-seisei.md
 *
 * ## 約束（ここを崩すとツールの前提が壊れる）
 *
 * 1. **乱数は `crypto.getRandomValues()` だけを使う。** `Math.random()` は
 *    予測可能な擬似乱数で、パスワードの生成に使ってはいけない
 * 2. **剰余バイアスを作らない。** `乱数 % 文字数` は、文字数が256の約数でないとき
 *    先頭の文字ほど出やすくなる。割り切れない端（`limit` 以上の値）を
 *    捨てて引き直す**棄却サンプリング**で偏りをなくす（`randomInt`）
 * 3. **選んだ文字種を必ず1文字ずつ含める。** 「含まれるまで引き直す」方式は
 *    条件を満たす候補だけを残すため分布が歪む。各種から1文字ずつ先に確保し、
 *    残りを全体から引いてから**シャッフルする**（位置の偏りも消える）
 * 4. **生成した値をどこにも残さない。** この関数群は文字列を返すだけで、
 *    保存も送信もしない。画面側も `localStorage` に書かない
 *
 * 乱数の供給元を引数（`RandomSource`）にしてあるのは、テストで
 * 「この並びのバイト列を渡したらこの文字列になる」を固定するため。
 * 既定値は `cryptoRandom` なので、呼び出し側が何も渡さなければ必ず Web Crypto を使う。
 */
import { PASSPHRASE_WORDS, BITS_PER_WORD } from './password-words';

export { PASSPHRASE_WORDS, BITS_PER_WORD };

/* ------------------------------------------------------------------ *
 * 乱数
 * ------------------------------------------------------------------ */

/** 指定バイト数の乱数を返す関数。テストではここに決め打ちの列を差し込む */
export type RandomSource = (byteLength: number) => Uint8Array;

/**
 * 既定の乱数源。Web Crypto（暗号用の乱数）をそのまま使う。
 * ブラウザにも Node.js 19+ にも `globalThis.crypto` がある。
 */
export const cryptoRandom: RandomSource = (byteLength) =>
  globalThis.crypto.getRandomValues(new Uint8Array(byteLength));

/** 2バイトで引ける上限。単語リスト（2048語）も文字集合もこの範囲に収まる */
const MAX_RANGE = 65536;

/**
 * 0 以上 `maxExclusive` 未満の整数を偏りなく返す。
 *
 * バイト列をそのまま剰余で丸めると、割り切れない端の分だけ小さい値が出やすくなる
 * （例: 0〜255 を 10 で割ると 0〜5 が26回・6〜9 が25回で 4% ずれる）。
 * `limit`（= 範囲を `maxExclusive` で割り切れるところまで縮めた値）以上を捨てて
 * 引き直すことで、どの値も同じ確率にする。
 */
export function randomInt(maxExclusive: number, random: RandomSource): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
    throw new RangeError(`乱数の範囲が不正です: ${maxExclusive}`);
  }
  if (maxExclusive > MAX_RANGE) {
    throw new RangeError(`乱数の範囲が大きすぎます: ${maxExclusive}（上限 ${MAX_RANGE}）`);
  }
  if (maxExclusive === 1) return 0;

  const byteLength = maxExclusive <= 256 ? 1 : 2;
  const range = byteLength === 1 ? 256 : MAX_RANGE;
  // ここ以上の値は「割り切れない端」なので使わない
  const limit = range - (range % maxExclusive);

  for (;;) {
    const bytes = random(byteLength);
    if (bytes.length < byteLength) {
      throw new Error(`乱数が足りません（${byteLength}バイト必要）`);
    }
    let value = 0;
    for (let i = 0; i < byteLength; i++) value = value * 256 + bytes[i];
    if (value < limit) return value % maxExclusive;
    // 端に当たったら捨てて引き直す（ここを消すと剰余バイアスが復活する）
  }
}

/**
 * Fisher-Yates シャッフル。位置の偏りをなくすために使う。
 * 交換位置も `randomInt` で引くので、こちらにも剰余バイアスは出ない。
 */
export function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, random);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * 文字種
 * ------------------------------------------------------------------ */

/** 文字種のキー */
export type CharsetKey = 'upper' | 'lower' | 'digit' | 'symbol';

/**
 * 使う文字種。
 *
 * 記号から引用符（`'` `"` `` ` ``）・バックスラッシュ・パイプ・不等号を外してあるのは、
 * シェルやCSV・設定ファイルに貼ったときに壊れやすく、
 * 入力欄で弾くサービスも多いため（=「使えないパスワードができた」を減らす）。
 */
export const CHARSETS: Record<CharsetKey, string> = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digit: '0123456789',
  symbol: '!#$%&()*+,-.:;=?@[]^_{}~',
};

/** 文字種の表示名（画面とテストで同じ名前を使う） */
export const CHARSET_LABELS: Record<CharsetKey, string> = {
  upper: '英大文字',
  lower: '英小文字',
  digit: '数字',
  symbol: '記号',
};

/** 文字種の並び順。画面のチェックボックスもこの順に出す */
export const CHARSET_KEYS: readonly CharsetKey[] = ['upper', 'lower', 'digit', 'symbol'];

/**
 * 紛らわしい文字。手で書き写すときに読み違えるものだけを外す。
 *
 * `I`（大文字のアイ）/ `l`（小文字のエル）/ `1`、`O`（オー）/ `o` / `0`（ゼロ）。
 * `5` と `S`、`8` と `B` まで外すと数字が5種類まで減り、
 * 同じ長さでのエントロピーが目に見えて落ちるのでここまでにしている。
 */
export const AMBIGUOUS_CHARS = 'Il1Oo0';

/** パスワードの長さ（仕様書の 8〜64、既定16） */
export const MIN_LENGTH = 8;
export const MAX_LENGTH = 64;
export const DEFAULT_LENGTH = 16;

/** 一度に生成する件数の上限 */
export const MAX_COUNT = 10;

/** パスワードの生成条件 */
export interface PasswordOptions {
  /** 長さ（MIN_LENGTH〜MAX_LENGTH） */
  length: number;
  /** 英大文字を含める */
  upper: boolean;
  /** 英小文字を含める */
  lower: boolean;
  /** 数字を含める */
  digit: boolean;
  /** 記号を含める */
  symbol: boolean;
  /** 紛らわしい文字（AMBIGUOUS_CHARS）を除く */
  excludeAmbiguous: boolean;
}

/** 既定の条件。画面の初期値もこれを使う */
export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: DEFAULT_LENGTH,
  upper: true,
  lower: true,
  digit: true,
  symbol: true,
  excludeAmbiguous: false,
};

/** 条件が不正なときに投げる。画面はこれを捕まえて説明文を出す */
export class PasswordOptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordOptionError';
  }
}

/**
 * 条件から「文字種ごとの候補」と「全体の候補」を作る。
 *
 * 文字種ごとの配列を残すのは、**選んだ文字種を1文字ずつ確保する**ため
 * （ここを1つの文字列にまとめてしまうと「記号が1つも入らないパスワード」が出る）。
 */
export function charPools(options: PasswordOptions): { pools: string[][]; alphabet: string[] } {
  const excluded = options.excludeAmbiguous ? new Set(AMBIGUOUS_CHARS) : new Set<string>();
  const pools: string[][] = [];

  for (const key of CHARSET_KEYS) {
    if (!options[key]) continue;
    const pool = [...CHARSETS[key]].filter((c) => !excluded.has(c));
    if (pool.length === 0) {
      throw new PasswordOptionError(
        `${CHARSET_LABELS[key]}が「紛らわしい文字を除く」で空になりました。`,
      );
    }
    pools.push(pool);
  }

  if (pools.length === 0) {
    throw new PasswordOptionError('文字種を1つ以上選んでください。');
  }
  return { pools, alphabet: pools.flat() };
}

/** 条件から候補文字の総数を返す（エントロピーの計算に使う） */
export function alphabetSize(options: PasswordOptions): number {
  return charPools(options).alphabet.length;
}

/** 長さの検査。文字種の数より短いパスワードは「各種1文字」を満たせない */
function assertLength(options: PasswordOptions, poolCount: number): void {
  if (!Number.isInteger(options.length)) {
    throw new PasswordOptionError('長さは整数で指定してください。');
  }
  if (options.length < MIN_LENGTH || options.length > MAX_LENGTH) {
    throw new PasswordOptionError(`長さは${MIN_LENGTH}〜${MAX_LENGTH}文字にしてください。`);
  }
  if (options.length < poolCount) {
    throw new PasswordOptionError('長さが文字種の数より短いため、すべての文字種を入れられません。');
  }
}

/**
 * パスワードを1つ作る。
 *
 * 手順は「各文字種から1文字ずつ確保 → 残りを全体から引く → シャッフル」。
 * 引き直し（条件を満たすまで生成し直す）を使わないのは、
 * 条件付きの分布になって偏るのと、最悪の場合いつまでも終わらないため。
 */
export function generatePassword(
  options: PasswordOptions,
  random: RandomSource = cryptoRandom,
): string {
  const { pools, alphabet } = charPools(options);
  assertLength(options, pools.length);

  const chars: string[] = pools.map((pool) => pool[randomInt(pool.length, random)]);
  while (chars.length < options.length) {
    chars.push(alphabet[randomInt(alphabet.length, random)]);
  }
  return shuffle(chars, random).join('');
}

/** パスワードをまとめて作る。件数は MAX_COUNT まで */
export function generatePasswords(
  count: number,
  options: PasswordOptions,
  random: RandomSource = cryptoRandom,
): string[] {
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    throw new PasswordOptionError(`件数は1〜${MAX_COUNT}にしてください。`);
  }
  return Array.from({ length: count }, () => generatePassword(options, random));
}

/* ------------------------------------------------------------------ *
 * パスフレーズ
 * ------------------------------------------------------------------ */

/** 単語の区切りに選べる文字（画面のセレクトもこの順に出す） */
export const SEPARATORS = ['-', '_', '.', ' ', ''] as const;
export type Separator = (typeof SEPARATORS)[number];

export const MIN_WORDS = 3;
export const MAX_WORDS = 10;
/**
 * 既定の語数。**6語（66ビット）にしてある。**
 * 4語は44ビットで、このツール自身の目安表示では「弱い」に入る
 * （毎秒1兆回の総当たりで平均9秒）。既定値が自分の基準で弱いのはおかしいので、
 * 「強い」に入る最小の語数にした。
 */
export const DEFAULT_WORDS = 6;

/** 末尾に付ける数字の桁数。2桁なので log2(100) ≒ 6.64 ビット増える */
export const APPENDED_DIGITS = 2;

/** パスフレーズの生成条件 */
export interface PassphraseOptions {
  /** つなぐ単語の数（MIN_WORDS〜MAX_WORDS） */
  wordCount: number;
  /** 区切り文字 */
  separator: string;
  /** 各単語の先頭を大文字にする（**エントロピーは増えない**。見た目と入力規則のため） */
  capitalize: boolean;
  /** 末尾に2桁の数字を足す（「数字必須」のサービス向け） */
  appendNumber: boolean;
}

export const DEFAULT_PASSPHRASE_OPTIONS: PassphraseOptions = {
  wordCount: DEFAULT_WORDS,
  separator: '-',
  capitalize: false,
  appendNumber: false,
};

/**
 * パスフレーズを1つ作る。
 *
 * **同じ単語が2回出ることを禁止していない。** 引いた単語を候補から外すと
 * 1語あたりのエントロピーが少しずつ下がり（2048 → 2047 → …）、
 * 「1語=11ビット」という説明が成り立たなくなるため。
 * 重なる確率は4語なら 0.3% 程度で、強度上の問題にはならない。
 */
export function generatePassphrase(
  options: PassphraseOptions,
  random: RandomSource = cryptoRandom,
  words: readonly string[] = PASSPHRASE_WORDS,
): string {
  assertPassphraseOptions(options, words);

  const picked = Array.from({ length: options.wordCount }, () => {
    const word = words[randomInt(words.length, random)];
    return options.capitalize ? word[0].toUpperCase() + word.slice(1) : word;
  });

  let phrase = picked.join(options.separator);
  if (options.appendNumber) {
    const number = randomInt(10 ** APPENDED_DIGITS, random);
    phrase += options.separator + String(number).padStart(APPENDED_DIGITS, '0');
  }
  return phrase;
}

/** パスフレーズをまとめて作る */
export function generatePassphrases(
  count: number,
  options: PassphraseOptions,
  random: RandomSource = cryptoRandom,
  words: readonly string[] = PASSPHRASE_WORDS,
): string[] {
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    throw new PasswordOptionError(`件数は1〜${MAX_COUNT}にしてください。`);
  }
  return Array.from({ length: count }, () => generatePassphrase(options, random, words));
}

function assertPassphraseOptions(options: PassphraseOptions, words: readonly string[]): void {
  if (!Number.isInteger(options.wordCount)) {
    throw new PasswordOptionError('単語の数は整数で指定してください。');
  }
  if (options.wordCount < MIN_WORDS || options.wordCount > MAX_WORDS) {
    throw new PasswordOptionError(`単語の数は${MIN_WORDS}〜${MAX_WORDS}にしてください。`);
  }
  if (options.separator.length > 1) {
    throw new PasswordOptionError('区切り文字は1文字までです。');
  }
  if (words.length < 2) {
    throw new PasswordOptionError('単語リストが足りません。');
  }
}

/* ------------------------------------------------------------------ *
 * 強度（エントロピー）
 * ------------------------------------------------------------------ */

/**
 * パスワードのエントロピー（ビット）。
 *
 * 計算式は **log2(候補文字数 ^ 長さ)**＝`長さ × log2(候補文字数)`。
 * 「作り方が知られていて、長さと文字種だけが分かっている」前提での目安で、
 * 実際には「各文字種を1文字以上含める」制約があるぶん、真の値はここから
 * わずかに下がる（16文字・94種で0.1ビット程度）。**目安として扱う。**
 */
export function entropyBits(options: PasswordOptions): number {
  return options.length * Math.log2(alphabetSize(options));
}

/**
 * パスフレーズのエントロピー（ビット）。
 *
 * `単語数 × log2(語数)`。2048語なら1語11ビット。
 * **大文字化は数に入れない**（規則で決まる変換なので、当てる側の手間が増えない）。
 * 末尾の数字は2桁＝log2(100) ビットとして足す。
 */
export function passphraseEntropyBits(
  options: PassphraseOptions,
  wordListSize: number = PASSPHRASE_WORDS.length,
): number {
  const base = options.wordCount * Math.log2(wordListSize);
  return options.appendNumber ? base + Math.log2(10 ** APPENDED_DIGITS) : base;
}

/**
 * 総当たりの試行速度の前提（1秒あたりの試行回数）。
 *
 * 流出したハッシュを手元のGPUで総当たりする、いわゆるオフライン攻撃を想定して
 * **1秒あたり1兆回**とした。ログイン画面から試すオンライン攻撃は
 * 回数制限があるため桁違いに遅く、この前提は「速いほうに寄せた安全側の見積り」になる。
 * ハッシュの方式（bcrypt・Argon2 など）によっては何桁も遅くなる。
 */
export const GUESSES_PER_SECOND = 1e12;

/**
 * 総当たりにかかる時間（秒）の目安。
 * 平均で全体の半分を試したところで当たるので、2^(bits-1) を試行回数とする。
 */
export function crackSeconds(bits: number, guessesPerSecond = GUESSES_PER_SECOND): number {
  return 2 ** (bits - 1) / guessesPerSecond;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

/** 桁に応じて丸める（「約1.2万年」「約340年」のような見せ方にする） */
function round(value: number): string {
  if (value >= 100) return String(Math.round(value));
  // 小数の末尾の0は落とす（「5.0万年」ではなく「5万年」と出すため）
  return value.toFixed(value >= 10 ? 1 : 2).replace(/\.?0+$/, '');
}

/**
 * 秒数を日本語の目安に直す。
 *
 * 兆年を超えたら指数表記（`約1.2×10^30年`）にする。
 * 「実質破られない」とだけ書くと、条件を変えたときの差が見えなくなるため。
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '事実上、無限';
  if (seconds < 1) return '1秒未満';
  if (seconds < MINUTE) return `約${round(seconds)}秒`;
  if (seconds < HOUR) return `約${round(seconds / MINUTE)}分`;
  if (seconds < DAY) return `約${round(seconds / HOUR)}時間`;
  if (seconds < YEAR) return `約${round(seconds / DAY)}日`;

  const years = seconds / YEAR;
  if (years < 1e4) return `約${round(years)}年`;
  if (years < 1e8) return `約${round(years / 1e4)}万年`;
  if (years < 1e12) return `約${round(years / 1e8)}億年`;
  if (years < 1e16) return `約${round(years / 1e12)}兆年`;

  const exponent = Math.floor(Math.log10(years));
  const mantissa = years / 10 ** exponent;
  return `約${mantissa.toFixed(1)}×10^${exponent}年`;
}

/** 強度の段階 */
export type Strength = 'weak' | 'fair' | 'strong' | 'verystrong';

/**
 * エントロピーから強度の段階を決める。
 *
 * 60ビット未満は、流出したハッシュのオフライン総当たりで現実的に破られうる水準。
 * 80ビットあれば当面は総当たりの対象にならない、という目安で切っている
 * （**使い回しや流出には効かない**ので、この段階だけで安全とは言えない）。
 */
export function strengthOf(bits: number): Strength {
  if (bits < 45) return 'weak';
  if (bits < 60) return 'fair';
  if (bits < 80) return 'strong';
  return 'verystrong';
}

/** 強度の表示名 */
export const STRENGTH_LABELS: Record<Strength, string> = {
  weak: '弱い',
  fair: 'ふつう',
  strong: '強い',
  verystrong: 'とても強い',
};
