import { describe, expect, it } from 'vitest';
import {
  BUSINESS_TYPES,
  CONSUMPTION_TAX_RATE,
  DATA_CHECKED_AT,
  KANI_SALES_LIMIT,
  OPEN_ENDED_YEAR,
  PURCHASE_TRANSITION,
  PURCHASE_TRANSITION_CAP,
  SPECIAL_RATES,
  SPECIAL_SALES_LIMIT,
  TRADE_OFFS,
  YEARS,
  businessTypeById,
  compareMethods,
  filingDeadline,
  formatDate,
  formatDiff,
  formatManYen,
  formatPercent,
  formatYen,
  hayamihyo,
  kaniDeadline,
  methodLabel,
  netSalesOf,
  normalizePurchaseRate,
  parseYmd,
  rateOfSalesTaxFor,
  salesTaxOf,
  shiftIfClosed,
  specialFor,
  toYmd,
  yearDef,
  type InvoiceInput,
} from '@/lib/invoice-nozeigaku';

/**
 * インボイス 納税額 比較計算機のテスト。
 *
 * 仕様: docs/features/invoice-2wari-tokurei-shuryo.md
 *
 * このツールで一番こわいのは3つ。
 *
 * 1. **どの年にどの特例が使えるかを取り違えること** — 2割特例は2026年分が最後、
 *    3割特例は個人事業者の2027年・2028年分だけ。ここを間違えると、
 *    使えない方式を「これが一番安い」と勧めてしまう
 * 2. **届出期限の特則を落とすこと** — 原則（前年12月31日）だけを見た人は
 *    年が明けた時点で「もう手遅れ」と誤解して1年損をする。
 *    特則の期限が原則より必ずあとであることを固定する
 * 3. **一次資料の数値の写し間違い** — みなし仕入率6区分・特例の割合・
 *    経過措置の控除割合は国税庁の資料をそのまま焼き込む
 */

/** 素直な入力を1つ作る。個別のテストで必要なところだけ上書きする */
function input(over: Partial<InvoiceInput> = {}): InvoiceInput {
  return {
    year: 2027,
    sales: 5_500_000,
    salesIncludesTax: true,
    businessType: 'type5',
    purchaseRatePercent: 20,
    ...over,
  };
}

describe('一次資料から写した値', () => {
  it('標準税率は10%', () => {
    expect(CONSUMPTION_TAX_RATE).toBe(0.1);
  });

  it('2割特例は売上税額の20%、3割特例は30%', () => {
    expect(SPECIAL_RATES.niwari).toBe(0.2);
    expect(SPECIAL_RATES.sanwari).toBe(0.3);
  });

  it('みなし仕入率は6区分で 90/80/70/60/50/40%', () => {
    expect(BUSINESS_TYPES.map((t) => t.deemedRate)).toEqual([0.9, 0.8, 0.7, 0.6, 0.5, 0.4]);
    expect(BUSINESS_TYPES.map((t) => t.label)).toEqual([
      '第１種事業',
      '第２種事業',
      '第３種事業',
      '第４種事業',
      '第５種事業',
      '第６種事業',
    ]);
  });

  it('基準期間の売上の上限は特例が1,000万円・簡易課税が5,000万円', () => {
    expect(SPECIAL_SALES_LIMIT).toBe(10_000_000);
    expect(KANI_SALES_LIMIT).toBe(50_000_000);
  });

  it('買手側の経過措置は 80 → 70 → 50 → 30% で、期間が途切れず並んでいる', () => {
    expect(PURCHASE_TRANSITION.map((p) => p.rate)).toEqual([0.8, 0.7, 0.5, 0.3]);
    expect(PURCHASE_TRANSITION[1].from).toBe('2026-10-01');
    for (let i = 1; i < PURCHASE_TRANSITION.length; i += 1) {
      const prevEnd = parseYmd(PURCHASE_TRANSITION[i - 1].until);
      const start = parseYmd(PURCHASE_TRANSITION[i].from);
      expect(start.getTime() - prevEnd.getTime()).toBe(24 * 60 * 60 * 1000);
    }
  });

  it('経過措置の控除限度額は1億円', () => {
    expect(PURCHASE_TRANSITION_CAP).toBe(100_000_000);
  });

  it('データ最終確認日は YYYY-MM-DD 形式', () => {
    expect(DATA_CHECKED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('年ごとに使える特例', () => {
  /**
   * **`YEARS` に載っている年は、どの関数を通しても落ちないこと。**
   *
   * `specialFor()` を「画面の選択肢の表」から引く実装にしていたため、
   * `kaniDeadline(2026)` が前年（選択肢に無い2025年）を尋ねた瞬間に throw し、
   * 「2026年分」を選ぶとページごと落ちていた（PR #158 のレビューで発覚）。
   * 個別の年を足すだけだと `YEARS` に行を足したときに同じ穴が空くので、
   * **表を回して**不変条件として固定する。
   */
  it('YEARS の全ての年で kaniDeadline / compareMethods / yearDef が落ちない', () => {
    for (const y of YEARS) {
      expect(() => kaniDeadline(y.year), `kaniDeadline(${y.year})`).not.toThrow();
      expect(() => yearDef(y.year), `yearDef(${y.year})`).not.toThrow();
      expect(() => compareMethods(input({ year: y.year })), `compare(${y.year})`).not.toThrow();
    }
  });

  it('特例の判定は前年・翌年など YEARS の外の年でも答えられる', () => {
    // 届出期限の判定は必ず前年を尋ねる。選択肢の外に出ても落ちてはいけない
    expect(() => specialFor(2020)).not.toThrow();
    expect(() => specialFor(2100)).not.toThrow();
    expect(specialFor(2020)).toBeNull();
    expect(specialFor(2100)).toBeNull();
  });

  it('2割特例は令和5年分〜令和8年分（2023〜2026年）', () => {
    expect(specialFor(2022)).toBeNull();
    expect(specialFor(2023)).toBe('niwari');
    expect(specialFor(2025)).toBe('niwari');
    expect(specialFor(2026)).toBe('niwari');
    expect(specialFor(2027)).not.toBe('niwari');
    expect(specialFor(2028)).not.toBe('niwari');
  });

  it('3割特例が使えるのは2027年分・2028年分の2年間だけ', () => {
    expect(specialFor(2027)).toBe('sanwari');
    expect(specialFor(2028)).toBe('sanwari');
    expect(specialFor(2029)).toBeNull();
  });

  it('2029年分以降は特例が無く、年を先へ延ばしても顔ぶれが変わらない', () => {
    expect(specialFor(OPEN_ENDED_YEAR)).toBeNull();
    expect(specialFor(2035)).toBeNull();
    expect(yearDef(2035)).toEqual(yearDef(OPEN_ENDED_YEAR));
  });

  it('対象外の年は投げる（黙って特例なしにしない）', () => {
    expect(() => yearDef(2025)).toThrow();
  });

  it('YEARS は特例の年を持たない（specialFor が唯一の情報源）', () => {
    // 同じことを2箇所に書くと片方だけ直したときに黙って食い違う。
    // 表の側に `special` を復活させないための番人
    for (const y of YEARS) {
      expect(y, `YEARS[${y.year}]`).not.toHaveProperty('special');
    }
  });

  it('YEARS は年の昇順で、元号の表記が暦年と対応している', () => {
    for (let i = 1; i < YEARS.length; i += 1) {
      expect(YEARS[i].year).toBeGreaterThan(YEARS[i - 1].year);
    }
    expect(YEARS.find((y) => y.year === 2026)?.eraLabel).toBe('令和8年分');
    expect(YEARS.find((y) => y.year === 2029)?.eraLabel).toBe('令和11年分');
  });
});

describe('売上税額', () => {
  it('税込550万円は税抜500万円・売上税額50万円', () => {
    const net = netSalesOf(5_500_000, true);
    expect(net).toBe(5_000_000);
    expect(salesTaxOf(net)).toBe(500_000);
  });

  it('税抜で入れたときはそのまま使う', () => {
    expect(netSalesOf(5_000_000, false)).toBe(5_000_000);
  });

  it('0以下・不正な入力は0にする（NaNを金額に出さない）', () => {
    expect(netSalesOf(0, true)).toBe(0);
    expect(netSalesOf(-100, false)).toBe(0);
    expect(netSalesOf(Number.NaN, true)).toBe(0);
    expect(salesTaxOf(Number.NaN)).toBe(0);
  });

  it('割り切れない税込額は円未満切捨て', () => {
    expect(netSalesOf(1_000_000, true)).toBe(909_090);
    expect(salesTaxOf(909_090)).toBe(90_909);
  });
});

describe('方式ごとの割合', () => {
  const type2 = businessTypeById('type2');

  it('簡易課税は 1 − みなし仕入率', () => {
    expect(rateOfSalesTaxFor('kani', type2, 0.2)).toBeCloseTo(0.2, 10);
    expect(rateOfSalesTaxFor('kani', businessTypeById('type6'), 0.2)).toBeCloseTo(0.6, 10);
  });

  it('本則課税は 1 − 実際の仕入割合', () => {
    expect(rateOfSalesTaxFor('honsoku', type2, 0.35)).toBeCloseTo(0.65, 10);
  });

  it('特例は仕入割合にも業種にも左右されない', () => {
    expect(rateOfSalesTaxFor('niwari', type2, 0.9)).toBe(0.2);
    expect(rateOfSalesTaxFor('sanwari', businessTypeById('type1'), 0)).toBe(0.3);
  });

  it('仕入割合の正規化は %→小数。負・不正な値は0', () => {
    expect(normalizePurchaseRate(30)).toBeCloseTo(0.3, 10);
    expect(normalizePurchaseRate(-5)).toBe(0);
    expect(normalizePurchaseRate(Number.NaN)).toBe(0);
  });

  it('方式名は4つとも引ける', () => {
    expect(methodLabel('niwari')).toBe('2割特例');
    expect(methodLabel('sanwari')).toBe('3割特例');
    expect(methodLabel('kani')).toBe('簡易課税');
    expect(methodLabel('honsoku')).toBe('本則課税');
  });
});

describe('4方式の比較', () => {
  it('売上税額50万円・第5種・仕入20%のとき、それぞれの納税額が出る（2027年分）', () => {
    const r = compareMethods(input());
    expect(r.salesTax).toBe(500_000);

    const tax = (id: string) => r.methods.find((m) => m.id === id)!.tax;
    expect(tax('sanwari')).toBe(150_000); // 50万 × 30%
    expect(tax('kani')).toBe(250_000); // 50万 ×（1 − 50%）
    expect(tax('honsoku')).toBe(400_000); // 50万 ×（1 − 20%）
    expect(tax('niwari')).toBe(100_000); // 額は出すが available は false
  });

  it('2027年分では2割特例が選べず、理由が付く', () => {
    const r = compareMethods(input({ year: 2027 }));
    const niwari = r.methods.find((m) => m.id === 'niwari')!;
    expect(niwari.available).toBe(false);
    expect(niwari.unavailableReason).toContain('2026年分が最後');
    expect(r.ranked.some((m) => m.id === 'niwari')).toBe(false);
  });

  it('2026年分では2割特例が選べ、3割特例が選べない', () => {
    const r = compareMethods(input({ year: 2026 }));
    expect(r.methods.find((m) => m.id === 'niwari')!.available).toBe(true);
    expect(r.methods.find((m) => m.id === 'sanwari')!.available).toBe(false);
    expect(r.best.id).toBe('niwari');
  });

  it('2029年分以降は特例が両方とも選べず、簡易課税と本則課税だけになる', () => {
    const r = compareMethods(input({ year: 2029 }));
    expect(r.ranked.map((m) => m.id).sort()).toEqual(['honsoku', 'kani']);
  });

  it('第2種（小売業・みなし仕入率80%）は3割特例より簡易課税のほうが安い', () => {
    // 国税庁 問117-3 の設例（小売業なら簡易課税のほうが納付額が少なくなる）
    const r = compareMethods(input({ year: 2027, businessType: 'type2' }));
    expect(r.best.id).toBe('kani');
    expect(r.methods.find((m) => m.id === 'kani')!.tax).toBe(100_000);
    expect(r.methods.find((m) => m.id === 'sanwari')!.tax).toBe(150_000);
  });

  it('第6種（不動産業・みなし仕入率40%）は3割特例のほうが安い', () => {
    const r = compareMethods(input({ year: 2027, businessType: 'type6' }));
    expect(r.best.id).toBe('sanwari');
  });

  it('仕入れが多いと本則課税がいちばん安くなる', () => {
    const r = compareMethods(input({ year: 2027, businessType: 'type5', purchaseRatePercent: 85 }));
    expect(r.best.id).toBe('honsoku');
  });

  it('仕入れが売上を上回ると本則課税はマイナス（還付）になり、0で丸めない', () => {
    const r = compareMethods(input({ purchaseRatePercent: 150 }));
    const honsoku = r.methods.find((m) => m.id === 'honsoku')!;
    expect(honsoku.tax).toBeLessThan(0);
    expect(r.best.id).toBe('honsoku');
  });

  it('基準期間の売上が1,000万円を超えると特例が選べなくなる', () => {
    const r = compareMethods(input({ year: 2027, sales: 12_000_000, salesIncludesTax: false }));
    const sanwari = r.methods.find((m) => m.id === 'sanwari')!;
    expect(sanwari.available).toBe(false);
    expect(sanwari.unavailableReason).toContain('1,000万');
  });

  it('1,000万円ちょうどなら特例は選べる（境界は「以下」）', () => {
    const r = compareMethods(input({ year: 2027, sales: 10_000_000, salesIncludesTax: false }));
    expect(r.methods.find((m) => m.id === 'sanwari')!.available).toBe(true);
  });

  it('基準期間の売上が5,000万円を超えると簡易課税が選べなくなる', () => {
    const r = compareMethods(input({ year: 2029, sales: 60_000_000, salesIncludesTax: false }));
    const kani = r.methods.find((m) => m.id === 'kani')!;
    expect(kani.available).toBe(false);
    expect(r.ranked.map((m) => m.id)).toEqual(['honsoku']);
    expect(r.best.id).toBe('honsoku');
  });

  it('5,000万円ちょうどなら簡易課税は選べる（境界は「以下」）', () => {
    const r = compareMethods(input({ year: 2029, sales: 50_000_000, salesIncludesTax: false }));
    expect(r.methods.find((m) => m.id === 'kani')!.available).toBe(true);
  });

  it('売上が0なら empty になり、金額はすべて0', () => {
    const r = compareMethods(input({ sales: 0 }));
    expect(r.empty).toBe(true);
    expect(r.salesTax).toBe(0);
    for (const m of r.methods) expect(m.tax).toBe(0);
    expect(r.best).toBeDefined();
  });

  it('本則が有利になる仕入割合の分岐点が出る（第5種・2027年分なら70%）', () => {
    // 3割特例（30%）と釣り合うのは 1 − 0.3 = 70%
    const r = compareMethods(input({ year: 2027, businessType: 'type5' }));
    expect(r.honsokuBreakEvenPercent).toBe(70);
  });

  it('分岐点は「本則以外でいちばん安い方式」を基準にする（第2種なら簡易課税の20%が相手）', () => {
    const r = compareMethods(input({ year: 2027, businessType: 'type2' }));
    expect(r.honsokuBreakEvenPercent).toBe(80);
  });

  it('本則しか選べないときは分岐点を出さない', () => {
    const r = compareMethods(input({ year: 2029, sales: 60_000_000, salesIncludesTax: false }));
    expect(r.honsokuBreakEvenPercent).toBeNull();
  });

  it('ranked は選べるものだけを納税額の少ない順に並べる', () => {
    const r = compareMethods(input({ year: 2027 }));
    expect(r.ranked.every((m) => m.available)).toBe(true);
    for (let i = 1; i < r.ranked.length; i += 1) {
      expect(r.ranked[i].tax).toBeGreaterThanOrEqual(r.ranked[i - 1].tax);
    }
    expect(r.best).toBe(r.ranked[0]);
  });

  /**
   * 第3種の簡易課税は 1 − 0.7 = 30% で、3割特例とちょうど同額になる。
   * `best` だけを見て「最安」の印を付けると、同額の片方にだけ印が付いて
   * 優劣があるように見える。このツール自身が「第3種は3割特例と同じであって
   * 安いではない」と言っている以上、画面でそれを裏切らないこと。
   */
  it('同額のときは最安が複数返る（第3種・2027年分は3割特例と簡易課税が同額）', () => {
    const r = compareMethods(input({ year: 2027, businessType: 'type3' }));
    expect(r.methods.find((m) => m.id === 'kani')!.tax).toBe(
      r.methods.find((m) => m.id === 'sanwari')!.tax,
    );
    expect([...r.bestIds].sort()).toEqual(['kani', 'sanwari']);
  });

  it('同額が無いときの bestIds は1つだけ', () => {
    const r = compareMethods(input({ year: 2027, businessType: 'type5' }));
    expect(r.bestIds).toEqual(['sanwari']);
  });

  it('bestIds は best と同額の、選べる方式だけを含む', () => {
    for (const year of YEARS.map((y) => y.year)) {
      for (const type of BUSINESS_TYPES.map((t) => t.id)) {
        const r = compareMethods(input({ year, businessType: type }));
        expect(r.bestIds).toContain(r.best.id);
        for (const id of r.bestIds) {
          const m = r.methods.find((x) => x.id === id)!;
          expect(m.available, `${year}/${type}/${id}`).toBe(true);
          expect(m.tax).toBe(r.best.tax);
        }
      }
    }
  });

  it('選べない方式にも「使える条件」の説明が付く', () => {
    const r = compareMethods(input({ year: 2029 }));
    for (const m of r.methods) expect(m.condition.length).toBeGreaterThan(0);
  });
});

describe('簡易課税制度選択届出書の提出期限', () => {
  it('原則は適用したい年の前年12月31日', () => {
    expect(kaniDeadline(2027).principle).toBe('2026-12-31');
    expect(kaniDeadline(2029).principle).toBe('2028-12-31');
  });

  /**
   * 国税庁 インボイスQ&A 問117 の設例そのもの。
   * 「令和7年分まで2割特例により申告を行った個人事業者が令和8年分の確定申告期限までに
   * 『消費税簡易課税制度選択届出書（令和8年分から適用を受ける旨を記載したもの）』を
   * 提出すれば、令和8年分から簡易課税制度の適用を受けることができます」
   *
   * このページの主題そのものの年で、届出期限パネルの価値がいちばん高いところ。
   * ここが throw していた（PR #158 のレビューで発覚）。
   */
  it('2026年分から簡易課税にするなら、特則で2027年3月31日まで間に合う（問117の設例）', () => {
    const d = kaniDeadline(2026);
    expect(d.hasSpecial).toBe(true);
    expect(d.previousSpecial).toBe('niwari'); // 2025年分は2割特例が使えた年
    expect(d.principle).toBe('2025-12-31');
    expect(d.special).toBe('2027-03-31');
  });

  it('2027年分から簡易課税にするなら、特則で2028年3月31日まで間に合う', () => {
    // 2026年分に2割特例 → その翌課税期間（2027年分）に係る確定申告期限まで
    const d = kaniDeadline(2027);
    expect(d.hasSpecial).toBe(true);
    expect(d.previousSpecial).toBe('niwari');
    expect(d.special).toBe('2028-03-31');
  });

  it('2028年分は前年に3割特例を使っているので特則が効く', () => {
    const d = kaniDeadline(2028);
    expect(d.previousSpecial).toBe('sanwari');
    expect(d.special).toBe(filingDeadline(2028));
  });

  it('2029年分から簡易課税にするなら期限は2030年4月1日（3月31日が日曜のため翌日）', () => {
    // 国税庁「令和8年度税制改正について」の図：令和11年分は令和12年4月1日まで
    const d = kaniDeadline(2029);
    expect(d.previousSpecial).toBe('sanwari');
    expect(d.special).toBe('2030-04-01');
  });

  it('前年に特例を使っていない年は特則が無い（原則だけ）', () => {
    const d = kaniDeadline(2031);
    expect(d.hasSpecial).toBe(false);
    expect(d.special).toBeNull();
    expect(d.extraDays).toBe(0);
  });

  it('特則の期限は必ず原則よりあと（これが「もう手遅れ」の誤解を防ぐ肝）', () => {
    for (const year of [2026, 2027, 2028, 2029, 2030]) {
      const d = kaniDeadline(year);
      if (!d.special) continue;
      expect(parseYmd(d.special).getTime()).toBeGreaterThan(parseYmd(d.principle).getTime());
      expect(d.extraDays).toBeGreaterThan(90);
    }
  });
});

describe('確定申告期限のずらし', () => {
  it('平日ならその日のまま', () => {
    expect(shiftIfClosed('2028-03-31')).toBe('2028-03-31'); // 金曜
  });

  it('日曜なら翌日', () => {
    expect(shiftIfClosed('2030-03-31')).toBe('2030-04-01'); // 日曜 → 月曜
  });

  it('土曜なら翌々日（翌日の日曜も休日なので、さらに翌日）', () => {
    expect(shiftIfClosed('2029-03-31')).toBe('2029-04-02'); // 土曜 → 月曜
  });

  it('12月29〜31日も「これらの日の翌日」の対象', () => {
    expect(shiftIfClosed('2026-12-29')).toBe('2027-01-01');
  });

  it('個人事業者の確定申告期限は翌年3月31日を起点にする', () => {
    expect(filingDeadline(2027)).toBe('2028-03-31');
    expect(filingDeadline(2029)).toBe('2030-04-01');
  });

  it('日付の往復で値が変わらない', () => {
    for (const iso of ['2026-01-01', '2028-02-29', '2030-12-31']) {
      expect(toYmd(parseYmd(iso))).toBe(iso);
    }
  });
});

describe('業種別の早見表', () => {
  it('6区分すべてが出る', () => {
    expect(hayamihyo()).toHaveLength(6);
  });

  it('みなし仕入率が高い区分ほど簡易課税の納税額の割合が低い', () => {
    const rows = hayamihyo();
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].kaniRate).toBeGreaterThan(rows[i - 1].kaniRate);
    }
  });

  it('3割特例より簡易課税が安いのは第1種・第2種だけ（第3種はちょうど同じ30%）', () => {
    const winners = hayamihyo()
      .filter((r) => r.kaniBeatsSanwari)
      .map((r) => r.type.id);
    expect(winners).toEqual(['type1', 'type2']);
    // 「70%以上なら簡易課税が有利」と丸めると第3種で誤案内になる。同率であることを固定する
    expect(hayamihyo().find((r) => r.type.id === 'type3')!.kaniRate).toBe(SPECIAL_RATES.sanwari);
  });

  it('2割特例より簡易課税が安いのは第1種だけ（第2種は同じ20%で「安い」ではない）', () => {
    const winners = hayamihyo()
      .filter((r) => r.kaniBeatsNiwari)
      .map((r) => r.type.id);
    expect(winners).toEqual(['type1']);
  });
});

describe('納税額以外の判断材料', () => {
  it('簡易課税の2年縛りと、本則課税の事務負担の両方が入っている', () => {
    expect(TRADE_OFFS.some((t) => t.method === 'kani' && t.title.includes('2年'))).toBe(true);
    expect(TRADE_OFFS.some((t) => t.method === 'honsoku')).toBe(true);
  });

  it('すべての項目に本文がある', () => {
    for (const t of TRADE_OFFS) expect(t.body.length).toBeGreaterThan(20);
  });
});

describe('表示のための整形', () => {
  it('金額は3桁区切りに「円」', () => {
    expect(formatYen(1_234_567)).toBe('1,234,567円');
    expect(formatYen(0)).toBe('0円');
  });

  it('制度の閾値は万円単位で書く（条文と照合できるように）', () => {
    expect(formatManYen(SPECIAL_SALES_LIMIT)).toBe('1,000万円');
    expect(formatManYen(KANI_SALES_LIMIT)).toBe('5,000万円');
  });

  it('割合は小数第1位まで', () => {
    expect(formatPercent(0.2)).toBe('20%');
    expect(formatPercent(0.055)).toBe('5.5%');
  });

  it('日付は和文', () => {
    expect(formatDate('2028-03-31')).toBe('2028年3月31日');
  });

  it('差額は符号つき。0は ±0円', () => {
    expect(formatDiff(1000)).toBe('+1,000円');
    expect(formatDiff(-1000)).toBe('−1,000円');
    expect(formatDiff(0)).toBe('±0円');
  });
});
