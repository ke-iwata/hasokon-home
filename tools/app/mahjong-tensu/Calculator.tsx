'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  DEFAULT_RULES,
  FU_OPTIONS,
  MELD_KIND_LABELS,
  PAIR_LABELS,
  WAIT_LABELS,
  applySpecialForm,
  asksRonCompleted,
  calcFu,
  calcScore,
  canBeRonCompleted,
  defaultFuInput,
  fmt,
  limitRows,
  parseRules,
  scoreLabel,
  tableCell,
  type FuInput,
  type HanSpec,
  type MahjongRules,
  type Meld,
  type MeldKind,
  type PairKind,
  type SpecialForm,
  type WaitKind,
  type WinType,
} from '@/lib/mahjong-tensu';

// 仕様: docs/features/mahjong-tensu-keisan.md

const SLUG = 'mahjong-tensu';
const RULES_KEY = 'hasokon-mahjong-tensu-rules';

type Tab = 'easy' | 'fu' | 'table';

const buttonStyle = (active: boolean, disabled = false): CSSProperties => ({
  minHeight: 44,
  padding: '8px 12px',
  borderRadius: 8,
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  background: active ? 'var(--accent-soft)' : 'var(--surface)',
  color: 'var(--text)',
  fontSize: 'var(--fs-sm)',
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});

const rowStyle: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };

const numberStyle: CSSProperties = {
  width: '6em',
  minHeight: 44,
  fontSize: 16, // iOS Safari は 16px 未満の入力欄で拡大する
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
};

function Toggle<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div role="group" aria-label={label} style={rowStyle}>
        {options.map(([v, text]) => (
          <button
            key={String(v)}
            type="button"
            style={buttonStyle(value === v, disabled)}
            aria-pressed={value === v}
            disabled={disabled}
            onClick={() => onChange(v)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 翻の選択肢（1〜12・13以上・役満・ダブル役満）
// ---------------------------------------------------------------------------

type HanKey = string;

function hanOptions(rules: MahjongRules): (readonly [HanKey, string])[] {
  const opts: (readonly [HanKey, string])[] = [];
  for (let h = 1; h <= 12; h++) opts.push([String(h), `${h}翻`]);
  opts.push(['13', '13翻以上']);
  opts.push(['y1', '役満']);
  if (rules.doubleYakuman) opts.push(['y2', 'ダブル役満']);
  return opts;
}

function hanFromKey(key: HanKey): HanSpec {
  if (key.startsWith('y')) return { yakuman: Number(key.slice(1)) };
  return Number(key);
}

function HanSelect({ value, onChange, rules }: { value: HanKey; onChange: (v: HanKey) => void; rules: MahjongRules }) {
  return (
    <div className="field">
      <label htmlFor="mj-han">翻</label>
      <select
        id="mj-han"
        value={value}
        style={{ ...numberStyle, width: 'auto' }}
        onChange={(e) => {
          onChange(e.target.value);
          trackToolUse(SLUG, 'select-han');
        }}
      >
        {hanOptions(rules).map(([k, text]) => (
          <option key={k} value={k}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

function NumberField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={99}
        value={value}
        style={numberStyle}
        onChange={(e) => {
          const n = Math.floor(Number(e.target.value));
          onChange(Number.isFinite(n) && n > 0 ? Math.min(n, 99) : 0);
        }}
        onBlur={() => trackToolUse(SLUG, `input-${id.replace('mj-', '')}`)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 点数の表示
// ---------------------------------------------------------------------------

function ScoreView({
  dealer,
  win,
  fu,
  han,
  honba,
  kyotaku,
  rules,
}: {
  dealer: boolean;
  win: WinType;
  fu: number;
  han: HanSpec;
  honba: number;
  kyotaku: number;
  rules: MahjongRules;
}) {
  const r = calcScore({ dealer, win, fu, han, honba, kyotaku }, rules);
  if (!r.ok) {
    return (
      <div className="panel quiet" role="alert">
        <p style={{ margin: 0, fontWeight: 700 }}>{r.error}</p>
      </div>
    );
  }
  const who = `${dealer ? '親' : '子'}の${win === 'ron' ? 'ロン' : 'ツモ'}`;
  const withExtras = honba > 0 || kyotaku > 0;
  let headline: string;
  if (win === 'ron') headline = `${fmt(r.ron! + r.honbaBonus)}点`;
  else if (dealer) headline = `${fmt(r.payKo!)}オール`;
  else headline = `${fmt(r.payKo!)}・${fmt(r.payOya!)}`;

  return (
    <div className="panel" aria-live="polite">
      <div className="metric">
        <span className="label">{who}{r.limit ? `（${r.limit}）` : ''}</span>
      </div>
      <div className="metric">
        <span className="value">{headline}</span>
      </div>
      <dl className="kv">
        {win === 'tsumo' && !dealer && (
          <div>
            <dt>払い</dt>
            <dd>
              子 {fmt(r.payKo!)}・親 {fmt(r.payOya!)}
            </dd>
          </div>
        )}
        {win === 'tsumo' && dealer && (
          <div>
            <dt>払い</dt>
            <dd>子3人が {fmt(r.payKo!)} ずつ</dd>
          </div>
        )}
        <div>
          <dt>基本（本場・供託を除く）</dt>
          <dd>{scoreLabel(r, dealer, win)}{win === 'tsumo' ? `（計 ${fmt(r.basic)}）` : ''}</dd>
        </div>
        {withExtras && (
          <div>
            <dt>内訳</dt>
            <dd>
              基本 {fmt(r.basic)} ＋ 本場 {fmt(r.honbaBonus)} ＋ 供託 {fmt(r.kyotakuBonus)}
            </dd>
          </div>
        )}
        <div>
          <dt>受け取る合計</dt>
          <dd>{fmt(r.total)}点</dd>
        </div>
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// タブ2：符を数える
// ---------------------------------------------------------------------------

const MELD_KINDS: (readonly [MeldKind, string])[] = (['shuntsu', 'koutsu', 'kantsu'] as const).map(
  (k) => [k, MELD_KIND_LABELS[k]] as const,
);

function MeldRow({
  index,
  meld,
  locked,
  onChange,
  askRon,
  ronSelected,
  onSelectRon,
}: {
  index: number;
  meld: Meld;
  locked: boolean;
  onChange: (m: Meld) => void;
  askRon: boolean;
  ronSelected: boolean;
  onSelectRon: () => void;
}) {
  const showRon = askRon && canBeRonCompleted(meld);
  return (
    <fieldset
      style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '8px 10px',
        margin: '0 0 10px',
        minWidth: 0,
      }}
    >
      <legend style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>面子{index + 1}</legend>
      <div role="group" aria-label={`面子${index + 1}の形`} style={rowStyle}>
        {MELD_KINDS.map(([k, text]) => (
          <button
            key={k}
            type="button"
            style={buttonStyle(meld.kind === k, locked)}
            aria-pressed={meld.kind === k}
            disabled={locked}
            onClick={() => onChange({ ...meld, kind: k })}
          >
            {text}
          </button>
        ))}
      </div>
      <div style={{ ...rowStyle, marginTop: 8 }}>
        <div role="group" aria-label={`面子${index + 1}の明暗`} style={rowStyle}>
          {(
            [
              [true, '明（鳴いた）'],
              [false, '暗'],
            ] as const
          ).map(([v, text]) => (
            <button
              key={text}
              type="button"
              style={buttonStyle(meld.open === v, locked)}
              aria-pressed={meld.open === v}
              disabled={locked}
              onClick={() => onChange({ ...meld, open: v })}
            >
              {text}
            </button>
          ))}
        </div>
        {meld.kind !== 'shuntsu' && (
          <div role="group" aria-label={`面子${index + 1}の牌`} style={rowStyle}>
            {(
              [
                [false, '中張（2〜8）'],
                [true, '么九（1・9・字）'],
              ] as const
            ).map(([v, text]) => (
              <button
                key={text}
                type="button"
                style={buttonStyle(meld.yaochu === v, locked)}
                aria-pressed={meld.yaochu === v}
                disabled={locked}
                onClick={() => onChange({ ...meld, yaochu: v })}
              >
                {text}
              </button>
            ))}
          </div>
        )}
      </div>
      {showRon && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, minHeight: 44, fontWeight: 600 }}>
          <input type="radio" name="mj-ron-completed" checked={ronSelected} onChange={onSelectRon} style={{ width: 20, height: 20 }} />
          ロンで完成（明刻として数える）
        </label>
      )}
    </fieldset>
  );
}

function FuTab({
  rules,
  win,
  setWin,
  dealer,
  setDealer,
  hanKey,
  setHanKey,
  honba,
  kyotaku,
}: {
  rules: MahjongRules;
  win: WinType;
  setWin: (w: WinType) => void;
  dealer: boolean;
  setDealer: (d: boolean) => void;
  hanKey: HanKey;
  setHanKey: (k: HanKey) => void;
  honba: number;
  kyotaku: number;
}) {
  const [raw, setRaw] = useState<FuInput>(defaultFuInput);
  const input = applySpecialForm({ ...raw, win });
  const pinfu = input.special === 'pinfu';
  const chiitoi = input.special === 'chiitoi';
  const askRon = asksRonCompleted(input);
  const result = calcFu(input, rules);

  const update = (patch: Partial<FuInput>, action?: string) => {
    setRaw((prev) => ({ ...prev, ...patch }));
    if (action) trackToolUse(SLUG, action);
  };

  const setMeld = (i: number, m: Meld) => {
    const melds = [...raw.melds] as FuInput['melds'];
    melds[i] = m;
    // 「ロンで完成」に選んだ面子が暗刻でなくなったら選び直してもらう
    const ronCompleted = raw.ronCompleted === i && !canBeRonCompleted(m) ? null : raw.ronCompleted;
    update({ melds, ronCompleted }, 'select-meld');
  };

  return (
    <div>
      <Toggle<SpecialForm>
        label="特殊形"
        value={input.special}
        options={[
          ['none', 'なし'],
          ['pinfu', '平和'],
          ['chiitoi', '七対子'],
        ]}
        onChange={(v) => update({ special: v }, 'select-special')}
      />
      <Toggle<WinType>
        label="あがり方"
        value={win}
        options={[
          ['ron', 'ロン'],
          ['tsumo', 'ツモ'],
        ]}
        onChange={(v) => {
          setWin(v);
          trackToolUse(SLUG, 'select-win');
        }}
      />
      {!chiitoi && (
        <Toggle<'yes' | 'no'>
          label="門前（鳴いていない）"
          value={input.menzen ? 'yes' : 'no'}
          options={[
            ['yes', 'はい'],
            ['no', 'いいえ（鳴いた）'],
          ]}
          disabled={pinfu}
          onChange={(v) => update({ menzen: v === 'yes' }, 'select-menzen')}
        />
      )}

      {!chiitoi && (
        <>
          {pinfu && <p className="hint">平和を選んでいるので、面子・待ち・雀頭・門前を固定しています。変えたいときは特殊形を「なし」に戻してください。</p>}
          {input.melds.map((m, i) => (
            <MeldRow
              key={i}
              index={i}
              meld={m}
              locked={pinfu}
              onChange={(nm) => setMeld(i, nm)}
              askRon={askRon}
              ronSelected={input.ronCompleted === i}
              onSelectRon={() => update({ ronCompleted: i }, 'select-ron-completed')}
            />
          ))}
          <Toggle<PairKind>
            label="雀頭"
            value={input.pair}
            options={(['plain', 'yakuhai', 'renpu'] as const).map((k) => [k, PAIR_LABELS[k]] as const)}
            disabled={pinfu}
            onChange={(v) => update({ pair: v }, 'select-pair')}
          />
          <p className="hint" style={{ marginTop: -8 }}>役牌は三元牌・場風・自風。連風牌は場風と自風が同じ風（東場の東家の東など）。</p>
          <Toggle<WaitKind>
            label="待ち"
            value={input.wait}
            options={(['ryanmen', 'shanpon', 'kanchan', 'penchan', 'tanki'] as const).map((k) => [k, WAIT_LABELS[k]] as const)}
            disabled={pinfu}
            onChange={(v) => update({ wait: v }, 'select-wait')}
          />
          {askRon && <p className="hint">双碰待ちでロンしたときは、ロンで完成した刻子を「暗」の刻子の中から1つ選んでください。その刻子は明刻として数えます。</p>}
        </>
      )}

      {result.ok ? (
        <div className="panel quiet" aria-live="polite">
          <dl className="kv">
            {result.items.map((it, i) => (
              <div key={i}>
                <dt>{it.label}</dt>
                <dd>{it.fu}符</dd>
              </div>
            ))}
            <div>
              <dt>合計</dt>
              <dd>
                {result.raw === result.fu ? `${result.fu}符` : `${result.raw}符 → ${result.fu}符`}
              </dd>
            </div>
          </dl>
          {result.notes.map((n) => (
            <p key={n} className="hint" style={{ margin: '6px 0 0' }}>
              {n}
            </p>
          ))}
        </div>
      ) : (
        <div className="panel quiet" role="alert">
          <p style={{ margin: 0, fontWeight: 700 }}>{result.error}</p>
        </div>
      )}

      {result.ok && (
        <>
          <h3 style={{ marginTop: 20 }}>翻を選んで点数を出す</h3>
          <div className="field-row">
            <Toggle<'ko' | 'oya'>
              label="親／子"
              value={dealer ? 'oya' : 'ko'}
              options={[
                ['ko', '子'],
                ['oya', '親'],
              ]}
              onChange={(v) => setDealer(v === 'oya')}
            />
            <HanSelect value={hanKey} onChange={setHanKey} rules={rules} />
          </div>
          <ScoreView dealer={dealer} win={win} fu={result.fu} han={hanFromKey(hanKey)} honba={honba} kyotaku={kyotaku} rules={rules} />
          {(honba > 0 || kyotaku > 0) && <p className="hint">本場・供託は「かんたん」タブで入れた値を使っています。</p>}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// タブ3：早見表（画面）
// ---------------------------------------------------------------------------

type TableHan = 1 | 2 | 3 | 4 | 'limit';

function Cell({ fu, han, dealer, rules }: { fu: number; han: HanSpec; dealer: boolean; rules: MahjongRules }) {
  const ron = tableCell(fu, han, dealer, 'ron', rules);
  const tsumo = tableCell(fu, han, dealer, 'tsumo', rules);
  return (
    <>
      <span style={{ display: 'block' }}>
        <span className="hint">ロン </span>
        <span style={{ whiteSpace: 'nowrap' }}>{ron ?? '—'}</span>
      </span>
      <span style={{ display: 'block' }}>
        <span className="hint">ツモ </span>
        <span style={{ whiteSpace: 'nowrap' }}>{tsumo ?? '—'}</span>
      </span>
    </>
  );
}

function TableTab({ rules, onPrint }: { rules: MahjongRules; onPrint: () => void }) {
  const [han, setHan] = useState<TableHan>(3);
  return (
    <div>
      <Toggle<TableHan>
        label="翻"
        value={han}
        options={[
          [1, '1翻'],
          [2, '2翻'],
          [3, '3翻'],
          [4, '4翻'],
          ['limit', '満貫以上'],
        ]}
        onChange={(v) => {
          setHan(v);
          trackToolUse(SLUG, 'select-table-han');
        }}
      />
      <table style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'left' }}>
        <thead>
          <tr>
            <th>{han === 'limit' ? '区分' : '符'}</th>
            <th>子</th>
            <th>親</th>
          </tr>
        </thead>
        <tbody>
          {han === 'limit'
            ? limitRows(rules).map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>
                    <Cell fu={30} han={row.han} dealer={false} rules={rules} />
                  </td>
                  <td>
                    <Cell fu={30} han={row.han} dealer rules={rules} />
                  </td>
                </tr>
              ))
            : FU_OPTIONS.map((fu) => (
                <tr key={fu}>
                  <td>{fu}符</td>
                  <td>
                    <Cell fu={fu} han={han} dealer={false} rules={rules} />
                  </td>
                  <td>
                    <Cell fu={fu} han={han} dealer rules={rules} />
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
      <p className="hint">
        子のツモは「子の払い・親の払い」、親のツモは「◯オール」（子3人が同じ額）。「—」はありえない組み合わせです。本場・供託は含みません。
        {rules.kiriageMangan ? '切り上げ満貫ありで表示しています。' : '切り上げ満貫なしで表示しています。'}
      </p>
      <div style={rowStyle}>
        <button type="button" style={buttonStyle(false)} onClick={onPrint}>
          早見表を印刷する（A4 1枚）
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 印刷用（@media print のときだけ見える）
// ---------------------------------------------------------------------------

function PrintTable({ dealer, win, rules }: { dealer: boolean; win: WinType; rules: MahjongRules }) {
  const title = `${dealer ? '親' : '子'}の${win === 'ron' ? 'ロン' : 'ツモ'}`;
  return (
    <section>
      <h3>{title}</h3>
      <table>
        <thead>
          <tr>
            <th>符</th>
            <th>1翻</th>
            <th>2翻</th>
            <th>3翻</th>
            <th>4翻</th>
          </tr>
        </thead>
        <tbody>
          {FU_OPTIONS.map((fu) => (
            <tr key={fu}>
              <td>{fu}</td>
              {[1, 2, 3, 4].map((h) => (
                <td key={h}>{tableCell(fu, h, dealer, win, rules) ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PrintSheet({ rules }: { rules: MahjongRules }) {
  return (
    <div className="mj-print" data-print="sheet" aria-hidden="true">
      <h2>麻雀 点数早見表</h2>
      <p className="hint">
        子のツモは「子・親」の払い、親のツモは「◯オール」。「—」はありえない組み合わせ。本場はロン＋300・ツモは各自＋100、供託は1本1,000。
        切り上げ満貫{rules.kiriageMangan ? 'あり' : 'なし'}。
      </p>
      <div className="mj-print-grid">
        <PrintTable dealer={false} win="ron" rules={rules} />
        <PrintTable dealer={false} win="tsumo" rules={rules} />
        <PrintTable dealer win="ron" rules={rules} />
        <PrintTable dealer win="tsumo" rules={rules} />
      </div>
      <section>
        <h3>満貫以上</h3>
        <table>
          <thead>
            <tr>
              <th>区分</th>
              <th>子のロン／ツモ</th>
              <th>親のロン／ツモ</th>
            </tr>
          </thead>
          <tbody>
            {limitRows(rules).map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>
                  {tableCell(30, row.han, false, 'ron', rules)}／{tableCell(30, row.han, false, 'tsumo', rules)}
                </td>
                <td>
                  {tableCell(30, row.han, true, 'ron', rules)}／{tableCell(30, row.han, true, 'tsumo', rules)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="hint">hasokon.com/tools/mahjong-tensu/</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ルール
// ---------------------------------------------------------------------------

function RulesPanel({ rules, onChange }: { rules: MahjongRules; onChange: (r: MahjongRules) => void }) {
  const set = (patch: Partial<MahjongRules>, action: string) => {
    onChange({ ...rules, ...patch });
    trackToolUse(SLUG, action);
  };
  return (
    <details style={{ marginTop: 20 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, minHeight: 44, display: 'flex', alignItems: 'center' }}>
        ルールの切り替え（既定は一般的なルール）
      </summary>
      <div style={{ marginTop: 10 }}>
        <Toggle<'off' | 'on'>
          label="切り上げ満貫（4翻30符・3翻60符を満貫に）"
          value={rules.kiriageMangan ? 'on' : 'off'}
          options={[
            ['off', 'なし'],
            ['on', 'あり'],
          ]}
          onChange={(v) => set({ kiriageMangan: v === 'on' }, 'select-rule-kiriage')}
        />
        <Toggle<2 | 4>
          label="連風牌の雀頭"
          value={rules.renpuFu}
          options={[
            [2, '2符'],
            [4, '4符'],
          ]}
          onChange={(v) => set({ renpuFu: v }, 'select-rule-renpu')}
        />
        <Toggle<'on' | 'off'>
          label="13翻以上"
          value={rules.kazoeYakuman ? 'on' : 'off'}
          options={[
            ['on', '数え役満'],
            ['off', '三倍満止め'],
          ]}
          onChange={(v) => set({ kazoeYakuman: v === 'on' }, 'select-rule-kazoe')}
        />
        <Toggle<'on' | 'off'>
          label="ダブル役満"
          value={rules.doubleYakuman ? 'on' : 'off'}
          options={[
            ['on', 'あり'],
            ['off', 'なし（役満で止める）'],
          ]}
          onChange={(v) => set({ doubleYakuman: v === 'on' }, 'select-rule-double')}
        />
        <p className="hint">選んだルールはこのブラウザに覚えます（どこにも送りません）。</p>
      </div>
    </details>
  );
}

function loadRules(): MahjongRules {
  try {
    const raw = window.localStorage.getItem(RULES_KEY);
    return raw ? parseRules(JSON.parse(raw)) : { ...DEFAULT_RULES };
  } catch {
    return { ...DEFAULT_RULES };
  }
}

function saveRules(rules: MahjongRules) {
  try {
    window.localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  } catch {
    // 保存できない環境（プライベートブラウズなど）でも既定のまま動く
  }
}

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} style={{ ...buttonStyle(active), flex: '1 1 0' }} onClick={onClick}>
      {children}
    </button>
  );
}

export default function Calculator() {
  const [tab, setTab] = useState<Tab>('easy');
  const [rules, setRules] = useState<MahjongRules>(DEFAULT_RULES);
  const [dealer, setDealer] = useState(false);
  const [win, setWin] = useState<WinType>('ron');
  const [fu, setFu] = useState<number>(30);
  const [hanKey, setHanKey] = useState<HanKey>('3');
  const [honba, setHonba] = useState(0);
  const [kyotaku, setKyotaku] = useState(0);

  // localStorage はマウント後に読む（サーバ描画とハイドレーションの食い違いを避ける）
  useEffect(() => {
    setRules(loadRules());
  }, []);

  const changeRules = (r: MahjongRules) => {
    setRules(r);
    saveRules(r);
    if (!r.doubleYakuman && hanKey === 'y2') setHanKey('y1');
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    trackToolUse(SLUG, `select-tab-${t}`);
  };

  const print = () => {
    trackToolUse(SLUG, 'print');
    window.print();
  };

  return (
    <div className="card">
      <div role="tablist" aria-label="計算のしかた" style={{ ...rowStyle, marginBottom: 16 }}>
        <TabButton active={tab === 'easy'} onClick={() => switchTab('easy')}>
          かんたん
        </TabButton>
        <TabButton active={tab === 'fu'} onClick={() => switchTab('fu')}>
          符を数える
        </TabButton>
        <TabButton active={tab === 'table'} onClick={() => switchTab('table')}>
          早見表
        </TabButton>
      </div>

      {tab === 'easy' && (
        <div>
          <Toggle<'ko' | 'oya'>
            label="親／子"
            value={dealer ? 'oya' : 'ko'}
            options={[
              ['ko', '子'],
              ['oya', '親'],
            ]}
            onChange={(v) => {
              setDealer(v === 'oya');
              trackToolUse(SLUG, 'select-dealer');
            }}
          />
          <Toggle<WinType>
            label="あがり方"
            value={win}
            options={[
              ['ron', 'ロン'],
              ['tsumo', 'ツモ'],
            ]}
            onChange={(v) => {
              setWin(v);
              trackToolUse(SLUG, 'select-win');
            }}
          />
          <Toggle<number>
            label="符"
            value={fu}
            options={FU_OPTIONS.map((f) => [f, String(f)] as const)}
            onChange={(v) => {
              setFu(v);
              trackToolUse(SLUG, 'select-fu');
            }}
          />
          <div className="field-row">
            <HanSelect value={hanKey} onChange={setHanKey} rules={rules} />
            <NumberField id="mj-honba" label="本場" value={honba} onChange={setHonba} />
            <NumberField id="mj-kyotaku" label="供託のリーチ棒（本）" value={kyotaku} onChange={setKyotaku} />
          </div>
          <ScoreView dealer={dealer} win={win} fu={fu} han={hanFromKey(hanKey)} honba={honba} kyotaku={kyotaku} rules={rules} />
          <p className="hint">5翻以上と役満は符に関係なく決まります。符が分からないときは「符を数える」タブへ。</p>
        </div>
      )}

      {tab === 'fu' && (
        <FuTab
          rules={rules}
          win={win}
          setWin={setWin}
          dealer={dealer}
          setDealer={setDealer}
          hanKey={hanKey}
          setHanKey={setHanKey}
          honba={honba}
          kyotaku={kyotaku}
        />
      )}

      {tab === 'table' && <TableTab rules={rules} onPrint={print} />}

      <RulesPanel rules={rules} onChange={changeRules} />

      <PrintSheet rules={rules} />
    </div>
  );
}
