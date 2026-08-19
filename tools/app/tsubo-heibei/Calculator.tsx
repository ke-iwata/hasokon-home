'use client';

import { useMemo, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  DEFAULT_TATAMI_ID,
  TATAMI_STANDARDS,
  UNIT_LABEL,
  convertArea,
  formatArea,
  roundArea,
  type AreaUnit,
  type TatamiStandardId,
} from '@/lib/tsubo-heibei';

/** 入力欄の並び。坪から入る人がいちばん多いので坪を先頭に置く */
const UNITS: AreaUnit[] = ['tsubo', 'sqm', 'jo'];

/** 入力欄の見出し（単位だけだと何の数字か分かりにくいので言葉を足す） */
const FIELD_LABEL: Record<AreaUnit, string> = {
  tsubo: '坪（つぼ）',
  sqm: '平米（㎡）',
  jo: '畳（帖）',
};

export default function Calculator() {
  /** 最後に触った欄。ここに入った文字列がそのまま「入力値」になる */
  const [unit, setUnit] = useState<AreaUnit>('tsubo');
  const [raw, setRaw] = useState('30');
  const [standardId, setStandardId] = useState<TatamiStandardId>(DEFAULT_TATAMI_ID);

  const value = Number.parseFloat(raw);
  const result = useMemo(
    () => convertArea(value, unit, standardId),
    [value, unit, standardId],
  );

  const standard = TATAMI_STANDARDS.find((s) => s.id === standardId) as (typeof TATAMI_STANDARDS)[number];

  /**
   * 欄に出す文字列。触っている欄は打った文字をそのまま返す（変換で書き換えると打てなくなる）。
   * ほかの欄は換算結果を小数2桁で入れる。桁区切りは `type="number"` が受け付けないので入れない。
   */
  const shownValue = (target: AreaUnit): string => {
    if (target === unit) return raw;
    if (result === null) return '';
    return String(roundArea(result[target]));
  };

  /**
   * 大きく出す答え。㎡で入れた人には坪を、それ以外には㎡を返す
   * （入れた単位をそのまま出しても「70㎡は70㎡」にしかならない）
   */
  const mainUnit: AreaUnit = unit === 'sqm' ? 'tsubo' : 'sqm';

  const edit = (target: AreaUnit, next: string) => {
    setUnit(target);
    setRaw(next);
  };

  return (
    <div className="card">
      <p style={{ margin: '0 0 4px', fontWeight: 700 }}>
        どれか1つに入れると、残りの2つに換算されます
      </p>
      <p className="hint" style={{ marginTop: 0 }}>
        1坪 ＝ {formatArea(convertArea(1, 'tsubo')?.sqm as number)}㎡（400/121㎡）、1㎡ ＝ 0.3025坪。
        畳は規格で1枚の広さが違うので、下のセレクトで切り替えられます。
      </p>

      <div className="field-row">
        {UNITS.map((target) => (
          <label key={target} className="field" style={{ marginBottom: 0 }}>
            {FIELD_LABEL[target]}
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={shownValue(target)}
              onChange={(e) => edit(target, e.target.value)}
              onBlur={() => trackToolUse('tsubo-heibei', 'convert')}
              placeholder="0"
            />
          </label>
        ))}
      </div>

      <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
        <label>
          畳の規格
          <select
            value={standardId}
            onChange={(e) => {
              setStandardId(e.target.value as TatamiStandardId);
              trackToolUse('tsubo-heibei', 'standard');
            }}
          >
            {TATAMI_STANDARDS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}（1畳 {formatArea(s.sqm)}㎡）
              </option>
            ))}
          </select>
        </label>
        <p className="hint" style={{ marginTop: 6 }}>
          {standard.note}。
          {standard.size
            ? `畳1枚は ${standard.size.longMm.toLocaleString('ja-JP')}mm × ${standard.size.shortMm.toLocaleString('ja-JP')}mm。`
            : '寸法ではなく面積の下限（1畳あたり1.62㎡以上）で定められています。'}
        </p>
      </div>

      {result === null ? (
        <p className="hint" style={{ marginTop: 16 }}>
          0以上の数値を入力してください。
        </p>
      ) : (
        <>
          <div className="panel">
            <div className="metric">
              {/* 入力した値の読み上げ。打った数をそのまま返したいので不要な0は付けない */}
              <span className="label">
                {roundArea(result[unit]).toLocaleString('ja-JP')}
                {UNIT_LABEL[unit]} は
              </span>
              <span className="value">{formatArea(result[mainUnit])}</span>
              <span className="unit">{UNIT_LABEL[mainUnit]}</span>
            </div>
            <p className="hint" style={{ marginTop: 4 }}>
              {formatArea(result.tsubo)}坪 ／ {formatArea(result.sqm)}㎡ ／{' '}
              {formatArea(result.jo)}畳（{standard.label}で換算）
            </p>
          </div>

          <div className="panel quiet">
            <dl className="kv">
              <div>
                <dt>坪</dt>
                <dd>{formatArea(result.tsubo)} 坪</dd>
              </div>
              <div>
                <dt>平米</dt>
                <dd>{formatArea(result.sqm)} ㎡</dd>
              </div>
              <div>
                <dt>畳（{standard.label}）</dt>
                <dd>{formatArea(result.jo)} 畳</dd>
              </div>
              <div>
                <dt>正方形なら1辺</dt>
                <dd>{formatArea(Math.sqrt(result.sqm))} m</dd>
              </div>
            </dl>
            <p className="hint" style={{ marginTop: 8 }}>
              表示は小数第2位までの四捨五入で、計算そのものは丸めずに行っています。
              「正方形なら1辺」は広さの感覚をつかむための目安で、実際の部屋の形とは関係ありません。
            </p>
          </div>
        </>
      )}
    </div>
  );
}
