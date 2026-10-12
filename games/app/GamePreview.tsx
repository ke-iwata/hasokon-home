import type { ReactNode } from 'react';

/**
 * ゲーム一覧（/games/）のカードの絵：**遊んでいる最中の画面**を小さく描いたもの。
 *
 * ツール一覧の「結果の形」（tools/app/ToolPreview.tsx）のゲーム版。盤・札・駒が
 * どう並ぶかを見せれば、名前を知らなくても「どんな遊びか」が伝わる
 * （docs/features/card-illustrations.md）。
 *
 * - 枠は 340×150。カードの幅いっぱいに置き、PCでもスマホでも同じ絵を使う
 * - 色は5つだけ：線（currentColor = --tile-ink）・その薄め・地（--tile-bg）・
 *   紙面（--surface）・目立たせる1点（--cat-mark）。**生のカラーコードを書かない**
 * - 点数・記録は ［◯］ の伏せ字（それらしい架空の点数を描かない）
 * - 札は**数字だけ**（スートの記号は小さくすると潰れるので描かない）
 *
 * ほかのゲームのページの「他のゲーム」は小さいタイルなので、従来の盤面の絵
 * （app/GameIcon.tsx の BOARD）のまま。公開するPRでは両方を描く。
 */

const INK = { fill: 'currentColor' } as const;
const MID = { fill: 'currentColor', fillOpacity: 0.5 } as const;
const TINT = { fill: 'currentColor', fillOpacity: 0.18 } as const;
const MARK = { style: { fill: 'var(--cat-mark)' } } as const;
const PANEL = { style: { fill: 'var(--surface)' } } as const;
const BG = { style: { fill: 'var(--tile-bg)' } } as const;
const LINE = { fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const DASH = { fill: 'none', stroke: 'currentColor', strokeOpacity: 0.45, strokeWidth: 1.5, strokeDasharray: '3 3' } as const;

type Tone = 'text' | 'muted' | 'ink' | 'mark' | 'bg';
const TONE: Record<Tone, string> = {
  text: 'var(--text)',
  muted: 'var(--muted)',
  ink: 'currentColor',
  mark: 'var(--cat-mark)',
  bg: 'var(--tile-bg)',
};

function T({ x, y, s = 12, w = 500, c = 'text', a = 'start', children }: { x: number; y: number; s?: number; w?: number; c?: Tone; a?: 'start' | 'middle' | 'end'; children: ReactNode }) {
  return (
    <text x={x} y={y} fontSize={s} fontWeight={w} textAnchor={a} style={{ fill: TONE[c] }}>
      {children}
    </text>
  );
}

/** トランプ・札。up=表（数字だけ書く）、up=false=裏 */
function Card({ x, y, w = 24, h = 32, up = true, r, hot = false }: { x: number; y: number; w?: number; h?: number; up?: boolean; r?: string; hot?: boolean }) {
  if (!up) {
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx={3} {...INK} />
        <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} rx={1.5} fill="none" style={{ stroke: 'var(--tile-bg)' }} strokeWidth={1} />
      </g>
    );
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={3} {...PANEL} style={{ fill: 'var(--surface)', stroke: hot ? 'var(--cat-mark)' : 'currentColor' }} strokeWidth={hot ? 2.5 : 1.5} />
      {r ? (
        <text x={x + 4} y={y + 11} fontSize={10} fontWeight={700} style={{ fill: hot ? 'var(--cat-mark)' : 'currentColor' }}>
          {r}
        </text>
      ) : null}
    </g>
  );
}

/** 空きの置き場（破線の枠） */
function Slot({ x, y, w = 24, h = 32 }: { x: number; y: number; w?: number; h?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={3} {...DASH} />;
}

/** 盤のマス目（線だけ） */
function Grid({ x, y, cols, rows, size, opacity = 0.35 }: { x: number; y: number; cols: number; rows: number; size: number; opacity?: number }) {
  const d: string[] = [];
  for (let c = 0; c <= cols; c++) d.push(`M${x + c * size} ${y} V${y + rows * size}`);
  for (let r = 0; r <= rows; r++) d.push(`M${x} ${y + r * size} H${x + cols * size}`);
  return <path d={d.join(' ')} fill="none" stroke="currentColor" strokeOpacity={opacity} strokeWidth={1} />;
}

/** 連続する同じ値の長さ（ノノグラムの手がかり） */
function runs(line: string): number[] {
  const out: number[] = [];
  let n = 0;
  for (const ch of line) {
    if (ch === '1') n++;
    else if (n) {
      out.push(n);
      n = 0;
    }
  }
  if (n) out.push(n);
  return out.length ? out : [0];
}

const HEART = ['01100110', '11111111', '11111111', '11111111', '01111110', '00111100', '00011000', '00000000'];
const MINES = ['RRRRRR1CCCCC', 'RRRRRR12CCCC', 'RR111RR1FCCC', 'RR1F1RR12CCC', 'RR111RRR1CCC', 'RRRRRRRR1FCC'];
const NANPRE: [number, number, number][] = [
  [0, 0, 5], [0, 4, 7], [1, 2, 3], [1, 7, 9], [2, 5, 1], [3, 1, 8], [3, 8, 4], [4, 3, 6], [4, 6, 2], [5, 0, 2],
  [5, 5, 9], [6, 2, 4], [6, 7, 3], [7, 4, 8], [8, 1, 1], [8, 6, 6], [2, 0, 8], [7, 8, 5],
];
const BLOCKS = ['00000000', '00000000', '11000011', '11100111', '11111111', '01111110', '11011011', '11011111'];

const PREVIEW: Record<string, ReactNode> = {
  solitaire: (
    <>
      <Card x={24} y={14} w={30} h={40} up={false} />
      <Card x={66} y={14} w={30} h={40} r="A" />
      {[0, 1, 2, 3].map((i) => (i < 2 ? <Card key={i} x={150 + i * 42} y={14} w={30} h={40} r={i === 0 ? '3' : 'A'} /> : <Slot key={i} x={150 + i * 42} y={14} w={30} h={40} />))}
      {Array.from({ length: 7 }, (_, i) => (
        <g key={i}>
          {Array.from({ length: i }, (_, k) => (
            <Card key={k} x={24 + i * 42} y={62 + k * 6} w={30} h={40} up={false} />
          ))}
          <Card x={24 + i * 42} y={62 + i * 6} w={30} h={40} r={['K', '9', 'Q', '5', 'J', '7', '10'][i]} />
        </g>
      ))}
    </>
  ),
  spider: (
    <>
      {Array.from({ length: 10 }, (_, i) => {
        const down = [5, 4, 5, 4, 3, 5, 4, 3, 4, 5][i];
        const up = [2, 3, 1, 3, 4, 2, 2, 3, 1, 2][i];
        return (
          <g key={i}>
            {Array.from({ length: down }, (_, k) => (
              <Card key={`d${k}`} x={24 + i * 29} y={16 + k * 5} w={24} h={32} up={false} />
            ))}
            {Array.from({ length: up }, (_, k) => (
              <Card key={`u${k}`} x={24 + i * 29} y={16 + down * 5 + k * 12} w={24} h={32} r={String(10 - k - (i % 3))} />
            ))}
          </g>
        );
      })}
      <T x={316} y={134} s={11} c="muted" a="end">KからAまでそろえて8組</T>
    </>
  ),
  freecell: (
    <>
      {Array.from({ length: 8 }, (_, i) =>
        i < 4 ? (
          i === 1 ? <Card key={i} x={24 + i * 37} y={14} w={30} h={40} r="8" /> : <Slot key={i} x={24 + i * 37} y={14} w={30} h={40} />
        ) : i < 6 ? (
          <Card key={i} x={24 + i * 37} y={14} w={30} h={40} r={i === 4 ? '4' : '2'} />
        ) : (
          <Slot key={i} x={24 + i * 37} y={14} w={30} h={40} />
        ),
      )}
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i}>
          {Array.from({ length: i % 2 ? 3 : 4 }, (_, k) => (
            <Card key={k} x={24 + i * 37} y={64 + k * 12} w={30} h={36} r={String(((i * 3 + k * 5) % 9) + 2)} />
          ))}
        </g>
      ))}
    </>
  ),
  'pyramid-solitaire': (
    <>
      {Array.from({ length: 6 }, (_, r) =>
        Array.from({ length: r + 1 }, (_, i) => {
          const hot = (r === 5 && i === 1) || (r === 5 && i === 4);
          return <Card key={`${r}-${i}`} x={170 - (r + 1) * 13 + i * 26} y={14 + r * 16} w={24} h={32} r={hot ? (i === 1 ? '6' : '7') : undefined} hot={hot} />;
        }),
      )}
      <T x={300} y={70} s={22} w={900} c="mark" a="end">13</T>
      <T x={300} y={90} s={11} c="muted" a="end">足して</T>
    </>
  ),
  tripeaks: (
    <>
      {[70, 170, 270].map((cx) =>
        [0, 1, 2].map((r) =>
          Array.from({ length: r + 1 }, (_, i) => <Card key={`${cx}-${r}-${i}`} x={cx - 10 - r * 11 + i * 22} y={14 + r * 14} w={20} h={26} up={false} />),
        ),
      )}
      {Array.from({ length: 10 }, (_, i) => (
        <Card key={i} x={60 + i * 22} y={58} w={20} h={26} r={['4', '9', 'J', '2', '5', '8', 'K', '3', '6', '10'][i]} hot={i === 4} />
      ))}
      <Card x={150} y={98} w={26} h={34} up={false} />
      <Card x={182} y={98} w={26} h={34} r="6" hot />
      <T x={316} y={124} s={12} w={700} c="ink" a="end">連鎖 ［◯］</T>
    </>
  ),
  'golf-solitaire': (
    <>
      {Array.from({ length: 7 }, (_, i) =>
        Array.from({ length: 4 }, (_, k) => <Card key={`${i}-${k}`} x={30 + i * 40} y={14 + k * 12} w={30} h={38} r={String(((i * 4 + k * 7) % 9) + 2)} hot={i === 3 && k === 3} />),
      )}
      <Card x={120} y={100} w={30} h={36} up={false} />
      <Card x={160} y={100} w={30} h={36} r="5" />
      <T x={316} y={124} s={12} w={700} c="ink" a="end">残り［◯］枚</T>
    </>
  ),
  minesweeper: (
    <>
      {MINES.map((row, r) =>
        [...row].map((ch, c) => {
          const x = 50 + c * 20;
          const y = 15 + r * 20;
          if (ch === 'C' || ch === 'F') {
            return (
              <g key={`${r}-${c}`}>
                <rect x={x + 1} y={y + 1} width="18" height="18" rx="3" {...MID} />
                {ch === 'F' ? <path d={`M${x + 7} ${y + 15} V${y + 4} l7 3.5 -7 3.5`} {...MARK} style={{ fill: 'var(--cat-mark)', stroke: 'var(--cat-mark)' }} strokeWidth={1.5} strokeLinejoin="round" /> : null}
              </g>
            );
          }
          return (
            <g key={`${r}-${c}`}>
              <rect x={x + 1} y={y + 1} width="18" height="18" rx="2" {...TINT} />
              {ch === 'R' ? null : (
                <T x={x + 10} y={y + 14} s={11} w={900} c="ink" a="middle">{ch}</T>
              )}
            </g>
          );
        }),
      )}
    </>
  ),
  '2048': (
    <>
      <rect x="36" y="11" width="128" height="128" rx="8" {...TINT} />
      {[
        ['2', '', '4', ''],
        ['4', '8', '16', '2'],
        ['8', '32', '64', '4'],
        ['16', '128', '256', '2048'],
      ].map((row, r) =>
        row.map((v, c) => {
          const x = 40 + c * 31;
          const y = 15 + r * 31;
          if (!v) return <rect key={`${r}-${c}`} x={x} y={y} width="28" height="28" rx="4" {...PANEL} />;
          const big = Number(v) >= 64;
          return (
            <g key={`${r}-${c}`}>
              <rect x={x} y={y} width="28" height="28" rx="4" {...(v === '2048' ? MARK : big ? INK : MID)} />
              <T x={x + 14} y={y + 18} s={v.length >= 4 ? 8 : v.length === 3 ? 10 : 12} w={900} c="bg" a="middle">{v}</T>
            </g>
          );
        }),
      )}
      <T x={196} y={56} s={11} c="muted">スコア</T>
      <T x={196} y={80} s={18} w={900} c="ink">［◯］</T>
      <T x={196} y={116} s={11} c="muted">ベスト ［◯］</T>
    </>
  ),
  nanpre: (
    <>
      <Grid x={40} y={16} cols={9} rows={9} size={13} opacity={0.3} />
      <path d="M40 16 h117 v117 h-117 Z M79 16 v117 M118 16 v117 M40 55 h117 M40 94 h117" fill="none" stroke="currentColor" strokeWidth={2} />
      <rect x="105" y="56" width="13" height="12" {...MARK} fillOpacity={0.3} />
      {NANPRE.map(([r, c, v]) => (
        <T key={`${r}-${c}`} x={40 + c * 13 + 6.5} y={16 + r * 13 + 10} s={9} w={700} c="ink" a="middle">{v}</T>
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i}>
          <rect x={196 + (i % 3) * 36} y={30 + Math.floor(i / 3) * 32} width="30" height="26" rx="5" {...TINT} />
          <T x={211 + (i % 3) * 36} y={48 + Math.floor(i / 3) * 32} s={12} w={700} c="ink" a="middle">{i + 1}</T>
        </g>
      ))}
    </>
  ),
  nonogram: (
    <>
      {HEART.map((row, r) =>
        [...row].map((ch, c) => (
          <rect key={`${r}-${c}`} x={128 + c * 11} y={46 + r * 11} width="10" height="10" rx="1.5" {...(ch === '1' ? INK : TINT)} />
        )),
      )}
      {HEART.map((row, r) => (
        <T key={`l${r}`} x={122} y={55 + r * 11} s={8} c="muted" a="end">{runs(row).join(' ')}</T>
      ))}
      {Array.from({ length: 8 }, (_, c) => {
        const col = HEART.map((row) => row[c]).join('');
        return runs(col).map((n, k, all) => (
          <T key={`t${c}-${k}`} x={133 + c * 11} y={42 - (all.length - 1 - k) * 10} s={8} c="muted" a="middle">{n}</T>
        ));
      })}
      <T x={316} y={134} s={11} c="muted" a="end">数字をヒントに塗る</T>
    </>
  ),
  'suji-hitofude': (
    <>
      <Grid x={104} y={16} cols={5} rows={4} size={28} opacity={0.4} />
      {/* 往復させると数字の「2」に見えるので、外周をまわる道にしてある（SnakeIcon・BOARD と同じ失敗をしない） */}
      <path d="M118 30 V114 H230 V58" {...LINE} strokeWidth={6} strokeOpacity={0.85} />
      {[
        [118, 30, '1'],
        [230, 114, '8'],
        [174, 58, '20'],
      ].map(([x, y, n]) => (
        <g key={n as string}>
          <circle cx={x as number} cy={y as number} r="10" {...((n as string) === '20' ? MARK : INK)} />
          <T x={x as number} y={(y as number) + 4} s={(n as string).length > 1 ? 9 : 11} w={900} c="bg" a="middle">{n}</T>
        </g>
      ))}
    </>
  ),
  reversi: (
    <>
      <rect x="36" y="15" width="120" height="120" rx="4" {...TINT} />
      <Grid x={36} y={15} cols={8} rows={8} size={15} opacity={0.4} />
      {[
        [3, 3, 'w'], [3, 4, 'b'], [4, 3, 'b'], [4, 4, 'b'], [2, 4, 'b'], [5, 3, 'w'], [2, 2, 'w'], [3, 5, 'b'], [4, 5, 'w'], [5, 4, 'b'], [2, 3, 'b'], [5, 5, 'w'],
      ].map(([r, c, k]) => (
        <circle key={`${r}-${c}`} cx={36 + (c as number) * 15 + 7.5} cy={15 + (r as number) * 15 + 7.5} r="6" {...(k === 'b' ? INK : PANEL)} stroke="currentColor" strokeWidth={1.5} />
      ))}
      <circle cx={36 + 6 * 15 + 7.5} cy={15 + 2 * 15 + 7.5} r="3" {...MARK} />
      <circle cx="196" cy="60" r="9" {...INK} />
      <T x={212} y={65} s={14} w={700} c="ink">［◯］</T>
      <circle cx="196" cy="94" r="9" {...PANEL} stroke="currentColor" strokeWidth={2} />
      <T x={212} y={99} s={14} w={700} c="ink">［◯］</T>
    </>
  ),
  gomoku: (
    <>
      <Grid x={40} y={17} cols={8} rows={8} size={14} opacity={0.45} />
      {[
        [2, 2, 'b'], [3, 3, 'b'], [4, 4, 'b'], [5, 5, 'b'], [6, 6, 'b'], [2, 4, 'w'], [3, 5, 'w'], [4, 2, 'w'], [5, 3, 'w'], [6, 4, 'w'], [1, 5, 'w'],
      ].map(([r, c, k]) => (
        <circle key={`${r}-${c}`} cx={40 + (c as number) * 14} cy={17 + (r as number) * 14} r="6" {...(k === 'b' ? INK : PANEL)} stroke="currentColor" strokeWidth={1.5} />
      ))}
      <path d={`M${40 + 2 * 14 - 8} ${17 + 2 * 14 - 8} L${40 + 6 * 14 + 8} ${17 + 6 * 14 + 8}`} style={{ stroke: 'var(--cat-mark)' }} strokeWidth={3} strokeLinecap="round" />
      <T x={196} y={72} s={14} w={900} c="ink">5つ並べたら</T>
      <T x={196} y={94} s={14} w={900} c="mark">勝ち</T>
    </>
  ),
  daifugo: (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <Card key={`t${i}`} x={130 + i * 12} y={12} w={20} h={26} up={false} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <Card key={`l${i}`} x={24 + i * 8} y={50} w={20} h={26} up={false} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <Card key={`r${i}`} x={268 + i * 8} y={50} w={20} h={26} up={false} />
      ))}
      <Card x={146} y={50} w={24} h={32} r="8" hot />
      <Card x={172} y={50} w={24} h={32} r="8" hot />
      {['3', '5', '6', '9', 'J', 'Q', 'K', '2'].map((r, i) => (
        <Card key={r} x={90 + i * 20} y={98} w={24} h={34} r={r} />
      ))}
      <path d="M150 46 l4 -8 4 5 4 -7 4 7 4 -5 4 8 Z" {...MARK} />
    </>
  ),
  shichinarabe: (
    <>
      {[
        [4, 9],
        [5, 7],
        [2, 6],
        [6, 11],
      ].map(([from, to], r) =>
        Array.from({ length: 13 }, (_, i) =>
          i >= from && i <= to ? (
            <Card key={`${r}-${i}`} x={40 + i * 20} y={14 + r * 30} w={18} h={26} r={i === 6 ? '7' : undefined} hot={i === 6} />
          ) : (
            <rect key={`${r}-${i}`} x={40 + i * 20} y={14 + r * 30} width="18" height="26" rx="3" {...TINT} />
          ),
        ),
      )}
    </>
  ),
  'shinkei-suijaku': (
    <>
      {Array.from({ length: 18 }, (_, i) => {
        const r = Math.floor(i / 6);
        const c = i % 6;
        const x = 58 + c * 38;
        const y = 14 + r * 42;
        if (i === 7 || i === 14) return <Card key={i} x={x} y={y} w={30} h={38} r="Q" hot />;
        if (i === 3 || i === 10) return <Slot key={i} x={x} y={y} w={30} h={38} />;
        return <Card key={i} x={x} y={y} w={30} h={38} up={false} />;
      })}
    </>
  ),
  speed: (
    <>
      {[0, 1, 2, 3].map((i) => (
        <Card key={`c${i}`} x={110 + i * 30} y={12} w={24} h={30} r={['3', 'J', '9', '5'][i]} />
      ))}
      <Card x={130} y={58} w={30} h={38} r="6" />
      <Card x={180} y={58} w={30} h={38} r="7" hot />
      <path d="M166 62 l-6 12 h6 l-4 12 10 -15 h-6 l4 -9 Z" {...MARK} />
      {[0, 1, 2, 3].map((i) => (
        <Card key={`y${i}`} x={110 + i * 30} y={104} w={24} h={32} r={['8', '2', 'Q', '6'][i]} hot={i === 0} />
      ))}
      <T x={24} y={82} s={11} c="muted">早い者勝ち</T>
    </>
  ),
  'hanafuda-koikoi': (
    <>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={`c${i}`} x={110 + i * 20} y={12} width="16" height="24" rx="2" {...INK} />
      ))}
      {Array.from({ length: 8 }, (_, i) => {
        const x = 70 + (i % 4) * 30;
        const y = 44 + Math.floor(i / 4) * 40;
        return (
          <g key={i}>
            <rect x={x} y={y} width="24" height="36" rx="2" {...PANEL} stroke="currentColor" strokeWidth={1.5} />
            {i % 3 === 0 ? <circle cx={x + 12} cy={y + 13} r="6" {...(i === 0 ? MARK : MID)} /> : <path d={`M${x + 4} ${y + 30} q8 -16 16 0`} {...MID} />}
          </g>
        );
      })}
      <rect x="208" y="52" width="108" height="56" rx="8" {...TINT} />
      <T x={262} y={76} s={12} w={700} c="ink" a="middle">役</T>
      <T x={262} y={96} s={13} w={900} c="mark" a="middle">［役の名前］</T>
    </>
  ),
  'mahjong-solitaire': (
    <>
      {Array.from({ length: 21 }, (_, i) => {
        const r = Math.floor(i / 7);
        const c = i % 7;
        return <rect key={`a${i}`} x={60 + c * 30} y={30 + r * 36} width="28" height="34" rx="3" {...PANEL} stroke="currentColor" strokeWidth={1.2} />;
      })}
      {Array.from({ length: 8 }, (_, i) => {
        const r = Math.floor(i / 4);
        const c = i % 4;
        const hot = i === 1 || i === 6;
        return (
          <g key={`b${i}`}>
            <rect x={110 + c * 30} y={44 + r * 36} width="28" height="34" rx="3" {...MID} />
            <rect x={107 + c * 30} y={40 + r * 36} width="28" height="34" rx="3" {...PANEL} style={{ fill: 'var(--surface)', stroke: hot ? 'var(--cat-mark)' : 'currentColor' }} strokeWidth={hot ? 2.5 : 1.2} />
            <circle cx={121 + c * 30} cy={57 + r * 36} r="6" {...(hot ? MARK : TINT)} />
          </g>
        );
      })}
    </>
  ),
  'block-puzzle': (
    <>
      {BLOCKS.map((row, r) =>
        [...row].map((ch, c) => (
          <rect key={`${r}-${c}`} x={40 + c * 15} y={15 + r * 15} width="14" height="14" rx="2" {...(r === 4 ? MARK : ch === '1' ? INK : TINT)} />
        )),
      )}
      <g>
        <rect x="200" y="30" width="14" height="14" rx="2" {...MID} />
        <rect x="215" y="30" width="14" height="14" rx="2" {...MID} />
        <rect x="200" y="45" width="14" height="14" rx="2" {...MID} />
      </g>
      <g>
        <rect x="250" y="30" width="14" height="14" rx="2" {...MID} />
        <rect x="265" y="30" width="14" height="14" rx="2" {...MID} />
        <rect x="280" y="30" width="14" height="14" rx="2" {...MID} />
      </g>
      <g>
        <rect x="220" y="80" width="14" height="14" rx="2" {...MID} />
        <rect x="220" y="95" width="14" height="14" rx="2" {...MID} />
        <rect x="235" y="95" width="14" height="14" rx="2" {...MID} />
        <rect x="250" y="95" width="14" height="14" rx="2" {...MID} />
      </g>
      <T x={316} y={134} s={11} c="muted" a="end">そろった列が消える</T>
    </>
  ),
  'color-sort': (
    <>
      {[
        ['INK', 'MARK', 'MID', 'INK'],
        ['MARK', 'MARK', 'MARK', 'MARK'],
        ['MID', 'TINT', 'INK', ''],
        ['TINT', 'MID', 'TINT', 'MID'],
        ['TINT', 'INK', '', ''],
      ].map((layers, i) => {
        const x = 44 + i * 56;
        return (
          <g key={i}>
            {layers.map((k, j) =>
              k ? (
                <rect key={j} x={x + 2} y={110 - (j + 1) * 22 + 2} width="26" height={j === 0 ? 26 : 22} {...(k === 'INK' ? INK : k === 'MID' ? MID : k === 'TINT' ? TINT : MARK)} />
              ) : null,
            )}
            <path d={`M${x} 20 V112 a15 15 0 0 0 30 0 V20`} {...LINE} strokeWidth={2.5} />
            {i === 1 ? <path d={`M${x + 8} 12 l5 5 9 -10`} style={{ stroke: 'var(--cat-mark)' }} fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" /> : null}
          </g>
        );
      })}
    </>
  ),
  breakout: (
    <>
      {[0, 1, 2].map((r) =>
        Array.from({ length: 9 }, (_, c) =>
          (r === 2 && (c === 3 || c === 4)) || (r === 1 && c === 4) ? null : (
            <rect key={`${r}-${c}`} x={36 + c * 30} y={18 + r * 14} width="28" height="11" rx="2" {...(r === 0 ? INK : r === 1 ? MID : TINT)} />
          ),
        ),
      )}
      <path d="M150 120 L182 84 L160 58" fill="none" stroke="currentColor" strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="3 4" />
      <circle cx="182" cy="84" r="5" {...MARK} />
      <rect x="126" y="122" width="56" height="8" rx="4" {...INK} />
      <T x={316} y={92} s={11} c="muted" a="end">スコア ［◯］</T>
    </>
  ),
  snake: (
    <>
      <rect x="58" y="18" width="224" height="112" rx="6" {...TINT} />
      {[
        [2, 5], [2, 4], [2, 3], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [6, 3], [6, 4], [7, 4], [8, 4], [9, 4],
      ].map(([c, r], i, all) => (
        <rect key={i} x={58 + c * 16 + 1} y={18 + r * 16 + 1} width="14" height="14" rx={i === all.length - 1 ? 5 : 3} {...(i === all.length - 1 ? INK : MID)} />
      ))}
      <circle cx={58 + 9 * 16 + 11} cy={18 + 4 * 16 + 5} r="2" {...PANEL} />
      <circle cx={58 + 12 * 16 + 8} cy={18 + 2 * 16 + 8} r="6" {...MARK} />
      <T x={316} y={134} s={11} c="muted" a="end">長さ ［◯］</T>
    </>
  ),
  yacht: (
    <>
      {['エース', 'フルハウス', 'ストレート', 'ヨット'].map((s, i) => (
        <g key={s}>
          <rect x="24" y={18 + i * 28} width="128" height="24" rx="5" {...TINT} />
          <T x={32} y={34 + i * 28} s={11}>{s}</T>
          <T x={146} y={34 + i * 28} s={11} w={700} c={i === 3 ? 'mark' : 'ink'} a="end">［◯］</T>
        </g>
      ))}
      {[0, 1, 2, 3, 4].map((i) => {
        const x = 172 + (i % 3) * 46;
        const y = i < 3 ? 26 : 74;
        const hot = i === 3 || i === 4;
        return (
          <g key={i}>
            <rect x={x} y={y} width="38" height="38" rx="8" {...PANEL} style={{ fill: 'var(--surface)', stroke: hot ? 'var(--cat-mark)' : 'currentColor' }} strokeWidth={hot ? 3 : 2} />
            {[
              [10, 10],
              [28, 10],
              [19, 19],
              [10, 28],
              [28, 28],
            ].map(([dx, dy]) => (
              <circle key={`${dx}-${dy}`} cx={x + dx} cy={y + dy} r="3.5" {...INK} />
            ))}
          </g>
        );
      })}
      <T x={316} y={134} s={11} c="muted" a="end">あと［◯］回振れる</T>
    </>
  ),
};

export const GAME_PREVIEW_SLUGS: readonly string[] = Object.keys(PREVIEW);

/** 一覧カードの「遊んでいる画面」の絵。絵の無い slug は null */
export default function GamePreview({ slug }: { slug: string }) {
  const art = PREVIEW[slug];
  if (!art) return null;
  return (
    <svg viewBox="0 0 340 150" aria-hidden="true" focusable="false" style={{ display: 'block', width: '100%', height: 'auto' }}>
      <rect width="340" height="150" {...BG} />
      <rect x="10" y="6" width="320" height="138" rx="10" {...PANEL} />
      {art}
    </svg>
  );
}
