'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDate, formatJa, parseDate } from '@/lib/date-parts';
import {
  LEAVE_MONTHS_MAX,
  RATE_SHUSSHOGO,
  SHUSSHOGO_MAX_DAYS,
  SHUSSHOGO_MIN_LEAVE_DAYS,
  WAGE_DAILY_MAX,
  WAGE_DAILY_MIN,
  calcIkujiKyugyo,
  defaultLeaveStart,
  type ParentType,
  type ShusshogoAnswer,
} from '@/lib/ikuji-kyugyo';

const fmtYen = (yen: number) => `${Math.round(yen).toLocaleString('ja-JP')}円`;

/** 立場の選択肢。**産後休業をするかどうか**が対象期間の起算を決める */
const PARENTS: { value: ParentType; label: string; hint: string }[] = [
  {
    value: 'mother',
    label: '出産した本人（産後休業をする）',
    hint: '産後休業（出生日の翌日から8週間）のあとに育児休業に入ります。出生後休業支援給付の対象期間は、出生日から16週間を経過する日の翌日までです。',
  },
  {
    value: 'partner',
    label: '配偶者（父など・産後休業をしない）',
    hint: '出生日から育児休業（産後パパ育休を含む）を取れます。出生後休業支援給付の対象期間は、出生日から8週間を経過する日の翌日までです。',
  },
];

/** 取得予定期間の選択肢（延長は扱わないので12ヶ月まで） */
const MONTHS = [1, 2, 3, 4, 5, 6, 8, 10, 12];

const SHUSSHOGO_ANSWERS: { value: ShusshogoAnswer; label: string }[] = [
  { value: 'yes', label: '対象になる（両親とも14日以上の休業など）' },
  { value: 'no', label: '対象にならない' },
  { value: 'unknown', label: 'わからない' },
];

/**
 * @param buildDate ビルド時刻（ISO文字列）。静的書き出しなので、サーバ描画と
 *   ハイドレーション直後はこの固定値を初期値にし（一致しないとReactが警告を出す）、
 *   マウント後に「画面を開いた日」へ差し替える。
 */
export default function Calculator({ buildDate }: { buildDate: string }) {
  const [monthly, setMonthly] = useState('300000');
  const [parent, setParent] = useState<ParentType>('mother');
  const [birth, setBirth] = useState(() => buildDate.slice(0, 10));
  const [months, setMonths] = useState('12');
  const [shusshogo, setShusshogo] = useState<ShusshogoAnswer>('yes');
  /**
   * 育休開始日は出生日と立場から決まる目安を初期値にする。
   * 利用者が自分で触ったあとは上書きしない（触った時点で本人の予定のほうが正しい）。
   */
  const [startEdited, setStartEdited] = useState(false);
  const [start, setStart] = useState('');

  useEffect(() => {
    setBirth(new Date().toISOString().slice(0, 10));
  }, []);

  const birthDate = parseDate(birth);
  const suggested = birthDate ? defaultLeaveStart(birthDate, parent) : null;
  const suggestedStart = suggested ? formatDate(suggested) : '';
  const startValue = startEdited && start !== '' ? start : suggestedStart;
  const startDate = parseDate(startValue);

  const r = useMemo(() => {
    if (!birthDate || !startDate) return null;
    return calcIkujiKyugyo({
      totalWage6m: (Number(monthly) || 0) * 6,
      parent,
      birthDate,
      leaveStart: startDate,
      leaveMonths: Number(months) || 12,
      shusshogo,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthly, parent, birth, startValue, months, shusshogo]);

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="ik-monthly">休業開始前6ヶ月の平均月給（額面・円）</label>
        <input
          id="ik-monthly"
          type="number"
          inputMode="numeric"
          min={0}
          step={10000}
          value={monthly}
          onChange={(e) => setMonthly(e.target.value)}
        />
        <p className="hint">
          税・社会保険料を引く前の額面です。<strong>賞与（ボーナス）は含めません。</strong>
          賃金総額 {fmtYen((Number(monthly) || 0) * 6)} ÷ 180日 で休業開始時賃金日額を出します。
        </p>
      </div>

      <div className="field">
        <label htmlFor="ik-parent">育休を取るのはどちらですか</label>
        <select
          id="ik-parent"
          value={parent}
          onChange={(e) => setParent(e.target.value as ParentType)}
        >
          {PARENTS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <p className="hint">{PARENTS.find((p) => p.value === parent)?.hint}</p>
      </div>

      <div className="field">
        <div className="field-row">
          <div>
            <label htmlFor="ik-birth">子の出生日</label>
            <input
              id="ik-birth"
              type="date"
              value={birth}
              onChange={(e) => setBirth(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="ik-start">育児休業の開始日</label>
            <input
              id="ik-start"
              type="date"
              value={startValue}
              onChange={(e) => {
                setStartEdited(true);
                setStart(e.target.value);
              }}
            />
          </div>
        </div>
        <p className="hint">
          出生後休業支援給付の対象期間は出生日から数えます（
          <strong>出産予定日のほうが遅ければ出産予定日を入れてください</strong>。
          予定日と出生日がずれると対象期間も数日ずれます）。 開始日には、選んだ立場での最短の日を
          入れてあります（出産した本人は産後休業の8週間が明けた日）。予定が決まっていれば
          書き換えてください。
          {suggested && startValue !== suggestedStart && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => setStartEdited(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  color: 'inherit',
                  font: 'inherit',
                }}
              >
                最短の日（{formatJa(suggested)}）に戻す
              </button>
            </>
          )}
        </p>
      </div>

      <div className="field">
        <div className="field-row">
          <div>
            <label htmlFor="ik-months">取得予定の期間</label>
            <select id="ik-months" value={months} onChange={(e) => setMonths(e.target.value)}>
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m}ヶ月
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ik-shusshogo">出生後休業支援給付の対象</label>
            <select
              id="ik-shusshogo"
              value={shusshogo}
              onChange={(e) => setShusshogo(e.target.value as ShusshogoAnswer)}
            >
              {SHUSSHOGO_ANSWERS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="hint">
          出生後休業支援給付は、<strong>原則として両親がともに14日以上の育児休業</strong>を
          対象期間内に取ると、最大{SHUSSHOGO_MAX_DAYS}日ぶん13%が上乗せされる給付です。
          配偶者が無業・自営業・産後休業中などの場合は、本人だけの休業でも対象になります。
          1歳6ヶ月・2歳までの延長給付、パパ・ママ育休プラスはこの計算機では扱いません。
        </p>
      </div>

      {r === null ? (
        <div className="note">日付を入力すると計算します。</div>
      ) : (
        <>
          <div className="panel">
            <div className="metric">
              <span className="label">最初の支給単位期間に受け取る額</span>
              <span className="value">{fmtYen(r.firstPeriodTotal)}</span>
            </div>
            <div className="metric" style={{ marginTop: 8 }}>
              <span className="label">
                育休{r.periods.length}期間ぶんの合計（{r.payDays}日分）
              </span>
              <span className="value">{fmtYen(r.total)}</span>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              内訳は育児休業給付金 {fmtYen(r.totalIkuji)}
              {r.totalShusshogo > 0 && <> ＋ 出生後休業支援給付金 {fmtYen(r.totalShusshogo)}</>}
              です。給与が支払われない前提の目安で、実際の支給額はハローワークが決定します。
            </p>
          </div>

          <h3 style={{ fontSize: '1.05rem', marginTop: 24 }}>支給単位期間ごとの推移</h3>
          <p className="hint">
            支給単位期間は<strong>育休開始日から起算した1ヶ月ごと</strong>で、給与の暦月とは
            ずれます。支給日数は原則30日です（休業終了日を含む期間はその日までの日数）。
          </p>

          {/*
            スマホ（幅390px）でも読めるように、期間×金額の表を横に並べず
            1期間 = 1枚の縦積みカードにしている（仕様書の表示の約束）。
          */}
          {r.periods.map((p) => {
            const rate =
              p.shusshogoDays > 0
                ? '80%'
                : p.days50 === 0
                  ? '67%'
                  : p.days67 === 0
                    ? '50%'
                    : '67%→50%';
            return (
              <div key={p.index} className="panel quiet" style={{ marginTop: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    第{p.index}期<span className="chip" style={{ marginLeft: 8 }}>{rate}</span>
                  </span>
                  <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtYen(p.total)}
                  </span>
                </div>
                <p className="hint" style={{ marginTop: 6 }}>
                  {formatJa(p.start)}〜{formatJa(p.end)}（支給日数{p.payDays}日）
                  {p.shusshogoDays > 0 && (
                    <>
                      <br />
                      育児休業給付金 {fmtYen(p.ikuji)} ＋ 出生後休業支援給付金{' '}
                      {fmtYen(p.shusshogo)}（{p.shusshogoDays}日分）
                    </>
                  )}
                  {p.isFinal && p.payDays < 30 && (
                    <>
                      <br />
                      休業終了日を含む期間なので、支給日数は終了日までの{p.payDays}日です。
                    </>
                  )}
                </p>
              </div>
            );
          })}

          <dl className="kv" style={{ marginTop: 16 }}>
            <div>
              <dt>休業開始時賃金日額</dt>
              <dd>
                {fmtYen(r.wage.value)}
                {r.wage.cap === 'max' && (
                  <span className="chip" style={{ marginLeft: 8 }}>
                    上限適用
                  </span>
                )}
                {r.wage.cap === 'min' && (
                  <span className="chip" style={{ marginLeft: 8 }}>
                    下限適用
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>給付率67%の支給日数 ／ 50%の支給日数</dt>
              <dd>
                {r.days67}日 ／ {r.days50}日
              </dd>
            </div>
            <div>
              <dt>出生後休業支援給付（13%）</dt>
              <dd>
                {r.shusshogo.applied
                  ? `${r.shusshogo.days}日分 ${fmtYen(r.totalShusshogo)}`
                  : '対象外として計算'}
              </dd>
            </div>
            <div>
              <dt>出生後休業支援給付の対象期間</dt>
              <dd>
                {formatJa(r.shusshogo.window.start)}〜{formatJa(r.shusshogo.window.end)}
              </dd>
            </div>
            <div>
              <dt>育児休業の期間</dt>
              <dd>
                {formatJa(r.leaveStart)}〜{formatJa(r.leaveEnd)}（{r.leaveDays}日）
              </dd>
            </div>
          </dl>

          {r.shusshogo.applied && (
            <div className="note">
              <strong>
                80%（67%＋13%）になるのは、対象期間内の最大{SHUSSHOGO_MAX_DAYS}日だけです。
              </strong>
              {SHUSSHOGO_MAX_DAYS}日を過ぎると67%に、育休開始から通算181日目以降は50%に下がります。
              「手取りで実質10割」と言われるのは、育休中は社会保険料が免除され給付が非課税になる
              ためですが、<strong>住民税は前年の所得をもとに休業中も課税されます</strong>
              （前年に収入があった人は、その分だけ10割には届きません）。
            </div>
          )}

          {r.shusshogo.answer === 'unknown' && r.shusshogo.applied && (
            <div className="note">
              出生後休業支援給付の対象かどうかが「わからない」のまま、
              <strong>対象になる前提で計算しています。</strong>
              要件（対象期間内に両親がともに14日以上の育児休業を取得したこと。配偶者が無業・
              自営業・産後休業中などの場合は本人だけでよい）を満たすかどうかは、
              <strong>必ずハローワークまたは勤務先で確認してください。</strong>
              対象外だと、最初の28日分の13%（{fmtYen(Math.floor(r.wage.value * r.shusshogo.days * RATE_SHUSSHOGO))}
              ）が付きません。
            </div>
          )}

          {r.shusshogo.answer !== 'no' && r.shusshogo.shortOfMinDays && (
            <div className="note">
              入力した育休の日程では、出生後休業支援給付の対象期間（
              {formatJa(r.shusshogo.window.start)}〜{formatJa(r.shusshogo.window.end)}）と
              重なる休業が{r.shusshogo.overlapDays}日しかありません。
              <strong>対象期間内に{SHUSSHOGO_MIN_LEAVE_DAYS}日以上の休業</strong>
              が要るため、13%の上乗せは計算に入れていません。
            </div>
          )}

          {r.wage.cap === 'max' && (
            <p className="hint">
              賃金日額が上限額（{fmtYen(WAGE_DAILY_MAX)}）を超えているため、実際の月給（
              {fmtYen(Number(monthly) || 0)}）ではなく上限額で計算しています。
              給与が高いほど、額面に対する割合は小さくなります。
            </p>
          )}

          {r.wage.cap === 'min' && (
            <p className="hint">
              賃金日額が下限額（{fmtYen(WAGE_DAILY_MIN)}）を下回るため、下限額で計算しています。
            </p>
          )}

          {Number(months) >= LEAVE_MONTHS_MAX && (
            <p className="hint">
              保育所に入れないなどの理由で1歳6ヶ月・2歳まで延長した場合の給付は、
              この計算機では扱っていません（延長後も給付率は50%のままです）。
            </p>
          )}
        </>
      )}

      <div className="note">
        本計算は目安です。休業開始時賃金日額は実際には賃金月額証明書の額から算定され、
        受給資格の有無・出生後休業支援給付の要件は<strong>ハローワークが決定します</strong>。
        休業中に事業主から賃金が支払われる場合は減額されることがあります。
        金額と要件は、必ずハローワークまたは勤務先でご確認ください。
      </div>
    </div>
  );
}
