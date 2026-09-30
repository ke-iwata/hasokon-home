'use client';

import { useEffect, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  FIRST_REGISTRATION_DONE_NOTE,
  INPUT_ERROR_MESSAGES,
  NO_FIRST_REGISTRATION_NOTE,
  OVERDUE_MESSAGE,
  daysLeft,
  daysLeftLabel,
  formatDate,
  formatJaWithWeekday,
  isTokiOverdue,
  otherDeadlines,
  parseDate,
  taxDueDate,
  tokiDeadline,
  validateInput,
  type TaxDue,
} from '@/lib/sozoku-toki-kigen';

const radioRow = { display: 'flex', gap: 16, flexWrap: 'wrap' as const, fontSize: 'var(--fs-sm)' };
const radioLabel = { fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' };
const rowLabel = { textAlign: 'left' as const };
/** 320px 幅で横スクロールさせないため余白を詰める */
const tight = { padding: '6px 6px' };

/** 残り日数。過ぎていれば強調色で出す */
function Left({ deadline, today }: { deadline: string; today: string }) {
  const n = daysLeft(deadline, today);
  return <span style={n < 0 ? { color: 'var(--danger-fg)', fontWeight: 700 } : undefined}>{daysLeftLabel(n)}</span>;
}

/** 税の行の期限（繰り下げたときは額面の日付と理由を添える） */
function TaxDate({ t }: { t: TaxDue }) {
  return (
    <>
      {formatJaWithWeekday(t.due)}
      {t.shiftedBecause && (
        <span className="hint" style={{ display: 'block', margin: 0 }}>
          額面の{formatJaWithWeekday(t.nominal)}が{t.shiftedBecause}のため繰り下げ
        </span>
      )}
    </>
  );
}

/**
 * 相続登記の期限チェッカーの UI。
 *
 * 上段が主役の相続登記、下段が同じ死亡日から決まるほかの期限3つ。
 * ロジックは持たせない（すべて lib/sozoku-toki-kigen.ts の純関数）。
 */
export default function Calculator() {
  const [death, setDeath] = useState('');
  /** 空のあいだは死亡日と同じ扱い（「後から分かった」場合だけ変える） */
  const [known, setKnown] = useState('');
  const [division, setDivision] = useState('');
  const [registeredFirst, setRegisteredFirst] = useState(false);
  const [today, setToday] = useState<string | null>(null);

  /** 残り日数の「今日」は開いた日。静的書き出しなのでビルド時刻で固定せず、マウント後に入れる */
  useEffect(() => {
    const now = new Date();
    setToday(formatDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }));
  }, []);

  const deathOk = parseDate(death) !== null;
  const knownOn = parseDate(known) ? known : death;
  const divisionOn = parseDate(division) ? division : undefined;
  const error = deathOk ? validateInput(death, knownOn, divisionOn) : null;
  const ready = deathOk && !error;

  const toki = ready ? tokiDeadline(knownOn, divisionOn ? { on: divisionOn, registeredFirst } : undefined) : null;
  const others = ready ? otherDeadlines(death) : null;
  const jun = others ? taxDueDate(others.junKakutei) : null;
  const sozokuzei = others ? taxDueDate(others.sozokuzei) : null;
  const overdue = toki && today ? isTokiOverdue(toki, today) : false;
  /** 先に登記・申出をした人は、知った日からの期限をもう果たしている（残り日数を出さない） */
  const firstDone = Boolean(toki?.divisionDeadline);

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>相続登記の期限</h2>

      <div className="field-row">
        <div className="field">
          <label htmlFor="sozoku-death">相続の開始（死亡日）</label>
          <input
            id="sozoku-death"
            type="date"
            value={death}
            onChange={(e) => setDeath(e.target.value)}
            onBlur={() => trackToolUse('sozoku-toki-kigen', 'death')}
          />
        </div>
        <div className="field">
          <label htmlFor="sozoku-known">不動産を相続で取得したことを知った日</label>
          <input
            id="sozoku-known"
            type="date"
            value={known || death}
            onChange={(e) => setKnown(e.target.value)}
          />
        </div>
      </div>
      <p className="hint">
        知った日の既定は死亡日と同じです。不動産があることを後から知った場合だけ変えてください。
      </p>

      <div className="field">
        <label htmlFor="sozoku-division">遺産分割の成立日（任意）</label>
        <input
          id="sozoku-division"
          type="date"
          value={division}
          onChange={(e) => setDivision(e.target.value)}
          onBlur={() => trackToolUse('sozoku-toki-kigen', 'division')}
        />
      </div>

      {divisionOn && (
        <div className="field">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            分割より前に、法定相続分での登記、または相続人申告登記をしましたか
          </div>
          <div style={radioRow}>
            <label style={radioLabel}>
              <input
                type="radio"
                name="sozoku-registered-first"
                checked={registeredFirst}
                onChange={() => setRegisteredFirst(true)}
                style={{ width: 'auto' }}
              />
              はい
            </label>
            <label style={radioLabel}>
              <input
                type="radio"
                name="sozoku-registered-first"
                checked={!registeredFirst}
                onChange={() => setRegisteredFirst(false)}
                style={{ width: 'auto' }}
              />
              いいえ
            </label>
          </div>
        </div>
      )}

      {error ? (
        <p className="note" role="alert">
          {INPUT_ERROR_MESSAGES[error]}
        </p>
      ) : !toki ? (
        <div className="panel quiet">
          <p className="hint" style={{ margin: 0 }}>
            死亡日を入れると、相続登記の期限と残り日数、相続放棄・準確定申告・相続税申告の期限が出ます。
          </p>
        </div>
      ) : (
        <>
          <div className="panel" style={{ textAlign: 'center' }}>
            <div className="metric">
              <span className="value" style={{ fontSize: 'clamp(1.3rem, 6vw, 2rem)' }}>
                {formatJaWithWeekday(toki.deadline)}
              </span>
              <span className="label">
                までに相続登記
                {today && !firstDone && (
                  <>
                    （<Left deadline={toki.deadline} today={today} />）
                  </>
                )}
              </span>
            </div>
            <p className="hint" style={{ margin: '6px 0 0' }}>
              {toki.basis === 'transitional'
                ? '2024年4月1日より前に知った相続は、経過措置で2027年3月31日が期限です（知った日から3年ではありません）。'
                : '不動産を相続で取得したことを知った日から3年です（不動産登記法76条の2第1項）。'}
            </p>
            {firstDone && (
              <p className="hint" style={{ margin: '6px 0 0' }}>
                {FIRST_REGISTRATION_DONE_NOTE}
              </p>
            )}
          </div>

          {overdue && (
            <p className="note" role="alert">
              <strong>{OVERDUE_MESSAGE}</strong>
            </p>
          )}

          {divisionOn && (
            <table>
              <tbody>
                {toki.divisionDeadline ? (
                  <tr>
                    <td style={rowLabel}>
                      遺産分割の内容で登記する期限（分割の日から3年
                      {toki.divisionBasis === 'transitional' && '。施行日前の分割は経過措置で2027年3月31日'}）
                    </td>
                    <td>
                      {formatJaWithWeekday(toki.divisionDeadline)}
                      {today && (
                        <span className="hint" style={{ display: 'block', margin: 0 }}>
                          <Left deadline={toki.divisionDeadline} today={today} />
                        </span>
                      )}
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td style={rowLabel} colSpan={2}>
                      {NO_FIRST_REGISTRATION_NOTE}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          <p className="hint">
            遺産分割がまとまっていなくても、期限内に「相続人申告登記」で自分が相続人であることを法務局に申し出れば、
            申し出た人は義務を果たしたものとみなされます（76条の3）。その後の遺産分割で不動産を取得したら、
            分割の日から3年以内にあらためて登記します。
          </p>
          <p className="hint">
            期限の日が土日祝に当たるときの扱いは、法務局に確認してください。
          </p>

          <h2>ほかの期限（同じ死亡日から）</h2>
          <table>
            <thead>
              <tr>
                <th style={{ ...tight, ...rowLabel }}>手続き</th>
                <th style={tight}>期限日</th>
                <th style={tight}>残り</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...tight, ...rowLabel }}>相続放棄・限定承認（3か月）</td>
                <td style={tight}>{formatJaWithWeekday(others!.hoki)}</td>
                <td style={tight}>{today && <Left deadline={others!.hoki} today={today} />}</td>
              </tr>
              <tr>
                <td style={{ ...tight, ...rowLabel }}>準確定申告（4か月）</td>
                <td style={tight}>
                  <TaxDate t={jun!} />
                </td>
                <td style={tight}>{today && <Left deadline={jun!.due} today={today} />}</td>
              </tr>
              <tr>
                <td style={{ ...tight, ...rowLabel }}>相続税の申告・納付（10か月）</td>
                <td style={tight}>
                  <TaxDate t={sozokuzei!} />
                </td>
                <td style={tight}>{today && <Left deadline={sozokuzei!.due} today={today} />}</td>
              </tr>
            </tbody>
          </table>
          <p className="hint">
            死亡日を「相続の開始を知った日」として数えています。亡くなったことを後から知った場合は、知った日から数えます。
            税の2つは、期限が土日祝・年末年始に当たると翌開庁日に延びます（国税通則法10条2項）。
            {(jun!.holidayUnknown || sozokuzei!.holidayUnknown) &&
              '祝日のデータが無い年にかかるため、土日と年末年始だけで繰り下げています。'}
            相続放棄の期限が土日祝に当たるときの扱いは、家庭裁判所に確認してください。
            相続税は、遺産が基礎控除以下なら申告は要りません（小規模宅地等の特例や配偶者の税額軽減を使って税額が0になる場合は、申告が要ります）。
          </p>
        </>
      )}
    </div>
  );
}
