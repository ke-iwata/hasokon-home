'use client';

import Link from 'next/link';
import { useState } from 'react';
import YenField from '@/app/YenField';
import { trackToolUse } from '@/lib/analytics';
import {
  INCOME_TAX_RATES,
  calcSeimeiHokenryoKojo,
  nenmatsuHandoffHref,
  zeigakuMeyasu,
  type CategoryResult,
  type IncomeTaxRate,
} from '@/lib/seimei-hokenryo-kojo';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;
const toYen = (v: string) => Number(v) || 0;

/** 区分ごとに、新旧のどれを採ったかの1行 */
function choiceLabel(c: CategoryResult): string {
  switch (c.choice) {
    case 'none':
      return '支払なし';
    case 'new':
      return c.oldOnly > 0 ? '新だけで計算（いちばん有利）' : '新契約';
    case 'old':
      return c.newOnly > 0 ? '旧だけで計算（いちばん有利）' : '旧契約';
    case 'combined':
      return '新＋旧を合算（いちばん有利）';
  }
}

/**
 * 生命保険料控除の計算UI。ロジックは持たせない（すべて lib/seimei-hokenryo-kojo.ts の純関数）。
 *
 * スマホ 390×844 で「はい／いいえ＋5欄」と結果の1行目が1画面に入るよう、
 * 新旧の欄は2列に並べ、税率の選択と内訳は結果の下に置く。
 */
export default function Calculator() {
  const [under23, setUnder23] = useState(false);
  const [ippanNew, setIppanNew] = useState('');
  const [ippanOld, setIppanOld] = useState('');
  const [kaigo, setKaigo] = useState('');
  const [nenkinNew, setNenkinNew] = useState('');
  const [nenkinOld, setNenkinOld] = useState('');
  const [rate, setRate] = useState<IncomeTaxRate>(5);

  const r = calcSeimeiHokenryoKojo({
    under23,
    ippanNew: toYen(ippanNew),
    ippanOld: toYen(ippanOld),
    kaigo: toYen(kaigo),
    nenkinNew: toYen(nenkinNew),
    nenkinOld: toYen(nenkinOld),
  });
  const tax = zeigakuMeyasu(r.shotoku.total, r.jumin.total, rate);
  const rows = [
    { label: '一般の生命保険料', s: r.shotoku.ippan, j: r.jumin.ippan },
    { label: '介護医療保険料', s: r.shotoku.kaigo, j: r.jumin.kaigo },
    { label: '個人年金保険料', s: r.shotoku.nenkin, j: r.jumin.nenkin },
  ];

  return (
    <div className="card">
      <div className="field">
        <span className="field-label">23歳未満の扶養親族がいる（2026/12/31時点）</span>
        <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={under23 === v}
              onClick={() => setUnder23(v)}
              style={{
                padding: '8px 0',
                fontWeight: under23 === v ? 700 : 400,
                background: under23 === v ? 'var(--accent-soft)' : undefined,
              }}
            >
              {v ? 'はい' : 'いいえ'}
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 4 }}>
          <strong>16歳未満の子も含みます（扶養控除の人数とは数え方が違います）。</strong>
          所得62万円（年収136万円）超の子は含みません。
        </p>
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
        <div className="field-row">
          <YenField label="一般・新契約" value={ippanNew} onChange={setIppanNew} placeholder="例: 60000" />
          <YenField label="一般・旧契約" value={ippanOld} onChange={setIppanOld} placeholder="例: 0" />
        </div>
        <div className="field-row">
          <YenField label="介護医療（新契約）" value={kaigo} onChange={setKaigo} placeholder="例: 30000" />
          <span />
        </div>
        <div className="field-row">
          <YenField label="個人年金・新契約" value={nenkinNew} onChange={setNenkinNew} placeholder="例: 0" />
          <YenField label="個人年金・旧契約" value={nenkinOld} onChange={setNenkinOld} placeholder="例: 0" />
        </div>
      </div>
      <div className="panel" style={{ lineHeight: 1.7 }}>
        <p style={{ margin: 0 }}>
          所得税の控除額
          <strong style={{ fontSize: 'var(--fs-lg)', color: 'var(--accent)' }}> {yen(r.shotoku.total)}</strong>
          ・住民税 <strong>{yen(r.jumin.total)}</strong>
        </p>
        {r.tokureiGain > 0 && (
          <p style={{ margin: '4px 0 0', fontWeight: 700 }}>
            特例で +{yen(r.tokureiGain)}（所得税。特例が無ければ {yen(r.shotokuWithoutTokurei)}）
          </p>
        )}
        {under23 && r.tokureiGain === 0 && r.shotoku.ippan.amount > 0 && (
          <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm)' }}>
            {r.shotoku.ippan.newOnly === 0
              ? '一般の新契約の支払が無いので、特例（上限6万円）は効きません。'
              : '特例を使っても控除額は変わりません（支払額が少ないか、3区分の合計が上限12万円に届いています）。'}
          </p>
        )}
      </div>

      <p className="hint" style={{ marginTop: 8 }}>
        入れる額は控除証明書の「申告額」（年間の支払額。12月まで払う見込み額でよい）。2011年12月31日以前に結んだ契約が旧契約で、旧契約の医療保険は「一般・旧契約」に入れます。
      </p>

      <h3 style={{ marginTop: 22 }}>区分ごとの控除額（保険料控除申告書の順）</h3>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>所得税</th>
            <th>住民税</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td style={{ textAlign: 'left' }}>
                {row.label}
                <span style={{ display: 'block', fontSize: 'var(--fs-xs)', color: 'var(--muted)' }}>
                  {choiceLabel(row.s)}
                </span>
              </td>
              <td>{yen(row.s.amount)}</td>
              <td>{yen(row.j.amount)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ textAlign: 'left' }}>
              合計
              {(r.shotoku.sum > r.shotoku.total || r.jumin.sum > r.jumin.total) && (
                <span style={{ display: 'block', fontSize: 'var(--fs-xs)', color: 'var(--muted)' }}>
                  上限（所得税12万円・住民税7万円）を当てた額
                </span>
              )}
            </td>
            <td>
              <strong>{yen(r.shotoku.total)}</strong>
            </td>
            <td>
              <strong>{yen(r.jumin.total)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ marginTop: 22 }}>税額の目安（控除で軽くなる税金）</h3>
      <div className="field-row">
        <label>
          所得税の税率
          <select value={rate} onChange={(e) => setRate(Number(e.target.value) as IncomeTaxRate)}>
            {INCOME_TAX_RATES.map((v) => (
              <option key={v} value={v}>
                {v}%
              </option>
            ))}
          </select>
        </label>
      </div>
      <p style={{ margin: '8px 0' }}>
        所得税 {yen(tax.incomeTax)}（控除額 × {rate}% × 1.021）＋ 住民税 {yen(tax.residentTax)}（× 10%）＝
        <strong> 年 {yen(tax.total)}</strong>
      </p>
      <p className="hint">
        税率は課税所得で決まります（195万円以下 5%、330万円以下 10%、695万円以下 20%…）。分からなければ 5% のままで目安になります。
      </p>

      <p style={{ margin: '16px 0 12px' }}>
        <Link
          href={nenmatsuHandoffHref(r.shotoku.total)}
          onClick={() => trackToolUse('seimei-hokenryo-kojo', 'to-nenmatsu-chosei')}
          style={{
            display: 'inline-block',
            padding: '10px 18px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          この額を年末調整の計算機で使う →
        </Link>
      </p>

      <div className="note">
        本計算は保険料控除申告書の書き方の目安です。最終的な控除額は勤務先・税務署の案内で確かめてください。
        控除証明書の「申告額」は配当金などを差し引いた後の額です。地震保険料控除はこの計算に含みません。
      </div>
    </div>
  );
}
