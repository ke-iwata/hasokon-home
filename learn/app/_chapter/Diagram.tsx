/**
 * 図解のうち、グラフではないもの（順位・入れ子・時系列・板）。
 *
 * 約束は Figure.tsx の冒頭と同じ。色はCSS変数、幅は100%、
 * 色だけに意味を持たせない。
 */

/**
 * 上下の順位を示す積み木。
 * 倒産したときの弁済順位のように「先に払われる／後ろに回される」を出す。
 */
export function Ladder({
  steps,
  note,
}: {
  /** 上から順に。先に払われるものが上 */
  steps: { label: string; sub?: string; strong?: boolean }[];
  /** 図の脇に縦向きで添える説明（「先に払われる」など） */
  note?: { top: string; bottom: string };
}) {
  const W = 360;
  const rowH = 46;
  const gap = 6;
  const arrowW = note ? 44 : 0;
  const boxW = W - arrowW - 4;
  const H = steps.length * (rowH + gap);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {note && (
        <>
          <defs>
            <marker id="ladder-arrow" markerWidth="7" markerHeight="7" refX="3.5" refY="6"
              orient="auto">
              <path d="M0,6 L3.5,0 L7,6 Z" fill="var(--muted)" />
            </marker>
          </defs>
          <line
            x1={30} x2={30} y1={H - 10} y2={12}
            stroke="var(--muted)" strokeWidth="1.5" markerEnd="url(#ladder-arrow)"
          />
          {/* 説明は矢印に沿って縦に出す。横に置くと、箱に隠れて読めなくなる
              （実測して直したもの）。回転させると幅は文字の高さぶんで済む */}
          {/* rotate(-90) だと文字は下から上へ進む。上側のラベルは textAnchor="end"
              にしないと、起点から上へ伸びて図の外へ出る（実測して直したもの） */}
          <text
            x={16} y={10} className="chart-tick"
            textAnchor="end" transform={`rotate(-90, 16, 10)`}
          >
            {note.top}
          </text>
          <text
            x={16} y={H - 8} className="chart-tick"
            textAnchor="start" transform={`rotate(-90, 16, ${H - 8})`}
          >
            {note.bottom}
          </text>
        </>
      )}
      {steps.map((s, i) => (
        <g key={s.label} transform={`translate(${arrowW}, ${i * (rowH + gap)})`}>
          <rect
            x={0} y={0} width={boxW} height={rowH} rx="6"
            fill={s.strong ? 'var(--accent-soft)' : 'var(--surface-2)'}
            stroke={s.strong ? 'var(--accent)' : 'var(--border)'}
            strokeWidth={s.strong ? 2 : 1}
          />
          <text x={12} y={s.sub ? 20 : 27} className="diagram-label">
            {s.label}
          </text>
          {s.sub && (
            <text x={12} y={36} className="chart-tick">
              {s.sub}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/**
 * 入れ子の枠。全体のうち一部にさらに上限がある関係を出す
 * （NISAの「生涯1,800万円のうち成長投資枠は1,200万円まで」）。
 */
export function NestedBox({
  outer,
  inner,
  outerNote,
  innerNote,
}: {
  outer: { label: string; value: number };
  inner: { label: string; value: number };
  outerNote: string;
  innerNote: string;
}) {
  const W = 360;
  const H = 132;
  const padX = 4;
  const barW = W - padX * 2;
  const innerW = (inner.value / outer.value) * barW;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <text x={padX} y={14} className="diagram-label">{outer.label}</text>
      <rect
        x={padX} y={22} width={barW} height={46} rx="6"
        fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2"
      />
      {/* 内側の上限。境界を破線にして「ここまで」を示す */}
      <rect
        x={padX} y={22} width={innerW} height={46} rx="6"
        fill="var(--surface-2)" stroke="var(--accent-strong)" strokeWidth="2"
        strokeDasharray="5 3"
      />
      <text x={padX + 10} y={50} className="diagram-label">{inner.label}</text>

      <text x={padX + innerW / 2} y={86} className="chart-tick" textAnchor="middle">
        {innerNote}
      </text>
      <text x={padX + barW} y={104} className="chart-tick" textAnchor="end">
        {outerNote}
      </text>
      {/* 全体の幅を示す線 */}
      <line
        x1={padX} x2={padX + barW} y1={112} y2={112}
        stroke="var(--muted)" strokeWidth="1"
      />
      <line x1={padX} x2={padX} y1={108} y2={116} stroke="var(--muted)" strokeWidth="1" />
      <line
        x1={padX + barW} x2={padX + barW} y1={108} y2={116}
        stroke="var(--muted)" strokeWidth="1"
      />
    </svg>
  );
}

/**
 * 時系列。日付が並び、どこが境目かを示す
 * （権利付最終日・権利落ち日・権利確定日）。
 */
export function Timeline({
  items,
}: {
  items: { date: string; label: string; sub?: string; mark?: 'ok' | 'ng' | 'plain' }[];
}) {
  const W = 360;
  const padX = 8;
  const step = (W - padX * 2) / items.length;
  const lineY = 52;
  // 説明は隣の項目と重なるので、桁に収まる長さで折り返す。
  // 日本語はほぼ全角なので、文字数 × フォントサイズで幅を見積もれる
  const SUB_FONT = 11;
  const maxChars = Math.max(4, Math.floor((step - 6) / SUB_FONT));
  const wrap = (text: string) => {
    const lines: string[] = [];
    for (let i = 0; i < text.length; i += maxChars) lines.push(text.slice(i, i + maxChars));
    return lines;
  };
  const subLines = items.map((it) => (it.sub ? wrap(it.sub) : []));
  const maxLines = Math.max(0, ...subLines.map((l) => l.length));
  const H = lineY + 30 + maxLines * 14 + 6;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <line
        x1={padX} x2={W - padX} y1={lineY} y2={lineY}
        stroke="var(--border)" strokeWidth="2"
      />
      {items.map((it, i) => {
        const cx = padX + step * i + step / 2;
        const fill =
          it.mark === 'ok'
            ? 'var(--accent)'
            : it.mark === 'ng'
              ? 'var(--danger)'
              : 'var(--muted)';
        return (
          <g key={it.date}>
            <text x={cx} y={20} className="chart-tick" textAnchor="middle">
              {it.date}
            </text>
            <circle cx={cx} cy={lineY} r="7" fill={fill} />
            {/* 記号でも区別できるようにする（色だけに意味を持たせない） */}
            {it.mark === 'ok' && (
              <path
                d={`M${cx - 3.2},${lineY} l2.4,2.6 l4.2,-4.8`}
                fill="none" stroke="var(--on-accent)" strokeWidth="1.8" strokeLinecap="round"
              />
            )}
            {it.mark === 'ng' && (
              <path
                d={`M${cx - 2.8},${lineY - 2.8} l5.6,5.6 M${cx + 2.8},${lineY - 2.8} l-5.6,5.6`}
                fill="none" stroke="var(--on-accent)" strokeWidth="1.8" strokeLinecap="round"
              />
            )}
            <text x={cx} y={lineY + 24} className="diagram-label" textAnchor="middle">
              {it.label}
            </text>
            {subLines[i].map((line, li) => (
              <text
                key={line + li}
                x={cx}
                y={lineY + 40 + li * 14}
                className="chart-tick"
                textAnchor="middle"
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * 板（気配値）。売り注文と買い注文が価格ごとに並んだもの。
 *
 * `swept` に入れた価格は「成行がここまで食った」ものとして塗る。
 * 成行が滑る話は、板を見せないと伝わらない。
 */
export function OrderBook({
  rows,
  swept = [],
}: {
  /** 価格の高い順に並べる（板の見た目どおり） */
  rows: { price: number; sell?: number; buy?: number }[];
  /** 約定した価格と数量 */
  swept?: { price: number; qty: number }[];
}) {
  const W = 360;
  const rowH = 27;
  const H = rows.length * rowH + 26;
  // 3列の位置。値段は中央で揃え、株数は値段側の端に寄せる。
  // **列の位置は見出しと本体で同じ値を使う**（別々に置くとずれる）。
  // 右端は「約定」の注記のために空けてある
  const SELL_X = 108;
  const PRICE_X = 160;
  const BUY_X = 212;
  const NOTE_X = W - 6;
  const sweptAt = new Map(swept.map((s) => [s.price, s.qty]));

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <text x={SELL_X} y={14} className="chart-tick" textAnchor="end">
        売り注文
      </text>
      <text x={PRICE_X} y={14} className="chart-tick" textAnchor="middle">
        値段
      </text>
      <text x={BUY_X} y={14} className="chart-tick" textAnchor="start">
        買い注文
      </text>

      {rows.map((r, i) => {
        const yTop = 22 + i * rowH;
        const hit = sweptAt.get(r.price);
        return (
          <g key={r.price}>
            {hit !== undefined && (
              <rect
                x={2}
                y={yTop}
                width={W - 4}
                height={rowH - 3}
                rx="3"
                fill="var(--accent-soft)"
                stroke="var(--accent)"
                strokeWidth="1.5"
              />
            )}
            <text x={SELL_X} y={yTop + 17} className="book-qty" textAnchor="end">
              {r.sell ?? ''}
            </text>
            <text x={PRICE_X} y={yTop + 17} className="book-price" textAnchor="middle">
              {r.price.toLocaleString('ja-JP')}
            </text>
            <text x={BUY_X} y={yTop + 17} className="book-qty" textAnchor="start">
              {r.buy ?? ''}
            </text>
            {hit !== undefined && (
              <text x={NOTE_X} y={yTop + 17} className="chart-endlabel" textAnchor="end">
                {hit}株 約定
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * 順番に処理される流れ（成行 → 価格 → 時間の優先順位など）。
 * 横に並べて矢印でつなぐ。
 */
export function Flow({ steps }: { steps: { label: string; sub?: string }[] }) {
  const W = 360;
  const H = 74;
  const gap = 14;
  const boxW = (W - gap * (steps.length - 1)) / steps.length;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="var(--muted)" />
        </marker>
      </defs>
      {steps.map((s, i) => {
        const x = i * (boxW + gap);
        return (
          <g key={s.label}>
            <rect
              x={x} y={8} width={boxW} height={52} rx="6"
              fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1"
            />
            <text x={x + boxW / 2} y={s.sub ? 30 : 39} className="diagram-label"
              textAnchor="middle">
              {s.label}
            </text>
            {s.sub && (
              <text x={x + boxW / 2} y={46} className="chart-tick" textAnchor="middle">
                {s.sub}
              </text>
            )}
            {i < steps.length - 1 && (
              <line
                x1={x + boxW + 2} x2={x + boxW + gap - 4} y1={34} y2={34}
                stroke="var(--muted)" strokeWidth="1.5" markerEnd="url(#flow-arrow)"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
