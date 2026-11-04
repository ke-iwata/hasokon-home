'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  ASSETS,
  METHOD_LABEL,
  TOKUREI_LIMIT_AFTER,
  TOKUREI_LIMIT_BEFORE,
  TOKUREI_SWITCH_DATE,
  assetById,
  calculate,
  kessanshoRows,
  reiwa,
  type DepMethod,
  type Filing,
  type GenkaResult,
  type MethodResult,
  type Unavailable,
} from '@/lib/genka-shokyaku';
import { KAISEI_AFTER_NENDO, menzeiten, reiwa as reiwaNendo } from '@/lib/shokyaku-shisanzei';
import { trackToolUse } from '@/lib/analytics';

type Ok = Extract<GenkaResult, { ok: true }>;

const yen = (v: number) => `${v.toLocaleString('ja-JP')}円`;
const man = (v: number) => `${(v / 10_000).toLocaleString('ja-JP')}万円`;
const toInt = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Math.floor(Number(v) || 0)));

/** 'YYYY-MM-DD' → 2026年4月1日 */
const jaDate = (s: string) => `${Number(s.slice(0, 4))}年${Number(s.slice(5, 7))}月${Number(s.slice(8, 10))}日`;

const ERROR_TEXT: Record<Extract<GenkaResult, { ok: false }>['error'], string> = {
  cost: '取得価額を1円以上の整数で入れてください。',
  date: '買った日・使い始めた月を正しく入れてください。',
  startBeforeAcquired: '使い始めた月が、買った日より前になっています。',
  tooOld: '2007年3月31日以前に取得した物（旧定額法・旧定率法）は、この計算機の対象外です。',
  teiritsu250:
    '2012年3月31日以前に取得した物の定率法（250%定率法）は、この計算機の対象外です。定額法なら計算できます。',
  years: '耐用年数を2〜50年の整数で入れてください。',
  asset: '買った物の種類を選んでください。',
};

function unavailableText(u: Unavailable, r: Ok, acquiredOn: string, cap: number): string {
  switch (u.reason) {
    case 'over100k':
      return '10万円以上なので、全額をその年の経費にする方法（少額の減価償却資産）は使えません。';
    case 'over200k':
      return '20万円以上なので、一括償却（3年で均等）は使えません。';
    case 'zatsu':
      return '40万円未満の特例は事業所得・不動産所得・山林所得だけで、副業の雑所得では使えません。';
    case 'shiro':
      return '40万円未満の特例は青色申告の人だけです。白色申告では使えません。';
    case 'before':
    case 'expired':
      return '40万円未満の特例は、2006年4月1日〜2029年3月31日に取得した物が対象です。';
    case 'overLimit':
      return acquiredOn < TOKUREI_SWITCH_DATE
        ? `${jaDate(acquiredOn)}に買った物は、特例の上限が${man(TOKUREI_LIMIT_BEFORE)}未満です（2026年4月1日以後に買った物から${man(TOKUREI_LIMIT_AFTER)}未満）。`
        : `特例は${man(r.tokureiLimit ?? TOKUREI_LIMIT_AFTER)}未満の物だけです（ちょうどは対象外）。`;
    case 'overCap':
      return `今年この特例で経費にした物との合計が${man(cap)}を超えるので、この物には特例を使えません（物ごとに判定し、一部だけ使うことはできません）。`;
  }
}

function primaryReason(r: Ok, acquiredOn: string): string {
  const p = r.primary;
  switch (p.id) {
    case 'shogaku':
      return '10万円未満なので、青色・白色・副業の雑所得のどれでも、使い始めた年に全額を経費にできます（少額の減価償却資産）。';
    case 'tokurei':
      return acquiredOn < TOKUREI_SWITCH_DATE
        ? `2026年3月31日以前に買った${man(TOKUREI_LIMIT_BEFORE)}未満の物なので、青色申告なら全額をその年の経費にできます（中小事業者の少額減価償却資産の特例）。`
        : `2026年4月1日以後に買った${man(r.tokureiLimit ?? TOKUREI_LIMIT_AFTER)}未満の物なので、青色申告なら全額をその年の経費にできます（中小事業者の少額減価償却資産の特例）。`;
    case 'ikkatsu':
      return '20万円未満なので、3年間で3分の1ずつ経費にできます（一括償却資産。月割しないので、年の途中から使っても1年分）。';
    case 'normal': {
      const first = p.schedule[0];
      return `耐用年数${r.life}年の${r.depMethod === 'teigaku' ? '定額法' : '定率法'}で償却します。1年目は使い始めた月から${first.months}か月分です。`;
    }
  }
}

function laterText(m: MethodResult): string {
  const later = m.schedule.slice(1);
  if (later.length === 0) return 'なし（今年で全額）';
  const total = later.reduce((a, b) => a + b.expense, 0);
  return `${later[0].year}〜${later.at(-1)!.year}年に計${yen(total)}`;
}

function Radios<T extends string>({
  name,
  label,
  hint,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  hint?: ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 700, marginBottom: 6 }}>{label}</legend>
      <div style={{ display: 'grid', gap: 4, fontSize: 'var(--fs-sm)' }}>
        {options.map((o) => (
          <label key={o.value} style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="radio"
              name={name}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              style={{ width: 'auto' }}
            />
            {o.label}
          </label>
        ))}
      </div>
      {hint && (
        <p className="hint" style={{ marginTop: 6 }}>
          {hint}
        </p>
      )}
    </fieldset>
  );
}

/** ビルド時刻で描いてからマウント後に今日へ差し替える（静的書き出しなので） */
const BUILD_DEFAULT_DATE = '2026-11-10';

export default function Calculator() {
  const [assetId, setAssetId] = useState('pc');
  const [customYears, setCustomYears] = useState('');
  const [cost, setCost] = useState('150000');
  const [acquiredOn, setAcquiredOn] = useState(BUILD_DEFAULT_DATE);
  const [differentStart, setDifferentStart] = useState(false);
  const [startYm, setStartYm] = useState('');
  const [filing, setFiling] = useState<Filing>('aoiro');
  const [tokureiUsed, setTokureiUsed] = useState('');
  const [openClose, setOpenClose] = useState(false);
  const [businessMonths, setBusinessMonths] = useState('12');
  const [used, setUsed] = useState(false);
  const [usedYears, setUsedYears] = useState('');
  const [usedMonths, setUsedMonths] = useState('');
  const [ratio, setRatio] = useState('');
  const [depMethod, setDepMethod] = useState<DepMethod>('teigaku');

  useEffect(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    setAcquiredOn(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  }, []);

  const asset = assetById(assetId);
  const ymMatch = /^(\d{4})-(\d{2})$/.exec(startYm);
  const elapsed = (toInt(usedYears) ?? 0) * 12 + (toInt(usedMonths) ?? 0);
  const r = calculate({
    assetId,
    customYears: toInt(customYears),
    cost: toInt(cost) ?? 0,
    acquiredOn,
    startYear: differentStart && ymMatch ? Number(ymMatch[1]) : undefined,
    startMonth: differentStart && ymMatch ? Number(ymMatch[2]) : undefined,
    filing,
    tokureiUsedThisYear: filing === 'aoiro' ? (toInt(tokureiUsed) ?? 0) : undefined,
    businessMonths: filing === 'aoiro' && openClose ? (toInt(businessMonths) ?? 12) : undefined,
    usedElapsedMonths: used ? elapsed : undefined,
    businessRatio: toInt(ratio),
    depMethod,
  });
  const track = () => trackToolUse('genka-shokyaku', 'calculate');

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 16 }}>
        <label>
          1. 買った物の種類
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)} style={{ marginTop: 6 }}>
            {ASSETS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
                {a.years > 0 ? `（${a.years}年）` : ''}
              </option>
            ))}
          </select>
        </label>
        {assetId === 'other' && (
          <label>
            耐用年数（年）
            <input
              type="number"
              inputMode="numeric"
              min={2}
              max={50}
              value={customYears}
              placeholder="例：7"
              onChange={(e) => setCustomYears(e.target.value)}
            />
            <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
              耐用年数省令の別表で調べた年数（2〜50年）。建物・建物附属設備は対象外です
            </span>
          </label>
        )}

        <label>
          2. 取得価額（円）
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1000}
            value={cost}
            placeholder="例：150000"
            onChange={(e) => setCost(e.target.value)}
            onBlur={track}
          />
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            消費税：免税事業者・税込経理の人は<strong>税込</strong>、税抜経理の人は<strong>税抜</strong>で。
            配送料・設置費など、使えるようにするまでにかかった費用も含めます
          </span>
        </label>

        <div>
          <label>
            3. 買った日
            <input type="date" value={acquiredOn} onChange={(e) => setAcquiredOn(e.target.value)} />
          </label>
          <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
            <input
              type="checkbox"
              checked={differentStart}
              onChange={(e) => {
                setDifferentStart(e.target.checked);
                if (e.target.checked && !startYm) setStartYm(acquiredOn.slice(0, 7));
              }}
              style={{ width: 'auto' }}
            />
            使い始めた月が買った月と違う
          </label>
          {differentStart && (
            <label style={{ display: 'block', marginTop: 6 }}>
              使い始めた月
              <input type="month" value={startYm} onChange={(e) => setStartYm(e.target.value)} />
            </label>
          )}
          <p className="hint" style={{ marginTop: 6 }}>
            特例の上限（30万円／40万円）は<strong>買った日</strong>で、通常の減価償却の月割は
            <strong>使い始めた月</strong>で決まります。
          </p>
        </div>

        <Radios
          name="filing"
          label="4. 申告の種類"
          value={filing}
          onChange={setFiling}
          options={[
            { value: 'aoiro', label: '青色申告（事業所得）' },
            { value: 'shiro', label: '白色申告（事業所得）' },
            { value: 'zatsu', label: '副業の雑所得（申告不要の20万円以下も含む）' },
          ]}
          hint={
            <>
              家賃収入（不動産所得）の人は、この計算機の対象外です。
              {filing === 'zatsu' &&
                '副業の雑所得が20万円以下で所得税の申告が要らない人も、住民税の申告は要ります（経費の額はこの計算機で出せます）。'}
            </>
          }
        />

        {filing === 'aoiro' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <label>
              5. 今年この特例（40万円未満の全額経費）で経費にした物の合計（円）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={10000}
                value={tokureiUsed}
                placeholder="例：0"
                onChange={(e) => setTokureiUsed(e.target.value)}
              />
              <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
                特例は1年に合計300万円までです。この物を除いた額を入れてください
              </span>
            </label>
            <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={openClose}
                onChange={(e) => setOpenClose(e.target.checked)}
                style={{ width: 'auto' }}
              />
              今年開業した・廃業した（300万円が月割になります）
            </label>
            {openClose && (
              <label>
                今年営業した月数
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={12}
                  value={businessMonths}
                  onChange={(e) => setBusinessMonths(e.target.value)}
                />
                <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
                  1か月未満の端数は1か月に数えます（8月10日開業なら8〜12月の5か月）
                </span>
              </label>
            )}
          </div>
        )}

        <details>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 700 }}>
            中古・家事と兼用・定率法のとき（6〜8）
          </summary>
          <div style={{ display: 'grid', gap: 16, marginTop: 10 }}>
            <Radios
              name="used"
              label="6. 新品か中古か"
              value={used ? 'used' : 'new'}
              onChange={(v) => setUsed(v === 'used')}
              options={[
                { value: 'new', label: '新品' },
                { value: 'used', label: '中古' },
              ]}
            />
            {used && (
              <div className="field-row">
                <label>
                  前の持ち主が使っていた年数
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={usedYears}
                    placeholder="例：4"
                    onChange={(e) => setUsedYears(e.target.value)}
                  />
                </label>
                <label>
                  ＋か月
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={11}
                    value={usedMonths}
                    placeholder="例：0"
                    onChange={(e) => setUsedMonths(e.target.value)}
                  />
                </label>
              </div>
            )}

            <label>
              7. 事業で使う割合（%）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={ratio}
                placeholder="100"
                onChange={(e) => setRatio(e.target.value)}
              />
              {asset?.shared && (
                <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
                  家事と兼用なら、事業で使う割合だけが経費です。どの方法が使えるかの判定は、割合をかける前の取得価額の全額で行います
                </span>
              )}
            </label>

            {asset?.software ? (
              <p className="hint" style={{ margin: 0 }}>
                8. 償却方法：ソフトウエアは定額法だけです。
              </p>
            ) : (
              <Radios
                name="depMethod"
                label="8. 償却方法（通常の減価償却のとき）"
                value={depMethod}
                onChange={setDepMethod}
                options={[
                  { value: 'teigaku', label: '定額法（税務署に届け出ていない人はこちら）' },
                  { value: 'teiritsu', label: '定率法（税務署に届け出た人だけ）' },
                ]}
              />
            )}
          </div>
        </details>
      </div>

      {r.ok ? (
        <Result r={r} acquiredOn={acquiredOn} />
      ) : (
        <div className="panel quiet" aria-live="polite">
          <p style={{ margin: 0 }}>{ERROR_TEXT[r.error]}</p>
        </div>
      )}
    </div>
  );
}

function Result({ r, acquiredOn }: { r: Ok; acquiredOn: string }) {
  const p = r.primary;
  return (
    <>
      <div className="panel" style={{ textAlign: 'center', marginTop: 18 }} aria-live="polite">
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          今年（{r.year}年・令和{reiwa(r.year)}年分）の経費
        </div>
        <div className="metric" style={{ justifyContent: 'center' }}>
          <span className="value">{p.thisYearExpense.toLocaleString('ja-JP')}</span>
          <span className="unit">円</span>
        </div>
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700 }}>{METHOD_LABEL[p.id]}</div>
        <p style={{ fontSize: 'var(--fs-sm)', margin: '6px 0 0' }}>{primaryReason(r, acquiredOn)}</p>
        {r.businessRatio < 100 && (
          <p className="hint" style={{ margin: '4px 0 0' }}>
            事業で使う割合 {r.businessRatio}% をかけた額です。
          </p>
        )}
      </div>

      {r.mixedYearNotice && (
        <div className="note" style={{ lineHeight: 1.7 }}>
          <strong>注意：令和8年分は、買った日で上限が違います</strong>
          <br />
          2026年<strong>1〜3月に買った物は30万円未満</strong>、<strong>4月以後に買った物は40万円未満</strong>
          で判定します（令和8年法律第12号 附則35条）。
          たとえば38万円のパソコンは、2026年3月31日に買うと特例を使えず、4月1日に買うと全額をその年の経費にできます。
        </div>
      )}

      <h3 style={{ marginTop: 22 }}>使える方法</h3>
      {r.methods.map((m) => (
        <MethodCard key={m.id} r={r} m={m} />
      ))}

      {r.unavailable.length > 0 && (
        <>
          <h3 style={{ marginTop: 18 }}>使えない方法</h3>
          <ul style={{ fontSize: 'var(--fs-sm)' }}>
            {r.unavailable.map((u) => (
              <li key={u.id}>
                <strong>{METHOD_LABEL[u.id]}</strong>：{unavailableText(u, r, acquiredOn, r.annualCap)}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="hint" style={{ marginTop: 12 }}>
        どの方法を選ぶかで、今年と来年以降の経費の配分と、償却資産税の申告に載るかが変わります（どれが得かは、その年と翌年以降の所得、償却資産税の免税点〔令和{reiwaNendo(KAISEI_AFTER_NENDO)}年度から{man(menzeiten(KAISEI_AFTER_NENDO))}〕に近いかで変わります）。
        {r.used && `中古なので、耐用年数は簡便法で${r.life}年（法定${r.legalYears}年）にしています。`}
        {r.depMethodForced && 'ソフトウエアは定額法だけなので、定額法で計算しています。'}
        40万円未満の特例の対象は、常時使用する従業員が400人以下の個人です。
        償却費・経費の1円未満は切り捨てています。1円未満の扱いは会計ソフト・税務署の案内に合わせてください。
      </p>
      <p className="hint">本ツールの判定と金額は目安です。実際の申告の内容は、税務署か税理士に確認してください。</p>
    </>
  );
}

function MethodCard({ r, m }: { r: Ok; m: MethodResult }) {
  const rows = kessanshoRows(r, m);
  const showSchedule = m.id === 'normal' || m.id === 'ikkatsu';
  return (
    <div className="panel quiet">
      <div style={{ fontWeight: 700 }}>{METHOD_LABEL[m.id]}</div>
      <dl className="kv">
        <div>
          <dt>今年の経費</dt>
          <dd>{yen(m.thisYearExpense)}</dd>
        </div>
        <div>
          <dt>来年以降</dt>
          <dd>{laterText(m)}</dd>
        </div>
        <div>
          <dt>償却資産税の申告</dt>
          <dd>{m.inShokyakuShisan ? '載る' : '載らない'}</dd>
        </div>
      </dl>
      {m.id === 'tokurei' && (
        <p className="hint" style={{ margin: '4px 0 0' }}>
          全額経費にしても、償却資産（固定資産税）の申告には載せます。確定申告書に明細（決算書の減価償却費の計算欄など）を付けた場合に限り使えます。
        </p>
      )}
      {m.id === 'shogaku' && (
        <p className="hint" style={{ margin: '4px 0 0' }}>
          減価償却費の計算欄には書かず、消耗品費などの科目で経費にするのが一般的です。
        </p>
      )}
      {showSchedule && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>年ごとの償却表</summary>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>年</th>
                  <th>月数</th>
                  <th>償却費</th>
                  <th>うち経費</th>
                  <th>年末の未償却残高</th>
                </tr>
              </thead>
              <tbody>
                {m.schedule.map((row) => (
                  <tr key={row.year}>
                    <td>{row.year}</td>
                    <td>{m.id === 'ikkatsu' ? '—' : row.months}</td>
                    <td>{yen(row.depreciation)}</td>
                    <td>{yen(row.expense)}</td>
                    <td>{yen(row.endBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {m.id === 'normal' && (
            <p className="hint">
              最後の年は1円を残します（備忘価額）。未償却残高は、事業割合をかける前の償却費の全額で減らします。
            </p>
          )}
          {m.id === 'ikkatsu' && <p className="hint">1/3で割り切れない端数は3年目に寄せています。</p>}
        </details>
      )}
      {rows && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>
            決算書の「減価償却費の計算」欄の書き方（今年）
          </summary>
          <dl className="kv">
            {rows.map((x) => (
              <div key={x.label}>
                <dt>{x.label}</dt>
                <dd>{x.value || '—'}</dd>
              </div>
            ))}
          </dl>
          <p className="hint">
            列名は令和7年分の青色申告決算書（3ページ）・収支内訳書の様式によります。令和8年分の様式で欄の名前と位置を確かめてください。
          </p>
        </details>
      )}
    </div>
  );
}
