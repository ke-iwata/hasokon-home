'use client';

import { useMemo, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  MAX_SCORES,
  SMALL_GROUP,
  countBucket,
  RECORD_STEPS,
  estimatedRank,
  formatPercent,
  hensachi,
  parseScores,
  requiredScore,
  roundTo,
  rowName,
  stepDecimals,
  summarize,
  toCsv,
  upperPercent,
} from '@/lib/hensachi';

type Mode = 'single' | 'paste' | 'target';

const SLUG = 'hensachi';

/** 画面に描く表の行数。残りは「すべて表示」で出す（全件は CSV） */
const TABLE_ROWS = 100;

/** 仕様書 #1 の例。「入れたら変わる」型にするため最初から結果を出す */
const SAMPLE_PASTE = '佐藤 72\n鈴木 85\n田中 60\n高橋 91\n伊藤 55\n渡辺 78\n山本 64\n中村 70';

/** 数値欄 → 数（全角数字・カンマを許す）。空や不正なら null */
function toNum(s: string): number | null {
  const t = s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．]/g, '.')
    .replace(/[－−]/g, '-')
    .replace(/[,，\s]/g, '');
  if (t === '' || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** 320px 幅でも入力と結果1の数字が同じ画面に収まるよう、入力は常に2列（狭い入力欄で足りる） */
const TWO_COLS = { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } as const;

const fmt = (x: number, d = 1) => roundTo(x, d).toFixed(d);
const fmtNum = (x: number) => roundTo(x, 2).toLocaleString('ja-JP', { maximumFractionDigits: 2 });

/** 正規分布の図に自分の位置を1本線で。色は CSS 変数（明暗テーマに追随） */
function BellCurve({ t }: { t: number }) {
  const W = 300;
  const H = 90;
  const xOf = (v: number) => ((v - 20) / 60) * W; // 偏差値 20〜80 を横幅に
  const pts: string[] = [];
  for (let v = 20; v <= 80; v += 1) {
    const z = (v - 50) / 10;
    pts.push(`${xOf(v).toFixed(1)},${(H - 8 - Math.exp(-(z * z) / 2) * (H - 20)).toFixed(1)}`);
  }
  const clamped = Math.min(80, Math.max(20, t));
  const x = xOf(clamped);
  const shade: string[] = [`${x.toFixed(1)},${H - 8}`];
  for (let v = Math.ceil(clamped); v <= 80; v += 1) {
    const z = (v - 50) / 10;
    shade.push(`${xOf(v).toFixed(1)},${(H - 8 - Math.exp(-(z * z) / 2) * (H - 20)).toFixed(1)}`);
  }
  shade.push(`${W},${H - 8}`);
  return (
    <svg
      viewBox={`0 0 ${W} ${H + 8}`}
      role="img"
      aria-label={`正規分布の図。偏差値${fmt(t)}の位置に線`}
      style={{ width: '100%', maxWidth: 360, display: 'block', margin: '8px 0 0' }}
    >
      <polygon points={shade.join(' ')} fill="var(--accent)" opacity={0.18} />
      <polyline points={pts.join(' ')} fill="none" stroke="var(--muted)" strokeWidth={1.5} />
      <line x1={0} y1={H - 8} x2={W} y2={H - 8} stroke="var(--border)" />
      <line x1={x} y1={6} x2={x} y2={H - 8} stroke="var(--accent)" strokeWidth={2.5} />
      {[30, 40, 50, 60, 70].map((v) => (
        <text key={v} x={xOf(v)} y={H + 6} fontSize={10} textAnchor="middle" fill="var(--muted)">
          {v}
        </text>
      ))}
    </svg>
  );
}

function Undefined() {
  return (
    <div className="panel quiet">
      <p style={{ margin: 0 }}>
        標準偏差が 0（全員が同じ点数）のときは、偏差値を定義できません。全員が平均点ちょうどなので、ばらつきとの比べようがないためです。
      </p>
    </div>
  );
}

export default function Calculator() {
  const [mode, setMode] = useState<Mode>('single');
  const [lowerIsBetter, setLowerIsBetter] = useState(false);

  const [score, setScore] = useState('80');
  const [mean, setMean] = useState('60');
  const [sd, setSd] = useState('10');
  const [count, setCount] = useState('');

  const [text, setText] = useState(SAMPLE_PASTE);
  const [showNames, setShowNames] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);

  const [target, setTarget] = useState('65');
  const [tMean, setTMean] = useState('55');
  const [tSd, setTSd] = useState('12');
  const [fullMark, setFullMark] = useState('100');
  const [recordDecimals, setRecordDecimals] = useState(2);

  function switchMode(next: Mode) {
    setMode(next);
    trackToolUse(SLUG, next);
  }

  const opts = { lowerIsBetter };

  // ---- 1. 偏差値を出す
  const sNum = toNum(score);
  const mNum = toNum(mean);
  const sdNum = toNum(sd);
  const nNum = toNum(count);
  const t = sNum !== null && mNum !== null && sdNum !== null ? hensachi(sNum, mNum, sdNum, opts) : null;
  const sdZero = sdNum !== null && sdNum <= 0;
  const rank = t !== null && nNum !== null ? estimatedRank(t, nNum) : null;

  // ---- 2. 貼り付け
  const parsed = useMemo(() => parseScores(text), [text]);
  const summary = useMemo(() => summarize(parsed.entries, opts), [parsed, lowerIsBetter]); // eslint-disable-line react-hooks/exhaustive-deps
  const visibleRows = summary ? (showAll ? summary.rows : summary.rows.slice(0, TABLE_ROWS)) : [];

  async function copyCsv() {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(toCsv(summary, showNames));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      trackToolUse(SLUG, `paste-csv-${countBucket(summary.count)}`);
    } catch {
      /* クリップボード非対応環境では何もしない */
    }
  }

  // ---- 3. 必要な点数
  const tgNum = toNum(target);
  const tmNum = toNum(tMean);
  const tsNum = toNum(tSd);
  const fmNum = toNum(fullMark);
  const decimals = stepDecimals(fullMark, { lowerIsBetter, recordDecimals });
  const req =
    tgNum !== null && tmNum !== null && tsNum !== null
      ? requiredScore(tgNum, tmNum, tsNum, { ...opts, decimals, fullMark: fmNum })
      : null;

  return (
    <div className="card">
      <div className="field">
        <span className="field-label">計算の種類</span>
        <div style={{ display: 'flex', gap: '6px 20px', flexWrap: 'wrap' }}>
          {(
            [
              ['single', '偏差値を出す'],
              ['paste', '点数を貼り付ける'],
              ['target', '必要な点数を出す'],
            ] as [Mode, string][]
          ).map(([value, label]) => (
            <label key={value} style={{ fontWeight: mode === value ? 700 : 400 }}>
              <input
                type="radio"
                name="hensachi-mode"
                value={value}
                checked={mode === value}
                onChange={() => switchMode(value)}
                style={{ width: 'auto', marginRight: 6 }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {mode === 'single' && (
        <>
          <div className="field-row" style={TWO_COLS}>
            <div className="field">
              <label htmlFor="hensachi-score">{lowerIsBetter ? '記録' : '得点'}</label>
              <input id="hensachi-score" type="text" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} onBlur={() => trackToolUse(SLUG, 'single-input')} />
            </div>
            <div className="field">
              <label htmlFor="hensachi-mean">平均点</label>
              <input id="hensachi-mean" type="text" inputMode="decimal" value={mean} onChange={(e) => setMean(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="hensachi-sd">標準偏差</label>
              <input id="hensachi-sd" type="text" inputMode="decimal" value={sd} onChange={(e) => setSd(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="hensachi-count">受験者数（任意）</label>
              <input id="hensachi-count" type="text" inputMode="numeric" value={count} placeholder="例：200" onChange={(e) => setCount(e.target.value)} />
            </div>
          </div>
          <p className="hint" style={{ marginTop: 0 }}>
            <button
              type="button"
              onClick={() => switchMode('paste')}
              style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 'var(--fs-xs)' }}
            >
              標準偏差が分からない
            </button>{' '}
            全員の点数があれば、貼り付けて標準偏差を出せます。<strong>点数はこの端末の外に送りません。</strong>
          </p>

          {sdZero ? (
            <Undefined />
          ) : t !== null ? (
            <div className="panel">
              <div className="metric">
                <span className="label">偏差値</span>
                <span className="value">{fmt(t)}</span>
              </div>
              <dl className="kv">
                <div>
                  <dt>上位の目安</dt>
                  <dd>{formatPercent(upperPercent(t))}</dd>
                </div>
                {rank !== null && nNum !== null && (
                  <div>
                    <dt>順位の目安</dt>
                    <dd>
                      約{rank.toLocaleString('ja-JP')}位／{nNum.toLocaleString('ja-JP')}人
                    </dd>
                  </div>
                )}
              </dl>
              <BellCurve t={t} />
              <p className="hint" style={{ margin: '6px 0 0' }}>
                上位の目安は、点数の分布を正規分布とみなしたときの値です。実際の試験は満点・0点で打ち切られたり山が2つあったりするので、ずれることがあります。
              </p>
            </div>
          ) : (
            <p className="hint">得点・平均点・標準偏差を数で入れてください。</p>
          )}
        </>
      )}

      {mode === 'paste' && (
        <>
          <div className="field">
            <label htmlFor="hensachi-paste">点数（改行・カンマ・タブ・空白で区切る。名前つきも可）</label>
            <textarea
              id="hensachi-paste"
              rows={8}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setShowAll(false);
              }}
              onBlur={() => trackToolUse(SLUG, `paste-${countBucket(parsed.entries.length)}`)}
            />
            <p className="hint" style={{ margin: '4px 0 0' }}>
              表計算ソフトの列をそのまま貼れます（最大 {MAX_SCORES.toLocaleString('ja-JP')} 件）。
              <strong>点数はこの端末の外に送りません</strong>（計算はブラウザの中だけで行います）。
            </p>
          </div>

          {parsed.truncated > 0 && (
            <p className="note">
              {MAX_SCORES.toLocaleString('ja-JP')} 件までを使いました（残り {parsed.truncated.toLocaleString('ja-JP')} 件は読んでいません）。
            </p>
          )}
          {(parsed.skipped > 0 || parsed.negatives > 0) && (
            <p className="hint">
              {parsed.skipped > 0 && `読めなかった行・語：${parsed.skipped.toLocaleString('ja-JP')}件。`}
              {parsed.negatives > 0 && `負の点数があります（${parsed.negatives}件）。そのまま計算しています。`}
            </p>
          )}

          {summary && summary.sd === 0 && summary.count > 1 && <Undefined />}

          {summary && (
            <div className="panel">
              <dl className="kv">
                <div>
                  <dt>件数</dt>
                  <dd>{summary.count.toLocaleString('ja-JP')}件</dd>
                </div>
                <div>
                  <dt>平均</dt>
                  <dd>{fmtNum(summary.mean)}</dd>
                </div>
                <div>
                  <dt>標準偏差（母標準偏差・STDEV.P）</dt>
                  <dd>{fmtNum(summary.sd)}</dd>
                </div>
                <div>
                  <dt>最高／最低</dt>
                  <dd>
                    {fmtNum(summary.max)}／{fmtNum(summary.min)}
                  </dd>
                </div>
                <div>
                  <dt>中央値</dt>
                  <dd>{fmtNum(summary.median)}</dd>
                </div>
              </dl>
              {summary.count < SMALL_GROUP && (
                <p className="hint" style={{ margin: '6px 0 0' }}>
                  人数が少ない（{SMALL_GROUP}人未満）と、正規分布とみなした上位の目安はずれやすくなります。偏差値と順位はそのまま使えます。
                </p>
              )}
            </div>
          )}

          {summary && summary.sd > 0 && (
            <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0 4px' }}>
                <label style={{ fontWeight: 400 }}>
                  <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} style={{ width: 'auto', marginRight: 6 }} />
                  名前を表示する
                </label>
                <button
                  type="button"
                  onClick={copyCsv}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 'var(--fs-sm)', fontWeight: 600, cursor: 'pointer' }}
                >
                  {copied ? 'コピーしました' : `CSVでコピー（全${summary.count.toLocaleString('ja-JP')}件）`}
                </button>
              </div>
              <table style={{ tableLayout: 'fixed', fontSize: 'var(--fs-sm)' }}>
                <colgroup>
                  <col />
                  <col style={{ width: '24%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '20%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ padding: '6px 4px' }}>名前</th>
                    <th style={{ padding: '6px 4px' }}>{lowerIsBetter ? '記録' : '得点'}</th>
                    <th style={{ padding: '6px 4px' }}>偏差値</th>
                    <th style={{ padding: '6px 4px' }}>順位</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr key={r.index}>
                      <td style={{ padding: '6px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rowName(r, showNames)}</td>
                      <td style={{ padding: '6px 4px' }}>{r.score}</td>
                      <td style={{ padding: '6px 4px' }}>{r.hensachi === null ? '—' : fmt(r.hensachi)}</td>
                      <td style={{ padding: '6px 4px' }}>{r.rank}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!showAll && summary.count > TABLE_ROWS && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 'var(--fs-sm)', cursor: 'pointer' }}
                >
                  すべて表示（残り {(summary.count - TABLE_ROWS).toLocaleString('ja-JP')} 行）
                </button>
              )}
            </>
          )}
          {!summary && <p className="hint">点数を1つ以上貼り付けてください。</p>}
        </>
      )}

      {mode === 'target' && (
        <>
          <div className="field-row" style={TWO_COLS}>
            <div className="field">
              <label htmlFor="hensachi-target">目標の偏差値</label>
              <input id="hensachi-target" type="text" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} onBlur={() => trackToolUse(SLUG, 'target-input')} />
            </div>
            <div className="field">
              <label htmlFor="hensachi-tmean">平均点</label>
              <input id="hensachi-tmean" type="text" inputMode="decimal" value={tMean} onChange={(e) => setTMean(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="hensachi-tsd">標準偏差</label>
              <input id="hensachi-tsd" type="text" inputMode="decimal" value={tSd} onChange={(e) => setTSd(e.target.value)} />
            </div>
            {lowerIsBetter ? (
              <div className="field">
                <label htmlFor="hensachi-step">記録の刻み</label>
                <select id="hensachi-step" value={recordDecimals} onChange={(e) => setRecordDecimals(Number(e.target.value))}>
                  {RECORD_STEPS.map((st) => (
                    <option key={st.decimals} value={st.decimals}>
                      {st.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="hensachi-full">満点（任意）</label>
                <input id="hensachi-full" type="text" inputMode="decimal" value={fullMark} onChange={(e) => setFullMark(e.target.value)} />
              </div>
            )}
          </div>

          {tsNum !== null && tsNum <= 0 ? (
            <Undefined />
          ) : req ? (
            <div className="panel">
              {req.overFull ? (
                <p style={{ margin: 0, fontWeight: 700 }}>
                  満点でも届きません（必要な点数は {fmtNum(req.raw)} 点で、満点の {fmNum} 点を超えます）。
                </p>
              ) : (
                <>
                  <div className="metric">
                    <span className="label">{lowerIsBetter ? '必要な記録' : '必要な得点'}</span>
                    <span className="value">{req.value.toLocaleString('ja-JP', { maximumFractionDigits: decimals })}</span>
                    <span className="unit">{lowerIsBetter ? '以下' : '点以上'}</span>
                  </div>
                  <p className="hint" style={{ margin: '6px 0 0' }}>
                    式どおりだと {fmtNum(req.raw)}。
                    {lowerIsBetter
                      ? 'これより遅いと届かないので、刻みに合わせて切り捨てています。'
                      : 'これより低いと届かないので、刻みに合わせて切り上げています。'}
                    上位の目安は {formatPercent(upperPercent(tgNum as number))}（正規分布とみなしたとき）。
                  </p>
                </>
              )}
            </div>
          ) : (
            <p className="hint">目標の偏差値・平均点・標準偏差を数で入れてください。</p>
          )}
        </>
      )}

      <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
        <label style={{ fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={lowerIsBetter}
            onChange={(e) => {
              setLowerIsBetter(e.target.checked);
              trackToolUse(SLUG, `${mode}-lower`);
            }}
            style={{ width: 'auto', marginRight: 6 }}
          />
          小さいほど良い記録（タイムなど）
        </label>
        <p className="hint" style={{ margin: '2px 0 0' }}>
          速いほど偏差値が高くなるよう、符号を反転して計算します。分:秒（1:02.3）は読めないので、秒に直して入れてください。
        </p>
      </div>
    </div>
  );
}
