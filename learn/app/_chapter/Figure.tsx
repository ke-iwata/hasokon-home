/**
 * 図解の共通部品
 *
 * **図はすべてインラインSVGで描く。** 画像ファイルを置かないのは、
 * 明暗テーマで色を変えられること・拡大しても粗くならないこと・
 * 読み込みが増えないことの3つが要るため。色は `var(--...)` を直に参照する
 * （インラインSVGはページと同じ文書なのでCSS変数がそのまま効く）。
 *
 * ## 図を足すときの約束
 *
 * - **数字は `lib/calc.ts` から取る。** 図と本文で同じ数字を2回書かない
 * - **`Figure` で包む。** 図に名前（`title`）が付き、読み上げでも意味が伝わる
 * - **色だけで区別しない。** 線は破線・実線でも見分けられるようにする
 *   （サイトのアクセントは1色なので、そもそも色数で戦えない）
 * - **`viewBox` で組み、幅は100%にする。** 端末幅で崩れないようにするため
 */

/** 図の枠。見出し（説明）と、読み上げ用の名前を持つ */
export default function Figure({
  title,
  caption,
  children,
}: {
  /** 図の名前。読み上げと、図が読めないときの代わりになる1文 */
  title: string;
  /** 図の下に出す説明。何を読み取ればよいかを書く */
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="figure">
      <div className="figure-body" role="img" aria-label={title}>
        {children}
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/** 系列の見た目。アクセント1色のサイトなので、濃さと線種で見分ける */
import { manText } from '@/lib/calc';

export type Tone = 'accent' | 'muted' | 'soft';

const STROKE: Record<Tone, string> = {
  accent: 'var(--accent)',
  muted: 'var(--muted)',
  soft: 'var(--accent-strong)',
};

/** 色を見分けられない場合に備えて、線種でも区別する */
const DASH: Record<Tone, string | undefined> = {
  accent: undefined,
  muted: '5 4',
  soft: '2 3',
};

export interface Series {
  name: string;
  points: { year: number; value: number }[];
  tone: Tone;
  /** 線の終端に出す値のラベル（「326.2万円」など） */
  endLabel?: string;
}

/**
 * 折れ線グラフ。横軸は年、縦軸は金額。
 *
 * 目盛りの数字そのものより「形」を見せるための図なので、縦軸は
 * 上端と下端だけを出す。細かい値は本文の表で読む。
 */
export function LineChart({
  series,
  xMax,
  yMax,
  xLabel,
  yTop,
  xTicks,
}: {
  series: Series[];
  xMax: number;
  yMax: number;
  xLabel: string;
  /** 縦軸の上端に出す文字（「330万円」など） */
  yTop: string;
  xTicks: number[];
}) {
  // viewBox の座標系。実寸ではなく比率で組む
  const W = 360;
  const H = 196;
  // 縦軸の上端ラベル（「340万円」など）は軸の**上**に出す。
  // 軸の左に置くと桁数ぶんの幅が要り、箱の外へ文字が出る（実測して直したもの）
  const padL = 20;
  // 右端は終端ラベル（「1,233.1万」のような幅まで出る）が収まる分を空ける。
  // 足りないと文字がSVGの外へ出て、箱の余白に食い込む（実測して直したもの）
  const padR = 72;
  const padT = 30;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const x = (year: number) => padL + (year / xMax) * plotW;
  const y = (value: number) => padT + plotH - (value / yMax) * plotH;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {/* 目盛り線。地の色に近い薄さにして、線そのものを主役にしない */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line
          key={t}
          x1={padL}
          x2={padL + plotW}
          y1={padT + plotH * t}
          y2={padT + plotH * t}
          stroke="var(--border)"
          strokeWidth="1"
        />
      ))}

      {/* 縦軸の上端（軸の上に置く）と原点 */}
      <text x={padL} y={padT - 8} className="chart-tick" textAnchor="start">
        {yTop}
      </text>
      <text x={padL - 4} y={padT + plotH + 4} className="chart-tick" textAnchor="end">
        0
      </text>

      {/* 横軸の目盛り */}
      {xTicks.map((t) => (
        <text key={t} x={x(t)} y={H - 12} className="chart-tick" textAnchor="middle">
          {t}
        </text>
      ))}
      {/* 単位は最後の目盛りの**右隣**に置く。同じ位置に重ねると数字と重なる
          （実測して直したもの） */}
      <text x={padL + plotW + 8} y={H - 12} className="chart-tick" textAnchor="start">
        {xLabel}
      </text>

      {series.map((s) => (
        <g key={s.name}>
          <polyline
            points={s.points.map((p) => `${x(p.year)},${y(p.value)}`).join(' ')}
            fill="none"
            stroke={STROKE[s.tone]}
            strokeDasharray={DASH[s.tone]}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {s.endLabel && (
            <text
              x={x(s.points[s.points.length - 1].year) + 5}
              y={y(s.points[s.points.length - 1].value) + 4}
              className="chart-endlabel"
              fill={STROKE[s.tone]}
            >
              {s.endLabel}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/**
 * 凡例。SVGの外にHTMLで置く（文字の大きさを本文に合わせるため）。
 *
 * `variant` は図の印に合わせること。折れ線なら線、棒グラフなら塗り。
 * 食い違うと、凡例がどの要素を指しているのか分からなくなる。
 */
export function Legend({
  items,
  variant = 'line',
}: {
  items: { name: string; tone: Tone }[];
  variant?: 'line' | 'swatch';
}) {
  return (
    <ul className="legend">
      {items.map((i) => (
        <li key={i.name}>
          <span
            className={`legend-key legend-key-${variant} legend-${i.tone}`}
            aria-hidden="true"
          />
          {i.name}
        </li>
      ))}
    </ul>
  );
}

/**
 * 横棒での比較。金額の大小を並べて見せるとき用。
 * `parts` を複数入れると積み上げになる（元本と運用益など）。
 */
export function Bars({
  rows,
  max,
  unit = '万円',
}: {
  rows: { label: string; parts: { value: number; tone: Tone; name: string }[] }[];
  max: number;
  unit?: string;
}) {
  const W = 360;
  const rowH = 40;
  const labelW = 58;
  // 右側は値のラベル（「2,496.8万円」まで出る）が入る幅を空ける
  const barW = W - labelW - 92;
  const H = rows.length * rowH + 6;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {rows.map((row, i) => {
        const total = row.parts.reduce((s, p) => s + p.value, 0);
        let offset = 0;
        return (
          <g key={row.label} transform={`translate(0, ${i * rowH + 4})`}>
            <text x={0} y={20} className="chart-tick">
              {row.label}
            </text>
            {row.parts.map((p) => {
              const w = (p.value / max) * barW;
              const rect = (
                <rect
                  key={p.name}
                  x={labelW + offset}
                  y={7}
                  width={Math.max(w, 0)}
                  height={17}
                  rx="2"
                  fill={p.tone === 'muted' ? 'var(--surface-2)' : STROKE[p.tone]}
                  stroke={p.tone === 'muted' ? 'var(--muted)' : 'none'}
                  strokeWidth="1"
                />
              );
              offset += w;
              return rect;
            })}
            <text x={labelW + offset + 5} y={20} className="chart-endlabel">
              {/* 表と同じ書式（小数第1位＋3桁区切り）で出す。
                  図と表で桁の見え方が違うと、同じ数字だと気づけない */}
              {manText(total)}
              {unit}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
