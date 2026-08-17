/**
 * 半角⇔全角 変換ロジック
 *
 * 変換の対象を4種類に分けて、それぞれ個別にON/OFFできるようにしている。
 * 「英数字だけ半角にしたいが、カタカナは全角のままにしたい」という需要が
 * 実務（申請フォーム・CSV取り込み）でいちばん多いため。
 *
 * - 英数字: 0-9 A-Z a-z ⇔ ０-９ Ａ-Ｚ ａ-ｚ
 * - カタカナ: ｱｲｳ ⇔ アイウ（濁点・半濁点の合成/分解を含む）
 * - 記号: ! " # ... ⇔ ！＂＃ ...（ASCIIの記号に対応するものだけ）
 * - スペース: 半角スペース ⇔ 全角スペース（U+3000）
 *
 * 【データ更新箇所】対応する文字を増やすときは下の対応表を編集する。
 * 対応表は「同じ位置どうしが対応する」形式なので、長さを必ず揃えること。
 */

/** 変換の向き */
export type Direction = 'toHalf' | 'toFull';

/** 何を変換の対象にするか */
export interface WidthOptions {
  /** 英数字 */
  alnum: boolean;
  /** カタカナ */
  kana: boolean;
  /** 記号 */
  symbol: boolean;
  /** スペース */
  space: boolean;
}

export const DEFAULT_OPTIONS: WidthOptions = {
  alnum: true,
  kana: true,
  symbol: true,
  space: true,
};

/**
 * カタカナの対応表（濁点・半濁点が付かないもの）。
 * FULL_KANA と HALF_KANA は同じ位置どうしが対応する。
 */
const FULL_KANA =
  'ァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン、。「」・゛゜';
const HALF_KANA =
  'ｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝ､｡｢｣･ﾞﾟ';

/** 濁点付きカタカナと、その濁点を外した形 */
const VOICED = 'ガギグゲゴザジズゼゾダヂヅデドバビブベボヴヷヺ';
const VOICED_BASE = 'カキクケコサシスセソタチツテトハヒフヘホウワヲ';

/** 半濁点付きカタカナと、その半濁点を外した形 */
const SEMI_VOICED = 'パピプペポ';
const SEMI_VOICED_BASE = 'ハヒフヘホ';

/** 全角カタカナ1文字 → 半角カナ（濁点付きは2文字になる） */
const KANA_TO_HALF = new Map<string, string>();
/** 半角カナ → 全角カタカナ（キーは1文字。濁点は合成時に処理する） */
const KANA_TO_FULL = new Map<string, string>();

for (let i = 0; i < FULL_KANA.length; i += 1) {
  KANA_TO_HALF.set(FULL_KANA[i], HALF_KANA[i]);
  KANA_TO_FULL.set(HALF_KANA[i], FULL_KANA[i]);
}
for (let i = 0; i < VOICED.length; i += 1) {
  const half = KANA_TO_HALF.get(VOICED_BASE[i]);
  if (half) KANA_TO_HALF.set(VOICED[i], `${half}ﾞ`);
}
for (let i = 0; i < SEMI_VOICED.length; i += 1) {
  const half = KANA_TO_HALF.get(SEMI_VOICED_BASE[i]);
  if (half) KANA_TO_HALF.set(SEMI_VOICED[i], `${half}ﾟ`);
}

/** 全角カタカナに濁点／半濁点を付けた文字を返す。付けられない場合は null */
function addMark(fullKana: string, mark: 'ﾞ' | 'ﾟ'): string | null {
  const table = mark === 'ﾞ' ? VOICED_BASE : SEMI_VOICED_BASE;
  const result = mark === 'ﾞ' ? VOICED : SEMI_VOICED;
  const i = table.indexOf(fullKana);
  return i === -1 ? null : result[i];
}

/** 半角と全角のコード位置の差。ASCIIの ! (0x21) と ！ (0xFF01) の差 */
const WIDTH_OFFSET = 0xfee0;

const isHalfAlnum = (c: string) => /[0-9A-Za-z]/.test(c);
const isFullAlnum = (c: string) => /[０-９Ａ-Ｚａ-ｚ]/.test(c);

/**
 * ASCIIの記号か（英数字とスペースを除く、! から ~ までの印字可能文字）。
 * 記号だけを変換対象から外せるように、英数字とは別に判定している。
 */
const isHalfSymbol = (c: string) => {
  const code = c.charCodeAt(0);
  return code >= 0x21 && code <= 0x7e && !isHalfAlnum(c);
};

/** 上の記号に対応する全角の記号か（！ から ～ まで） */
const isFullSymbol = (c: string) => {
  const code = c.charCodeAt(0);
  return code >= 0xff01 && code <= 0xff5e && !isFullAlnum(c);
};

/** 半角カナを全角カタカナにする。濁点は直前の文字と合成する */
function kanaToFull(input: string): string {
  let out = '';
  let i = 0;
  while (i < input.length) {
    const full = KANA_TO_FULL.get(input[i]);
    if (full === undefined) {
      out += input[i];
      i += 1;
      continue;
    }
    // 「ｶ」+「ﾞ」を「ガ」1文字にまとめる。合成できない組み合わせ（「ｱﾞ」など）は
    // そのまま2文字として残す
    const next = input[i + 1];
    if (next === 'ﾞ' || next === 'ﾟ') {
      const marked = addMark(full, next);
      if (marked) {
        out += marked;
        i += 2;
        continue;
      }
    }
    out += full;
    i += 1;
  }
  return out;
}

/** 全角カタカナを半角カナにする。濁点付きは2文字に分解される */
function kanaToHalf(input: string): string {
  let out = '';
  for (const ch of input) {
    out += KANA_TO_HALF.get(ch) ?? ch;
  }
  return out;
}

/**
 * 文字列の半角⇔全角を変換する。
 *
 * @param input 変換元の文字列
 * @param direction 'toHalf' = 全角を半角に / 'toFull' = 半角を全角に
 * @param options 変換の対象。省略すると全種類が対象
 * @returns 変換後の文字列
 */
export function convertWidth(
  input: string,
  direction: Direction,
  options?: Partial<WidthOptions>,
): string {
  const opt = { ...DEFAULT_OPTIONS, ...options };

  // カタカナは文字数が変わる（ガ⇔ｶﾞ）ので、1文字ずつ置き換える処理とは
  // 分けて先に済ませる
  let text = input;
  if (opt.kana) {
    text = direction === 'toHalf' ? kanaToHalf(text) : kanaToFull(text);
  }

  let out = '';
  for (const ch of text) {
    if (direction === 'toHalf') {
      if (opt.space && ch === '　') {
        out += ' ';
        continue;
      }
      if ((opt.alnum && isFullAlnum(ch)) || (opt.symbol && isFullSymbol(ch))) {
        out += String.fromCharCode(ch.charCodeAt(0) - WIDTH_OFFSET);
        continue;
      }
    } else {
      if (opt.space && ch === ' ') {
        out += '　';
        continue;
      }
      if ((opt.alnum && isHalfAlnum(ch)) || (opt.symbol && isHalfSymbol(ch))) {
        out += String.fromCharCode(ch.charCodeAt(0) + WIDTH_OFFSET);
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/** 文字数の内訳。変換の前後で何がどれだけ変わったかを見せるために使う */
export interface CharCount {
  /** 文字数（サロゲートペアを1文字と数える） */
  total: number;
  /** 全角として扱われる文字の数（半角カナは半角に数える） */
  full: number;
  /** 半角として扱われる文字の数 */
  half: number;
}

/**
 * 文字数を数える。
 *
 * 全角/半角の判定は East Asian Width（全角・広い）にもとづく簡易版。
 * 「全角2文字・半角1文字」で文字数制限のあるフォームを想定している。
 */
export function countChars(input: string): CharCount {
  let full = 0;
  let half = 0;
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    const isFull =
      // 全角の記号・句読点・かな・漢字・全角英数など
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      // 絵文字（Unicodeの East Asian Width が Wide の範囲。記号・顔・乗り物など）
      (code >= 0x1f300 && code <= 0x1faff) ||
      // 追加面の漢字（𩸽 など）
      code >= 0x20000;
    if (isFull) full += 1;
    else half += 1;
  }
  return { total: full + half, full, half };
}
