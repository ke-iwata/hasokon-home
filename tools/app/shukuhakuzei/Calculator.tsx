'use client';

import { useEffect, useState } from 'react';
import YenField from '@/app/YenField';
import { trackToolUse } from '@/lib/analytics';
import {
  AREAS,
  DEFAULT_AREA,
  MAX_NIGHTS,
  MAX_PEOPLE,
  areaById,
  formatYmdJa,
  quickTable,
  revisionCompare,
  todayInJapan,
  totalTax,
  yen,
  type AreaId,
  type Note,
  type Revision,
} from '@/lib/shukuhakuzei';

const md = (ymd: string) => {
  const [, m, d] = ymd.split('-').map(Number);
  return `${m}/${d}`;
};

/** 境目・上限の1行。値付けをすすめる書き方（「あと◯円安ければ0円」）はしない */
function noteText(note: Note): string {
  switch (note.kind) {
    case 'exempt-below':
      return `${yen(note.threshold)}未満の宿泊は非課税です。`;
    case 'cap':
      return `上限${yen(note.cap)}に達しています。`;
    case 'not-yet':
      return `${formatYmdJa(note.from)}の宿泊分から課税されます。`;
  }
}

function revisionText(r: Revision): string {
  const sign = r.diff > 0 ? `+${yen(r.diff)}` : r.diff < 0 ? `−${yen(-r.diff)}` : '差なし';
  if (r.kind === 'after') {
    return `施行後（${formatYmdJa(r.from)}〜）の宿泊なら1人1泊 ${yen(r.tax)}（改正で ${sign}）`;
  }
  if (r.newlyIntroduced) return `${formatYmdJa(r.until)}までの宿泊は課税されていませんでした（新設）`;
  return `${formatYmdJa(r.until)}までの宿泊なら1人1泊 ${yen(r.tax)}（改正で ${sign}）`;
}

/** 整数の入力欄（人数・泊数） */
function IntField({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
}) {
  return (
    <label style={{ fontSize: 'var(--fs-sm)' }}>
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/**
 * 宿泊税の計算UI。ロジックは持たせない（すべて lib/shukuhakuzei.ts の純関数）。
 *
 * 泊まる日の既定は「今日」。静的書き出しなのでビルド日で描画してから、
 * マウント後に開いた日へ差し替える（サーバ描画とハイドレーションの食い違いを避けるため）。
 */
export default function Calculator() {
  const [areaId, setAreaId] = useState<AreaId>(DEFAULT_AREA);
  const [price, setPrice] = useState('20000');
  const [people, setPeople] = useState('1');
  const [nights, setNights] = useState('1');
  const [checkIn, setCheckIn] = useState(() => todayInJapan());
  useEffect(() => setCheckIn(todayInJapan()), []);

  const area = areaById(areaId);
  const r = totalTax(area, Number(price), Number(people), checkIn, Number(nights));
  const revision = r.ok ? revisionCompare(area, Number(price), checkIn) : null;
  const provisional = r.ok && r.nights.some((n) => n.period.rule.kind === 'rate' && n.period.rule.provisional);
  const table = quickTable(area);

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ fontSize: 'var(--fs-sm)' }}>
          泊まる場所
          <select
            value={areaId}
            onChange={(e) => {
              setAreaId(e.target.value as AreaId);
              trackToolUse('shukuhakuzei', 'area');
            }}
          >
            {AREAS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <YenField
          label="1人1泊の料金（素泊まり）"
          hint="食事代・消費税等は含めない（自治体の定義に従う）"
          value={price}
          onChange={setPrice}
          placeholder="例: 20000"
        />
        <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <IntField label="人数" value={people} onChange={setPeople} max={MAX_PEOPLE} />
          <IntField label="泊数" value={nights} onChange={setNights} max={MAX_NIGHTS} />
        </div>
        <label style={{ fontSize: 'var(--fs-sm)' }}>
          泊まる日（チェックイン）
          <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </label>
      </div>

      <div className="panel" style={{ lineHeight: 1.7 }}>
        {!r.ok ? (
          <p style={{ margin: 0 }}>{r.error}</p>
        ) : (
          <>
            <p style={{ margin: 0 }}>
              <strong style={{ fontSize: 'var(--fs-lg)' }}>
                {r.uniformPerNight !== null
                  ? `宿泊税は1人1泊 ${yen(r.uniformPerNight)}、合計 ${yen(r.total)}`
                  : `宿泊税は合計 ${yen(r.total)}`}
              </strong>
              （{people}人 × {nights}泊）
            </p>
            {r.uniformPerNight === null && (
              <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm)' }}>
                1人あたり：{r.nights.map((n) => `${md(n.date)}泊 ${yen(n.tax)}`).join('・')}
                （1泊ごとに宿泊日の税率）
              </p>
            )}
            {revision && <p style={{ margin: '4px 0 0', fontWeight: 700 }}>{revisionText(revision)}</p>}
            {r.note && <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm)' }}>{noteText(r.note)}</p>}
            {provisional && (
              <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-xs)', color: 'var(--muted)' }}>
                東京都の3%の端数処理・上限は条例で確認中です。ここでは1円未満切り捨て・上限なしで計算しています。
              </p>
            )}
          </>
        )}
      </div>

      {[...area.exemptions, ...area.notes].map((t) => (
        <p key={t} className="hint" style={{ marginTop: 6 }}>
          {t}
        </p>
      ))}

      <details style={{ marginTop: 14 }}>
        <summary>{area.name}の料金ごとの早見表</summary>
        <table>
          <thead>
            <tr>
              <th>1人1泊の料金</th>
              {table.columns.map((c) => (
                <th key={c.from}>
                  {c.to ? `〜${formatYmdJa(c.to)}` : `${formatYmdJa(c.from)}〜`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.price}>
                <td style={{ textAlign: 'left' }}>{yen(row.price)}</td>
                {row.taxes.map((t, i) => (
                  <td key={i}>{yen(t)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
