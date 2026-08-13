'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  STEP,
  calcHatarakizon,
  type CurvePoint,
  type HatarakizonResult,
  type TakeHome,
} from '@/lib/hatarakizon';
import { DAYTIME_STUDENT_EXCLUSION_NOTE, type Position } from '@/lib/nenshu-kabe';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;
/** 円 → 「128.5万円」。比較の主役は万円単位なので小数第1位まで出す */
const man = (v: number) => `${(Math.round(v / 1000) / 10).toLocaleString('ja-JP')}万円`;
/** 壁のようにちょうどの額は整数で出す */
const manInt = (v: number) => `${Math.round(v / 10_000).toLocaleString('ja-JP')}万円`;

const POSITIONS: { value: Position; label: string }[] = [
  { value: 'spouse', label: '配偶者の扶養内で働いている（パート等）' },
  { value: 'student', label: '親の扶養内・19〜22歳の学生' },
  { value: 'dependent', label: '親の扶養内・その他' },
  { value: 'none', label: '扶養には入っていない' },
];

/** 手取りの内訳（扶養内・加入の2枚を並べる） */
function Breakdown({ title, take, accent }: { title: string; take: TakeHome; accent: boolean }) {
  const rows: [string, number][] = [
    ['年収（額面）', take.gross],
    ['− 健康保険料（子ども・子育て支援金を含む）', take.premiums.health],
    ['− 厚生年金保険料', take.premiums.pension],
    ['− 雇用保険料', take.premiums.employment],
    ['− 所得税', take.incomeTax],
    ['− 住民税', take.residentTax],
  ];
  return (
    <div className={accent ? 'panel' : 'panel quiet'} style={{ marginTop: 0, flex: '1 1 260px' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', marginBottom: 6 }}>{title}</div>
      <div className="metric">
        <span className="value">{man(take.net)}</span>
        <span className="label">の手取り</span>
      </div>
      <dl className="kv" style={{ marginTop: 10 }}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value === 0 ? '—' : yen(value)}</dd>
          </div>
        ))}
        <div>
          <dt>＝ 手取り</dt>
          <dd>{yen(take.net)}</dd>
        </div>
      </dl>
    </div>
  );
}

const W = 640;
const H = 240;
const PAD = { l: 58, r: 14, t: 14, b: 30 };

/**
 * 手取り曲線。
 *
 * 「加入すると手取りがどう動くか」は数字を並べるより形で見せたほうが早い。
 * 破線が扶養内に抑えた場合の手取りで、曲線がそれを下回っている帯が働き損ゾーン。
 * 外部のグラフライブラリは入れず、素のSVGで描いている（静的サイトなので依存を増やさない）。
 */
function Chart({ r }: { r: Extract<HatarakizonResult, { kind: 'compare' }> }) {
  const focus = r.breakEven ?? r.target.gross;
  const xMin = Math.max(r.curve[0].gross, r.baseline.gross - 300_000);
  const xMax = Math.min(r.curve[r.curve.length - 1].gross, Math.max(focus, r.target.gross) + 400_000);
  const pts = r.curve.filter((p) => p.gross >= xMin && p.gross <= xMax);
  if (pts.length < 2) return null;

  const nets = [...pts.map((p) => p.net), r.baseline.net];
  const lo = Math.min(...nets);
  const hi = Math.max(...nets);
  const padY = (hi - lo) * 0.12 || 10_000;
  const yLo = lo - padY;
  const yHi = hi + padY;

  const x = (g: number) => PAD.l + ((g - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r);
  const y = (n: number) => PAD.t + (1 - (n - yLo) / (yHi - yLo)) * (H - PAD.t - PAD.b);
  const line = (list: CurvePoint[]) => list.map((p) => `${x(p.gross)},${y(p.net)}`).join(' ');

  // 賃金要件が残っている間は、加入する手前と後で線が切れる（そこが崖）
  const unenrolled = pts.filter((p) => !p.enrolled);
  const enrolled = pts.filter((p) => p.enrolled);

  // 横軸の目盛りは50万円ごと
  const ticks: number[] = [];
  for (let g = Math.ceil(xMin / 500_000) * 500_000; g <= xMax; g += 500_000) ticks.push(g);

  const zone = r.lossZone;
  const label = zone
    ? `年収${manInt(zone.from)}から${manInt(zone.to)}までは、扶養内で${man(r.baseline.gross)}に抑えた場合より手取りが少なくなります。`
    : '扶養内に抑えた場合を下回る年収帯はありません。';

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`年収ごとの手取りのグラフ。${label}`}
      style={{ marginTop: 14, display: 'block', maxWidth: '100%' }}
    >
      {/* 働き損ゾーンの帯。右端は損益分岐点（逆転区間の1つ先）まで伸ばす */}
      {zone && (
        <rect
          x={x(zone.from - STEP)}
          y={PAD.t}
          width={Math.max(1, x(zone.to + STEP) - x(zone.from - STEP))}
          height={H - PAD.t - PAD.b}
          fill="#f59e0b"
          opacity={0.16}
        />
      )}

      {/* 扶養内に抑えた場合の手取り（比較の基準） */}
      <line
        x1={PAD.l}
        x2={W - PAD.r}
        y1={y(r.baseline.net)}
        y2={y(r.baseline.net)}
        stroke="var(--muted)"
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
      <text x={PAD.l + 4} y={y(r.baseline.net) - 6} fontSize={11} fill="var(--muted)">
        扶養内 {man(r.baseline.gross)} の手取り {man(r.baseline.net)}
      </text>

      {unenrolled.length > 1 && (
        <polyline points={line(unenrolled)} fill="none" stroke="var(--muted)" strokeWidth={2} />
      )}
      {enrolled.length > 1 && (
        <polyline points={line(enrolled)} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
      )}

      {r.breakEven !== null && (
        <>
          <line
            x1={x(r.breakEven)}
            x2={x(r.breakEven)}
            y1={PAD.t}
            y2={H - PAD.b}
            stroke="var(--accent)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <circle cx={x(r.breakEven)} cy={y(r.baseline.net)} r={4} fill="var(--accent)" />
        </>
      )}

      {/* 軸 */}
      <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--border)" />
      {ticks.map((g) => (
        <text key={g} x={x(g)} y={H - PAD.b + 16} fontSize={11} fill="var(--muted)" textAnchor="middle">
          {manInt(g)}
        </text>
      ))}
      <text x={PAD.l - 6} y={y(yHi) + 12} fontSize={11} fill="var(--muted)" textAnchor="end">
        {manInt(yHi)}
      </text>
      <text x={PAD.l - 6} y={H - PAD.b} fontSize={11} fill="var(--muted)" textAnchor="end">
        {manInt(yLo)}
      </text>
    </svg>
  );
}

/**
 * @param buildDate ビルド時刻（ISO文字列）。lib/nenshu-kabe.ts と同じ理由で、
 *   サーバ描画とハイドレーション直後はこの固定値で判定し、マウント後に
 *   実際の「画面を開いた日」で評価し直す。2026年10月1日の賃金要件撤廃を
 *   ビルド日で固定してしまわないため。
 */
export default function Calculator({ buildDate }: { buildDate: string }) {
  const [incomeMan, setIncomeMan] = useState('130');
  const [position, setPosition] = useState<Position>('spouse');
  const [size51, setSize51] = useState(true);
  const [hours20, setHours20] = useState(true);
  const [kaigo, setKaigo] = useState(false);
  const [autoBaseline, setAutoBaseline] = useState(true);
  const [baselineMan, setBaselineMan] = useState('');
  const [asOf, setAsOf] = useState(() => new Date(buildDate));

  useEffect(() => {
    setAsOf(new Date());
  }, []);

  const r = calcHatarakizon({
    income: (Number(incomeMan) || 0) * 10_000,
    position,
    size51,
    hours20,
    kaigo,
    baselineIncome: autoBaseline ? null : (Number(baselineMan) || 0) * 10_000,
    asOf,
  });

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          年収（額面・万円）
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            社会保険に加入して働く場合の年収
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
          あなたの立場
          <select value={position} onChange={(e) => setPosition(e.target.value as Position)}>
            {POSITIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 'var(--fs-sm)' }}>
          <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={size51}
              onChange={(e) => setSize51(e.target.checked)}
              style={{ width: 'auto' }}
            />
            勤務先の従業員が51人以上
          </label>
          <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={hours20}
              onChange={(e) => setHours20(e.target.checked)}
              style={{ width: 'auto' }}
            />
            週20時間以上働く
          </label>
          <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={kaigo}
              onChange={(e) => setKaigo(e.target.checked)}
              style={{ width: 'auto' }}
            />
            40〜64歳（介護保険料がかかる）
          </label>
        </div>
        <div style={{ fontSize: 'var(--fs-sm)' }}>
          <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={!autoBaseline}
              onChange={(e) => setAutoBaseline(!e.target.checked)}
              style={{ width: 'auto' }}
            />
            扶養内に抑える場合の年収を自分で指定する
          </label>
          {!autoBaseline && (
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="扶養内に抑える年収（万円）"
              value={baselineMan}
              onChange={(e) => setBaselineMan(e.target.value)}
              style={{ marginTop: 8 }}
            />
          )}
        </div>
      </div>

      {r.kind === 'not-applicable' ? (
        <div className="note" style={{ marginTop: 18, lineHeight: 1.7 }}>
          {r.reason}
          <div style={{ marginTop: 6 }}>
            この条件では勤務先の社会保険に加入しないため、「加入すると手取りがどうなるか」の比較は出せません。
            自分に関係する壁を確かめるには{' '}
            <Link href="/nenshu-kabe/">年収の壁 計算機</Link> をお使いください。
          </div>
        </div>
      ) : (
        <Results r={r} position={position} />
      )}
    </div>
  );
}

function Results({
  r,
  position,
}: {
  r: Extract<HatarakizonResult, { kind: 'compare' }>;
  position: Position;
}) {
  const losing = r.netDiff < 0;

  return (
    <>
      <div className="panel" style={{ marginTop: 18 }}>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          年収 {man(r.target.gross)} で加入して働くと、扶養内で {man(r.baseline.gross)} に抑えた場合と比べて
        </div>
        <div className="metric" style={{ marginTop: 4 }}>
          <span className="value" style={{ color: losing ? '#b45309' : undefined }}>
            {losing ? '−' : '＋'}
            {man(Math.abs(r.netDiff))}
          </span>
          <span className="label">{losing ? '手取りが少なくなります' : '手取りが多くなります'}</span>
        </div>
      </div>

      {r.wageRequirementAbolished ? (
        <div className="note" style={{ marginTop: 10, lineHeight: 1.7 }}>
          <strong>2026年10月1日に賃金要件（月8.8万円＝年収106万円相当）が撤廃されました。</strong>
          従業員51人以上の勤務先で週20時間以上働くと、年収がいくらでも勤務先の社会保険に加入します。
          扶養内に留まるには<strong>週の所定労働時間を20時間未満にする</strong>しかなく、
          そのうえで {r.ceiling.label} が年収の上限になります。
        </div>
      ) : (
        <div className="note" style={{ marginTop: 10, lineHeight: 1.7 }}>
          いまは賃金要件（月8.8万円＝年収106万円相当）が残っているため、{r.ceiling.label}{' '}
          を超えると勤務先の社会保険に加入します。
          <strong>2026年10月1日にこの賃金要件は撤廃され</strong>、
          以降は週20時間以上働く方は年収に関係なく加入します（日付が変わると、この計算機の前提も自動で切り替わります）。
        </div>
      )}

      {position === 'student' && (
        <div className="note" style={{ marginTop: 10, fontSize: 'var(--fs-sm)', lineHeight: 1.7 }}>
          ※ {DAYTIME_STUDENT_EXCLUSION_NOTE}
        </div>
      )}

      <h3 style={{ marginTop: 22 }}>働き損ゾーンと損益分岐点</h3>
      <dl className="kv">
        <div>
          <dt>働き損ゾーン（手取りが逆転する年収）</dt>
          <dd>
            {r.lossZone
              ? `${manInt(r.lossZone.from)} 〜 ${manInt(r.lossZone.to)}`
              : 'なし（すぐに追いつきます）'}
          </dd>
        </div>
        <div>
          <dt>損益分岐点（扶養内の手取りに追いつく年収）</dt>
          <dd>{r.breakEven === null ? '300万円までに追いつきません' : manInt(r.breakEven)}</dd>
        </div>
        <div>
          <dt>比較の基準（扶養内に抑えた場合）</dt>
          <dd>
            {man(r.baseline.gross)} → 手取り {man(r.baseline.net)}
          </dd>
        </div>
      </dl>

      <Chart r={r} />

      <h3 style={{ marginTop: 22 }}>手取りの内訳</h3>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Breakdown title={`扶養内に抑える（${man(r.baseline.gross)}）`} take={r.baseline} accent={false} />
        <Breakdown title={`加入して働く（${man(r.target.gross)}）`} take={r.target} accent />
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        社会保険料は標準報酬月額
        {r.target.premiums.standardMonthly > 0 && (
          <>
            （{yen(r.target.premiums.standardMonthly)}・{r.target.premiums.grade}等級）
          </>
        )}
        にもとづく本人負担分です。健康保険料率は協会けんぽの全国平均（令和8年度・9.9%）で、
        お住まいの都道府県により数%変わります。 健康保険料には子ども・子育て支援金（令和8年度は本人負担0.115%）を
        含めています。給与明細でも健康保険料と一体で天引きされるため、内訳を分けていません
        （支援金だけの金額は <Link href="/kosodate-shienkin/">子ども・子育て支援金 計算機</Link> で確認できます）。
      </p>

      <h3 style={{ marginTop: 22 }}>手取り以外に増えるもの</h3>
      <dl className="kv">
        <div>
          <dt>老齢厚生年金（1年加入するごとの年額の増分・終身）</dt>
          <dd>{yen(r.benefits.pensionPerYearEnrolled)}</dd>
        </div>
        <div>
          <dt>同・10年加入した場合の年額の増分</dt>
          <dd>{yen(r.benefits.pensionAfter10Years)}</dd>
        </div>
        <div>
          <dt>払った厚生年金保険料を年金で取り戻すまで</dt>
          <dd>受給開始から約{r.benefits.pensionPaybackYears.toFixed(1)}年</dd>
        </div>
        <div>
          <dt>傷病手当金・出産手当金の日額</dt>
          <dd>{yen(r.benefits.sickBenefitDaily)}</dd>
        </div>
      </dl>
      <p className="hint" style={{ marginTop: 8 }}>
        老齢基礎年金は扶養内（第3号被保険者）でも満額の対象なので増えません。増えるのは
        老齢厚生年金の報酬比例部分だけで、その分だけを金額にしています。傷病手当金は加入して
        いなければ受け取れない給付です（
        <Link href="/shobyo-teate/">傷病手当金 計算機</Link>{' '}
        で休んだ日数に応じた総額を計算できます）。
      </p>
    </>
  );
}
