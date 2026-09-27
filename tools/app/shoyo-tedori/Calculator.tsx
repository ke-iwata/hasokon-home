'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TABLE_YEAR_LABEL } from '@/lib/shoyo-gensen-table';
import {
  calcShoyo,
  rateLabel,
  yearEndNoteKind,
  type ShoyoResult,
} from '@/lib/shoyo-tedori';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** 扶養の選択肢。乙欄も同じ選択に入れる（スマホで入力欄を1つ減らすため） */
const DEPENDENT_OPTIONS = [
  ...Array.from({ length: 8 }, (_, n) => ({
    value: String(n),
    label: n === 7 ? '7人以上' : `${n}人`,
  })),
  { value: 'otsu', label: '扶養控除等申告書を出していない（乙欄）' },
];

const AGE_BANDS = [
  { value: 'under40', label: '40歳未満（介護保険料なし）' },
  { value: '40to64', label: '40〜64歳（介護保険料あり）' },
] as const;

const NTA_2523 = 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2523.htm';

const toToday = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * @param buildDate ビルド時刻（ISO文字列）。静的書き出しなので、サーバ描画とハイドレーション直後は
 *   この固定値で年末調整の注記を選び、マウント後に「画面を開いた日」で選び直す
 *   （nenshu-kabe と同じ。2026年にビルドしたHTMLを2027年に開いたとき、注記が古いまま残らないように）。
 */
export default function Calculator({ buildDate }: { buildDate: string }) {
  const [bonusText, setBonusText] = useState('500000');
  const [prevText, setPrevText] = useState('300000');
  const [noPrev, setNoPrev] = useState(false);
  const [dependents, setDependents] = useState('0');
  const [ageBand, setAgeBand] = useState<(typeof AGE_BANDS)[number]['value']>('under40');
  const [priorText, setPriorText] = useState('0');
  const [today, setToday] = useState(() => toToday(new Date(buildDate)));

  useEffect(() => {
    setToday(toToday(new Date()));
  }, []);

  const bonus = Math.max(0, Number(bonusText) || 0);
  const otsu = dependents === 'otsu';
  const r = calcShoyo({
    bonus,
    prevSalary: Math.max(0, Number(prevText) || 0),
    noPrevSalary: noPrev,
    dependents: otsu ? 0 : Number(dependents),
    otsu,
    kaigo: ageBand === '40to64',
    priorBonusThisFiscalYear: Math.max(0, Number(priorText) || 0),
  });

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          賞与の額面（円）
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={bonusText}
            onChange={(e) => setBonusText(e.target.value)}
          />
        </label>
        <label>
          前月の給与の額面（円）
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            賞与の直前の月に支払われた給与（残業代・手当を含む総支給額）。所得税の率がこれで決まります
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={prevText}
            disabled={noPrev}
            onChange={(e) => setPrevText(e.target.value)}
          />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
          <input type="checkbox" checked={noPrev} onChange={(e) => setNoPrev(e.target.checked)} />
          前月に給与が無い
        </label>
        <label>
          扶養親族等の数
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            扶養控除等申告書に書いた配偶者・扶養親族の数（障害者・寡婦・ひとり親・勤労学生に当たる場合は1人ずつ加える）
          </span>
          <select value={dependents} onChange={(e) => setDependents(e.target.value)}>
            {DEPENDENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
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
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
            詳しく（今年度に既に賞与を受け取った方）
          </summary>
          <label style={{ display: 'block', marginTop: 10 }}>
            今年度（4月〜）に既に受け取った賞与の累計（額面・円）
            <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
              健康保険の標準賞与額は年度の累計573万円が上限です。ほとんどの方は0のままで構いません
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={priorText}
              onChange={(e) => setPriorText(e.target.value)}
            />
          </label>
        </details>
      </div>

      {bonus <= 0 ? (
        <div className="note" style={{ marginTop: 18 }}>賞与の額を入力すると手取りが出ます。</div>
      ) : (
        <Results r={r} kaigo={ageBand === '40to64'} otsu={otsu} dependents={dependents} today={today} />
      )}
    </div>
  );
}

function Results({
  r,
  kaigo,
  otsu,
  dependents,
  today,
}: {
  r: ShoyoResult;
  kaigo: boolean;
  otsu: boolean;
  dependents: string;
  today: string;
}) {
  const p = r.premiums;
  const rows: [string, number | null][] = [
    ['賞与（額面）', r.bonus],
    ['− 健康保険料', p.health],
    ...(kaigo ? ([['− 介護保険料', p.kaigo]] as [string, number][]) : []),
    ['− 子ども・子育て支援金', p.shienkin],
    ['− 厚生年金保険料', p.pension],
    ['− 雇用保険料', p.employment],
    ['− 所得税（復興特別所得税込み）', r.incomeTax],
  ];
  const depLabel = otsu ? '乙欄' : `扶養${dependents === '7' ? '7人以上' : `${dependents}人`}`;

  return (
    <>
      {r.net !== null ? (
        <div className="panel" style={{ marginTop: 18 }}>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
            賞与 {yen(r.bonus)} の手取りは
          </div>
          <div className="metric" style={{ marginTop: 4 }}>
            <span className="value">{yen(r.net)}</span>
            <span className="label">（額面の {pct(r.net / r.bonus)}）</span>
          </div>
        </div>
      ) : (
        <div className="note" style={{ marginTop: 18, lineHeight: 1.7 }}>
          <strong>この場合、所得税は算出率の表ではなく月額表で計算します。</strong>
          {r.special === 'no-prev-salary'
            ? '前月に給与が無い（または前月の給与が社会保険料以下の）場合は、'
            : '賞与（社会保険料を引いた額）が前月の給与（同）の10倍を超える場合は、'}
          賞与を6か月（賞与の計算期間が6か月を超えるときは12か月）で割った額をもとに、月額表で税額を求めます。
          このツールでは所得税と手取りの金額は出しません。計算のしかたは{' '}
          <a href={NTA_2523} target="_blank" rel="noopener noreferrer">
            国税庁 タックスアンサー No.2523「賞与に対する源泉徴収」
          </a>
          をご覧ください（社会保険料は下のとおりです）。
        </div>
      )}

      <h3 style={{ marginTop: 22 }}>引かれるものの内訳</h3>
      <dl className="kv">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value === null ? '（月額表で計算）' : value === 0 ? '0円' : yen(value)}</dd>
          </div>
        ))}
        <div>
          <dt>− 住民税</dt>
          <dd>0円（賞与からは引かれません）</dd>
        </div>
        {r.net !== null && (
          <div>
            <dt>＝ 手取り</dt>
            <dd>{yen(r.net)}</dd>
          </div>
        )}
      </dl>

      {r.rate && r.prev && (
        <p className="hint" style={{ marginTop: 8, lineHeight: 1.7 }}>
          所得税の率は<strong>{rateLabel(r.rate.rateMilli)}</strong>（{depLabel}・前月の給与{' '}
          {yen(r.prev.gross)}）。前月の社会保険料 {yen(r.prev.social)}（標準報酬月額{' '}
          {yen(r.prev.standardMonthly)}から計算）を引いた {yen(r.prev.afterSocial)} が、
          {TABLE_YEAR_LABEL}の算出率の表の{otsu ? '乙欄' : '甲欄'}「
          {r.rate.from > 0 ? `${yen(r.rate.from)}以上` : ''}
          {r.rate.below !== null ? `${yen(r.rate.below)}未満` : ''}」の行に当たります。
        </p>
      )}
      <p className="hint" style={{ marginTop: 8, lineHeight: 1.7 }}>
        標準賞与額は {yen(p.standardBonus)}（1,000円未満切り捨て）。雇用保険料だけは標準賞与額ではなく賞与の額そのものにかかります。
        <strong>健康保険料は協会けんぽの全国平均（令和8年度9.9%）</strong>
        で計算しています。都道府県で少し変わり、組合健保・公務員共済の方は率が違います。
      </p>

      {(p.pensionCapped || p.healthCapped) && (
        <div className="note" style={{ marginTop: 10, lineHeight: 1.7 }}>
          <strong>社会保険料の上限に当たっています。</strong>
          {p.pensionCapped && (
            <>
              厚生年金は標準賞与額150万円で頭打ちなので、これを超える部分に厚生年金保険料はかかりません。
            </>
          )}
          {p.healthCapped && (
            <>
              健康保険（介護保険・子ども・子育て支援金を含む）は標準賞与額の年度累計573万円が上限で、この賞与では{' '}
              {yen(p.healthStandardBonus)} までにかかります。
            </>
          )}
        </div>
      )}

      <div className="note" style={{ marginTop: 10, lineHeight: 1.7 }}>
        {yearEndNoteKind(today) === 'r8-year-end-adjustment' ? (
          <>
            <strong>12月の賞与でも源泉徴収は表どおりで、令和8年度改正の減税分は年末調整で精算されます。</strong>
            基礎控除の引上げは令和8年12月1日施行ですが、源泉徴収税額表の改正は令和9年1月1日からです。
            戻る金額は <Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link> で計算できます。
          </>
        ) : (
          <>
            <strong>2027年1月からは令和9年分の算出率の表に切り替わっています。</strong>
            このツールの率は{TABLE_YEAR_LABEL}の表なので、2027年以後に支払われる賞与では実際の率と異なる場合があります。
          </>
        )}
      </div>
    </>
  );
}
