'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { trackToolUse } from '@/lib/analytics';
import {
  ADVICE_LABEL,
  CATEGORIES,
  DATA_CHECKED_AT,
  MINOR_DRINKING_NOTE,
  REVISION_DATE,
  SIZES,
  adviceFor,
  compare,
  daysUntilRevision,
  estimateBurden,
  formatDate,
  formatDiff,
  formatYen,
  isRevised,
  sortByAdvice,
  withConsumptionTax,
  type CategoryId,
  type DrinkInput,
} from '@/lib/shuzei-kaisei';

/** 計算機に出す区分（税率が同じ区分は代表の1つだけ） */
const CHOICES = CATEGORIES.filter((c) => c.inCalculator);

/** 入力欄のキー。区分と容量の組み合わせで1つ */
function keyOf(categoryId: CategoryId, ml: number): string {
  return `${categoryId}-${ml}`;
}

/**
 * 初期値（週あたりの本数）。
 * わざと**増税になるものと減税になるものを混ぜてある**。片方だけを入れておくと、
 * 「酒税は上がる／下がる」のどちらか一方だけが答えに見えてしまうため。
 */
const DEFAULTS: Record<string, string> = {
  [keyOf('beer', 350)]: '5',
  [keyOf('happoshu-low', 350)]: '5',
  [keyOf('other-sparkling', 350)]: '3',
};

/** 入力欄の数値を読む。空欄・不正な値は0にする */
function num(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function Calculator() {
  const [counts, setCounts] = useState<Record<string, string>>(DEFAULTS);

  /**
   * 判定の基準日。
   * 静的書き出しなのでビルド時刻で描画してから、マウント後に「開いた日」へ差し替える
   * （サーバ描画とハイドレーションの食い違いを避けるため。lib/tabako-zei.ts と同じ作法）。
   */
  const [asOf, setAsOf] = useState<Date>(() => new Date());
  useEffect(() => setAsOf(new Date()), []);

  const revised = isRevised(asOf);
  const remainingDays = daysUntilRevision(asOf);

  const inputs = useMemo<DrinkInput[]>(
    () =>
      CHOICES.flatMap((category) =>
        SIZES.map((ml) => ({
          categoryId: category.id,
          ml,
          perWeek: num(counts[keyOf(category.id, ml)] ?? ''),
        })),
      ),
    [counts],
  );

  const burden = useMemo(() => estimateBurden(inputs), [inputs]);
  const sorted = useMemo(() => sortByAdvice(burden), [burden]);

  const set = (key: string, value: string) =>
    setCounts((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="card">
      <p style={{ margin: '0 0 4px', fontWeight: 700 }}>
        1週間に飲む本数を入れてください
      </p>
      <p className="hint" style={{ marginTop: 0 }}>
        {revised ? (
          <>
            {formatDate(REVISION_DATE)}の改正は施行済みです。改正前と比べて、年間の酒税がいくら変わったかを計算します。
          </>
        ) : (
          <>
            {formatDate(REVISION_DATE)}の改正まで<strong>あと{remainingDays}日</strong>
            。改正後に年間の酒税がいくら変わるかを計算します。
          </>
        )}
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>種類</th>
              {SIZES.map((ml) => (
                <th key={ml}>{ml}ml（本/週）</th>
              ))}
              <th>1本あたり（350ml）</th>
            </tr>
          </thead>
          <tbody>
            {CHOICES.map((category) => {
              const cmp = compare(category, 350);
              return (
                <tr key={category.id}>
                  <th scope="row" style={{ fontWeight: 600 }}>
                    {category.calcLabel ?? category.label}
                    <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
                      {category.example}
                    </span>
                  </th>
                  {SIZES.map((ml) => {
                    const key = keyOf(category.id, ml);
                    return (
                      <td key={ml}>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          style={{ maxWidth: 90 }}
                          aria-label={`${category.calcLabel ?? category.label} ${ml}ml の1週間の本数`}
                          value={counts[key] ?? ''}
                          onChange={(e) => set(key, e.target.value)}
                          onBlur={() => trackToolUse('shuzei-kaisei', 'calculate')}
                          placeholder="0"
                        />
                      </td>
                    );
                  })}
                  <td>
                    {formatDiff(cmp.diff)}
                    <span className="chip">{ADVICE_LABEL[adviceFor(category)]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {burden.empty ? (
        <p className="hint">本数を入れると、年間・月間の負担の増減を計算します。</p>
      ) : (
        <>
          <div className="panel">
            <div className="metric">
              <span className="label">
                {revised ? '改正前と比べた年間の酒税' : '改正後の年間の酒税'}
              </span>
              <span className="value">{formatDiff(burden.annualDiff, 0)}</span>
            </div>
            <p className="hint" style={{ marginTop: 4 }}>
              月あたり {formatDiff(burden.monthlyDiff, 0)}。
              {burden.annualDiff > 0
                ? 'いまの飲み方だと負担が増えます。'
                : burden.annualDiff < 0
                  ? 'いまの飲み方だと負担は減ります。'
                  : '増える分と減る分がちょうど釣り合っています。'}
              店頭価格に酒税の増減がそのまま反映されるなら、消費税ぶんを加えて年
              {formatDiff(withConsumptionTax(burden.annualDiff), 0)}が目安です。
            </p>
          </div>

          <div className="panel quiet">
            <dl className="kv">
              <div>
                <dt>増税になる分の合計（年）</dt>
                <dd>{formatYen(burden.annualIncrease)}</dd>
              </div>
              <div>
                <dt>減税になる分の合計（年）</dt>
                <dd>{formatYen(burden.annualDecrease)}</dd>
              </div>
              <div>
                <dt>年間の酒税（改正前 → 改正後）</dt>
                <dd>
                  {formatYen(burden.annualBefore)} → {formatYen(burden.annualAfter)}
                </dd>
              </div>
            </dl>
            <p className="hint" style={{ marginTop: 8 }}>
              ビールの減税と、発泡酒・第三のビール・チューハイ等の増税を<strong>相殺した合計</strong>
              です。飲むものによって、合計はプラスにもマイナスにもなります。
            </p>
          </div>

          <h3 style={{ fontSize: '1rem', margin: '20px 0 8px' }}>内訳</h3>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>種類</th>
                  <th>容量</th>
                  <th>本/週</th>
                  <th>1本あたり</th>
                  <th>年間の増減</th>
                </tr>
              </thead>
              <tbody>
                {burden.lines.map((line) => (
                  <tr key={`${line.category.id}-${line.ml}`}>
                    <th scope="row" style={{ fontWeight: 600 }}>
                      {line.category.calcLabel ?? line.category.label}
                    </th>
                    <td>{line.ml}ml</td>
                    <td>{line.perWeek.toLocaleString('ja-JP')}</td>
                    <td>{formatDiff(line.diffPerUnit)}</td>
                    <td>{formatDiff(line.annualDiff, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel quiet">
            <p style={{ margin: '0 0 8px', fontWeight: 700 }}>
              {revised
                ? '安く買えるようになったもの・高くなったもの'
                : `${formatDate(REVISION_DATE)}をまたぐときの買い方`}
            </p>
            <dl className="kv">
              {sorted.buyBefore.length > 0 && (
                <div>
                  <dt>{revised ? '値上がりした（増税）' : '9月中に買うと得'}</dt>
                  <dd>
                    {sorted.buyBefore
                      .map((l) => `${l.category.calcLabel ?? l.category.label}（${l.ml}ml）`)
                      .join('、')}
                  </dd>
                </div>
              )}
              {sorted.wait.length > 0 && (
                <div>
                  <dt>{revised ? '値下がりした（減税）' : '10月以降のほうが得'}</dt>
                  <dd>
                    {sorted.wait
                      .map((l) => `${l.category.calcLabel ?? l.category.label}（${l.ml}ml）`)
                      .join('、')}
                  </dd>
                </div>
              )}
              {sorted.same.length > 0 && (
                <div>
                  <dt>変わらない</dt>
                  <dd>
                    {sorted.same
                      .map((l) => `${l.category.calcLabel ?? l.category.label}（${l.ml}ml）`)
                      .join('、')}
                  </dd>
                </div>
              )}
            </dl>
            <p className="hint" style={{ marginTop: 8 }}>
              増税になるものは施行前に、減税になるものは施行後に買うほうが酒税のぶんだけ得になります。ただし計算しているのは
              <strong>酒税の額だけ</strong>
              です。店頭価格は各社の改定発表しだいで、酒税の増減がそのまま価格に乗るとは限りません。
              {MINOR_DRINKING_NOTE}飲みすぎにご注意ください。
            </p>
          </div>
        </>
      )}

      <p className="hint" style={{ marginTop: 16 }}>
        データ最終更新日：{formatDate(DATA_CHECKED_AT)} ／ 同じ
        {formatDate(REVISION_DATE)}に変わるものとして
        <Link href="/tabako-zei-neage/">たばこ値上げ早見表</Link>、
        <Link href="/saitei-chingin/">最低賃金 早見表</Link>もどうぞ。
      </p>
    </div>
  );
}
