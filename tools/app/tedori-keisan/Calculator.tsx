'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  HEALTH_CAP_INCOME,
  HEALTH_STANDARD_MIN,
  PENSION_CAP_INCOME,
  PENSION_STANDARD_MIN,
  calcTedori,
  type TedoriResult,
} from '@/lib/tedori-keisan';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;
/** 円 → 「394.0万円」。手取りの主役は万円単位なので小数第1位まで出す */
const man = (v: number) => `${(Math.round(v / 1000) / 10).toLocaleString('ja-JP')}万円`;
const manInt = (v: number) => `${Math.round(v / 10_000).toLocaleString('ja-JP')}万円`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const AGE_BANDS = [
  { value: 'under40', label: '40歳未満（介護保険料なし）' },
  { value: '40to64', label: '40〜64歳（介護保険料あり）' },
] as const;

export default function Calculator() {
  const [incomeMan, setIncomeMan] = useState('500');
  const [ageBand, setAgeBand] = useState<(typeof AGE_BANDS)[number]['value']>('under40');

  const income = Math.max(0, Number(incomeMan) || 0) * 10_000;
  const r = calcTedori({ income, kaigo: ageBand === '40to64' });

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          年収（額面・万円）
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            賞与を含めた年間の総支給額
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={incomeMan}
            onChange={(e) => setIncomeMan(e.target.value)}
          />
        </label>
        <label>
          年齢
          <select
            value={ageBand}
            onChange={(e) => setAgeBand(e.target.value as (typeof AGE_BANDS)[number]['value'])}
          >
            {AGE_BANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {income <= 0 ? (
        <div className="note" style={{ marginTop: 18 }}>年収を入力すると手取りが出ます。</div>
      ) : r.netNegative ? (
        <BelowFloor r={r} />
      ) : (
        <Results r={r} kaigo={ageBand === '40to64'} />
      )}
    </div>
  );
}

/**
 * 保険料が年収を上回る年収帯（およそ13万円以下）。
 *
 * 手取りの金額は出さない。マイナスの金額をそのまま出すのは論外だが、
 * 0円に丸めるのも「年収10万円の手取りは0円」という別の嘘になる。
 * 出すべきは金額ではなく理由（下限等級への張り付き）と、
 * そもそも加入するかどうかを判定できるツールへの導線。
 */
function BelowFloor({ r }: { r: TedoriResult }) {
  return (
    <div className="note" style={{ marginTop: 18, lineHeight: 1.7 }}>
      <strong>この年収では手取りの金額を出せません。</strong>
      標準報酬月額には下限があり（健康保険1等級 {yen(HEALTH_STANDARD_MIN)}・厚生年金{' '}
      {yen(PENSION_STANDARD_MIN)}）、報酬がこれを下回っても保険料は下限の額で計算されます。
      そのため社会保険料が年 {yen(r.current.premiums.total)} かかり、年収{' '}
      {man(r.current.gross)} を上回ってしまいます。
      <div style={{ marginTop: 6 }}>
        実際には、この働き方では勤務先の社会保険の加入対象にならないことがほとんどです。加入するかどうかは{' '}
        <Link href="/nenshu-kabe/">年収の壁 計算機</Link>、加入した場合の手取りの変化は{' '}
        <Link href="/hatarakizon/">社会保険 損得計算機</Link> で確認できます。
      </div>
    </div>
  );
}

function Results({ r, kaigo }: { r: TedoriResult; kaigo: boolean }) {
  const t = r.current;

  const rows: [string, number][] = [
    ['年収（額面）', t.gross],
    [
      // 介護保険料は健康保険料に含めて天引きされる。年齢が主要な入力なので、
      // 40〜64歳を選んだときだけラベルにも出す
      kaigo
        ? '− 健康保険料（介護保険料・子ども・子育て支援金を含む）'
        : '− 健康保険料（子ども・子育て支援金を含む）',
      t.premiums.health,
    ],
    ['− 厚生年金保険料', t.premiums.pension],
    ['− 雇用保険料', t.premiums.employment],
    ['− 所得税（復興特別所得税込み）', t.incomeTax],
    ['− 住民税（所得割 + 均等割）', t.residentTax],
  ];

  return (
    <>
      <div className="panel" style={{ marginTop: 18 }}>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          年収 {man(t.gross)} の手取りは
        </div>
        <div className="metric" style={{ marginTop: 4 }}>
          <span className="value">{man(t.net)}</span>
          <span className="label">／年（額面の {pct(r.netRate)}）</span>
        </div>
        <div className="metric" style={{ marginTop: 6 }}>
          <span className="value">{yen(r.monthlyNet)}</span>
          <span className="label">／月（賞与なしで12分割した目安）</span>
        </div>
      </div>

      <div className="panel quiet" style={{ marginTop: 12 }}>
        {r.reformGain > 0 ? (
          <>
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
              2026年（令和8年分）の基礎控除・給与所得控除の引上げにより、改正前の控除額で計算した場合と比べて
            </div>
            <div className="metric" style={{ marginTop: 4 }}>
              <span className="value">＋{yen(r.reformGain)}</span>
              <span className="label">／年 手取りが増えます</span>
            </div>
          </>
        ) : (
          // 改正前の控除額で計算しても税額が変わらない年収帯。
          // 「所得税・住民税がかからないため」とは書けない（年収120万円あたりでは
          // 住民税の均等割はかかるのに、増分は0になる）
          <div style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.7 }}>
            この年収では、改正前（令和7年分）の控除額で計算しても税額が変わらないため、
            <strong>2026年の改正による手取りの増減はありません</strong>。
          </div>
        )}
      </div>

      <h3 style={{ marginTop: 22 }}>引かれるものの内訳（年額）</h3>
      <dl className="kv">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value === 0 ? '—' : yen(value)}</dd>
          </div>
        ))}
        <div>
          <dt>＝ 手取り（年額）</dt>
          <dd>{yen(t.net)}</dd>
        </div>
        <div>
          <dt>引かれる合計</dt>
          <dd>
            {yen(r.totalDeducted)}（額面の {pct(1 - r.netRate)}）
          </dd>
        </div>
      </dl>
      <p className="hint" style={{ marginTop: 8 }}>
        社会保険料は標準報酬月額
        {t.premiums.standardMonthly > 0 && (
          <>
            （{yen(t.premiums.standardMonthly)}・{t.premiums.grade}等級）
          </>
        )}
        にもとづく本人負担分です。<strong>健康保険料は都道府県で少し変わります</strong>
        （このツールは協会けんぽの全国平均・令和8年度9.9%で計算しています）。組合健保・公務員共済は料率が異なります。
      </p>

      <h3 style={{ marginTop: 22 }}>この結果を読むときの注意</h3>
      <div className="note" style={{ lineHeight: 1.7 }}>
        <strong>月々の手取りに改正が効くのは2027年1月からです。</strong>
        令和8年度改正は令和8年12月1日施行で、国税庁は「令和8年11月までの給与等の源泉徴収事務に変更は生じません」と明記しています（源泉徴収税額表の改正は令和9年1月1日施行）。
        つまり<strong>2026年中の給与明細は、まだ改正前の源泉徴収のまま</strong>で、上の「月あたりの手取り」とはずれます。
        2026年分の減税は<strong>12月の年末調整でまとめて戻ります</strong>。戻る金額は{' '}
        <Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link> で計算できます。
      </div>
      <div className="note" style={{ marginTop: 10, lineHeight: 1.7 }}>
        <strong>住民税は「同じ年収が続いた場合」の目安です。</strong>
        住民税は前年の所得に対して課税され、翌年6月からの給与天引きで納めます。
        そのため新社会人の1年目は住民税が引かれず、2年目から引かれ始めます。
        転職・昇給・退職で年収が動いた年も、実際の天引き額とはずれます。
      </div>
      <div className="note" style={{ marginTop: 10, lineHeight: 1.7 }}>
        <strong>賞与がある人は、社会保険料を多めに見積もっています。</strong>
        このツールは年間の総額を12分割して標準報酬月額に当てていますが、実際の賞与の社会保険料は
        標準賞与額として別に計算され、月額とは違う上限がかかります。
        <strong>ずれる向きは社会保険料の取りすぎ側</strong>なので、賞与の割合が大きい人は
        実際の手取りがこの結果より多くなる傾向があります。
      </div>
      {(r.pensionCapped || r.healthCapped) && (
        <div className="note" style={{ marginTop: 10, lineHeight: 1.7 }}>
          <strong>社会保険料が頭打ちに達しています。</strong>
          {r.pensionCapped && (
            <>
              厚生年金は32等級・標準報酬月額65万円が上限で、年収
              {manInt(PENSION_CAP_INCOME)}あたりから、これ以上稼いでも厚生年金保険料は増えません。
            </>
          )}
          {r.healthCapped && (
            <>
              健康保険も50等級・標準報酬月額139万円（年収{manInt(HEALTH_CAP_INCOME)}あたり）が上限です。
            </>
          )}
        </div>
      )}
      <div className="note" style={{ marginTop: 10, lineHeight: 1.7 }}>
        <strong>独身・扶養なし・各種控除なしの目安です。</strong>
        配偶者控除・扶養控除・生命保険料控除・住宅ローン控除などがある方は、実際の税額はこれより少なくなります。
        細かい控除まで入れて計算するには{' '}
        <Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link> をお使いください。
      </div>
    </>
  );
}
