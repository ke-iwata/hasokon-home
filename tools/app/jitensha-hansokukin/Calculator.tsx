'use client';

import { useMemo, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  SYSTEM,
  VIOLATION_COUNT,
  checkBehavior,
  fineGroups,
  formatYen,
  searchBehaviors,
  type Violation,
} from '@/lib/jitensha-hansokukin';

/** 適用範囲の限定（※1 / ※2）の表示 */
const SCOPE_LABEL: Record<NonNullable<Violation['scope']>, string> = {
  bicycle: '自転車のみ',
  'ordinary-bicycle': '普通自転車のみ',
};

export default function Calculator() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const candidates = useMemo(() => searchBehaviors(query), [query]);
  const result = selected === null ? null : checkBehavior(selected);
  const groups = useMemo(() => fineGroups(!showAll), [showAll]);

  const select = (id: string) => {
    setSelected(id);
    trackToolUse('jitensha-hansokukin', 'check');
  };

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="behavior-search">行為をしぼり込む（任意）</label>
        <input
          id="behavior-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="イヤホン、歩道、二人乗り …"
        />
      </div>

      <div className="field">
        <span className="field-label">気になる行為を選んでください</span>
        {candidates.length === 0 ? (
          <p className="hint">
            あてはまる行為が見つかりませんでした。しぼり込みの言葉を消すか、別の言い方でお試しください。
            下の早見表から違反名で探すこともできます。
          </p>
        ) : (
          <div className="field-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {candidates.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => select(b.id)}
                aria-pressed={selected === b.id}
                style={{
                  fontSize: 'var(--fs-sm)',
                  fontWeight: selected === b.id ? 700 : 400,
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {result === null ? (
        <p className="hint">
          選ぶと、該当し得る違反名・反則金・青切符か赤切符かを表示します。
        </p>
      ) : (
        <>
          <div className="panel">
            <div className="metric">
              <span className="label">{result.behavior.label}</span>
              {result.yen === null ? (
                <span className="value" style={{ fontSize: 'var(--fs-lg)' }}>
                  反則金の対象外
                </span>
              ) : (
                <>
                  <span className="value">{result.yen.toLocaleString('ja-JP')}</span>
                  <span className="unit">円</span>
                </>
              )}
            </div>
            {result.violations.length > 0 && (
              <p className="hint" style={{ marginTop: 4 }}>
                {result.violations[0].name}（{result.violations[0].article}）として青切符の対象。
                {result.violations.length > 1 && '状況によっては下の違反として扱われることもあります。'}
              </p>
            )}
          </div>

          {result.violations.length > 0 && (
            <div className="panel quiet">
              <dl className="kv">
                {result.violations.map((v, i) => (
                  <div key={v.id}>
                    <dt>
                      {i === 0 ? '該当する違反' : 'なり得る違反'}：{v.name}
                      {v.scope && <span className="chip">{SCOPE_LABEL[v.scope]}</span>}
                    </dt>
                    <dd>
                      {v.variants ? (v.fineNote ?? formatYen(v.yen)) : formatYen(v.yen)}
                    </dd>
                  </div>
                ))}
              </dl>
              {result.violations.map((v) =>
                v.note || v.fineNote ? (
                  <p key={v.id} className="hint" style={{ marginTop: 8 }}>
                    <strong>{v.name}</strong>（{v.article}）
                    {v.fineNote && !v.variants && `：${v.fineNote}`}
                    {v.note && `　${v.note}`}
                  </p>
                ) : null
              )}
              {result.violations.some((v) => v.variants) && (
                <dl className="kv" style={{ marginTop: 8 }}>
                  {result.violations
                    .filter((v) => v.variants)
                    .flatMap((v) =>
                      v.variants!.map((variant) => (
                        <div key={`${v.id}-${variant.condition}`}>
                          <dt>{variant.condition}</dt>
                          <dd>{formatYen(variant.yen)}</dd>
                        </div>
                      ))
                    )}
                </dl>
              )}
            </div>
          )}

          {result.redTickets.length > 0 && (
            <div className="panel quiet">
              <p style={{ margin: '0 0 6px', fontWeight: 700 }}>
                こちらは青切符ではなく赤切符（刑事手続）です
              </p>
              <dl className="kv">
                {result.redTickets.map((v) => (
                  <div key={v.id}>
                    <dt>{v.name}</dt>
                    <dd>反則金では終わらない</dd>
                  </div>
                ))}
              </dl>
              {result.redTickets.map((v) => (
                <p key={v.id} className="hint" style={{ marginTop: 8 }}>
                  {v.note}
                </p>
              ))}
            </div>
          )}

          {result.behavior.caution && (
            <div className="note">{result.behavior.caution}</div>
          )}
        </>
      )}

      <h3 style={{ fontSize: '1rem', marginTop: 28 }}>反則金の早見表</h3>
      <p className="hint">
        {showAll
          ? `警察庁の一覧に載っている${VIOLATION_COUNT}項目すべてです。`
          : '日常の自転車利用で問題になりやすい項目だけを出しています。'}
      </p>
      <div className="field-row" style={{ marginBottom: 8 }}>
        <button type="button" onClick={() => setShowAll(false)} aria-pressed={!showAll}>
          よくある違反
        </button>
        <button type="button" onClick={() => setShowAll(true)} aria-pressed={showAll}>
          全{VIOLATION_COUNT}項目
        </button>
      </div>

      {groups.map((g) => (
        <div key={g.yen} style={{ marginTop: 12 }}>
          <h4 style={{ fontSize: '0.95rem', margin: '0 0 6px' }}>{formatYen(g.yen)}</h4>
          <table>
            <thead>
              <tr>
                <th>反則行為</th>
                <th>根拠条文</th>
              </tr>
            </thead>
            <tbody>
              {g.violations.map((v) => (
                <tr key={v.id}>
                  <td style={{ textAlign: 'left' }}>
                    {v.name}
                    {v.scope && <span className="chip">{SCOPE_LABEL[v.scope]}</span>}
                    {v.fineNote && (
                      <span className="hint" style={{ display: 'block' }}>
                        {v.fineNote}
                      </span>
                    )}
                  </td>
                  <td>{v.article}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="note">
        条文は道路交通法の条番号です（§7 は第7条）。金額が状況で変わる項目は、上の行に幅を記しています。
        イヤホン・傘差しなどの<strong>公安委員会遵守事項違反は都道府県の道路交通規則で内容が決まる</strong>ため、
        細部はお住まいの都道府県で異なります。青切符の対象は{SYSTEM.minAge}歳以上です。
      </div>
    </div>
  );
}
