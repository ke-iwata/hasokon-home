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

/**
 * ポジションサイジング。
 *
 * 「1回の取引で資産の何%まで失ってよいか」と「どこで損切りするか」から、
 * **いくら分まで持てるか**を出す。順番が逆（先に金額を決めてから損切りを考える）だと、
 * 1回の損失が想定を超える。
 *
 * @param capital 資産の総額
 * @param riskRatio 1回の取引で失ってよい割合（0.01 なら1%）
 * @param stopRatio 損切りまでの下落率（0.1 なら10%下で切る）
 */
export function positionSize(
  capital: number,
  riskRatio: number,
  stopRatio: number,
): number {
  if (stopRatio <= 0) return 0;
  return (capital * riskRatio) / stopRatio;
}

/**
 * 一定の割合で取り崩したときに資産がどう推移するか。
 * 運用しながら毎年 withdrawRatio を引き出す。
 */
export function withdrawSeries(
  start: number,
  annualReturn: number,
  withdrawRatio: number,
  years: number,
): number[] {
  const out: number[] = [start];
  let v = start;
  const yearly = start * withdrawRatio;
  for (let y = 1; y <= years; y += 1) {
    v = Math.max(0, (v - yearly) * (1 + annualReturn));
    out.push(v);
  }
  return out;
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
 * 毎回同じ金額を投じたときの平均取得単価（ドルコスト平均法）。
 *
 * 価格が安いときに多く、高いときに少なく買うことになるので、
 * **単純な価格の平均より必ず低くなる**（調和平均になる）。
 * 価格がすべて同じときだけ一致する。
 */
export function averageCostPerUnit(prices: readonly number[], amountEach: number): number {
  const units = prices.reduce((s, p) => s + amountEach / p, 0);
  return (amountEach * prices.length) / units;
}

/** 単純な価格の平均。ドルコスト平均法との比較に使う */
export function mean(values: readonly number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * 目標の配分から、いまの評価額がどれだけずれているか。
 * リバランスの判断に使う「乖離」を出す。
 */
export function driftOf(current: readonly number[], target: readonly number[]): number[] {
  const total = current.reduce((s, v) => s + v, 0);
  return current.map((v, i) => (v / total) * 100 - target[i]);
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

/**
 * 裁定取引（アービトラージ）の手残り。
 *
 * 見えている価格差から、実際にかかる費用を順に引いていく。
 * **0で止めない。** 赤字になることこそがこの計算の要点で、
 * 「差が1%あるから1%儲かる」という読み違いを数字で潰すために使う。
 *
 * 単位はすべて「元手に対する%」。往復ぶんの費用は呼び出し側で合算して渡す
 * （買いと売りで手数料率が違うことがあるため、ここでは足さない）。
 */
export function arbitrageSteps(
  gapPercent: number,
  costs: readonly { label: string; percent: number }[],
): { label: string; percent: number; rest: number }[] {
  let rest = gapPercent;
  return costs.map((c) => {
    rest -= c.percent;
    return { label: c.label, percent: c.percent, rest };
  });
}

/** `arbitrageSteps` を通したあとの手残り（%）。費用が無ければ価格差そのもの */
export function arbitrageNet(
  gapPercent: number,
  costs: readonly { label: string; percent: number }[],
): number {
  return costs.reduce((rest, c) => rest - c.percent, gapPercent);
}

/**
 * 税引き後の手残り（%）。
 *
 * **損のときは引かない。** 暗号資産の利益は雑所得・総合課税で、
 * 損が出ても給与などとは通算できない（第3部22章）。
 * 「勝ったときは税で削られ、負けたときは誰も補ってくれない」を数字で出すためのもの。
 */
export function afterTax(profitPercent: number, taxRatePercent: number): number {
  if (profitPercent <= 0) return profitPercent;
  return profitPercent * (1 - taxRatePercent / 100);
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
