/**
 * 本文と図で使う計算
 *
 * **本文の表と図は、必ずここから数字を取ること。**
 * 手打ちすると必ずずれる。実際に最初の版では信託報酬の表を手で書いていて、
 * 3か所間違えたまま出しかけた（docs/DECISIONS.md 2026-09-07）。
 * 表と図で同じ数字を2回書けば、片方だけ直す事故が起きる。
 *
 * tools/ の `lib/{slug}.ts` と同じ約束で、**純関数だけを置く**。
 * DOM にも React にも依存しない。テストは tests/calc.test.ts。
 */

/** 単利。元本にだけ利息がつく */
export function simple(principal: number, rate: number, years: number): number {
  return principal * (1 + rate * years);
}

/** 複利。ついた利息を元本に組み入れる */
export function compound(principal: number, rate: number, years: number): number {
  return principal * (1 + rate) ** years;
}

/**
 * 毎月一定額を積み立てたときの評価額（期末払いの年金現価の将来価値）。
 *
 * 月利は年利 ÷ 12 で出す。金融実務では (1+r)^(1/12)-1 を使うこともあるが、
 * 積立の説明で使われるのは年利÷12 のほうなので、そちらに合わせる。
 */
export function futureValueOfSeries(
  monthly: number,
  annualRate: number,
  years: number,
): number {
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return monthly * n;
  return monthly * (((1 + r) ** n - 1) / r);
}

/**
 * 元本が2倍になるまでのおおよその年数（72の法則）。
 * 年利が数%〜10%程度の範囲でよく合う近似。
 */
export function ruleOf72(ratePercent: number): number {
  return 72 / ratePercent;
}

/** 2倍になるまでの正確な年数。72の法則がどれくらい合っているかの確認に使う */
export function exactDoublingYears(rate: number): number {
  return Math.log(2) / Math.log(1 + rate);
}

/**
 * 信託報酬を引いたあとの実質利回り。
 *
 * 差し引きで出しているのは、日割りで純資産から控除される信託報酬の効果を
 * 年利ベースで近似したもの。説明で使われるのもこの形。
 */
export function netRate(grossRate: number, feeRate: number): number {
  return grossRate - feeRate;
}

/**
 * インフレが続いたときに、いまの1円が将来いくらの価値になるか（購買力）。
 *
 * 物価が上がると同じ金額で買えるものが減る。年2%のインフレが10年続けば、
 * いまの100万円は約82万円ぶんの買い物しかできない。
 * 「何もしない」ことがリスクだと言われるのはこの意味。
 */
export function purchasingPower(amount: number, inflation: number, years: number): number {
  return amount / (1 + inflation) ** years;
}

/**
 * 元本と、そのうち何割が値動きする資産かから、
 * 値動きする側が指定の割合だけ下がったときの全体の下落率を出す。
 *
 * 「株を何割持つか」がそのまま「いくら減りうるか」を決めることを示すために使う。
 */
export function drawdownOf(riskyRatio: number, riskyFall: number): number {
  return riskyRatio * riskyFall;
}

/** 図の1点。年と金額 */
export interface Point {
  year: number;
  value: number;
}

/** 0年目から years 年目までの系列を作る。図の折れ線はこれを描く */
export function series(
  years: number,
  valueAt: (year: number) => number,
  step = 1,
): Point[] {
  const points: Point[] = [];
  for (let y = 0; y <= years; y += step) points.push({ year: y, value: valueAt(y) });
  if (points[points.length - 1].year !== years) {
    points.push({ year: years, value: valueAt(years) });
  }
  return points;
}

/**
 * 成行注文が板を食っていったときの約定。
 *
 * `levels` は価格の有利な順（買いなら安い順）に並んでいる前提。
 * 数量が足りなければ、約定できたぶんだけを返す（`filled` を見て判断する）。
 */
export function sweepBook(
  levels: readonly { price: number; qty: number }[],
  wanted: number,
): { filled: number; cost: number; average: number; fills: { price: number; qty: number }[] } {
  let remaining = wanted;
  let cost = 0;
  const fills: { price: number; qty: number }[] = [];
  for (const level of levels) {
    if (remaining <= 0) break;
    const qty = Math.min(remaining, level.qty);
    cost += qty * level.price;
    remaining -= qty;
    fills.push({ price: level.price, qty });
  }
  const filled = wanted - remaining;
  return { filled, cost, average: filled === 0 ? 0 : cost / filled, fills };
}

/** 万円に丸める（小数第1位まで）。計算に使う値 */
export function toMan(man: number): number {
  return Math.round(man * 10) / 10;
}

/**
 * 表に出す万円の文字列。**小数第1位を必ず出す。**
 *
 * 丸めたままだと 103万円 と 134.4万円 が同じ列に並び、桁が揃わず読みにくい
 * （表は数字を上下で見比べるためのもの）。3桁区切りも入れる。
 */
export function manText(man: number): string {
  return toMan(man).toLocaleString('ja-JP', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
