'use client';

import { useRef, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  AGE_MAX,
  calcBmi,
  CHILD_MAX_AGE,
  CHILD_MIN_AGE,
  formatTenths,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  targetBandRangeLabel,
  targetSentence,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
  type AdultResult,
  type Sex,
} from '@/lib/bmi';
import BmiBand from './BmiBand';

/** 入力欄の文字列を数にする。空欄は null */
function num(s: string): number | null {
  const t = s.trim().replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

const kg = (tenths: number) => `${formatTenths(tenths)}kg`;

/**
 * BMI・適正体重の計算UI。ロジックは持たせない（すべて lib/bmi.ts）。
 *
 * **入力値は送信しない。** GA4 に渡すのは「計算した」の1種類だけで、
 * 身長・体重・BMI の値はイベントに載せない（仕様「書かないこと」）。
 */
export default function Calculator() {
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Sex | ''>('');
  const tracked = useRef(false);

  const h = num(height);
  const w = num(weight);
  const a = num(age);
  const ageValue = a === null ? null : Number.isNaN(a) ? -1 : a;
  const isChildAge = ageValue !== null && ageValue >= CHILD_MIN_AGE && ageValue <= CHILD_MAX_AGE;

  const r =
    h !== null && w !== null
      ? calcBmi({ heightCm: h, weightKg: w, age: ageValue, sex: sex || null })
      : ageValue !== null && ageValue >= 0 && ageValue < CHILD_MIN_AGE
        ? calcBmi({ heightCm: 0, weightKg: 0, age: ageValue, sex: null })
        : null;

  const onCalculated = () => {
    if (tracked.current) return;
    if (r && (r.kind === 'adult' || r.kind === 'child')) {
      tracked.current = true;
      trackToolUse('bmi', 'calculate');
    }
  };

  return (
    <div className="card">
      <div className="field-row">
        <div className="field">
          <label htmlFor="bmi-height">身長（cm）</label>
          <input
            id="bmi-height"
            type="number"
            inputMode="decimal"
            min={HEIGHT_MIN_CM}
            max={HEIGHT_MAX_CM}
            step={0.1}
            placeholder="例：165.0"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            onBlur={onCalculated}
          />
        </div>
        <div className="field">
          <label htmlFor="bmi-weight">体重（kg）</label>
          <input
            id="bmi-weight"
            type="number"
            inputMode="decimal"
            min={WEIGHT_MIN_KG}
            max={WEIGHT_MAX_KG}
            step={0.1}
            placeholder="例：60.0"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onBlur={onCalculated}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="bmi-age">年齢（任意・満年齢）</label>
          <input
            id="bmi-age"
            type="number"
            inputMode="numeric"
            min={0}
            max={AGE_MAX}
            step={1}
            placeholder="空欄でも計算できます"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            onBlur={onCalculated}
          />
        </div>
        {isChildAge && (
          <div className="field">
            <label htmlFor="bmi-sex">性別（5〜17歳のときだけ）</label>
            <select
              id="bmi-sex"
              value={sex}
              onChange={(e) => setSex(e.target.value as Sex | '')}
              onBlur={onCalculated}
            >
              <option value="">選んでください</option>
              <option value="male">男子</option>
              <option value="female">女子</option>
            </select>
          </div>
        )}
      </div>
      <p className="hint" style={{ marginTop: -6 }}>
        年齢を入れると、18歳以上は年代別の目標 BMI（食事摂取基準 2025年版）でも見直します。
        {CHILD_MIN_AGE}〜{CHILD_MAX_AGE}歳は BMI ではなく学校健診の「肥満度」で判定し、そのときだけ性別を使います。
        学校健診の年齢は<strong>その年度の4月1日時点の満年齢</strong>で数えるので、誕生日によっては1歳ずれることがあります。
      </p>

      <Result r={r} hasInput={h !== null || w !== null} />
    </div>
  );
}

function Result({ r, hasInput }: { r: ReturnType<typeof calcBmi> | null; hasInput: boolean }) {
  if (!r) {
    return (
      <div className="panel quiet">
        <p className="hint" style={{ margin: 0 }}>
          身長と体重を入れると、BMI と判定・標準体重・普通体重に入る体重の幅が出ます。入力した値はこの端末の中だけで計算し、どこにも送信しません。
        </p>
      </div>
    );
  }
  if (r.kind === 'infant') {
    return (
      <div className="panel quiet" role="status">
        <p style={{ margin: 0 }}>{r.message}</p>
      </div>
    );
  }
  if (r.kind === 'invalid') {
    return (
      <div className="panel quiet" role="status">
        <p className="hint" style={{ margin: 0 }}>
          {hasInput
            ? `身長は${HEIGHT_MIN_CM}〜${HEIGHT_MAX_CM}cm、体重は${WEIGHT_MIN_KG}〜${WEIGHT_MAX_KG}kg、年齢は0〜${AGE_MAX}歳の範囲で入れてください（小数は1桁まで）。`
            : '入力を確かめてください。'}
        </p>
      </div>
    );
  }
  if (r.kind === 'needSex') {
    return (
      <div className="panel quiet" role="status">
        <p style={{ margin: 0 }}>
          {r.age}歳は学校健診の「肥満度」で判定します。肥満度の基準は男女で違うので、性別を選んでください。
        </p>
      </div>
    );
  }
  if (r.kind === 'child') {
    const sign = r.degreeTenths > 0 ? '+' : '';
    return (
      <div className="panel" role="status" aria-live="polite">
        <div className="metric">
          <span className="label">肥満度</span>
          <span className="value">
            {sign}
            {formatTenths(r.degreeTenths)}
          </span>
          <span className="unit">%</span>
        </div>
        <p style={{ margin: '6px 0 10px', fontWeight: 700 }}>判定の目安：{r.label}</p>
        <dl className="kv">
          <div>
            <dt>身長別標準体重（{r.age}歳・{r.sex === 'male' ? '男子' : '女子'}）</dt>
            <dd>{kg(r.standardWeightTenths)}</dd>
          </div>
        </dl>
        <p className="hint" style={{ margin: '8px 0 0' }}>
          区分：−30%以下 高度やせ／−20%以下 やせ／+20%以上 軽度肥満／+30%以上 中等度肥満／+50%以上 高度肥満（それ以外は ふつう）
        </p>
        <p className="hint" style={{ margin: '8px 0 0' }}>
          子どもは成長の途中で身長と体重の釣り合いが年齢ごとに変わるため、大人と同じ BMI の基準では判定しません。
          この肥満度は学校健診と同じ式による目安です。成長の様子は、学校や医療機関で成長曲線とあわせて確かめてください。
        </p>
      </div>
    );
  }
  return <AdultPanel r={r} />;
}

function AdultPanel({ r }: { r: AdultResult }) {
  const sentence = targetSentence(r);
  const range = `${kg(r.normalRange.minTenths)}〜${kg(r.normalRange.maxTenths)}まで`;
  const distance =
    r.toNormalTenths === 0
      ? '幅の中に入っています'
      : `普通体重の幅まであと ${formatTenths(Math.abs(r.toNormalTenths))}kg`;
  const target = r.target
    ? {
        lowerTenths: r.target.band.lowerTenths,
        upperTenths: r.target.band.upperTenths,
        label: `${r.target.band.label}の目標 ${targetBandRangeLabel(r.target.band)}`,
      }
    : null;

  return (
    <div className="panel" role="status" aria-live="polite">
      <div className="metric">
        <span className="label">BMI</span>
        <span className="value">{formatTenths(r.bmiTenths)}</span>
      </div>
      <p style={{ margin: '6px 0 0', fontWeight: 700 }}>日本肥満学会の判定の目安：{r.jasso.label}</p>
      {sentence && <p style={{ margin: '4px 0 0' }}>{sentence}</p>}

      <BmiBand
        bmiTenths={r.bmiTenths}
        target={target}
        description={`BMI ${formatTenths(r.bmiTenths)}、判定の目安は${r.jasso.label}。${sentence ?? ''}`}
      />

      <dl className="kv" style={{ marginTop: 8 }}>
        <div>
          <dt>標準体重（BMI 22）</dt>
          <dd>{kg(r.standardWeightTenths)}</dd>
        </div>
        <div>
          <dt>普通体重の幅（BMI 18.5〜25未満）</dt>
          <dd>{range}</dd>
        </div>
        <div>
          <dt style={{ whiteSpace: 'nowrap' }}>幅との差</dt>
          <dd>{distance}</dd>
        </div>
      </dl>
      <p className="hint" style={{ margin: '8px 0 0' }}>
        BMI は身長と体重だけから出す目安で、筋肉と脂肪を区別しません。妊娠中の方には当てはまりません。
        肥満に健康上の問題を伴い医学的な対応が必要な状態（肥満症）かどうかは、医師が判断するものです。
      </p>
    </div>
  );
}
