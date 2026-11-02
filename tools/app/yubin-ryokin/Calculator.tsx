'use client';

import { useEffect, useState } from 'react';
import {
  cheaperAlternatives,
  compareStamps,
  computeFee,
  ENVELOPE_PRESETS,
  formatCombo,
  formatHoldings,
  HOLDING_STAMPS,
  nengaBanner,
  OLD_STAMPS,
  parseDecimal,
  rateTableAt,
  todayInTokyo,
  upcomingNotice,
  YU_PACK_URL,
  type Input,
  type Kind,
  type Options,
  type Record_,
} from '@/lib/yubin-ryokin';
import { trackToolUse } from '@/lib/analytics';

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;

const KINDS: [Kind, string][] = [
  ['envelope', '封筒・小包'],
  ['hagaki', 'はがき'],
  ['ofuku', '往復はがき'],
];

const RECORDS: [Record_, string][] = [
  ['none', 'なし'],
  ['tokutei', '特定記録'],
  ['kani', '簡易書留'],
  ['ippan', '一般書留'],
];

const btn = {
  minHeight: 44,
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  fontSize: 'var(--fs-sm)',
  cursor: 'pointer',
} as const;

const stepBtn = { ...btn, minWidth: 44, padding: 0, fontSize: '1.1rem', fontWeight: 700 } as const;

/** 数値の入力欄（inputmode=decimal。全角数字も受け付ける） */
function NumField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label>
      {label}（{unit}）
      <input type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export default function Calculator({ buildDate }: { buildDate: string }) {
  const [kind, setKind] = useState<Kind>('envelope');
  const [length, setLength] = useState('23.5');
  const [width, setWidth] = useState('12');
  const [thickness, setThickness] = useState('0.5');
  const [weight, setWeight] = useState('25');
  const [hLength, setHLength] = useState('14.8');
  const [hWidth, setHWidth] = useState('10');
  const [hWeight, setHWeight] = useState('3');
  const [sokutatsu, setSokutatsu] = useState(false);
  const [record, setRecord] = useState<Record_>('none');
  const [songai, setSongai] = useState('');
  const [shomei, setShomei] = useState(false);
  const [stamps, setStamps] = useState<Record<number, number>>({});
  // サーバ描画とハイドレーション直後はビルド日。マウント後に「開いた日」（Asia/Tokyo）へ差し替える
  const [today, setToday] = useState(buildDate);

  useEffect(() => {
    setToday(todayInTokyo());
  }, []);

  const isHagaki = kind !== 'envelope';
  const nums = isHagaki
    ? [parseDecimal(hLength), parseDecimal(hWidth), 0, parseDecimal(hWeight)]
    : [parseDecimal(length), parseDecimal(width), parseDecimal(thickness), parseDecimal(weight)];
  const sizeOk = kind === 'ofuku' || nums.every((n) => n !== null && n >= 0);
  const songaiNum = songai.trim() === '' ? null : parseDecimal(songai);

  const options: Options = {
    sokutatsu,
    record,
    songai: record === 'kani' || record === 'ippan' ? songaiNum : null,
    haitatsuShomei: record === 'ippan' && shomei,
  };
  const input: Input | null = sizeOk
    ? {
        kind,
        size:
          kind === 'ofuku'
            ? { length: 14.8, width: 10, thickness: 0, weight: 0 }
            : { length: nums[0]!, width: nums[1]!, thickness: nums[2]!, weight: nums[3]! },
        options,
      }
    : null;
  const result = input ? computeFee(input, today) : null;
  const table = rateTableAt(today);
  const notice = input && result?.ok ? upcomingNotice(input, today) : null;
  const alternatives =
    input && result?.ok && (result.category === 'kikakunai' || result.category === 'kikakugai')
      ? cheaperAlternatives(input.size, result.base, table)
      : [];
  const banner = isHagaki ? nengaBanner(today) : null;
  const stampResult = result?.ok ? compareStamps(stamps, result.total) : null;

  const setCount = (v: number, n: number) => setStamps((s) => ({ ...s, [v]: Math.max(0, n) }));

  return (
    <div className="card">
      <div className="field">
        <span className="field-label">送るもの</span>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {KINDS.map(([value, label]) => (
            <label key={value} style={{ fontWeight: kind === value ? 700 : 400 }}>
              <input
                type="radio"
                name="yubin-kind"
                value={value}
                checked={kind === value}
                onChange={() => {
                  setKind(value);
                  trackToolUse('yubin-ryokin', value);
                }}
                style={{ width: 'auto', marginRight: 6 }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {kind === 'envelope' && (
        <>
          <div className="field">
            <span className="field-label">よく使う封筒</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ENVELOPE_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  style={btn}
                  onClick={() => {
                    setLength(String(p.length));
                    setWidth(String(p.width));
                    trackToolUse('yubin-ryokin', 'preset');
                  }}
                >
                  {p.name}
                  <span className="hint" style={{ display: 'block', margin: 0 }}>
                    {p.note}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="field-row">
            <NumField label="長さ" unit="cm" value={length} onChange={setLength} />
            <NumField label="幅" unit="cm" value={width} onChange={setWidth} />
          </div>
          <div className="field-row">
            <NumField label="厚さ" unit="cm" value={thickness} onChange={setThickness} />
            <NumField label="重さ" unit="g" value={weight} onChange={setWeight} />
          </div>
        </>
      )}
      {kind === 'hagaki' && (
        <>
          <div className="field-row">
            <NumField label="長さ" unit="cm" value={hLength} onChange={setHLength} />
            <NumField label="幅" unit="cm" value={hWidth} onChange={setHWidth} />
            <NumField label="重さ" unit="g" value={hWeight} onChange={setHWeight} />
          </div>
          <p className="hint" style={{ marginTop: 0 }}>
            ふつうのはがき（14.8×10cm・2〜6g）ならそのままで構いません。規格を外れると封書の料金になります。
          </p>
        </>
      )}

      <div className="field">
        <span className="field-label">オプション</span>
        <label style={{ fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={sokutatsu}
            onChange={(e) => setSokutatsu(e.target.checked)}
            style={{ width: 'auto', marginRight: 6 }}
          />
          速達
        </label>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 6 }}>
          {RECORDS.map(([value, label]) => (
            <label key={value} style={{ fontWeight: record === value ? 700 : 400 }}>
              <input
                type="radio"
                name="yubin-record"
                value={value}
                checked={record === value}
                onChange={() => setRecord(value)}
                style={{ width: 'auto', marginRight: 6 }}
              />
              {label}
            </label>
          ))}
        </div>
        {(record === 'kani' || record === 'ippan') && (
          <div className="field-row" style={{ marginTop: 6 }}>
            <label>
              損害要償額（円・任意）
              <input
                type="text"
                inputMode="numeric"
                value={songai}
                placeholder={record === 'kani' ? '50000まで' : '100000'}
                onChange={(e) => setSongai(e.target.value)}
              />
            </label>
          </div>
        )}
        <label style={{ fontWeight: 400, display: 'block', marginTop: 6, opacity: record === 'ippan' ? 1 : 0.5 }}>
          <input
            type="checkbox"
            checked={record === 'ippan' && shomei}
            disabled={record !== 'ippan'}
            onChange={(e) => setShomei(e.target.checked)}
            style={{ width: 'auto', marginRight: 6 }}
          />
          配達証明（一般書留のときだけ）
        </label>
      </div>

      {banner && (
        <div className="panel quiet" role="note">
          <p style={{ margin: 0 }}>
            {banner.parts.map((p, i) => (p.strong ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>))}
          </p>
          {banner.countdown && (
            <p className="hint" style={{ margin: '4px 0 0' }}>
              {banner.countdown}
            </p>
          )}
        </div>
      )}

      {!result ? (
        <p className="panel quiet" role="status">
          大きさと重さを数字で入れてください。
        </p>
      ) : !result.ok ? (
        <div className="panel" role="status">
          {result.reason === 'option' ? (
            <>
              <p style={{ margin: 0, fontWeight: 700 }}>{result.option.message}</p>
              {result.option.reason === 'kani-over' && (
                <button type="button" style={{ ...btn, marginTop: 8 }} onClick={() => setRecord('ippan')}>
                  一般書留に切り替える
                </button>
              )}
            </>
          ) : (
            <>
              {result.hagakiOutOfSpec && <p className="hint" style={{ marginTop: 0 }}>はがきの規格を外れるので、封書として判定しました。</p>}
              <p style={{ margin: 0, fontWeight: 700 }}>{result.message}</p>
              {result.reason === 'too-small' &&
                result.notes.map((n) => (
                  <p key={n} className="hint" style={{ margin: '4px 0 0' }}>
                    {n}
                  </p>
                ))}
              {result.reason === 'too-large' && (
                <p className="hint" style={{ margin: '4px 0 0' }}>
                  <a href={YU_PACK_URL} target="_blank" rel="nofollow noopener noreferrer">
                    日本郵便「ゆうパック」
                  </a>
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="panel" role="status" aria-live="polite">
          {result.hagakiOutOfSpec && (
            <p className="hint" style={{ marginTop: 0 }}>
              はがきの規格（長さ14〜15.4cm・幅9〜10.7cm・重さ2〜6g）を外れるので、封書の料金です。
            </p>
          )}
          <p style={{ margin: 0, fontSize: '1.1rem' }}>
            {result.label}：<strong style={{ fontSize: '1.4rem' }}>{yen(result.total)}</strong>
          </p>
          {result.options.length > 0 && (
            <p className="hint" style={{ margin: '4px 0 0' }}>
              基本 {result.base.toLocaleString('ja-JP')}
              {result.options.map((o) => `＋${o.label} ${o.amount.toLocaleString('ja-JP')}`).join('')}＝{yen(result.total)}
            </p>
          )}
          {result.reason && <p style={{ margin: '8px 0 0' }}>{result.reason}</p>}
          {alternatives.map((a) => (
            <p key={a.name} style={{ margin: '8px 0 0' }}>
              {a.name}（{yen(a.price)}・{a.delivery}）のほうが<strong>{yen(a.cheaperBy)}安い</strong>です。
            </p>
          ))}
          {notice && (
            <p className="hint" style={{ margin: '8px 0 0' }}>
              {notice}。
            </p>
          )}
        </div>
      )}

      <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>
          手持ちの切手で払う（古い84円・63円切手など）
        </summary>
        <div style={{ marginTop: 8 }}>
          {HOLDING_STAMPS.map((v) => {
            const n = stamps[v] ?? 0;
            return (
              <div
                key={v}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', borderBottom: '1px solid var(--border)' }}
              >
                <span style={{ flex: 1 }}>
                  {v}円{OLD_STAMPS.includes(v) && <span className="hint">（旧料金）</span>}
                </span>
                <button type="button" style={stepBtn} aria-label={`${v}円切手を1枚減らす`} onClick={() => setCount(v, n - 1)}>
                  −
                </button>
                <span style={{ minWidth: 40, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{n}枚</span>
                <button
                  type="button"
                  style={stepBtn}
                  aria-label={`${v}円切手を1枚増やす`}
                  onClick={() => {
                    setCount(v, n + 1);
                    trackToolUse('yubin-ryokin', 'stamp');
                  }}
                >
                  ＋
                </button>
              </div>
            );
          })}
        </div>
        {result?.ok && stampResult && stampResult.kind !== 'none' && (
          <div className="panel" role="status" style={{ marginTop: 8 }}>
            {stampResult.kind === 'short' && (
              <p style={{ margin: 0 }}>
                {formatHoldings(stamps)}に、<strong>あと{yen(stampResult.shortBy)}</strong>（例：{formatCombo(stampResult.combo)}）
              </p>
            )}
            {stampResult.kind === 'exact' && <p style={{ margin: 0 }}>{formatHoldings(stamps)}で、ちょうど{yen(result.total)}です。</p>}
            {stampResult.kind === 'over' && (
              <p style={{ margin: 0 }}>
                {formatHoldings(stamps)}で{yen(stampResult.held)}。<strong>{yen(stampResult.overBy)}多く貼っています</strong>（差額は戻りません）。
              </p>
            )}
          </div>
        )}
      </details>

      <p className="hint" style={{ marginTop: 12 }}>
        国内あての料金です。入力した内容はブラウザの中だけで計算され、どこにも送信されません。
      </p>
    </div>
  );
}
