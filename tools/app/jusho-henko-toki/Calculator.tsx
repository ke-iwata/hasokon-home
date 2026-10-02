'use client';

import { useEffect, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  INPUT_ERROR_MESSAGES,
  MULTIPLE_CHANGES_NOTE,
  OVERDUE_MESSAGE,
  SEARCH_INFO_DONE_NOTE,
  SEARCH_INFO_UNKNOWN_NOTE,
  daysLeft,
  daysLeftLabel,
  earliestDeadline,
  formatDate,
  formatJaWithWeekday,
  isOverdue,
  parseDate,
  tokiDeadline,
  torokuMenkyo,
  validateInput,
  type JushoDeadline,
} from '@/lib/jusho-henko-toki';

const radioRow = { display: 'flex', gap: 16, flexWrap: 'wrap' as const, fontSize: 'var(--fs-sm)' };
const radioLabel = { fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' };
const rowLabel = { textAlign: 'left' as const };

type Kind = 'address' | 'name' | 'both';
type SearchInfo = 'no' | 'yes' | 'unknown';

const KIND_LABEL: Record<Kind, string> = { address: '住所', name: '氏名', both: '住所と氏名' };

/** 残り日数。過ぎていれば強調色で出す */
function Left({ deadline, today }: { deadline: string; today: string }) {
  const n = daysLeft(deadline, today);
  return <span style={n < 0 ? { color: 'var(--danger-fg)', fontWeight: 700 } : undefined}>{daysLeftLabel(n)}</span>;
}

function basisText(d: JushoDeadline): string {
  return d.basis === 'transitional'
    ? '2026年4月1日より前の変更なので、経過措置の期限です（附則）。'
    : '変更日から2年の応当日です（不動産登記法76条の5）。';
}

function Radios<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div style={radioRow}>
      {options.map(([v, label]) => (
        <label key={v} style={radioLabel}>
          <input
            type="radio"
            name={name}
            checked={value === v}
            onChange={() => onChange(v)}
            style={{ width: 'auto' }}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

/**
 * 住所変更登記の期限チェッカーの UI。
 *
 * 上段が期限、下段が登録免許税の目安。ロジックは持たせない（lib/jusho-henko-toki.ts の純関数）。
 */
export default function Calculator() {
  const [kind, setKind] = useState<Kind>('address');
  const [changed, setChanged] = useState('');
  const [hasEarlier, setHasEarlier] = useState(false);
  const [earlier, setEarlier] = useState('');
  const [searchInfo, setSearchInfo] = useState<SearchInfo>('unknown');
  const [count, setCount] = useState('2');
  const [today, setToday] = useState<string | null>(null);

  /** 「今日」は開いた日。静的書き出しなのでビルド時刻で固定せず、マウント後に入れる */
  useEffect(() => {
    const now = new Date();
    setToday(formatDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }));
  }, []);

  const changedOk = parseDate(changed) !== null;
  const earlierOn = hasEarlier && parseDate(earlier) ? earlier : undefined;
  const error = changedOk && today ? validateInput(changed, earlierOn, today) : null;
  const ready = changedOk && !error;

  const current = ready ? tokiDeadline(changed) : null;
  const previous = ready && earlierOn ? tokiDeadline(earlierOn) : null;
  const first = ready ? earliestDeadline(earlierOn ? [earlierOn, changed] : [changed]) : null;
  const overdue = first && today ? isOverdue(first.deadline, today) : false;
  const tax = torokuMenkyo(Number(count));

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>変更登記の期限</h2>

      <div className="field">
        <div style={{ fontWeight: 700, marginBottom: 6 }}>変わったのは</div>
        <Radios
          name="jusho-kind"
          value={kind}
          onChange={setKind}
          options={[
            ['address', '住所（引っ越し）'],
            ['name', '氏名（結婚・離婚など）'],
            ['both', '両方'],
          ]}
        />
      </div>

      <div className="field">
        <label htmlFor="jusho-changed">変わった日</label>
        <input
          id="jusho-changed"
          type="date"
          value={changed}
          onChange={(e) => setChanged(e.target.value)}
          onBlur={() => trackToolUse('jusho-henko-toki', 'changed')}
        />
      </div>
      <p className="hint">
        {kind === 'name'
          ? '戸籍上の氏名が変わった日（婚姻届・離婚届などの日）です。'
          : '転入届を出した日ではなく、実際に住所が変わった日（住民票の「住所を定めた日」）です。'}
      </p>

      <div className="field">
        <div style={{ fontWeight: 700, marginBottom: 6 }}>その前にも、登記していない変更がありますか</div>
        <Radios
          name="jusho-earlier"
          value={hasEarlier ? 'yes' : 'no'}
          onChange={(v) => setHasEarlier(v === 'yes')}
          options={[
            ['no', 'いいえ'],
            ['yes', 'はい'],
          ]}
        />
      </div>
      {hasEarlier && (
        <div className="field">
          <label htmlFor="jusho-earlier-on">いちばん古い未登記の変更日</label>
          <input id="jusho-earlier-on" type="date" value={earlier} onChange={(e) => setEarlier(e.target.value)} />
        </div>
      )}

      <div className="field">
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          検索用情報の申出（スマート変更登記）または会社法人等番号の登記は済んでいますか
        </div>
        <Radios
          name="jusho-search-info"
          value={searchInfo}
          onChange={setSearchInfo}
          options={[
            ['no', 'いいえ'],
            ['yes', 'はい'],
            ['unknown', '分からない'],
          ]}
        />
      </div>

      {error ? (
        <p className="note" role="alert">
          {INPUT_ERROR_MESSAGES[error]}
        </p>
      ) : !current || !first ? (
        <div className="panel quiet">
          <p className="hint" style={{ margin: 0 }}>
            変わった日を入れると、{KIND_LABEL[kind]}の変更登記の期限と残り日数が出ます。
          </p>
        </div>
      ) : (
        <>
          <div className="panel" style={{ textAlign: 'center' }}>
            <div className="metric">
              <span className="value" style={{ fontSize: 'clamp(1.3rem, 6vw, 2rem)' }}>
                {formatJaWithWeekday(first.deadline)}
              </span>
              <span className="label">
                までに{KIND_LABEL[kind]}の変更登記
                {today && (
                  <>
                    （<Left deadline={first.deadline} today={today} />）
                  </>
                )}
              </span>
            </div>
            <p className="hint" style={{ margin: '6px 0 0' }}>
              {basisText(first)}
            </p>
          </div>

          {previous && (
            <>
              <table>
                <tbody>
                  {(
                    [
                      ['前の未登記の変更', earlierOn!, previous],
                      ['今回の変更', changed, current],
                    ] as const
                  ).map(([label, on, d]) => {
                    const isFirst = on === first.of;
                    return (
                      <tr key={label}>
                        <td style={rowLabel}>
                          {label}：{formatJaWithWeekday(on)}
                        </td>
                        <td style={isFirst ? { fontWeight: 700 } : undefined}>
                          {formatJaWithWeekday(d.deadline)}
                          {today && (
                            <span className="hint" style={{ display: 'block', margin: 0 }}>
                              <Left deadline={d.deadline} today={today} />
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="hint">{MULTIPLE_CHANGES_NOTE}</p>
            </>
          )}

          {overdue && (
            <p className="note" role="alert">
              <strong>{OVERDUE_MESSAGE}</strong>
            </p>
          )}

          {searchInfo === 'yes' && <p className="hint">{SEARCH_INFO_DONE_NOTE}</p>}
          {searchInfo === 'unknown' && <p className="hint">{SEARCH_INFO_UNKNOWN_NOTE}</p>}
          <p className="hint">期限の日が土日祝に当たるときの扱いは、法務局に確認してください。</p>
        </>
      )}

      <h2>登録免許税の目安</h2>
      <div className="field">
        <label htmlFor="jusho-count">不動産の個数（土地は1筆、建物は1棟ごと）</label>
        <input
          id="jusho-count"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      </div>
      <div className="panel" style={{ textAlign: 'center' }}>
        <div className="metric">
          <span className="value">{tax.toLocaleString('ja-JP')}円</span>
          <span className="label">登録免許税（1個につき1,000円）</span>
        </div>
      </div>
      <p className="hint">
        戸建て（土地1筆・建物1棟）なら2個です。マンションは敷地権の土地が複数あると個数が増えます。
      </p>
    </div>
  );
}
