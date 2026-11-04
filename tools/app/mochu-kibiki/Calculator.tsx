'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  dashidoki,
  dashidokiText,
  EXTRA_LABELS,
  formatMonthDay,
  hoyoDates,
  kibiki,
  kibikiRow,
  kinship,
  mochuNewYear,
  mochuScope,
  OFUKU_MAX,
  RELATIONS,
  relationById,
  SELF_PRIMARY_COUNT,
  todayInTokyo,
  type HoyoCount,
  type Matsunouchi,
  type Relation,
  type RelationId,
  type Side,
} from '@/lib/mochu-kibiki';
import { trackToolUse } from '@/lib/analytics';

const SLUG = 'mochu-kibiki';

const choiceStyle = (on: boolean) => ({
  padding: '10px 6px',
  fontSize: 'var(--fs-sm)',
  fontWeight: on ? 700 : 400,
  background: on ? 'var(--accent-soft)' : 'var(--surface)',
  border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
  borderRadius: 10,
  color: 'inherit',
  cursor: 'pointer',
});

const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } as const;

/** カードの見出し。「法令」「一般的な目安」のバッジで値の性質を分ける */
function CardHead({ title, badge }: { title: string; badge: '法令' | '一般的な目安' }) {
  return (
    <p style={{ margin: '0 0 8px', fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {title}
      <span className="chip">{badge}</span>
    </p>
  );
}

function Card({ quiet, children }: { quiet?: boolean; children: ReactNode }) {
  return <div className={quiet ? 'panel quiet' : 'panel'}>{children}</div>;
}

/** 親等の小さな図：自分 →（上る世代）→ 共通の祖先 →（下る世代）→ 亡くなった方 */
function DegreeDiagram({ r }: { r: Relation }) {
  if (r.isSpouse) return null;
  const steps: string[] = [r.side === 'spouse' ? '配偶者' : '自分'];
  for (let i = 0; i < r.up; i++) steps.push('↑');
  if (r.up > 0 && r.down > 0) steps.push('共通の祖先');
  for (let i = 0; i < r.down; i++) steps.push('↓');
  steps.push(r.label.replace(/（.*）$/, ''));
  return (
    <p className="hint" style={{ margin: '6px 0 0' }} aria-hidden="true">
      {steps.join(' ')}
      {r.viaSpouse && '（の配偶者）'}
    </p>
  );
}

export default function Calculator({ buildDay }: { buildDay: string }) {
  const [side, setSide] = useState<Side>('self');
  const [relId, setRelId] = useState<RelationId>('fubo');
  const [meinichi, setMeinichi] = useState('');
  const [seikei, setSeikei] = useState(false);
  const [daishu, setDaishu] = useState(false);
  // サーバ描画とハイドレーション直後はビルド日。マウント後に開いた日（Asia/Tokyo）へ差し替える
  const [today, setToday] = useState(buildDay);
  const [start, setStart] = useState(buildDay);
  const [ofuku, setOfuku] = useState('0');
  const [matsunouchi, setMatsunouchi] = useState<Matsunouchi>(7);
  const [count, setCount] = useState<HoyoCount>('meinichi');

  useEffect(() => {
    const t = todayInTokyo();
    setToday(t);
    setStart(t);
  }, []);

  const r = relationById(relId);
  const k = kinship(r);
  const scope = mochuScope(r);
  const row = kibikiRow(r);
  const validMeinichi = /^\d{4}-\d{2}-\d{2}$/.test(meinichi) ? meinichi : '';
  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : today;
  const kb = kibiki(r, { seikei, daishu, start: validStart, ofuku: Number(ofuku) || 0 });
  const d = validMeinichi ? dashidoki(validMeinichi, today, matsunouchi) : null;
  const dt = d ? dashidokiText(d) : null;
  const hoyo = validMeinichi ? hoyoDates(validMeinichi, count) : [];

  const list = RELATIONS.filter((x) => x.side === side);
  const primary = side === 'self' ? list.slice(0, SELF_PRIMARY_COUNT) : list;
  const others = side === 'self' ? list.slice(SELF_PRIMARY_COUNT) : [];
  const otherSelected = others.some((x) => x.id === relId);

  const pick = (id: RelationId) => {
    setRelId(id);
    trackToolUse(SLUG, 'relation');
  };

  const button = (x: Relation) => (
    <button key={x.id} type="button" aria-pressed={relId === x.id} onClick={() => pick(x.id)} style={choiceStyle(relId === x.id)}>
      {x.label}
    </button>
  );

  return (
    <div className="card">
      <div className="field">
        <span className="field-label">亡くなった方</span>
        <div style={{ ...grid2, marginBottom: 10 }} role="group" aria-label="自分側・配偶者側">
          {(
            [
              ['self', '自分側'],
              ['spouse', '配偶者側'],
            ] as [Side, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={side === v}
              onClick={() => {
                setSide(v);
                setRelId(v === 'self' ? 'fubo' : 'gi-fubo');
              }}
              style={{ ...choiceStyle(side === v), fontSize: 'inherit' }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={grid2}>{primary.map(button)}</div>
        {others.length > 0 && (
          <details open={otherSelected} style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', padding: '6px 0' }}>ほかの続柄</summary>
            <div style={{ ...grid2, marginTop: 6 }}>{others.map(button)}</div>
          </details>
        )}
      </div>

      <div className="field-row">
        <label>
          命日（亡くなった日）
          <input
            type="date"
            value={meinichi}
            min="1950-01-01"
            max="2100-12-31"
            onChange={(e) => setMeinichi(e.target.value)}
            onBlur={() => trackToolUse(SLUG, 'meinichi')}
          />
        </label>
      </div>

      <Card>
        <CardHead title="親等と関係" badge="法令" />
        <p style={{ margin: 0 }}>
          <strong>{r.label}</strong>は<strong>{k.label}</strong>です。
          {k.isRelative ? '民法上の親族にあたります（725条）。' : '民法上の親族にはあたりません（姻族は3親等まで。725条）。'}
        </p>
        <DegreeDiagram r={r} />
      </Card>

      <Card>
        <CardHead title="喪中はがき" badge="一般的な目安" />
        <p style={{ margin: 0 }}>
          {scope === 'usual' ? (
            <>
              <strong>一般的に出します</strong>（自分または配偶者の二親等以内）。
            </>
          ) : (
            <>
              <strong>同居していたか、付き合いの深さで決めてよい</strong>とされます（三親等以上・親族外は出さないことも多い）。
            </>
          )}
        </p>
        {validMeinichi ? (
          <>
            <p style={{ margin: '8px 0 0' }}>
              喪中の正月は<strong>{mochuNewYear(validMeinichi)}年</strong>です（命日から1年以内に迎える正月）。
            </p>
            {dt && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <p style={{ margin: '0 0 4px', fontWeight: 700 }}>出しどき：{dt.head}</p>
                <p style={{ margin: 0 }}>{dt.body}</p>
                {dt.note && (
                  <p className="hint" style={{ margin: '6px 0 0' }}>
                    {dt.note}
                  </p>
                )}
              </div>
            )}
            <label style={{ display: 'block', marginTop: 10 }}>
              松の内
              <select value={matsunouchi} onChange={(e) => setMatsunouchi(Number(e.target.value) as Matsunouchi)}>
                <option value={7}>1月7日まで（多くの地域）</option>
                <option value={15}>1月15日まで（関西の一部など）</option>
              </select>
            </label>
          </>
        ) : (
          <p className="hint" style={{ margin: '8px 0 0' }}>
            命日を入れると、喪中の正月と喪中はがきの出しどき・寒中見舞いの期間を出します。
          </p>
        )}
      </Card>

      <Card>
        <CardHead title="忌引き（国家公務員の基準）" badge="法令" />
        {kb ? (
          <>
            <p style={{ margin: 0 }}>
              <strong>
                {kb.totalDays}日（{formatMonthDay(kb.start)}〜{formatMonthDay(kb.end)}）
              </strong>
            </p>
            <p className="hint" style={{ margin: '4px 0 0' }}>
              別表第二「{kb.row.label}」{kb.baseDays}日
              {kb.ofuku > 0 && `＋往復${kb.ofuku}日`}。土日・祝日を含む連続した日数です。
            </p>
          </>
        ) : (
          <p style={{ margin: 0 }}>
            <strong>人事院規則の別表第二に定めがありません</strong>（{r.label}）。
          </p>
        )}
        <p style={{ margin: '8px 0 0', fontWeight: 700 }}>お勤め先の就業規則が優先します。</p>
        <p className="hint" style={{ margin: '2px 0 0' }}>
          民間企業の忌引き休暇は法律上の義務ではありません。地方公務員は各自治体の条例・規則によります。
        </p>
        {kb && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', padding: '6px 0' }}>
              1日目・往復の日数{row?.extra ? '・条件' : ''}を変える
            </summary>
            <div className="field-row" style={{ marginTop: 6 }}>
              <label>
                忌引きの1日目
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label>
                往復に要する日数
                <select value={ofuku} onChange={(e) => setOfuku(e.target.value)}>
                  {Array.from({ length: OFUKU_MAX + 1 }, (_, i) => (
                    <option key={i} value={i}>
                      {i}日
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {row?.extra?.when === 'seikei' && (
              <label style={{ display: 'block', marginTop: 8 }}>
                <input type="checkbox" checked={seikei} onChange={(e) => setSeikei(e.target.checked)} style={{ width: 'auto', marginRight: 6 }} />
                {EXTRA_LABELS.seikei}（{row.extra.days}日）
              </label>
            )}
            {row?.extra?.when === 'daishu' && (
              <label style={{ display: 'block', marginTop: 8 }}>
                <input type="checkbox" checked={daishu} onChange={(e) => setDaishu(e.target.checked)} style={{ width: 'auto', marginRight: 6 }} />
                {EXTRA_LABELS.daishu}（{row.extra.days}日）
              </label>
            )}
          </details>
        )}
      </Card>

      <Card>
        <CardHead title="法要の日付" badge="一般的な目安" />
        {validMeinichi ? (
          <>
            <table>
              <thead>
                <tr>
                  <th scope="col">法要</th>
                  <th scope="col">日付</th>
                  <th scope="col">直前の土日</th>
                </tr>
              </thead>
              <tbody>
                {hoyo.map((h) => (
                  <tr key={h.name}>
                    <th scope="row">{h.name}</th>
                    <td>
                      {h.date.slice(0, 4)}年{formatMonthDay(h.date)}
                      {h.leapAdjusted && '※'}
                    </td>
                    <td>{h.weekend.map((w) => formatMonthDay(w)).join('・')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hoyo.some((h) => h.leapAdjusted) && (
              <p className="hint" style={{ margin: '6px 0 0' }}>
                ※ 2月29日の命日は、うるう年でない年は2月28日にしています。
              </p>
            )}
            <label style={{ display: 'block', marginTop: 10 }}>
              数え方
              <select value={count} onChange={(e) => setCount(e.target.value as HoyoCount)}>
                <option value="meinichi">命日から数える（多くの地域）</option>
                <option value="zenjitsu">命日の前日から数える（関西の一部）</option>
              </select>
            </label>
            <p className="hint" style={{ margin: '6px 0 0' }}>
              法要は当日より前の土日に行うことが多いため、その日以前の直近の土日を並べています（当日が土日なら当日）。日取りはお寺と相談して決めます。
            </p>
          </>
        ) : (
          <p className="hint" style={{ margin: 0 }}>
            命日を入れると、初七日・四十九日・百か日・一周忌・三回忌などの日付を出します。
          </p>
        )}
      </Card>

      <Card quiet>
        <p style={{ margin: '0 0 6px', fontWeight: 700 }}>このあとの手続き</p>
        <p style={{ margin: 0 }}>
          相続放棄・準確定申告・相続税の申告・相続登記には期限があります。
          <Link href="/sozoku-toki-kigen/">相続の期限</Link>・<Link href="/sozokuzei-keisan/">相続税 計算機</Link>
          で確かめられます。
        </p>
      </Card>

      <p className="hint" style={{ marginTop: 12 }}>
        入力した内容はブラウザの中だけで計算され、どこにも送信されません。喪中はがきの範囲や法要の日取りは地域・宗派・家庭によって異なります。
      </p>
    </div>
  );
}
