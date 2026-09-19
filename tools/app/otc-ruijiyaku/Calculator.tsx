'use client';

import { useEffect, useMemo, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  COPAY_OPTIONS,
  CONSUMPTION_TAX_RATE,
  ENFORCEMENT_LABEL,
  EXCLUSIONS,
  LOOKUP_TABLE,
  TRANSITION_LABEL,
  UNCONFIRMED,
  calculate,
  effectiveBurdenRate,
  exemptMessage,
  formatPercent,
  formatYen,
  toIsoDate,
  yenToPoints,
  type CopayPercent,
  type ExclusionId,
} from '@/lib/otc-ruijiyaku';
import {
  CATEGORIES_WITHOUT_ITEMS,
  ITEMS_ARE_PARTIAL,
  ITEM_CATEGORY_LABEL,
  ITEM_COUNT,
  TOTAL_INGREDIENTS,
  TOTAL_LABEL,
  itemGroups,
  searchItems,
  type OtcItem,
} from '@/lib/otc-ruijiyaku-items';

/** 薬剤料の入れ方 */
type AmountMode = 'points' | 'yen';

/** 年間の負担増に使う処方の頻度 */
const FREQUENCY_PRESETS = [
  { label: '月1回', timesPerYear: 12 },
  { label: '2か月に1回', timesPerYear: 6 },
  { label: '3か月に1回', timesPerYear: 4 },
  { label: '年1回', timesPerYear: 1 },
] as const;

export default function Calculator() {
  /* ---- 入力 ---- */
  // 調剤明細書・領収証には「薬剤料 ○○点」と出るので、既定は点数
  const [mode, setMode] = useState<AmountMode>('points');
  const [points, setPoints] = useState('100');
  const [yen, setYen] = useState('1000');
  const [copayPercent, setCopayPercent] = useState<CopayPercent>(30);
  const [checked, setChecked] = useState<ExclusionId[]>([]);
  const [transitionItem, setTransitionItem] = useState(false);
  const [timesPerYear, setTimesPerYear] = useState(12);

  /**
   * 処方を受ける日の既定値は「画面を開いた日」。
   * 静的書き出しなのでビルド時刻で描画してから、マウント後に差し替える
   * （サーバ描画とハイドレーションの食い違いを避けるため。shuzei-kaisei と同じ作法）。
   */
  const [prescribedOn, setPrescribedOn] = useState(() => toIsoDate(new Date()));
  useEffect(() => setPrescribedOn(toIsoDate(new Date())), []);

  const parsedPoints =
    mode === 'points'
      ? Number(points.replace(/[,\s]/g, ''))
      : (yenToPoints(Number(yen.replace(/[,\s]/g, ''))) ?? NaN);

  const result = calculate({
    points: parsedPoints,
    copayPercent,
    exclusions: checked,
    transitionItem,
    prescribedOn,
    timesPerYear,
  });

  const toggleExclusion = (id: ExclusionId) => {
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    trackToolUse('otc-ruijiyaku', 'check-exclusion');
  };

  /* ---- 早見表 ---- */
  const [query, setQuery] = useState('');
  const groups = useMemo(() => itemGroups(searchItems(query)), [query]);
  const hitCount = groups.reduce((n, g) => n + g.items.length, 0);
  const [selected, setSelected] = useState<OtcItem | null>(null);

  const selectItem = (item: OtcItem) => {
    setSelected(item);
    // 早見表で選んだものが経過措置なら、計算側のチェックも合わせる
    // （別々に触らせると「湿布なのに＋175円」の画面を作れてしまう）
    setTransitionItem(item.transition);
    trackToolUse('otc-ruijiyaku', 'check-item');
  };

  return (
    <>
      {/* ================= 計算 ================= */}
      <div className="card">
        <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>窓口で払う額がいくら変わるか</h2>

        <div className="field">
          <span className="field-label">薬剤料の入れ方</span>
          {/* globals.css は [aria-pressed] にスタイルを持たないので、
              選ばれている側はインラインの fontWeight で示す（他の計算機と同じ作法） */}
          <div className="field-row">
            <button
              type="button"
              onClick={() => setMode('points')}
              aria-pressed={mode === 'points'}
              style={{ fontWeight: mode === 'points' ? 700 : 400 }}
            >
              点数で入れる
            </button>
            <button
              type="button"
              onClick={() => setMode('yen')}
              aria-pressed={mode === 'yen'}
              style={{ fontWeight: mode === 'yen' ? 700 : 400 }}
            >
              円で入れる
            </button>
          </div>
          <p className="hint">
            調剤明細書・領収証には「薬剤料 ○○点」と出ます（1点＝10円）。
          </p>
        </div>

        {mode === 'points' ? (
          <div className="field">
            <label htmlFor="points">薬剤料（点）</label>
            <input
              id="points"
              type="text"
              inputMode="numeric"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder="100"
            />
          </div>
        ) : (
          <div className="field">
            <label htmlFor="yen">薬剤料（円）</label>
            <input
              id="yen"
              type="text"
              inputMode="numeric"
              value={yen}
              onChange={(e) => setYen(e.target.value)}
              placeholder="1000"
            />
            <p className="hint">10円未満は切り捨てて点数に直します（点数は整数のため）。</p>
          </div>
        )}

        <div className="field">
          <span className="field-label">窓口負担の割合</span>
          <div className="field-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {COPAY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setCopayPercent(option.value)}
                aria-pressed={copayPercent === option.value}
                style={{ fontWeight: copayPercent === option.value ? 700 : 400 }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="hint">{COPAY_OPTIONS.find((o) => o.value === copayPercent)?.who}</p>
        </div>

        <div className="field">
          <label htmlFor="prescribed-on">処方を受ける日</label>
          <input
            id="prescribed-on"
            type="date"
            value={prescribedOn}
            onChange={(e) => setPrescribedOn(e.target.value)}
          />
          <p className="hint">{ENFORCEMENT_LABEL}より前の処方には「特別の料金」はかかりません。</p>
        </div>

        <div className="field">
          <span className="field-label">経過措置の品目か</span>
          <label
            style={{
              fontWeight: 400,
              display: 'flex',
              gap: 6,
              alignItems: 'flex-start',
              fontSize: 'var(--fs-sm)',
            }}
          >
            <input
              type="checkbox"
              checked={transitionItem}
              onChange={(e) => setTransitionItem(e.target.checked)}
              style={{ width: 'auto', marginTop: 3 }}
            />
            湿布（外用鎮痛消炎剤）・皮膚の保湿剤（{TRANSITION_LABEL}まで対象外）
          </label>
        </div>

        <div className="field">
          <span className="field-label">「特別の料金」がかからない場合に当てはまるか</span>
          {EXCLUSIONS.map((def) => (
            <label
              key={def.id}
              style={{
                fontWeight: 400,
                display: 'flex',
                gap: 6,
                alignItems: 'flex-start',
                fontSize: 'var(--fs-sm)',
                marginTop: 6,
              }}
            >
              <input
                type="checkbox"
                checked={checked.includes(def.id)}
                onChange={() => toggleExclusion(def.id)}
                style={{ width: 'auto', marginTop: 3 }}
              />
              {def.label}
            </label>
          ))}
          <p className="hint">
            「低所得者」の項目は置いていません。2025年12月の政府決定には挙がっていましたが、中間とりまとめの類型には独立して出てこないためです（告示で類型が立てば足します）。
          </p>
        </div>

        <div className="field">
          <span className="field-label">この処方を受ける回数</span>
          <div className="field-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {FREQUENCY_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setTimesPerYear(preset.timesPerYear)}
                aria-pressed={timesPerYear === preset.timesPerYear}
                style={{
                  fontSize: 'var(--fs-sm)',
                  fontWeight: timesPerYear === preset.timesPerYear ? 700 : 400,
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* ---- 結果。「かかるか・かからないか」を金額より先に出す ---- */}
        {result === null ? (
          <p className="hint">薬剤料を入れてください（0以上の数）。</p>
        ) : !result.charged ? (
          <>
            <div className="panel">
              <div className="metric">
                <span className="label">「特別の料金」は</span>
                <span className="value" style={{ fontSize: 'var(--fs-lg)' }}>
                  かかりません
                </span>
              </div>
              <p className="hint" style={{ marginTop: 4 }}>
                {exemptMessage(result.reasons[0])}。
              </p>
              {result.reasons.length > 1 && (
                <ul className="hint" style={{ marginTop: 4 }}>
                  {result.reasons.slice(1).map((reason) => (
                    <li key={reason}>{exemptMessage(reason)}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="panel quiet">
              <dl className="kv">
                <div>
                  <dt>窓口で払う額（薬剤料の分）</dt>
                  <dd>
                    <strong>{formatYen(result.before)}</strong>
                  </dd>
                </div>
                <div>
                  <dt>いまと比べて</dt>
                  <dd>変わりません（±0円）</dd>
                </div>
              </dl>
            </div>
          </>
        ) : (
          <>
            <div className="panel">
              <div className="metric">
                <span className="label">「特別の料金」は</span>
                <span className="value" style={{ fontSize: 'var(--fs-lg)' }}>
                  かかります
                </span>
              </div>
              <dl className="kv" style={{ marginTop: 8 }}>
                <div>
                  <dt>いままで（薬剤料の分）</dt>
                  <dd>{formatYen(result.before)}</dd>
                </div>
                <div>
                  <dt>{ENFORCEMENT_LABEL}から</dt>
                  <dd>
                    <strong>{formatYen(result.after)}</strong>
                  </dd>
                </div>
                <div>
                  <dt>増える額</dt>
                  <dd>
                    <strong>＋{formatYen(result.increase)}</strong>
                  </dd>
                </div>
              </dl>
            </div>

            <div className="panel quiet">
              <p style={{ margin: '0 0 6px', fontWeight: 700 }}>内訳</p>
              <dl className="kv">
                <div>
                  <dt>薬剤料（{result.points.toLocaleString('ja-JP')}点）</dt>
                  <dd>{formatYen(result.drugCost)}</dd>
                </div>
                <div>
                  <dt>特別の料金（薬剤料の4分の1・全額負担）</dt>
                  <dd>{formatYen(result.specialCharge)}</dd>
                </div>
                <div>
                  <dt>保険がきく4分の3の分（{copayPercent}%）</dt>
                  <dd>{formatYen(result.insuredCopay)}</dd>
                </div>
                <div>
                  <dt>薬剤料に対する実質の負担率</dt>
                  <dd>{formatPercent(result.effectiveRate)}</dd>
                </div>
              </dl>
              {UNCONFIRMED.consumptionTax && (
                <p className="hint" style={{ marginTop: 6 }}>
                  特別の料金は保険外なので、{formatPercent(CONSUMPTION_TAX_RATE, 0)}
                  の消費税が上乗せされる見込みです。乗る場合は{' '}
                  <strong>＋{formatYen(result.consumptionTax)}</strong>（合計{' '}
                  {formatYen(result.afterWithTax)}）になります。
                  <strong>告示で確認できていないため、上の金額には含めていません。</strong>
                </p>
              )}
            </div>

            <div className="panel quiet">
              <dl className="kv">
                <div>
                  <dt>1年で増える額（この処方を{timesPerYear}回受けた場合）</dt>
                  <dd>
                    <strong>
                      {result.yearlyIncrease === null ? '—' : formatYen(result.yearlyIncrease)}
                    </strong>
                  </dd>
                </div>
              </dl>
            </div>
          </>
        )}

        <div className="note">
          <strong>「保険が効かなくなる」わけではありません。</strong>
          対象になるのは薬剤料の4分の1だけで、残りの4分の3にはこれまでどおり保険給付が残ります。
          <br />
          また、ここで出しているのは<strong>薬剤料の分だけ</strong>
          です。実際の窓口では調剤技術料・薬学管理料などが加わり、一部負担金は明細の合計に対して10円未満を四捨五入するため、領収証の額とは一致しません。
        </div>
      </div>

      {/* ================= 対象成分の早見表 ================= */}
      <div className="card" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>対象になる成分（早見表）</h2>
        <p className="hint">
          厚生労働省の対象品目一覧は{TOTAL_LABEL}です。
          {ITEMS_ARE_PARTIAL && (
            <>
              {' '}
              <strong>
                このうち、一次情報と報道で成分名が確認できた{ITEM_COUNT}成分だけを載せています。
              </strong>
              ここに無い成分が対象外とは限りません（残りは告示の公表後に足します）。
            </>
          )}
        </p>

        <div className="field">
          <label htmlFor="item-search">成分をしぼり込む（任意）</label>
          <input
            id="item-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ロキソプロフェン、湿布、花粉症 …"
          />
        </div>

        {selected !== null && (
          <div className="panel">
            <div className="metric">
              <span className="label">{selected.name}</span>
              <span className="value" style={{ fontSize: 'var(--fs-lg)' }}>
                {selected.transition ? `${TRANSITION_LABEL}まで対象外` : '対象'}
              </span>
            </div>
            <p className="hint" style={{ marginTop: 4 }}>
              {ITEM_CATEGORY_LABEL[selected.category]}
              {selected.otcNote && ` ／ ${selected.otcNote}`}
            </p>
            {selected.transition && (
              <p className="hint" style={{ marginTop: 4 }}>
                一定の重症患者の長期使用の実態を踏まえた経過措置で、{TRANSITION_LABEL}
                までは「特別の料金」はかかりません。上の計算にも反映しました。
              </p>
            )}
          </div>
        )}

        {hitCount === 0 ? (
          <p className="hint">
            あてはまる成分が見つかりませんでした。しぼり込みの言葉を消すか、別の言い方でお試しください。
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.category} style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: '0.95rem', margin: '0 0 6px' }}>
                {ITEM_CATEGORY_LABEL[group.category]}
                {group.items[0].transition && (
                  <span className="chip">{TRANSITION_LABEL}まで対象外</span>
                )}
              </h3>
              <div className="field-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectItem(item)}
                    aria-pressed={selected?.id === item.id}
                    style={{
                      fontSize: 'var(--fs-sm)',
                      fontWeight: selected?.id === item.id ? 700 : 400,
                    }}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}

        {CATEGORIES_WITHOUT_ITEMS.length > 0 && (
          <p className="hint" style={{ marginTop: 16 }}>
            次の種類も対象に挙がっていますが、成分名を一次情報から写せていないため載せていません：
            {CATEGORIES_WITHOUT_ITEMS.map((c) => ITEM_CATEGORY_LABEL[c]).join('、')}。
          </p>
        )}

        <div className="note">
          <strong>どの薬を使うかは医師・薬剤師の判断です。</strong>
          このページは制度の計算と対象成分の一覧だけを出すもので、市販薬に切り替えるべきかどうかは扱いません。全{TOTAL_INGREDIENTS}
          成分の一覧は厚生労働省の公表資料でご確認ください。
        </div>
      </div>

      {/* ================= 早見表（金額） ================= */}
      <div className="card" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>薬剤料別の早見表</h2>
        <p className="hint">
          除外にも経過措置にも当たらず、{ENFORCEMENT_LABEL}以後に処方された場合の額です（消費税を含みません）。
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>薬剤料</th>
                {COPAY_OPTIONS.map((o) => (
                  <th key={o.value}>{o.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LOOKUP_TABLE.map((row) => (
                <tr key={row.points}>
                  <th scope="row">
                    {row.points.toLocaleString('ja-JP')}点
                    <br />
                    <span className="hint">（{row.drugCost.toLocaleString('ja-JP')}円）</span>
                  </th>
                  {row.cells.map((cell) => (
                    <td key={cell.copayPercent}>
                      {cell.before.toLocaleString('ja-JP')} →{' '}
                      <strong>{cell.after.toLocaleString('ja-JP')}円</strong>
                      <br />
                      <span className="hint">＋{cell.increase.toLocaleString('ja-JP')}円</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">
          実質の負担率は
          {COPAY_OPTIONS.map(
            (o) => `${o.label}が${formatPercent(effectiveBurdenRate(o.value))}`,
          ).join('、')}
          です。
        </p>
        {UNCONFIRMED.rounding && (
          <p className="hint">
            円未満の端数は切り捨てで計算しています（薬剤料は10円単位なので、4分の1を取ると2.5円のような端数が出ます）。
            <strong>端数の扱いは告示で確認できていません。</strong>
          </p>
        )}
      </div>
    </>
  );
}
