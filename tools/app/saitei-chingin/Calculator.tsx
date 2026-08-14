'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  CURRENT_FY_LABEL,
  DATA_CHECKED_AT,
  PREFECTURES,
  REVISED_FY_LABEL,
  checkWage,
  estimateIncome,
  formatDate,
  formatYen,
  nextWallFor,
  prefectureByCode,
  revisionOf,
  type RevisionStatus,
} from '@/lib/saitei-chingin';

/** 状態の見せ方。目安は「見込み」であることを言い切る文言にする */
const STATUS_NOTE: Record<RevisionStatus, string> = {
  目安: 'まだ答申が出ていないため、ランク別の目安額を足した見込みです。県によっては目安を上回る額で答申されます',
  答申: '地方最低賃金審議会が答申した額です。異議申出の手続を経て正式に決定されます',
  発効済み: 'すでに発効しています',
};

/** 初期表示の県。全国で最も人口が多く、検索も多い東京にしておく */
const DEFAULT_CODE = 13;

export default function Calculator() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [hourly, setHourly] = useState('');
  const [hoursPerWeek, setHoursPerWeek] = useState('20');
  const [size51, setSize51] = useState(false);

  /**
   * 判定の基準日。
   * 静的書き出しなのでビルド時刻で描画してから、マウント後に「開いた日」へ差し替える
   * （サーバ描画とハイドレーションの食い違いを避けるため。lib/nenshu-kabe.ts と同じ作法）。
   */
  const [asOf, setAsOf] = useState<Date>(() => new Date());
  useEffect(() => setAsOf(new Date()), []);

  const pref = prefectureByCode(code) ?? PREFECTURES[0];
  const revision = useMemo(() => revisionOf(pref, asOf), [pref, asOf]);

  const hourlyYen = Number.parseFloat(hourly);
  const hasHourly = Number.isFinite(hourlyYen) && hourlyYen > 0;
  const check = hasHourly ? checkWage(pref, hourlyYen, asOf) : null;

  const hours = Number.parseFloat(hoursPerWeek);
  const hasHours = Number.isFinite(hours) && hours > 0;
  const income = hasHourly && hasHours ? estimateIncome(hourlyYen, hours) : null;
  const nextKabe = income
    ? nextWallFor(income.annual, { hoursPerWeek: hours, size51, asOf })
    : undefined;

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="pref">お住まい・勤務先の都道府県</label>
        <select
          id="pref"
          value={code}
          onChange={(e) => {
            setCode(Number(e.target.value));
            trackToolUse('saitei-chingin', 'select-prefecture');
          }}
        >
          {PREFECTURES.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="panel">
        <div className="metric">
          <span className="label">
            {pref.name}の最低賃金（{REVISED_FY_LABEL}
            {revision.status === '目安' ? '・見込み' : ''}）
          </span>
          <span className="value">{revision.yen.toLocaleString('ja-JP')}</span>
          <span className="unit">円</span>
        </div>
        <p className="hint" style={{ marginTop: 4 }}>
          いまは <strong>{formatYen(pref.currentYen)}</strong>（{CURRENT_FY_LABEL}・
          {formatDate(pref.currentEffectiveOn)}発効）。
          <strong>
            {revision.raise > 0 ? `+${revision.raise}円` : `${revision.raise}円`}（
            {revision.raisePercent}%）
          </strong>
          の引き上げです。
        </p>
      </div>

      <div className="panel quiet">
        <dl className="kv">
          <div>
            <dt>
              状態<span className="chip">{revision.status}</span>
            </dt>
            <dd style={{ fontWeight: 400 }}>{STATUS_NOTE[revision.status]}</dd>
          </div>
          <div>
            <dt>発効（予定）日</dt>
            <dd>
              {revision.effectiveOn
                ? formatDate(revision.effectiveOn)
                : '未公表（10月ごろの見込み）'}
            </dd>
          </div>
          <div>
            <dt>目安のランク</dt>
            <dd>{pref.rank}ランク</dd>
          </div>
        </dl>
        <p className="hint" style={{ marginTop: 8 }}>
          出典：
          <a href={revision.source.url} target="_blank" rel="noopener noreferrer">
            {revision.source.label}
          </a>
          （{formatDate(revision.source.checkedAt)}確認）／ データ最終更新日：
          {formatDate(DATA_CHECKED_AT)}
        </p>
      </div>

      <div className="field">
        <label htmlFor="hourly">あなたの時給（円）</label>
        <input
          id="hourly"
          type="number"
          inputMode="decimal"
          min={0}
          step={1}
          value={hourly}
          onChange={(e) => setHourly(e.target.value)}
          onBlur={() => hasHourly && trackToolUse('saitei-chingin', 'check-wage')}
          placeholder="1200"
        />
        <p className="hint">
          月給制の方は「月給 ÷ 1か月の所定労働時間」で時間額にしてから入力してください。
          通勤手当・残業代・賞与は最低賃金の比較には含めません。
        </p>
      </div>

      {check && (
        <div className="panel">
          <div className="metric">
            <span className="label">{CURRENT_FY_LABEL}（いま）の最低賃金と比べると</span>
            <span className="value" style={{ fontSize: 'var(--fs-lg)' }}>
              {check.current.meets ? '足りています' : '下回っています'}
            </span>
          </div>
          <p className="hint" style={{ marginTop: 4 }}>
            {check.current.meets
              ? `${formatYen(pref.currentYen)}を${
                  check.current.surplus === 0
                    ? 'ちょうど満たしています'
                    : `${formatYen(check.current.surplus)}上回っています`
                }。`
              : `${formatYen(pref.currentYen)}に${formatYen(
                  check.current.shortfall,
                )}足りません。最低賃金を下回る取り決めは無効で、差額を請求できます。`}
          </p>

          <div className="metric" style={{ marginTop: 12 }}>
            <span className="label">
              {REVISED_FY_LABEL}の改定後
              {revision.status === '目安' ? '（見込み）' : ''}は
            </span>
            <span className="value" style={{ fontSize: 'var(--fs-lg)' }}>
              {check.revised.meets ? '足りています' : '下回ります'}
            </span>
          </div>
          <p className="hint" style={{ marginTop: 4 }}>
            {check.revised.meets
              ? `改定後の${formatYen(revision.yen)}も満たしています。`
              : `改定後は${formatYen(revision.yen)}になるため、いまの時給のままだと${formatYen(
                  check.revised.shortfall,
                )}足りなくなります。`}
            {revision.status === '目安' &&
              '（この額は答申前の見込みです。確定額は県の答申で変わることがあります）'}
          </p>
        </div>
      )}

      <div className="field">
        <label htmlFor="hours">週の労働時間（時間）</label>
        <input
          id="hours"
          type="number"
          inputMode="decimal"
          min={0}
          max={168}
          step={1}
          value={hoursPerWeek}
          onChange={(e) => setHoursPerWeek(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="size51" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            id="size51"
            type="checkbox"
            checked={size51}
            onChange={(e) => setSize51(e.target.checked)}
            style={{ width: 'auto' }}
          />
          勤務先の従業員数が51人以上
        </label>
        <p className="hint">
          社会保険に加入するかどうかの判定に使います。分からないときはチェックなしのままで構いません。
        </p>
      </div>

      {income && (
        <div className="panel quiet">
          <dl className="kv">
            <div>
              <dt>月収の目安</dt>
              <dd>{formatYen(income.monthly)}</dd>
            </div>
            <div>
              <dt>年収の目安</dt>
              <dd>{formatYen(income.annual)}</dd>
            </div>
            {nextKabe ? (
              <div>
                <dt>次の年収の壁</dt>
                <dd>
                  {nextKabe.label} まであと {formatYen(nextKabe.diff)}
                </dd>
              </div>
            ) : (
              <div>
                <dt>年収の壁</dt>
                <dd>該当する壁を超えています</dd>
              </div>
            )}
          </dl>
          <p className="hint" style={{ marginTop: 8 }}>
            時給 × 週の労働時間 × 52週で計算した概算です（賞与・残業代・通勤手当は含みません）。
            {nextKabe && `${nextKabe.label}を超えると、${nextKabe.effect}`}
          </p>
          <p className="hint" style={{ marginTop: 8 }}>
            <Link href="/nenshu-kabe/">年収の壁 計算機で詳しく見る →</Link>
            {' ／ '}
            <Link href="/hatarakizon/">社会保険に入ると手取りがどうなるか →</Link>
          </p>
        </div>
      )}

      {!hasHourly && (
        <p className="hint">
          時給を入力すると、いまの最低賃金と改定後の額の両方で足りているかを判定します。
        </p>
      )}
    </div>
  );
}
