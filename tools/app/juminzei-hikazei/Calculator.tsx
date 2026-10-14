'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  DEFAULT_NENDO,
  MAX_DEPENDENTS,
  MAX_INCOME,
  NENDO_RULES,
  fmtDate,
  judge,
  judgeAllKyuchi,
  judgeHousehold,
  minorBornOnOrAfter,
  over65BornOnOrBefore,
  type JudgeResult,
  type Kyuchi,
  type Nendo,
  type PersonInput,
  type Status,
} from '@/lib/juminzei-hikazei';

const fmtYen = (yen: number) => `${yen.toLocaleString('ja-JP')}円`;
const fmtMan = (yen: number) => `${(yen / 10_000).toLocaleString('ja-JP')}万円`;

const toYen = (v: string) => Math.min(MAX_INCOME, Math.max(0, Math.floor(Number(v) || 0)));

/** 結論の1行（太字） */
const STATUS_TEXT: Record<Status, string> = {
  none: 'かからない見込み（均等割・所得割とも）',
  kintowari: '所得割はかからないが、均等割はかかる見込み',
  taxed: 'かかる見込み',
};

const KYUCHI_OPTIONS: { value: Kyuchi | 'unknown'; label: string }[] = [
  { value: 'unknown', label: '分からない（1級地で判定し、2・3級地の場合も出す）' },
  { value: 1, label: '1級地' },
  { value: 2, label: '2級地' },
  { value: 3, label: '3級地' },
];

/** 世帯員の入力（文字列のまま持つ） */
interface MemberDraft {
  salary: string;
  pension: string;
  over65: boolean;
  dependents: string;
  special: boolean;
}

const EMPTY_MEMBER: MemberDraft = {
  salary: '0',
  pension: '0',
  over65: false,
  dependents: '0',
  special: false,
};

/** 本人のほかに足せる世帯員の数 */
const MAX_MEMBERS = 4;

const toPerson = (m: MemberDraft): PersonInput => ({
  salary: toYen(m.salary),
  pension: toYen(m.pension),
  over65: m.over65,
  dependents: Number(m.dependents) || 0,
  special: m.special,
});

function DependentsSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {Array.from({ length: MAX_DEPENDENTS + 1 }, (_, n) => (
        <option key={n} value={n}>
          {n}人
        </option>
      ))}
    </select>
  );
}

function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="field" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 400 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 'auto', marginTop: 3 }}
      />
      <span>{children}</span>
    </label>
  );
}

/** 均等割の額の書き方（「前後」で済ませず、内訳ごと書く。仕様書） */
function KintowariNote() {
  return (
    <p className="hint" style={{ margin: '6px 0 0' }}>
      均等割の標準は年5,000円（市区町村民税3,000円・道府県民税1,000円・森林環境税1,000円）。県によって超過課税で上乗せがあります。
    </p>
  );
}

export default function Calculator() {
  const [nendo, setNendo] = useState<Nendo>(DEFAULT_NENDO);
  const [salary, setSalary] = useState('1190000');
  const [pension, setPension] = useState('0');
  const [over65, setOver65] = useState(false);
  const [dependents, setDependents] = useState('0');
  const [special, setSpecial] = useState(false);
  const [kyuchiChoice, setKyuchiChoice] = useState<Kyuchi | 'unknown'>('unknown');
  const [members, setMembers] = useState<MemberDraft[]>([]);

  const rule = NENDO_RULES[nendo];
  const kyuchi: Kyuchi = kyuchiChoice === 'unknown' ? 1 : kyuchiChoice;
  const self: PersonInput = {
    salary: toYen(salary),
    pension: toYen(pension),
    over65,
    dependents: Number(dependents) || 0,
    special,
  };
  const r = judge({ ...self, nendo, kyuchi });
  const all = kyuchiChoice === 'unknown' ? judgeAllKyuchi({ ...self, nendo }) : null;
  const household = judgeHousehold([self, ...members.map(toPerson)], { nendo, kyuchi });

  const over65Date = fmtDate(over65BornOnOrBefore(nendo));
  const minorDate = fmtDate(minorBornOnOrAfter(nendo));

  const updateMember = (i: number, patch: Partial<MemberDraft>) =>
    setMembers((ms) => ms.map((m, k) => (k === i ? { ...m, ...patch } : m)));

  return (
    <div className="card">
      <p className="hint" style={{ marginTop: 0 }}>
        生活保護の生活扶助を受けている方は、住民税がかかりません（入力は不要です）。
      </p>

      <div className="field">
        <span className="field-label">どの年度を見るか</span>
        <div style={{ display: 'grid', gap: 6 }}>
          {(['R9', 'R8'] as const).map((n) => (
            <label key={n} style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
              <input
                type="radio"
                name="nendo"
                checked={nendo === n}
                onChange={() => setNendo(n)}
                style={{ width: 'auto' }}
              />
              {NENDO_RULES[n].label}（{NENDO_RULES[n].incomeYear}年の収入
              {n === 'R9' ? '。2027年6月からの住民税' : '。いまの通知書の答え合わせ'}）
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="salary">{rule.incomeYear}年の給与収入（年額・額面・円）</label>
        <input
          id="salary"
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_INCOME}
          step={10000}
          value={salary}
          onChange={(e) => setSalary(e.target.value)}
        />
        <p className="hint">源泉徴収票の「支払金額」。パート・アルバイトも含みます。なければ0。</p>
      </div>

      <div className="field">
        <label htmlFor="pension">{rule.incomeYear}年の公的年金の収入（年額・円）</label>
        <input
          id="pension"
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_INCOME}
          step={10000}
          value={pension}
          onChange={(e) => setPension(e.target.value)}
        />
        <p className="hint">老齢年金の源泉徴収票の「支払金額」。遺族年金・障害年金は非課税なので入れません。</p>
      </div>

      <Checkbox checked={over65} onChange={setOver65}>
        {rule.incomeYear}年12月31日時点で65歳以上（{over65Date}以前の生まれ）
      </Checkbox>

      <div className="field">
        <label htmlFor="dependents">同一生計配偶者・扶養親族の人数</label>
        <DependentsSelect id="dependents" value={dependents} onChange={setDependents} />
        <p className="hint">
          <strong>16歳未満のお子さんも数えます</strong>
          （年末調整の扶養控除の欄に書かない子も入ります）。所得が{fmtMan(rule.dependentIncomeMax)}
          以下（給与だけなら年収{fmtMan(rule.dependentSalaryMax)}以下）の配偶者・親族が対象です。
        </p>
      </div>

      <Checkbox checked={special} onChange={setSpecial}>
        障害者・ひとり親・寡婦・未成年のいずれかに当たる
        <br />
        <span className="hint">
          当たれば合計所得135万円以下で非課税。未成年は{rule.fiscalYear}年1月1日時点で18歳未満（{minorDate}以降の生まれ）。
        </span>
      </Checkbox>

      <div className="field">
        <label htmlFor="kyuchi">住んでいる市区町村の級地（生活保護の級地）</label>
        <select
          id="kyuchi"
          value={String(kyuchiChoice)}
          onChange={(e) =>
            setKyuchiChoice(e.target.value === 'unknown' ? 'unknown' : (Number(e.target.value) as Kyuchi))
          }
        >
          {KYUCHI_OPTIONS.map((o) => (
            <option key={o.value} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="hint">
          東京23区・政令指定都市の多くは1級地です。級地で変わるのは均等割の線だけで、所得割の線は全国共通です。
        </p>
      </div>

      {/* 入力を1つ変えたとき、結論の1行がスクロールせずに見えるよう画面の下に貼り付ける（仕様書「公開条件」） */}
      <div
        className="panel"
        style={{
          // 320×568 で入力欄を隠しすぎないよう、余白と文字を詰めて1〜2行に収める
          position: 'sticky',
          bottom: 8,
          zIndex: 1,
          boxShadow: 'var(--shadow-md)',
          padding: '8px 12px',
          fontSize: 'var(--fs-sm)',
        }}
        aria-live="polite"
      >
        <strong>
          {rule.label}の住民税：{STATUS_TEXT[r.status]}
        </strong>
        {r.bySpecial && <span className="hint">（障害者・ひとり親等の135万円の基準）</span>}
      </div>

      <dl className="kv">
        <div>
          <dt>合計所得金額（給与所得 {fmtYen(r.kyuyoShotoku)} ＋ 年金の雑所得 {fmtYen(r.nenkinShotoku)}）</dt>
          <dd>{fmtYen(r.totalIncome)}</dd>
        </div>
        <div>
          <dt>均等割がかからない線{kyuchiChoice === 'unknown' ? '（1級地）' : `（${kyuchi}級地）`}</dt>
          <dd>{fmtYen(r.limitKintowari)}以下</dd>
        </div>
        <div>
          <dt>所得割がかからない線（全国共通）</dt>
          <dd>{fmtYen(r.limitShotokuwari)}以下</dd>
        </div>
        {special && (
          <div>
            <dt>障害者・ひとり親等の線</dt>
            <dd>135万円以下</dd>
          </div>
        )}
        <div>
          <dt>あと何円まで非課税か（給与収入に直して）</dt>
          <dd>
            {r.headroomSalary === null
              ? '—'
              : `あと${fmtYen(r.headroomSalary)}（給与${fmtYen(r.maxSalaryNone ?? 0)}まで）`}
          </dd>
        </div>
      </dl>
      {r.choseiKojo > 0 && (
        <p className="hint">給与と年金の両方があるので、所得金額調整控除 {fmtYen(r.choseiKojo)} を給与所得から引いています。</p>
      )}
      {r.status === 'kintowari' && r.maxSalaryShotokuwari !== null && (
        <p className="hint">所得割は給与{fmtYen(r.maxSalaryShotokuwari)}までかかりません。</p>
      )}
      {r.status !== 'none' && <KintowariNote />}

      {all && (all[2].status !== all[1].status || all[3].status !== all[1].status) && (
        <div className="panel quiet">
          <strong>級地で結論が変わります</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: '1.2em' }}>
            {([1, 2, 3] as const).map((k) => (
              <li key={k}>
                {k}級地（均等割の線 {fmtMan(all[k].limitKintowari)}）：{STATUS_TEXT[all[k].status]}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel quiet">
        <strong>所得税（{rule.incomeYearLabel}）との違い</strong>
        <p style={{ margin: '6px 0 0' }}>
          {r.incomeTaxFreeByBasic
            ? `所得税は、合計所得が基礎控除${fmtMan(r.basicDeductionIncomeTax)}以下なのでかからない見込みです。`
            : `所得税は、基礎控除${fmtMan(r.basicDeductionIncomeTax)}だけでは課税所得が残ります（社会保険料控除・扶養控除などで変わります）。`}
          {r.incomeTaxFreeByBasic && r.status !== 'none' &&
            ' 一方で住民税の非課税の線はそれより低いので、「所得税はかからないのに住民税はかかる」帯です。'}
        </p>
      </div>

      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
          世帯の判定（住民税非課税世帯か）
        </summary>
        <p className="hint">
          住民票上の世帯の全員が非課税（均等割もかからない）なら「住民税非課税世帯」です。本人は上の入力を使います。
          同じ世帯の人をあと{MAX_MEMBERS}人まで足せます。
        </p>
        {members.map((m, i) => (
          <fieldset
            key={i}
            style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, margin: '0 0 12px' }}
          >
            <legend style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>世帯員 {i + 1}</legend>
            <div className="field">
              <label htmlFor={`m${i}-salary`}>給与収入（円）</label>
              <input
                id={`m${i}-salary`}
                type="number"
                inputMode="numeric"
                min={0}
                step={10000}
                value={m.salary}
                onChange={(e) => updateMember(i, { salary: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor={`m${i}-pension`}>公的年金の収入（円）</label>
              <input
                id={`m${i}-pension`}
                type="number"
                inputMode="numeric"
                min={0}
                step={10000}
                value={m.pension}
                onChange={(e) => updateMember(i, { pension: e.target.value })}
              />
            </div>
            <Checkbox checked={m.over65} onChange={(v) => updateMember(i, { over65: v })}>
              65歳以上（{over65Date}以前の生まれ）
            </Checkbox>
            <div className="field">
              <label htmlFor={`m${i}-dependents`}>この人が扶養している人数（16歳未満の子を含む）</label>
              <DependentsSelect
                id={`m${i}-dependents`}
                value={m.dependents}
                onChange={(v) => updateMember(i, { dependents: v })}
              />
            </div>
            <Checkbox checked={m.special} onChange={(v) => updateMember(i, { special: v })}>
              障害者・ひとり親・寡婦・未成年のいずれかに当たる
            </Checkbox>
            <p className="hint" style={{ margin: 0 }}>
              この人：{STATUS_TEXT[household.members[i + 1].status]}
              <button
                type="button"
                onClick={() => setMembers((ms) => ms.filter((_, k) => k !== i))}
                style={{ marginLeft: 8 }}
              >
                外す
              </button>
            </p>
          </fieldset>
        ))}
        {members.length < MAX_MEMBERS && (
          <button type="button" onClick={() => setMembers((ms) => [...ms, { ...EMPTY_MEMBER }])}>
            世帯員を足す
          </button>
        )}

        <HouseholdSummary members={household.members} hikazei={household.hikazeiSetai} taxed={household.taxedIndexes} />
      </details>

      <div className="note">
        判定は{rule.label}の住民税の見込みです。最終的な課税・非課税は、お住まいの市区町村の決定（6月ごろに届く通知書）によります。
        均等割の線は市区町村の条例で定められ、ここでは政令の基準どおりに定めた額で判定しています。
      </div>
    </div>
  );
}

function HouseholdSummary({
  members,
  hikazei,
  taxed,
}: {
  members: JudgeResult[];
  hikazei: boolean;
  taxed: number[];
}) {
  const name = (i: number) => (i === 0 ? '本人' : `世帯員 ${i}`);
  return (
    <div className="panel">
      <strong>{hikazei ? '住民税非課税世帯の見込みです' : '住民税非課税世帯ではない見込みです'}</strong>
      {!hikazei && (
        <p className="hint" style={{ margin: '6px 0 0' }}>
          課税される人：{taxed.map((i) => `${name(i)}（${STATUS_TEXT[members[i].status]}）`).join('、')}
        </p>
      )}
      {hikazei && (
        <ul style={{ margin: '6px 0 0', paddingLeft: '1.2em' }}>
          <li>
            高額療養費の区分が「住民税非課税」になります（<Link href="/kogaku-ryoyohi/">高額療養費 計算機</Link>）
          </li>
          <li>
            高校生等奨学給付金の対象になりえます（<Link href="/koko-jugyoryo/">高校授業料 実質負担 計算機</Link>）
          </li>
          <li>国民健康保険料の軽減・自治体の給付金は、お住まいの市区町村の案内を見てください</li>
        </ul>
      )}
    </div>
  );
}
