'use client';

import { useState } from 'react';
import {
  CORRESPONDENCE_DEFAULT_TUITION_PER_UNIT,
  CORRESPONDENCE_DEFAULT_UNITS,
  OTHER_COST_PRESETS,
  PRIVATE_FULLTIME_AVERAGE_TUITION,
  PUBLIC_FULLTIME_TUITION,
  SCHOOL_TYPE_LABELS,
  SUPPORT_LIMITS,
  UNITS_PER_YEAR_CAP,
  UNITS_TOTAL_CAP,
  calcKokoJugyoryo,
  type SchoolType,
} from '@/lib/koko-jugyoryo';

const fmtYen = (yen: number) => `${yen.toLocaleString('ja-JP')}円`;

const SCHOOL_TYPES = Object.keys(SCHOOL_TYPE_LABELS) as SchoolType[];

/** 私立通信制の1単位あたり支給限度額（表示用に取り出しておく） */
const PER_UNIT_LIMIT = (SUPPORT_LIMITS['private-correspondence'] as { perUnit: number }).perUnit;

export default function Calculator() {
  const [schoolType, setSchoolType] = useState<SchoolType>('private-fulltime');
  const [yearlyTuition, setYearlyTuition] = useState(String(PRIVATE_FULLTIME_AVERAGE_TUITION));
  const [unitsPerYear, setUnitsPerYear] = useState(String(CORRESPONDENCE_DEFAULT_UNITS));
  const [tuitionPerUnit, setTuitionPerUnit] = useState(
    String(CORRESPONDENCE_DEFAULT_TUITION_PER_UNIT)
  );
  const [otherCosts, setOtherCosts] = useState('0');
  const [years, setYears] = useState('3');

  const isCorrespondence = schoolType === 'private-correspondence';
  // 公立の授業料は全国一律なので入力させない（入れ替えても結果が変わらない項目は出さない）
  const isPublic = schoolType === 'public-fulltime';

  const r = calcKokoJugyoryo({
    schoolType,
    yearlyTuition: isPublic ? PUBLIC_FULLTIME_TUITION : Number(yearlyTuition) || 0,
    unitsPerYear: Number(unitsPerYear) || 0,
    tuitionPerUnit: Number(tuitionPerUnit) || 0,
    otherCostsYearly: Number(otherCosts) || 0,
    years: Number(years) || 3,
  });

  const changeSchoolType = (next: SchoolType) => {
    setSchoolType(next);
    // 種別ごとに授業料の相場が違うので、切り替えたら初期値に戻す
    if (next === 'private-fulltime') setYearlyTuition(String(PRIVATE_FULLTIME_AVERAGE_TUITION));
  };

  return (
    <div className="card">
      <div className="field">
        <span className="field-label">進学先</span>
        <div className="field-row">
          {SCHOOL_TYPES.map((t) => (
            <label
              key={t}
              style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}
            >
              <input
                type="radio"
                name="school-type"
                checked={schoolType === t}
                onChange={() => changeSchoolType(t)}
                style={{ width: 'auto' }}
              />
              <span>{SCHOOL_TYPE_LABELS[t]}</span>
            </label>
          ))}
        </div>
      </div>

      {isPublic && (
        <p className="hint">
          公立高校（全日制）の授業料は全国一律で年額{fmtYen(PUBLIC_FULLTIME_TUITION)}
          。就学支援金の限度額と同額なので、授業料の自己負担は残りません。
        </p>
      )}

      {schoolType === 'private-fulltime' && (
        <div className="field">
          <label htmlFor="yearly-tuition">年間授業料（円）</label>
          <input
            id="yearly-tuition"
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            value={yearlyTuition}
            onChange={(e) => setYearlyTuition(e.target.value)}
          />
          <p className="hint">
            初期値は全国平均にあたる{fmtYen(PRIVATE_FULLTIME_AVERAGE_TUITION)}
            （＝支給上限と同額）。志望校の学校案内に載っている授業料に入れ替えてください。
            入学金・施設費はここには含めません。
          </p>
        </div>
      )}

      {isCorrespondence && (
        <>
          <div className="field">
            <span className="field-label">通信制（単位制）の授業料</span>
            <div className="field-row">
              <label>
                年間の履修単位数
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={unitsPerYear}
                  onChange={(e) => setUnitsPerYear(e.target.value)}
                />
              </label>
              <label>
                1単位あたり授業料（円）
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1000}
                  value={tuitionPerUnit}
                  onChange={(e) => setTuitionPerUnit(e.target.value)}
                />
              </label>
            </div>
          </div>
          <p className="hint">
            私立通信制の就学支援金は1単位あたり{fmtYen(PER_UNIT_LIMIT)}が上限で、
            年間{UNITS_PER_YEAR_CAP}単位・通算{UNITS_TOTAL_CAP}単位までが支給対象です。
            高校の卒業要件は74単位以上なので、3年で卒業する組み方ならおおむね収まります。
          </p>
        </>
      )}

      <div className="field">
        <label htmlFor="other-costs">授業料以外の年間費用（円・任意）</label>
        <input
          id="other-costs"
          type="number"
          inputMode="numeric"
          min={0}
          step={10000}
          value={otherCosts}
          onChange={(e) => setOtherCosts(e.target.value)}
        />
        <div className="field-row" style={{ marginTop: 8 }}>
          {OTHER_COST_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setOtherCosts(String(p.yearly))}
              style={{ fontSize: 'var(--fs-sm)' }}
            >
              {p.label}（{fmtYen(p.yearly)}）
            </button>
          ))}
          <button type="button" onClick={() => setOtherCosts('0')} style={{ fontSize: 'var(--fs-sm)' }}>
            入れない（0円）
          </button>
        </div>
        <p className="hint">
          入学金・施設費・制服・教材・修学旅行の積立など、
          <strong>就学支援金の対象にならない費用</strong>です。目安ボタンはざっくりした概算で、
          入学年はこれより大きく膨らみます。学校案内の「初年度納付金」を見て入れ替えてください。
        </p>
      </div>

      <div className="field">
        <label htmlFor="years">在学年数</label>
        <input
          id="years"
          type="number"
          inputMode="numeric"
          min={1}
          max={6}
          step={1}
          value={years}
          onChange={(e) => setYears(e.target.value)}
        />
      </div>

      <div className="panel">
        <div className="metric">
          <span className="label">{r.years}年間の実質負担</span>
          <span className="value">{r.totalOutOfPocket.toLocaleString('ja-JP')}</span>
          <span className="unit">円</span>
        </div>
        <p className="hint" style={{ marginTop: 4 }}>
          授業料の自己負担{fmtYen(r.totalTuitionOutOfPocket)} ＋ 授業料以外
          {fmtYen(r.totalOtherCosts)}
        </p>
      </div>

      <div className="panel quiet">
        <dl className="kv">
          <div>
            <dt>年間の授業料</dt>
            <dd>{fmtYen(r.perYear[0].tuition)}</dd>
          </div>
          <div>
            <dt>年間の就学支援金</dt>
            <dd>{fmtYen(r.perYear[0].support)}</dd>
          </div>
          <div>
            <dt>年間の授業料の自己負担</dt>
            <dd>{fmtYen(r.perYear[0].tuitionOutOfPocket)}</dd>
          </div>
          <div>
            <dt>{r.years}年間の授業料の合計</dt>
            <dd>{fmtYen(r.totalTuition)}</dd>
          </div>
          <div>
            <dt>{r.years}年間の就学支援金の合計</dt>
            <dd>{fmtYen(r.totalSupport)}</dd>
          </div>
          <div>
            <dt>公立（全日制）にした場合との差（授業料）</dt>
            <dd>{r.extraVsPublicTuition > 0 ? `＋${fmtYen(r.extraVsPublicTuition)}` : '0円'}</dd>
          </div>
        </dl>
        <p className="hint" style={{ marginTop: 8 }}>
          公立（全日制）の授業料は{r.years}年間で{fmtYen(r.publicComparison.totalTuition)}
          かかりますが、同額の就学支援金が出るため授業料の自己負担は残りません。
          上の差額が「私立にした場合の追い金」にあたります（授業料以外は含みません）。
        </p>
      </div>

      {isCorrespondence && (r.cappedByYearlyUnits || r.cappedByTotalUnits) && (
        <div className="panel quiet">
          <p className="hint" style={{ color: '#b45309' }}>
            {r.cappedByYearlyUnits && (
              <>
                年間{UNITS_PER_YEAR_CAP}単位を超えて履修した分は支給対象外です。
                <br />
              </>
            )}
            {r.cappedByTotalUnits && (
              <>
                通算{UNITS_TOTAL_CAP}単位の上限に達しています。
                学年ごとの支給対象単位数は
                {r.perYear.map((y) => y.supportedUnits).join(' / ')} 単位で計算しました。
              </>
            )}
          </p>
        </div>
      )}

      {r.perYear[0].tuition > 0 && r.perYear[0].tuitionOutOfPocket === 0 && (
        <p className="hint" style={{ marginTop: 10 }}>
          授業料は就学支援金でまかなえています。支給限度額との差額が現金でもらえるわけではないため、
          支給額は実際の授業料の額で止まります。
        </p>
      )}

      <div className="note">
        本計算は目安です。就学支援金は<strong>授業料に充てるための制度</strong>で、
        入学金・施設費・制服・教材費・修学旅行費・通学費などは対象外です。
        都道府県によっては独自の上乗せ助成があり、実際の負担はさらに軽くなることがあります。
        正確な金額は志望校の募集要項と、お住まいの都道府県の私学助成の窓口でご確認ください。
      </div>
    </div>
  );
}
