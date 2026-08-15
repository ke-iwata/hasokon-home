'use client';

import { useState } from 'react';
import {
  CHILD_AGE_LABELS,
  INCOME_LIMIT,
  LIEN_CAP_PER_CHILD,
  LIVING_COST_INDEX,
  MAX_CHILDREN,
  STATUTORY_SUPPORT_PER_CHILD,
  calcYoikuhi,
  type ChildAgeBand,
  type IncomeKind,
} from '@/lib/yoikuhi';
import { trackToolUse } from '@/lib/analytics';

const fmtYen = (yen: number) => `${Math.round(yen).toLocaleString('ja-JP')}円`;
/** 円 → 「◯万円」（表示用。端数は切り捨てず小数1桁まで） */
const fmtMan = (yen: number) => `${Math.round(yen / 1_000) / 10}万円`;
/** 円 → 「2,000万円」（算定表の軸と同じ、桁区切りつきの万円表記） */
const fmtManInt = (yen: number) => `${(yen / 10_000).toLocaleString('ja-JP')}万円`;

const INCOME_KINDS: { value: IncomeKind; label: string; hint: string }[] = [
  { value: 'salary', label: '給与所得者', hint: '源泉徴収票の「支払金額」' },
  { value: 'business', label: '自営業者', hint: '確定申告書の「課税される所得金額」' },
];

const AGE_BANDS = Object.keys(CHILD_AGE_LABELS) as ChildAgeBand[];

/** 年収の入力欄は万円で受ける（算定表の軸が万円のため）。lib には円で渡す */
const manToYen = (man: string) => (Number(man) || 0) * 10_000;

export default function Calculator() {
  const [obligorIncome, setObligorIncome] = useState('500');
  const [obligorKind, setObligorKind] = useState<IncomeKind>('salary');
  const [obligeeIncome, setObligeeIncome] = useState('100');
  const [obligeeKind, setObligeeKind] = useState<IncomeKind>('salary');
  const [children, setChildren] = useState<ChildAgeBand[]>(['0-14']);

  const result = calcYoikuhi({
    obligorIncome: manToYen(obligorIncome),
    obligorKind,
    obligeeIncome: manToYen(obligeeIncome),
    obligeeKind,
    children,
  });

  const changeCount = (count: number) => {
    setChildren((prev) =>
      Array.from({ length: count }, (_, i) => prev[i] ?? ('0-14' as ChildAgeBand))
    );
    trackToolUse('yoikuhi-keisan', 'children');
  };

  const changeAge = (index: number, band: ChildAgeBand) => {
    setChildren((prev) => prev.map((b, i) => (i === index ? band : b)));
    trackToolUse('yoikuhi-keisan', 'children');
  };

  const incomeField = (
    id: string,
    label: string,
    value: string,
    setValue: (v: string) => void,
    kind: IncomeKind,
    setKind: (k: IncomeKind) => void
  ) => (
    <div className="field">
      <label htmlFor={id}>{label}（万円）</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={25}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => trackToolUse('yoikuhi-keisan', 'calculate')}
      />
      <div className="field-row" style={{ marginTop: 8 }}>
        {INCOME_KINDS.map((k) => (
          <label
            key={k.value}
            style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}
          >
            <input
              type="radio"
              name={`${id}-kind`}
              checked={kind === k.value}
              onChange={() => setKind(k.value)}
              style={{ width: 'auto' }}
            />
            <span>{k.label}</span>
          </label>
        ))}
      </div>
      <p className="hint">
        {INCOME_KINDS.find((k) => k.value === kind)!.hint}が年収にあたります。
        児童扶養手当・児童手当は年収に含めません。
      </p>
    </div>
  );

  return (
    <div className="card">
      {incomeField(
        'obligor-income',
        '支払う側（義務者）の年収',
        obligorIncome,
        setObligorIncome,
        obligorKind,
        setObligorKind
      )}

      {incomeField(
        'obligee-income',
        '受け取る側（権利者）の年収',
        obligeeIncome,
        setObligeeIncome,
        obligeeKind,
        setObligeeKind
      )}

      <div className="field">
        <span className="field-label">子の人数</span>
        {/* .field-row は最小140pxのグリッドなので、短い選択肢が3つ並ばない。ここは素のflexで組む */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {[1, 2, 3].map((n) => (
            <label key={n} style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
              <input
                type="radio"
                name="child-count"
                checked={children.length === n}
                onChange={() => changeCount(n)}
                style={{ width: 'auto' }}
              />
              <span>{n}人</span>
            </label>
          ))}
        </div>
        <p className="hint">
          算定表は子{MAX_CHILDREN}人までです。4人以上は調停・弁護士相談の領域になります。
        </p>
      </div>

      <div className="field">
        <span className="field-label">子の年齢</span>
        {children.map((band, i) => (
          <div
            key={i}
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}
          >
            <span style={{ minWidth: '4em' }}>{i + 1}人目</span>
            {AGE_BANDS.map((b) => (
              <label
                key={b}
                style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}
              >
                <input
                  type="radio"
                  name={`child-age-${i}`}
                  checked={band === b}
                  onChange={() => changeAge(i, b)}
                  style={{ width: 'auto' }}
                />
                <span>{CHILD_AGE_LABELS[b]}</span>
              </label>
            ))}
          </div>
        ))}
        <p className="hint">
          標準算定方式は0〜14歳と15歳以上の2区分で計算します（生活費指数
          {LIVING_COST_INDEX['0-14']}／{LIVING_COST_INDEX['15+']}）。
          公立中学校・高等学校の教育費相当額が織り込まれているためです。
        </p>
      </div>

      {result.outOfRange ? (
        <div className="panel">
          <p style={{ margin: 0, fontWeight: 700 }}>算定表の範囲外です</p>
          <ul style={{ marginBottom: 0 }}>
            {result.reasons.includes('obligor-income') && (
              <li>
                支払う側の年収が算定表の上限（給与{fmtManInt(INCOME_LIMIT.salary)}／自営
                {fmtManInt(INCOME_LIMIT.business)}）を超えています
              </li>
            )}
            {result.reasons.includes('obligee-income') && (
              <li>
                受け取る側の年収が算定表の上限（給与{fmtManInt(INCOME_LIMIT.salary)}／自営
                {fmtManInt(INCOME_LIMIT.business)}）を超えています
              </li>
            )}
            {result.reasons.includes('children-count') && (
              <li>子の人数が算定表の範囲（1〜{MAX_CHILDREN}人）から外れています</li>
            )}
          </ul>
          <p className="hint" style={{ marginBottom: 0 }}>
            算定表の範囲を超える場合、標準算定方式をそのまま延長した額が妥当とは限らず、
            実務では個別の事情を踏まえた調整が行われます。
            <strong>調停・審判や弁護士への相談の領域</strong>
            なので、このツールでは金額を出しません。
          </p>
        </div>
      ) : (
        <>
          <div className="panel">
            <div className="metric">
              <span className="label">養育費の月額の目安</span>
              <span className="value">{Math.round(result.monthly).toLocaleString('ja-JP')}</span>
              <span className="unit">円</span>
            </div>
            <p className="hint" style={{ marginTop: 4 }}>
              算定表の該当レンジは<strong>{result.range.label}</strong>
              （年額にすると約{fmtMan(result.annual)}）
            </p>
            {/*
              免責は結果の直下に固定で出す（仕様: docs/features/yoikuhi-keisan.md）。
              ページ末尾に一度だけ書く形にすると、金額だけを見て帰る人には届かない
            */}
            <p className="note" style={{ marginTop: 12, marginBottom: 0 }}>
              <strong>この額は目安です。</strong>
              実際の養育費は父母の協議・調停・審判で決まります。算定表は標準的な家庭を
              前提にしたもので、私立学校の学費・持病の医療費・住宅ローンの負担など
              個別の事情があれば増減します。
            </p>
          </div>

          {result.beyondObligeeAxis && (
            <p className="hint">
              受け取る側の年収が算定表の横軸の上限を超えているため、印刷された算定表の升目とは
              突き合わせられません（標準算定方式の計算式で算出しています）。
            </p>
          )}

          <div className="panel quiet">
            <dl className="kv">
              <div>
                <dt>支払う側の基礎収入</dt>
                <dd>{fmtYen(result.obligorBasicIncome)}</dd>
              </div>
              <div>
                <dt>受け取る側の基礎収入</dt>
                <dd>{fmtYen(result.obligeeBasicIncome)}</dd>
              </div>
              <div>
                <dt>子に充てられる生活費（年額）</dt>
                <dd>{fmtYen(result.childrenLivingCost)}</dd>
              </div>
              <div>
                <dt>養育費（年額）</dt>
                <dd>{fmtYen(result.annual)}</dd>
              </div>
            </dl>
            <p className="hint" style={{ marginTop: 8 }}>
              基礎収入 ＝ 年収 × 基礎収入割合（支払う側{Math.round(result.obligorRate * 100)}%・
              受け取る側{Math.round(result.obligeeRate * 100)}%）。そこから子の生活費指数（合計
              {result.childIndexSum}）で子の取り分を出し、双方の基礎収入の比で分担します。
            </p>
          </div>

          <div className="panel quiet">
            <dl className="kv">
              <div>
                <dt>法定養育費（月額）</dt>
                <dd>{fmtYen(result.statutoryMonthly)}</dd>
              </div>
              <div>
                <dt>先取特権が及ぶ上限（月額）</dt>
                <dd>{fmtYen(result.lienCapMonthly)}</dd>
              </div>
            </dl>
            <p className="hint" style={{ marginTop: 8 }}>
              法定養育費は子1人あたり月{STATUTORY_SUPPORT_PER_CHILD / 10_000}万円 × {result.childCount}
              人、先取特権の上限は子1人あたり月{LIEN_CAP_PER_CHILD / 10_000}万円 ×{' '}
              {result.childCount}人（いずれも法務省令）。
              <strong>法定養育費は2026年4月1日以降に成立した離婚だけが対象</strong>
              で、それ以前の離婚には適用されません。
            </p>
          </div>
        </>
      )}
    </div>
  );
}
