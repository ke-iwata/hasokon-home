'use client';

import { useEffect, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import { ToolLink } from '@/app/PublicToolLink';
import { formatDate, parseDate, type DateParts } from '@/lib/date-parts';
import {
  DISCLAIMER,
  RELATION_LABELS,
  SMALL_LAND_NOTE,
  VERDICT_MESSAGES,
  applyFraction,
  civilShares,
  formatFraction,
  heirCountNotes,
  perHeirTax,
  type Acquirer,
  type DisabilityKind,
  type Person,
  type PersonInput,
} from '@/lib/sozokuzei-keisan';
import { formatJaWithWeekday, otherDeadlines, taxDueDate } from '@/lib/sozoku-toki-kigen';

const yen = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}円`;
/** 入力は万円。小数（0.5 万円など）も受ける */
const manToYen = (v: string) => Math.max(0, Math.round((Number(v) || 0) * 10_000));

const radioRow = { display: 'flex', gap: 16, flexWrap: 'wrap' as const, fontSize: 'var(--fs-sm)' };
const radioLabel = { fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center', minHeight: 44 };
const rowLabel = { textAlign: 'left' as const, whiteSpace: 'nowrap' as const };
const stepButton = { width: 44, height: 44, fontSize: '1.2rem', padding: 0 };

/** 600px 以上は表、それ未満は人ごとのカード（仕様書「結果」）。CSS クラスを増やさないため matchMedia で切り替える */
function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 600px)');
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return wide;
}

/** 人数の −／＋（44px） */
function Stepper({
  id,
  label,
  value,
  onChange,
  max = 20,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  max?: number;
}) {
  return (
    <div className="field">
      <div className="field-label" id={`${id}-label`} style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', marginBottom: 6 }}>
        {label}
      </div>
      <div role="group" aria-labelledby={`${id}-label`} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" style={stepButton} aria-label={`${label}を減らす`} onClick={() => onChange(Math.max(0, value - 1))}>
          −
        </button>
        <output aria-live="polite" style={{ minWidth: 40, textAlign: 'center', fontWeight: 700 }}>
          {value}人
        </output>
        <button type="button" style={stepButton} aria-label={`${label}を増やす`} onClick={() => onChange(Math.min(max, value + 1))}>
          ＋
        </button>
      </div>
    </div>
  );
}

interface Extra {
  acquired: string;
  insurance: string;
  retirement: string;
  gifts: string;
  giftTax: string;
  birth: string;
  disability: '' | DisabilityKind;
}

const EMPTY_EXTRA: Extra = { acquired: '', insurance: '', retirement: '', gifts: '', giftTax: '', birth: '', disability: '' };

/** 続柄＋通し番号の表示名（「子1」「孫（代襲相続）1-2」） */
function displayName(p: Person, all: readonly Person[]): string {
  if (p.relation === 'spouse') return '配偶者';
  const same = all.filter((q) => q.relation === p.relation && (p.relation !== 'grandchild' || q.branch === p.branch));
  const n = same.indexOf(p) + 1;
  if (p.relation === 'grandchild') return `孫（亡くなった子${(p.branch ?? 0) + 1}の子）${same.length > 1 ? n : ''}`;
  return `${RELATION_LABELS[p.relation]}${same.length > 1 || all.filter((q) => q.relation === p.relation).length > 1 ? n : ''}`;
}

/**
 * 相続税 計算機の UI。ロジックは持たせない（すべて lib/sozokuzei-keisan.ts の純関数）。
 * 相続人の欄は段階的に出す：子の系統がいれば父母・兄弟姉妹は出さない。子の系統が全員放棄したときだけ次の順位を出す。
 */
export default function Calculator() {
  const wide = useWide();
  const [estate, setEstate] = useState('10000');
  const [death, setDeath] = useState('');

  const [spouse, setSpouse] = useState(true);
  const [children, setChildren] = useState(2);
  const [adopted, setAdopted] = useState(0);
  const [adoptedGrand, setAdoptedGrand] = useState(0);
  const [adoptedAsReal, setAdoptedAsReal] = useState(0);
  const [branches, setBranches] = useState<number[]>([]);
  const [parents, setParents] = useState(0);
  const [siblings, setSiblings] = useState(0);
  const [halfSiblings, setHalfSiblings] = useState(0);

  const [renounced, setRenounced] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<'legal' | 'custom'>('legal');
  const [extras, setExtras] = useState<Record<string, Extra>>({});

  /** 相続開始日の既定は「開いた日」。静的書き出しなのでビルド時刻で固定せず、マウント後に入れる */
  useEffect(() => {
    const now = new Date();
    setDeath(formatDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }));
  }, []);

  // ── 人の一覧を組み立てる（id は続柄＋番号で固定。人数を変えても他の人の入力が消えない）
  const asReal = Math.min(adoptedAsReal, adopted);
  const grandAdopted = Math.min(adoptedGrand, adopted - asReal);
  const childRank: Person[] = [
    ...Array.from({ length: children }, (_, i) => ({ id: `child-${i}`, relation: 'child' as const })),
    ...Array.from({ length: adopted }, (_, i) => ({
      id: `adopted-${i}`,
      relation: i < asReal ? ('adopted-as-real' as const) : i < asReal + grandAdopted ? ('adopted-grandchild' as const) : ('adopted' as const),
    })),
    ...branches.flatMap((n, b) =>
      Array.from({ length: n }, (_, i) => ({ id: `grand-${b}-${i}`, relation: 'grandchild' as const, branch: b })),
    ),
  ].map((p) => ({ ...p, renounced: !!renounced[p.id] }));
  const childRankGone = childRank.every((p) => p.renounced);
  const showParents = childRankGone;
  const parentRank: Person[] = showParents
    ? Array.from({ length: parents }, (_, i) => ({ id: `parent-${i}`, relation: 'parent' as const, renounced: !!renounced[`parent-${i}`] }))
    : [];
  const showSiblings = showParents && parentRank.every((p) => p.renounced);
  const siblingRank: Person[] = showSiblings
    ? [
        ...Array.from({ length: siblings }, (_, i) => ({ id: `sib-${i}`, relation: 'sibling' as const })),
        ...Array.from({ length: halfSiblings }, (_, i) => ({ id: `half-${i}`, relation: 'half-sibling' as const })),
      ].map((p) => ({ ...p, renounced: !!renounced[p.id] }))
    : [];
  const people: Person[] = [
    ...(spouse ? [{ id: 'spouse', relation: 'spouse' as const, renounced: !!renounced.spouse }] : []),
    ...childRank,
    ...parentRank,
    ...siblingRank,
  ];

  const estateYen = manToYen(estate);
  const shares = civilShares(people);
  const deathDate = parseDate(death);
  const ex = (id: string) => extras[id] ?? EMPTY_EXTRA;
  const setEx = (id: string, patch: Partial<Extra>) => setExtras((m) => ({ ...m, [id]: { ...ex(id), ...patch } }));

  const inputs: PersonInput[] = people.map((person) => {
    const e = ex(person.id);
    const share = shares.get(person.id);
    const acquired = !share ? 0 : mode === 'legal' ? applyFraction(estateYen, share) : manToYen(e.acquired);
    return {
      person,
      acquired,
      insurance: manToYen(e.insurance),
      retirement: manToYen(e.retirement),
      addedGifts: manToYen(e.gifts),
      giftTaxPaid: manToYen(e.giftTax),
      birth: parseDate(e.birth),
      disability: e.disability || null,
    };
  });
  const customTotal = inputs.reduce((s, i) => s + i.acquired, 0);
  const result = deathDate ? perHeirTax({ people, inputs, inheritanceDate: deathDate }) : null;

  const toggleRenounced = (id: string) => setRenounced((m) => ({ ...m, [id]: !m[id] }));
  const name = (p: Person) => displayName(p, people);

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="sozoku-estate">遺産の額（正味・万円）</label>
        <input
          id="sozoku-estate"
          type="number"
          inputMode="decimal"
          min={0}
          step={100}
          value={estate}
          onChange={(e) => setEstate(e.target.value)}
          onBlur={() => trackToolUse('sozokuzei-keisan', 'estate')}
        />
        <p className="hint">
          財産の評価額から債務・葬式費用を引いた額。死亡保険金・死亡退職金は下の「任意の入力」に分けて入れます。
          小規模宅地等の特例を使うなら、使ったあとの評価額を入れてください。
        </p>
      </div>

      <div className="field">
        <label htmlFor="sozoku-death">相続開始日（亡くなった日）</label>
        <input id="sozoku-death" type="date" value={death} onChange={(e) => setDeath(e.target.value)} />
      </div>

      <h3>相続人の構成</h3>
      <div className="field">
        <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', marginBottom: 6 }}>配偶者</div>
        <div style={radioRow}>
          {(
            [
              [true, 'いる'],
              [false, 'いない'],
            ] as const
          ).map(([v, label]) => (
            <label key={label} style={radioLabel}>
              <input type="radio" name="sozoku-spouse" checked={spouse === v} onChange={() => setSpouse(v)} style={{ width: 'auto' }} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="field-row">
        <Stepper id="sozoku-children" label="子（実子）" value={children} onChange={setChildren} />
        <Stepper id="sozoku-adopted" label="養子" value={adopted} onChange={setAdopted} />
      </div>
      {adopted > 0 && (
        <>
          <Stepper
            id="sozoku-adopted-grand"
            label="養子のうち孫養子（2割加算の対象）"
            value={grandAdopted}
            onChange={setAdoptedGrand}
            max={adopted - asReal}
          />
          <details className="field">
            <summary>養子のうち「実子として数える人」がいる場合</summary>
            <p className="hint">
              特別養子・配偶者の実子で亡くなった人の養子になった人などは、養子の数の上限（実子がいれば1人・いなければ2人）の計算で実子として数えます（国税庁 No.4170）。
            </p>
            <Stepper
              id="sozoku-adopted-real"
              label="実子として数える養子"
              value={asReal}
              onChange={setAdoptedAsReal}
              max={adopted}
            />
          </details>
        </>
      )}

      <details className="field">
        <summary>先に亡くなった子がいる（代襲相続の孫）</summary>
        <p className="hint">亡くなった子ごとに、その子の子（孫）の人数を入れます。孫は亡くなった子1人分の相続分を頭数で分けます。</p>
        {branches.map((n, b) => (
          <Stepper
            key={b}
            id={`sozoku-branch-${b}`}
            label={`亡くなった子${b + 1}の子（孫）`}
            value={n}
            onChange={(v) => setBranches((arr) => arr.map((x, i) => (i === b ? v : x)))}
          />
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={{ minHeight: 44, padding: '0 14px' }} onClick={() => setBranches((a) => [...a, 1])}>
            亡くなった子を足す
          </button>
          {branches.length > 0 && (
            <button type="button" style={{ minHeight: 44, padding: '0 14px' }} onClick={() => setBranches((a) => a.slice(0, -1))}>
              最後の1人を外す
            </button>
          )}
        </div>
      </details>

      {showParents && (
        <>
          {childRank.length > 0 && <p className="hint">子の全員が放棄したので、父母（いなければ兄弟姉妹）が相続人になります。</p>}
          <Stepper id="sozoku-parents" label="父母（直系尊属）" value={parents} onChange={setParents} max={4} />
        </>
      )}
      {showSiblings && (
        <div className="field-row">
          <Stepper id="sozoku-siblings" label="兄弟姉妹（父母が同じ）" value={siblings} onChange={setSiblings} />
          <Stepper id="sozoku-half" label="兄弟姉妹（父母の一方だけ同じ）" value={halfSiblings} onChange={setHalfSiblings} />
        </div>
      )}

      {people.length > 0 && (
        <details className="field">
          <summary>相続を放棄した人がいる場合</summary>
          <p className="hint">
            放棄した人も法定相続人の数と基礎控除には入れ、取得額は0にします。子が全員放棄すると、父母（いなければ兄弟姉妹）の欄が出ます。
          </p>
          {people.map((p) => (
            <label key={p.id} style={radioLabel}>
              <input type="checkbox" checked={!!p.renounced} onChange={() => toggleRenounced(p.id)} style={{ width: 'auto' }} />
              {name(p)}が放棄した
            </label>
          ))}
        </details>
      )}

      <h3>分け方</h3>
      <div style={radioRow}>
        {(
          [
            ['legal', '法定相続分どおり'],
            ['custom', '1人ずつ取得額を入れる'],
          ] as const
        ).map(([v, label]) => (
          <label key={v} style={radioLabel}>
            <input type="radio" name="sozoku-mode" checked={mode === v} onChange={() => setMode(v)} style={{ width: 'auto' }} />
            {label}
          </label>
        ))}
      </div>
      {mode === 'custom' && (
        <>
          <div className="field-row">
            {people
              .filter((p) => shares.has(p.id))
              .map((p) => (
                <div className="field" key={p.id}>
                  <label htmlFor={`sozoku-acq-${p.id}`}>{name(p)}の取得額（万円）</label>
                  <input
                    id={`sozoku-acq-${p.id}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={ex(p.id).acquired}
                    placeholder={String(applyFraction(estateYen, shares.get(p.id)!) / 10_000)}
                    onChange={(e) => setEx(p.id, { acquired: e.target.value })}
                  />
                </div>
              ))}
          </div>
          {customTotal !== estateYen && (
            <p className="hint">入れた取得額の合計は{yen(customTotal)}で、遺産の額（{yen(estateYen)}）と違います。計算は取得額の合計で行います。</p>
          )}
        </>
      )}

      <details className="field" style={{ marginTop: 12 }}>
        <summary>任意の入力（死亡保険金・死亡退職金・生前贈与・未成年・障害者）</summary>
        <p className="hint">
          加算する生前贈与は、<ToolLink slug="zoyozei-keisan">贈与税の計算機</ToolLink>
          で、贈与日と相続開始日から加算されるかを判定できます。ここには加算される額と、その贈与にかかった贈与税額を入れます。
        </p>
        {people.map((p) => {
          const e = ex(p.id);
          return (
            <fieldset key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, margin: '12px 0' }}>
              <legend style={{ fontWeight: 700 }}>
                {name(p)}
                {p.renounced ? '（放棄）' : ''}
              </legend>
              <div className="field-row">
                {(
                  [
                    ['insurance', '死亡保険金（万円）'],
                    ['retirement', '死亡退職金（万円）'],
                    ['gifts', '加算する生前贈与（万円）'],
                    ['giftTax', 'その贈与税額（万円）'],
                  ] as const
                ).map(([k, label]) => (
                  <div className="field" key={k}>
                    <label htmlFor={`sozoku-${k}-${p.id}`}>{label}</label>
                    <input
                      id={`sozoku-${k}-${p.id}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={e[k]}
                      onChange={(ev) => setEx(p.id, { [k]: ev.target.value })}
                    />
                  </div>
                ))}
              </div>
              <div className="field-row">
                  <div className="field">
                    <label htmlFor={`sozoku-birth-${p.id}`}>生年月日（未成年者・障害者控除に使う）</label>
                    <input
                      id={`sozoku-birth-${p.id}`}
                      type="date"
                      value={e.birth}
                      onChange={(ev) => setEx(p.id, { birth: ev.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`sozoku-dis-${p.id}`}>障害者控除</label>
                    <select
                      id={`sozoku-dis-${p.id}`}
                      value={e.disability}
                      onChange={(ev) => setEx(p.id, { disability: ev.target.value as Extra['disability'] })}
                    >
                      <option value="">なし</option>
                      <option value="general">一般障害者</option>
                      <option value="special">特別障害者</option>
                    </select>
                  </div>
                </div>
            </fieldset>
          );
        })}
      </details>

      {deathDate === null ? (
        <div className="panel quiet">
          <p className="hint" style={{ margin: 0 }}>
            相続開始日を入れると結果が出ます。
          </p>
        </div>
      ) : result === null ? (
        <div className="panel quiet">
          <p style={{ margin: 0 }}>相続人がいない場合は対象外です。相続人の構成を入れてください。</p>
        </div>
      ) : (
        <Result result={result} deathDate={deathDate} wide={wide} name={name} />
      )}
    </div>
  );
}

function Result({
  result: r,
  deathDate,
  wide,
  name,
}: {
  result: NonNullable<ReturnType<typeof perHeirTax>>;
  deathDate: DateParts;
  wide: boolean;
  name: (p: Person) => string;
}) {
  const due = taxDueDate(otherDeadlines(formatDate(deathDate)).sozokuzei);
  const notes = heirCountNotes(r.heirs);
  return (
    <>
      <div className="panel" style={{ textAlign: 'center' }} aria-live="polite">
        <p style={{ margin: '0 0 6px', fontWeight: 700 }}>{VERDICT_MESSAGES[r.verdict]}</p>
        {r.verdict === 'tax' && (
          <div className="metric" style={{ justifyContent: 'center' }}>
            <span className="value">{r.payableTotal.toLocaleString('ja-JP')}</span>
            <span className="unit">円</span>
            <span className="label">納付税額の合計</span>
          </div>
        )}
        <p className="hint" style={{ margin: '6px 0 0' }}>
          課税価格の合計 {yen(r.taxableTotal)} ／ 基礎控除 {yen(r.basic)}
        </p>
        {(r.verdict === 'below-basic' || r.verdict === 'zero-by-credits') && (
          <p className="hint" style={{ margin: '6px 0 0' }}>
            {SMALL_LAND_NOTE}
          </p>
        )}
      </div>
      <p className="hint" style={{ marginTop: 6 }}>
        {DISCLAIMER}
      </p>

      <dl className="kv">
        <div>
          <dt>法定相続人の数</dt>
          <dd>{r.heirs.count}人</dd>
        </div>
        {r.verdict !== 'below-basic' && (
          <>
            <div>
              <dt>課税遺産総額（課税価格の合計 − 基礎控除）</dt>
              <dd>{yen(r.total.taxableEstate)}</dd>
            </div>
            <div>
              <dt>相続税の総額</dt>
              <dd>{yen(r.total.total)}</dd>
            </div>
          </>
        )}
      </dl>
      {notes.map((n) => (
        <p key={n} className="hint" style={{ margin: '2px 0' }}>
          {n}
        </p>
      ))}

      {r.verdict !== 'below-basic' && (
        <>
          <h3>相続税の総額の出し方（法定相続分で分けたと仮定）</h3>
          <table>
            <thead>
              <tr>
                <th>法定相続分</th>
                <th>取得金額</th>
                <th>税率／控除額</th>
                <th>税額</th>
              </tr>
            </thead>
            <tbody>
              {r.total.rows.map((row, i) => (
                <tr key={i}>
                  <td>{formatFraction(row.share)}</td>
                  <td>{yen(row.amount)}</td>
                  <td>
                    {Math.round(row.bracket.rate * 100)}%／{row.bracket.deduction === 0 ? '—' : yen(row.bracket.deduction)}
                  </td>
                  <td>{yen(row.tax)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>1人ずつの納付税額</h3>
          {wide ? <PerPersonTable acquirers={r.acquirers} name={name} /> : r.acquirers.map((a) => <PerPersonCard key={a.person.id} a={a} name={name} />)}
          {r.acquirers.some((a) => a.minorUnused > 0 || a.disabledUnused > 0) && (
            <p className="hint">
              未成年者控除・障害者控除で引ききれなかった額は、扶養義務者の相続税から引けます。このツールでは振替は計算していません。
            </p>
          )}
        </>
      )}

      <div className="panel quiet">
        <p style={{ margin: 0 }}>
          申告・納付の期限：<strong>{formatJaWithWeekday(due.due)}</strong>
          {due.shiftedBecause && `（${due.shiftedBecause}のため繰り下げ）`}
        </p>
        <p className="hint" style={{ margin: '6px 0 0' }}>
          相続開始日を「亡くなったことを知った日」とみなして、その翌日から10か月で出しています。後で知った場合は知った日から数えるので、期限は後ろにずれます（
          <ToolLink slug="sozoku-toki-kigen">相続登記の期限の計算機</ToolLink>で知った日から出せます）。
          {due.holidayUnknown && '祝日データの範囲外の年なので、祝日による繰り下げは見ていません。'}
        </p>
      </div>
    </>
  );
}

type Line = { label: string; value: number; sign: '' | '+' | '−' };

function lines(a: Acquirer): Line[] {
  return [
    { label: '取得額', value: a.acquired, sign: '' },
    { label: '死亡保険金（非課税分を除く）', value: a.insurance - a.insuranceExempt, sign: '+' },
    { label: '死亡退職金（非課税分を除く）', value: a.retirement - a.retirementExempt, sign: '+' },
    { label: '加算する生前贈与', value: a.addedGifts, sign: '+' },
    { label: '課税価格（千円未満切捨て）', value: a.taxable, sign: '' },
    { label: '按分した税額', value: a.allocated, sign: '' },
    { label: '2割加算', value: a.surcharge, sign: '+' },
    { label: '贈与税額控除', value: a.giftCredit, sign: '−' },
    { label: '配偶者の税額軽減', value: a.spouseRelief, sign: '−' },
    { label: '未成年者控除', value: a.minorCredit, sign: '−' },
    { label: '障害者控除', value: a.disabledCredit, sign: '−' },
  ];
}

function PerPersonCard({ a, name }: { a: Acquirer; name: (p: Person) => string }) {
  // 0 円の行は畳む（仕様書「結果」）
  const shown = lines(a).filter((l) => l.value !== 0 || l.label === '取得額' || l.label === '按分した税額');
  return (
    <div className="panel quiet">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong>{name(a.person)}</strong>
        <div className="metric">
          <span className="value">{a.payable.toLocaleString('ja-JP')}</span>
          <span className="unit">円</span>
        </div>
      </div>
      <dl className="kv">
        {shown.map((l) => (
          <div key={l.label}>
            <dt>
              {l.sign && `${l.sign} `}
              {l.label}
            </dt>
            <dd>{yen(l.value)}</dd>
          </div>
        ))}
        <div>
          <dt>納付税額（100円未満切捨て）</dt>
          <dd>{yen(a.payable)}</dd>
        </div>
      </dl>
    </div>
  );
}

function PerPersonTable({ acquirers, name }: { acquirers: Acquirer[]; name: (p: Person) => string }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>相続人</th>
            <th>納付税額</th>
            <th>課税価格</th>
            <th>按分した税額</th>
            <th>2割加算</th>
            <th>贈与税額控除</th>
            <th>配偶者の軽減</th>
            <th>未成年者・障害者控除</th>
          </tr>
        </thead>
        <tbody>
          {acquirers.map((a) => (
            <tr key={a.person.id}>
              <td style={rowLabel}>{name(a.person)}</td>
              <td>
                <strong>{yen(a.payable)}</strong>
              </td>
              <td>{yen(a.taxable)}</td>
              <td>{yen(a.allocated)}</td>
              <td>{a.surcharge ? `+${yen(a.surcharge)}` : '—'}</td>
              <td>{a.giftCredit ? `−${yen(a.giftCredit)}` : '—'}</td>
              <td>{a.spouseRelief ? `−${yen(a.spouseRelief)}` : '—'}</td>
              <td>{a.minorCredit + a.disabledCredit ? `−${yen(a.minorCredit + a.disabledCredit)}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
