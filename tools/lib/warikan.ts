/**
 * 割り勘計算ロジック
 *
 * 合計金額・人数・端数の丸め単位・幹事の扱いから、
 * 参加者（幹事以外）一人あたりの支払額と幹事の支払額を求める。
 *
 * - 幹事が端数を負担: 参加者は一人あたり額を丸め単位で「切り捨て」、
 *   不足分を幹事がかぶる（幹事の支払いが多くなる）
 * - 幹事が端数を得: 参加者は「切り上げ」で少し多めに払い、
 *   幹事の支払いが少なくなる。集めすぎた分はマイナス（お釣り）になる
 * - 均等: floor(合計÷人数) を全員同額とし、1円単位の余りだけ幹事が負担
 *
 * どのモードでも「参加者×(人数−1) + 幹事 = 合計」が常に成り立つ。
 */

/** 幹事の扱い */
export type KanjiMode =
  | 'kanji-more' // 幹事が端数を負担（参加者は切り捨て）
  | 'kanji-less' // 幹事が端数を得（参加者は切り上げ）
  | 'equal'; // 均等（1円単位）

export interface WarikanInput {
  /** 合計金額（円） */
  total: number;
  /** 人数（幹事を含む） */
  people: number;
  /** 端数の丸め単位（円）: 1 / 10 / 100 / 500 / 1000 */
  roundUnit: number;
  mode: KanjiMode;
}

export interface WarikanResult {
  /** 参加者（幹事以外）一人あたりの支払額（円） */
  perPerson: number;
  /** 幹事の支払額（円）。マイナスのときは「お釣り」（集めすぎ） */
  kanji: number;
  /** 検算用: perPerson × (人数−1) + kanji。常に合計と一致する */
  collected: number;
}

/**
 * 割り勘を計算する
 *
 * 入力は total を 0 以上の整数、people を 1 以上の整数、
 * roundUnit を 1 以上の整数に丸めてから計算する。
 */
export function calcWarikan(input: WarikanInput): WarikanResult {
  const total = Math.max(0, Math.floor(input.total));
  const people = Math.max(1, Math.floor(input.people));
  const unit = Math.max(1, Math.floor(input.roundUnit));

  const share = total / people;

  let perPerson: number;
  if (input.mode === 'equal') {
    perPerson = Math.floor(share);
  } else if (input.mode === 'kanji-more') {
    perPerson = Math.floor(share / unit) * unit;
  } else {
    perPerson = Math.ceil(share / unit) * unit;
  }

  const kanji = total - perPerson * (people - 1);

  return {
    perPerson,
    kanji,
    collected: perPerson * (people - 1) + kanji,
  };
}
