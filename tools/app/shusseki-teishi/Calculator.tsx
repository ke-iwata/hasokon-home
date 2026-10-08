'use client';

import { useEffect, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  HOLIDAY_LAST_YEAR,
  INPUT_ERROR_MESSAGES,
  OTHER_RULES,
  RULES,
  VERB,
  buildCalendar,
  decidedByText,
  earliestReturn,
  formatDate,
  formatMd,
  headline,
  parseDate,
  type CalendarCell,
  type DateParts,
  type Disease,
  type Group,
} from '@/lib/shusseki-teishi';

const DISEASES: Disease[] = ['influenza', 'covid19', 'measles', 'mumps', 'pcf', 'other'];
const GROUPS: [Group, string][] = [
  ['school', '小学校・中学校・高校・大学'],
  ['preschool', '保育所・幼稚園・認定こども園（幼児）'],
  ['adult', '大人（職場）'],
];

/** 既定値（仕様書の例）。「入れたら変わる」型にするため最初から結果を出す */
const DEFAULT_ONSET = '2026-10-01';
const DEFAULT_RECOVERY = '2026-10-05';

/**
 * 入力欄の補足。利用者がここを誤ると結果が丸ごとずれるので、定義を 1 行で出す（#346 レビュー必須3）。
 * 文言はこども家庭庁「保育所における感染症対策ガイドライン」（2023年10月一部修正）の
 * 「出席停止期間の算定について」「症状軽快とは」から
 */
const RECOVERY_HINT: Record<Exclude<Disease, 'other'>, string> = {
  influenza:
    '発症した日は、ふつうは熱が出始めた日です（受診した日ではありません）。発症した日・解熱した日はその日を0日目とし、翌日を1日目と数えます。',
  covid19:
    '「症状が軽快」は、解熱剤を使わずに熱が下がり、かつ、せきや息苦しさが良くなってきた状態です。発症した日・軽快した日はその日を0日目とし、翌日を1日目と数えます。',
  measles: '解熱した日はその日を0日目とし、翌日を1日目と数えます。',
  mumps: '腫れが出た日はその日を0日目とし、翌日を1日目と数えます。',
  pcf: '主な症状が消えた日はその日を0日目とし、翌日を1日目と数えます。',
};

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
/** 320px 幅で 7 列が収まるよう余白を詰める */
const cellBase = { padding: '4px 2px', textAlign: 'center' as const, fontSize: '0.8rem', lineHeight: 1.3 };

function Cell({ c, recLabel }: { c: CalendarCell | null; recLabel: string }) {
  if (!c) return <td style={cellBase} />;
  const style = {
    ...cellBase,
    background: c.state === 'stop' ? 'var(--surface-2)' : undefined,
    outline: c.state === 'return' || c.state === 'actual' ? '2px solid var(--accent)' : undefined,
    outlineOffset: -2,
    fontWeight: c.state === 'return' || c.state === 'actual' ? 700 : 400,
  };
  return (
    <td style={style}>
      <div>
        {c.date.day === 1 || c.onsetIndex === 0 || c.recoveryIndex === 0 ? `${c.date.month}/` : ''}
        {c.date.day}
      </div>
      {c.state === 'stop' ? (
        <div className="hint" style={{ fontSize: '0.7rem' }}>
          {c.onsetIndex !== null && <div>発{c.onsetIndex}</div>}
          {c.recoveryIndex !== null && (
            <div>
              {recLabel[0]}
              {c.recoveryIndex}
            </div>
          )}
        </div>
      ) : (
        c.state === 'return' && <div style={{ fontSize: '0.7rem' }}>OK</div>
      )}
    </td>
  );
}

/**
 * 出席停止期間 計算機の UI。
 *
 * 上段に入力 4 つ（病気・通っているところ・発症日・解熱日）、下段に結果 1 行と 0 日目からのカレンダー。
 * ロジックは lib/shusseki-teishi.ts。
 */
export default function Calculator() {
  const [disease, setDisease] = useState<Disease>('influenza');
  const [group, setGroup] = useState<Group>('school');
  const [onset, setOnset] = useState(DEFAULT_ONSET);
  const [recovery, setRecovery] = useState(DEFAULT_RECOVERY);
  const [notYet, setNotYet] = useState(false);
  const [today, setToday] = useState<DateParts | null>(null);

  /** 「今日」は開いた日。静的書き出しなのでビルド時刻で固定せず、マウント後に入れる */
  useEffect(() => {
    const now = new Date();
    setToday({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
  }, []);

  const rule = disease === 'other' ? null : RULES[disease];
  const usesOnset = rule?.afterOnsetDays !== null && rule !== null;
  const usesRecovery = rule?.afterRecoveryDays !== null && rule !== null;
  const onsetDate = usesOnset ? parseDate(onset) : null;
  const recoveryDate = usesRecovery && !notYet ? parseDate(recovery) : null;
  const recoveryReady = !usesRecovery || notYet || recoveryDate !== null;

  // 「今日」が未確定の描画（静的書き出し）では、未来日かどうかを見ない。
  // 「まだ」は今日を仮の解熱日にするので、今日が決まるまで出さない
  const r =
    disease !== 'other' && (!usesOnset || onsetDate) && recoveryReady && (!notYet || today)
      ? earliestReturn({
          disease,
          group,
          onset: onsetDate,
          recovery: recoveryDate,
          today: today ?? { year: 9999, month: 12, day: 31 },
        })
      : null;
  const error = typeof r === 'string' ? r : null;
  const result = typeof r === 'string' ? null : r;
  const recLabel = disease === 'covid19' ? '軽快' : disease === 'pcf' ? '消退' : '解熱';

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="shusseki-disease">病気</label>
        <select
          id="shusseki-disease"
          value={disease}
          onChange={(e) => {
            setDisease(e.target.value as Disease);
            trackToolUse('shusseki-teishi', `disease-${e.target.value}`);
          }}
        >
          {DISEASES.map((k) => (
            <option key={k} value={k}>
              {k === 'other' ? 'その他（百日咳・風しん・水痘）' : RULES[k].name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="shusseki-group">通っているところ</label>
        <select id="shusseki-group" value={group} onChange={(e) => setGroup(e.target.value as Group)}>
          {GROUPS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {rule && (
        <div className="field-row">
          {usesOnset && (
            <div className="field">
              <label htmlFor="shusseki-onset">{rule.onsetLabel}</label>
              <input
                id="shusseki-onset"
                type="date"
                value={onset}
                onChange={(e) => setOnset(e.target.value)}
                onBlur={() => trackToolUse('shusseki-teishi', 'onset')}
              />
            </div>
          )}
          {usesRecovery && (
            <div className="field">
              <label htmlFor="shusseki-recovery">{rule.recoveryLabel}</label>
              <input
                id="shusseki-recovery"
                type="date"
                value={recovery}
                disabled={notYet}
                onChange={(e) => setRecovery(e.target.value)}
                onBlur={() => trackToolUse('shusseki-teishi', 'recovery')}
              />
              <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                <input
                  type="checkbox"
                  checked={notYet}
                  onChange={(e) => setNotYet(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                {rule.notYetLabel}
              </label>
            </div>
          )}
        </div>
      )}
      {rule && (
        <p className="hint">
          {RECOVERY_HINT[disease as Exclude<Disease, 'other'>]}
          迷ったら医師・学校に確かめてください。
        </p>
      )}

      {disease === 'other' ? (
        <div className="panel quiet">
          <p style={{ margin: 0 }}>次の病気は、出席停止の期間が症状で決まるので日付にできません。</p>
          <ul style={{ margin: '8px 0 0', paddingLeft: '1.2em' }}>
            {OTHER_RULES.map((o) => (
              <li key={o.name}>
                <strong>{o.name}</strong>：{o.text}（{o.article}）
              </li>
            ))}
          </ul>
          <p className="hint" style={{ margin: '8px 0 0' }}>
            百日咳は「5日間の適正な抗菌薬の治療が終わるまで」の側なら、治療を始めた日から5日間が目安です。いつまで休むかは医師に確かめてください。
          </p>
        </div>
      ) : error ? (
        <p className="note" role="alert">
          {INPUT_ERROR_MESSAGES[error]}
        </p>
      ) : !result || !rule ? (
        <div className="panel quiet">
          <p className="hint" style={{ margin: 0 }}>
            日付を入れると、{VERB[group]}できる最も早い日が出ます。
          </p>
        </div>
      ) : (
        <div className="panel">
          <p style={{ margin: 0, fontSize: 'clamp(1.1rem, 5vw, 1.4rem)' }}>
            {result.assumedRecoveryToday && (
              <>
                <span style={{ fontSize: 'var(--fs-sm)' }}>今日{recLabel}したとしても、最短で</span>
                <br />
              </>
            )}
            <strong>{headline(result, group, today ?? undefined)}</strong>
            {!result.assumedRecoveryToday && <span style={{ fontSize: 'var(--fs-sm)' }}>（最短）</span>}
          </p>
          {decidedByText(result, disease as Exclude<Disease, 'other'>) && (
            <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)' }}>{decidedByText(result, disease as Exclude<Disease, 'other'>)}</p>
          )}
          {result.actualSchoolDay && (
            <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)' }}>
              {formatMd(result.earliest)}は{result.closedBecause}なので、
              <strong>実際に登校するのは{formatMd(result.actualSchoolDay, today ?? undefined)}</strong>
              （学校の休みの日は学校の暦に従ってください）。
            </p>
          )}
          {group === 'preschool' && result.closedBecause && (
            <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)' }}>
              {formatMd(result.earliest)}は{result.closedBecause}です。園の開所日に従ってください。
            </p>
          )}
          {group === 'adult' && (
            <p className="hint" style={{ margin: '6px 0 0' }}>
              大人の出勤停止に法令の基準はありません。学校と同じ数え方の目安です。勤務先の就業規則・指示に従ってください。
            </p>
          )}
          {rule.extraCondition && (
            <p className="hint" style={{ margin: '6px 0 0' }}>
              {rule.extraCondition}。
            </p>
          )}
          {result.holidayUnknown && (
            <p className="hint" style={{ margin: '6px 0 0' }}>
              {HOLIDAY_LAST_YEAR + 1}年以降の祝日はまだ入っていないので、土日だけで判定しています。
            </p>
          )}

          <table style={{ marginTop: 10, width: '100%', tableLayout: 'fixed' }}>
            <caption className="hint" style={{ textAlign: 'left' }}>
              灰色が出席停止の日、枠が{VERB[group]}できる日。「発」は発症日から、「{recLabel[0]}」は{recLabel}した日から数えた日数（その日が0日目）
            </caption>
            <thead>
              <tr>
                {WEEK.map((w) => (
                  <th key={w} style={cellBase}>
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buildCalendar(result, onsetDate).map((week, i) => (
                <tr key={i}>
                  {week.map((c, j) => (
                    <Cell key={c ? formatDate(c.date) : `x${j}`} c={c} recLabel={recLabel} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint" style={{ margin: '6px 0 0' }}>
            根拠：学校保健安全法施行規則{rule.article}「{rule.text}」
          </p>
        </div>
      )}

      <p className="hint" style={{ marginTop: 12 }}>
        医師が感染のおそれがないと認めたときは、この限りではありません（施行規則19条2号ただし書き）。迷ったら学校医・かかりつけ医に。
        登校の際の書類（治癒証明書・経過報告書など）は、学校・自治体の様式に従ってください。
      </p>
    </div>
  );
}
