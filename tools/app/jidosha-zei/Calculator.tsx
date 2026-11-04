'use client';

import { useEffect, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  CAR_KINDS,
  DISPLACEMENT_CLASSES,
  EV_SURCHARGE_FROM,
  JURYO_RATES,
  KANKYO_SEINOWARI_ABOLISHED,
  MIN_REGISTERED,
  SECOND_EXEMPT_RATE,
  honsokuThresholdAt,
  POWERS,
  WEIGHT_CLASSES,
  ageBandStart,
  fiscalYearLabel,
  formatYen,
  kankyoSeinowariRange,
  proratedOnAcquire,
  refundOnDeregister,
  reiwaLabel,
  shinshaJuryozei,
  summarize,
  timeline,
  ymLabel,
  type CarKind,
  type JuryoInput,
  type JuryoResult,
  type Power,
  type ShubetsuResult,
} from '@/lib/jidosha-zei';

/** ビルド時の日付で描いてからマウント後に今日へ差し替える（静的書き出しなので） */
const BUILD_DEFAULT_DATE = '2026-11-04';

const ECO_LABEL = {
  none: 'エコカー外',
  exempt: '免税',
  cut75: '▲75%',
  cut50: '▲50%',
  cut25: '▲25%',
  honsoku: '本則税率',
} as const;

const RATE_LABEL: Record<JuryoResult['rate'], string> = {
  exempt: '免税',
  honsoku: 'エコカー（本則税率）',
  normal: 'エコカー外',
  over13: '13年経過',
  over18: '18年経過',
};

function shubetsuText(s: ShubetsuResult): string {
  switch (s.status) {
    case 'not-registered':
      return '—';
    case 'first-year':
      return '登録した年度（月割）';
    case 'undecided':
      return '未定（令和9年度改正で決まる）';
    case 'juka':
      return `${formatYen(s.yen!)}（重課）`;
    case 'juka-projected':
      return `${formatYen(s.yen!)}（重課の見込み）`;
    case 'juka-undetermined':
      return `${formatYen(s.yen!)}＋重課（額は未定）`;
    case 'green':
      return `${formatYen(s.yen!)}（グリーン化特例）`;
    default:
      return formatYen(s.yen!);
  }
}

function juryoText(j: JuryoResult): string {
  const ev =
    j.evSurcharge === 'undecided'
      ? '＋新しい負担（未定）'
      : j.evSurcharge === 'exempt-first'
        ? '（新しい負担は1回目なので免除）'
        : j.evSurchargeYen !== null
          ? `＋${formatYen(j.evSurchargeYen)}`
          : '';
  return `${ymLabel(j.inspection)}の車検 ${formatYen(j.yen)}${ev}`;
}

export default function Calculator() {
  const [today, setToday] = useState(BUILD_DEFAULT_DATE);
  const [kind, setKind] = useState<CarKind>('futsu');
  const [power, setPower] = useState<Power>('gasoline');
  const [displacementClass, setDisplacementClass] = useState(1);
  const [year, setYear] = useState(Number(BUILD_DEFAULT_DATE.slice(0, 4)));
  const [month, setMonth] = useState(Number(BUILD_DEFAULT_DATE.slice(5, 7)));
  const [weightUnits, setWeightUnits] = useState(3);
  const [fuelRate, setFuelRate] = useState('');
  const [price, setPrice] = useState('');

  useEffect(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    setToday(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
    // 初度登録の既定は今月（仕様書の入力の表）
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }, []);

  const thisYear = Number(today.slice(0, 4));
  const years: number[] = [];
  for (let y = thisYear; y >= Number(MIN_REGISTERED.slice(0, 4)); y--) years.push(y);

  const changeKind = (k: CarKind) => {
    setKind(k);
    if (k === 'kei' && !POWERS.find((p) => p.id === power)?.kei) setPower('gasoline');
  };

  const car: JuryoInput = {
    kind,
    power,
    displacementClass,
    firstRegistered: `${year}-${String(month).padStart(2, '0')}`,
    weightUnits,
    fuelRate2030: fuelRate.trim() === '' ? null : Number(fuelRate.replace(/[%％\s]/g, '')),
  };
  const r = summarize(car, today);
  const track = () => trackToolUse('jidosha-zei', 'calculate');
  const denki = power === 'ev' || power === 'phev';
  const priceYen = Number(price.replace(/[,，\s]/g, ''));

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 16 }}>
        <label>
          1. 車の種類
          <select value={kind} onChange={(e) => changeKind(e.target.value as CarKind)}>
            {CAR_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            営業用（緑・黒ナンバー）・トラック・バス・二輪は対象外です
          </span>
        </label>

        <label>
          2. 動力
          <select
            value={power}
            onChange={(e) => {
              setPower(e.target.value as Power);
              track();
            }}
          >
            {POWERS.filter((p) => kind === 'futsu' || p.kei).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {kind === 'futsu' && power !== 'ev' && (
          <label>
            3. 総排気量（車検証の「総排気量又は定格出力」）
            <select value={displacementClass} onChange={(e) => setDisplacementClass(Number(e.target.value))}>
              {DISPLACEMENT_CLASSES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>
            {kind === 'kei' ? '4. 初度検査の年月' : '4. 初度登録の年月'}（車検証に書いてあります）
          </legend>
          <div style={{ display: 'flex', gap: 8 }}>
            <select aria-label="年" value={year} onChange={(e) => setYear(Number(e.target.value))} onBlur={track}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </select>
            <select aria-label="月" value={month} onChange={(e) => setMonth(Number(e.target.value))} onBlur={track}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}月
                </option>
              ))}
            </select>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            中古で買った車も、名義を変えた日ではなく最初に登録された年月です
          </p>
        </fieldset>

        {kind === 'futsu' && (
          <label>
            5. 車両重量（車検証の「車両重量」。車両総重量ではありません）
            <select value={weightUnits} onChange={(e) => setWeightUnits(Number(e.target.value))}>
              {WEIGHT_CLASSES.map((w) => (
                <option key={w.units} value={w.units}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {!denki && (
          <label>
            {kind === 'futsu' ? '6.' : '5.'} 2030年度燃費基準の達成率（%。任意）
            <input
              type="text"
              inputMode="decimal"
              placeholder="例：95（分からなければ空欄）"
              value={fuelRate}
              onChange={(e) => setFuelRate(e.target.value)}
              onBlur={track}
            />
            <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
              カタログや販売店の書類の「2030年度燃費基準◯%達成」。車検のときに{honsokuThresholdAt('2027-05')}%以上
              （2027年4月までは{honsokuThresholdAt('2027-04')}%以上）なら重量税は本則税率で、13年・18年の重課もかかりません。
              新車のときのエコカー減税の区分は引き継がれません。空欄ならエコカー外で計算します
            </span>
          </label>
        )}

        <label>
          取得価額（任意。環境性能割の廃止で取得時の税がいくら減ったかを見たい人だけ）
          <input
            type="text"
            inputMode="numeric"
            placeholder="例：3000000"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={track}
          />
        </label>
      </div>

      {r.kind === 'error' && (
        <p className="hint">
          {r.error === 'future'
            ? '初度登録の年月が今月より先になっています。'
            : r.error === 'rate'
              ? '燃費基準の達成率は数字（%）で入れてください。'
              : '入力を確かめてください。'}
        </p>
      )}

      {r.kind === 'ok' && (
        <Result
          car={car}
          today={today}
          s={r.summary}
          priceYen={Number.isFinite(priceYen) && priceYen > 0 ? priceYen : null}
        />
      )}
    </div>
  );
}

function Result({
  car,
  today,
  s,
  priceYen,
}: {
  car: JuryoInput;
  today: string;
  s: Extract<ReturnType<typeof summarize>, { kind: 'ok' }>['summary'];
  priceYen: number | null;
}) {
  const rows = timeline(car, s.fiscalYear, 10);
  const shinsha = shinshaJuryozei(car, today);
  const denki = car.power === 'ev' || car.power === 'phev';
  // 抹消の還付は今年度の額から。登録した年度は通知の額が無いので標準の額で
  const annualForProration = s.shubetsu.status === 'undecided' ? null : (s.shubetsu.yen ?? s.shubetsu.standardYen);

  return (
    <>
      <div className="panel">
        <dl className="kv">
          <div>
            <dt>{reiwaLabel(s.fiscalYear)}の{car.kind === 'kei' ? '軽自動車税' : '自動車税'}（種別割）</dt>
            <dd>
              <strong>{shubetsuText(s.shubetsu)}</strong>
            </dd>
          </div>
          <div>
            <dt>次の車検の重量税（2年分）</dt>
            <dd>
              <strong>{formatYen(s.next.yen)}</strong>（{ymLabel(s.next.inspection)}・{RATE_LABEL[s.next.rate]}）
            </dd>
          </div>
          <div>
            <dt>1年あたり（種別割＋重量税÷2）</dt>
            <dd>
              <strong>{s.perYear === null ? '—' : formatYen(s.perYear)}</strong>
            </dd>
          </div>
        </dl>
        {s.shubetsu.status === 'first-year' && (
          <p className="hint" style={{ marginTop: 6 }}>
            {car.kind === 'kei'
              ? '軽自動車は4月1日の持ち主に1年分かかるので、登録した年度は種別割がかかりません。1年あたりは来年度の額で出しています。'
              : '登録した年度は5月の通知が来ず、登録のときに翌月から3月までの月割を納めます。1年あたりは来年度の額で出しています。'}
          </p>
        )}
        {s.shubetsu.status === 'undecided' && (
          <p className="hint" style={{ marginTop: 6 }}>
            令和10年度（2028年4月）以後に新規登録するEV・FCVは、車両重量に応じた課税方式になります。税率は令和9年度税制改正で決まります。
          </p>
        )}
        {s.next.assumedNonEco && (
          <p className="hint" style={{ marginTop: 6 }}>
            燃費基準の達成率が空欄なので、エコカー外の税率で出しています。車検のときに基準を満たすなら本則税率（
            {formatYen(JURYO_RATES[car.kind].honsoku2 * (car.kind === 'kei' ? 1 : car.weightUnits))}）です。
          </p>
        )}
        {s.next.maybeExempt125 && (
          <p className="hint" style={{ marginTop: 6 }}>
            初回の継続車検を免税で出しています（{SECOND_EXEMPT_RATE}%以上で、新車のとき免税を受けた車に限ります。そうでなければ本則税率です）。
          </p>
        )}
      </div>

      <div className="panel">
        {s.juka.kind === 'exempt' ? (
          <p style={{ margin: 0 }}>
            <strong>この車は13年超の重課の対象外です</strong>
            （電気自動車・ハイブリッド・プラグインハイブリッドは除かれています）。
          </p>
        ) : s.yearsToJuka === null ? (
          <p style={{ margin: 0 }}>
            <strong>{reiwaLabel(s.juka.fiscalYear)}から重課</strong>
            されています（標準 {formatYen(s.juka.standardYen)} → 重課 {s.juka.yen === null ? '額は未定' : formatYen(s.juka.yen)}）。
          </p>
        ) : (
          <>
            <div className="metric">
              <span className="label">{car.kind === 'kei' ? '軽自動車税' : '自動車税'}の重課まで</span>
              <span className="value">あと{s.yearsToJuka}</span>
              <span className="unit">年度</span>
            </div>
            <p className="hint" style={{ marginTop: 4 }}>
              {fiscalYearLabel(s.juka.fiscalYear)}から
              {s.juka.yen === null ? '重課（額は条文にまだありません）' : ` ${formatYen(s.juka.yen)}`}
              （いまは {formatYen(s.juka.standardYen)}）。
              {!s.juka.statutory &&
                '現行の条文が重課の対象にしているのは、ガソリン車が2015年3月、ディーゼル車が2017年3月までに登録した車です。毎年の税制改正で延長されてきたので、延長されればこの年度からという見込みです。'}
            </p>
          </>
        )}
        {s.juka.kind === 'start' && s.next.rate === 'honsoku' ? null : (
          s.juka.kind === 'start' && (
            <p className="hint" style={{ marginTop: 6 }}>
              重量税の「13年」は数え方が違い、{ymLabel(ageBandStart(car.kind, car.firstRegistered, 'over13'))}
              以後に受ける車検から上がります（18年は{ymLabel(ageBandStart(car.kind, car.firstRegistered, 'over18'))}以後）。
            </p>
          )
        )}
      </div>

      <h3>10年の推移（いまの税率のまま）</h3>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>年度</th>
              <th>種別割</th>
              <th>車検の重量税</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.fiscalYear}>
                <td style={{ textAlign: 'left' }}>{reiwaLabel(row.fiscalYear)}</td>
                <td>{shubetsuText(row.shubetsu)}</td>
                <td>{row.inspections.length === 0 ? '—' : row.inspections.map(juryoText).join('／')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        車検は初度登録から3年、その後2年ごととして並べています。車検の時期がずれている車は、車検証の有効期間の満了日で読み替えてください。
        {rows.some((r) => r.shubetsu.mayChange) &&
          car.kind === 'futsu' &&
          ' 令和10年度以後の種別割は、重量と環境性能に応じた仕組みへの見直しが令和9年度改正で決まる予定です。'}
      </p>

      <h3>令和8年度改正で変わったこと</h3>
      <ul>
        <li>
          <strong>環境性能割は2026年3月31日で廃止</strong>（{KANKYO_SEINOWARI_ABOLISHED.slice(0, 4)}年4月1日以後の取得は0円）。
          {priceYen !== null
            ? (() => {
                const k = kankyoSeinowariRange(car.kind, priceYen);
                return ` 取得価額${formatYen(priceYen)}なら、廃止前は燃費の区分で 0〜${formatYen(k.maxYen)}（0〜${k.maxRate}%）かかっていた分がなくなりました。`;
              })()
            : ` 廃止前は燃費の区分で取得価額の0〜${car.kind === 'kei' ? 2 : 3}%でした。`}
        </li>
        <li>
          <strong>いま新車で買うと、重量税は3年分 {formatYen(shinsha.yen)}</strong>
          {shinsha.period
            ? `（エコカー減税の期間 ${shinsha.period.label}・${ECO_LABEL[shinsha.appliedClass]}${shinsha.assumedNonEco ? '。達成率が空欄なのでエコカー外で計算' : ''}）`
            : '（エコカー減税の期間外）'}
          。基準は2026年5月と2027年5月の2回に分けて引き上げられます。
        </li>
        {denki && (
          <li>
            <strong>{ymLabel(EV_SURCHARGE_FROM)}1日以後に受ける車検から、EV・PHEVに新しい負担</strong>
            が重量税に上乗せされます。額は令和9年度税制改正（2026年12月の大綱）で決まります。新車の新規検査と、すでに走っている車の施行後最初の継続車検は免除です。
          </li>
        )}
      </ul>

      <h3>買う・手放すときの月割</h3>
      {car.kind === 'kei' ? (
        <p>軽自動車税には月割も還付もありません。4月1日の持ち主に1年分かかります。</p>
      ) : annualForProration === null ? (
        <p>税率が決まっていないので、月割は出せません。</p>
      ) : (
        <ul>
          {s.shubetsu.status === 'first-year' && (
            <li>
              {ymLabel(car.firstRegistered)}に新規登録したときの月割（翌月から3月まで
              {proratedOnAcquire(annualForProration, car.firstRegistered).months}か月）：
              {formatYen(proratedOnAcquire(annualForProration, car.firstRegistered).yen)}
            </li>
          )}
          <li>
            今月（{ymLabel(today)}）に抹消登録（廃車・輸出）したときの還付の目安（
            {refundOnDeregister(annualForProration, today).months}か月分）：
            {formatYen(refundOnDeregister(annualForProration, today).yen)}
          </li>
          <li>売却・譲渡（名義変更）では月割になりません。県からの還付も、買った人への月割の課税も無く、その年度の税は4月1日の持ち主に1年分かかります。月割は新規登録（新車など）と抹消登録のときだけです。</li>
        </ul>
      )}
      <p className="hint">
        標準税率での計算です。道府県が条例で標準より高い税率を定めている場合や、積雪地域の特例がある場合は額が変わります。
      </p>
    </>
  );
}
