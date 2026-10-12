import type { ReactNode } from 'react';

/**
 * ツール一覧（/tools/）のカードの絵：**そのツールで出てくる答えの形**を小さく描いたもの。
 *
 * 円グラフ・段差・期限の日付・数直線のように、開いたときに出てくる結果画面の形を
 * そのまま描く。説明を読まなくても「何が分かるツールか」が形で伝わり、
 * 開いたページで同じ形が出てくるので迷いも少ない（運営者が案Bとして選んだ。
 * docs/features/card-illustrations.md）。
 *
 * - 枠は 340×150。カードの幅いっぱいに置き、PCでもスマホでも同じ絵を使う
 * - 色は5つだけ：分類の線（currentColor）・その薄め（opacity）・分類の地（--tile-bg）・
 *   紙面（--surface）・目立たせる1点（--cat-mark）。文字は --text / --muted。
 *   **生のカラーコードを書かない**（明暗テーマに追随させるため。tests/tool-preview.test.ts）
 * - **数字は制度で決まっている値だけを書く**（80%・119万・6.2万円など）。
 *   人によって変わる値は ［◯円］ のような伏せ字にする（それらしい架空の額を描かない）
 *
 * トップ（home/）・関連ツール・404 のカードは小さいタイルなので、
 * 従来の絵（app/ToolArt.tsx）のまま。公開するPRでは両方を描く。
 */

const INK = { fill: 'currentColor' } as const;
const MID = { fill: 'currentColor', fillOpacity: 0.5 } as const;
const TINT = { fill: 'currentColor', fillOpacity: 0.18 } as const;
const MARK = { style: { fill: 'var(--cat-mark)' } } as const;
const PANEL = { style: { fill: 'var(--surface)' } } as const;
const BG = { style: { fill: 'var(--tile-bg, var(--accent-soft))' } } as const;
const LINE = { fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

type Tone = 'text' | 'muted' | 'ink' | 'mark' | 'bg';
const TONE: Record<Tone, string> = {
  text: 'var(--text)',
  muted: 'var(--muted)',
  ink: 'currentColor',
  mark: 'var(--cat-mark)',
  bg: 'var(--tile-bg, var(--accent-soft))',
};

/** 絵の中の文字。字の太さと色だけを選ぶ */
function T({
  x,
  y,
  s = 12,
  w = 500,
  c = 'text',
  a = 'start',
  children,
}: {
  x: number;
  y: number;
  s?: number;
  w?: number;
  c?: Tone;
  a?: 'start' | 'middle' | 'end';
  children: ReactNode;
}) {
  return (
    <text x={x} y={y} fontSize={s} fontWeight={w} textAnchor={a} style={{ fill: TONE[c] }}>
      {children}
    </text>
  );
}

/** 円グラフの1切れ（周の長さ 2πr に対する割合で描く） */
function Ring({ cx, cy, r, w, from, len, tone }: { cx: number; cy: number; r: number; w: number; from: number; len: number; tone: 'ink' | 'tint' | 'mark' }) {
  const c = 2 * Math.PI * r;
  const stroke = tone === 'mark' ? 'var(--cat-mark)' : 'currentColor';
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      strokeWidth={w}
      strokeDasharray={`${len * c} ${c}`}
      strokeDashoffset={-from * c}
      transform={`rotate(-90 ${cx} ${cy})`}
      style={{ stroke }}
      strokeOpacity={tone === 'tint' ? 0.18 : 1}
    />
  );
}

const PREVIEW: Record<string, ReactNode> = {
  // ---- 決める・選ぶ ----
  roulette: (
    <>
      <g transform="translate(110 78)">
        <path d="M0 0 L0 -50 A50 50 0 0 1 43.3 -25 Z" {...INK} />
        <path d="M0 0 L43.3 -25 A50 50 0 0 1 43.3 25 Z" {...TINT} />
        <path d="M0 0 L43.3 25 A50 50 0 0 1 0 50 Z" {...MID} />
        <path d="M0 0 L0 50 A50 50 0 0 1 -43.3 25 Z" {...TINT} />
        <path d="M0 0 L-43.3 25 A50 50 0 0 1 -43.3 -25 Z" {...MID} />
        <path d="M0 0 L-43.3 -25 A50 50 0 0 1 0 -50 Z" {...TINT} />
        <circle r="9" {...PANEL} stroke="currentColor" strokeWidth="3" />
      </g>
      <path d="M110 30 l-8 -12 h16 Z" {...MARK} />
      <rect x="190" y="56" width="120" height="44" rx="10" {...INK} />
      <T x={250} y={84} s={15} w={700} c="bg" a="middle">［当たり］</T>
    </>
  ),
  group: (
    <>
      {[
        [70, 'A'],
        [170, 'B'],
        [270, 'C'],
      ].map(([cx, label]) => (
        <g key={label as string}>
          <circle cx={cx as number} cy={70} r={38} {...TINT} />
          <T x={cx as number} y={56} s={13} w={700} c="ink" a="middle">{`${label}班`}</T>
          {[-14, 0, 14].map((dx) => (
            <circle key={dx} cx={(cx as number) + dx} cy={80} r={7} {...INK} />
          ))}
        </g>
      ))}
      <T x={170} y={136} s={11} c="muted" a="middle">人数は自動で均等に</T>
    </>
  ),
  dice: (
    <>
      <rect x="40" y="34" width="70" height="70" rx="12" {...INK} />
      {[
        [58, 52],
        [92, 52],
        [75, 69],
        [58, 86],
        [92, 86],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={6} {...BG} />
      ))}
      <rect x="126" y="34" width="70" height="70" rx="12" {...MID} />
      {[
        [144, 52],
        [178, 86],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={6} {...PANEL} />
      ))}
      <T x={226} y={64} s={12} c="muted">合計</T>
      <T x={226} y={96} s={24} w={900} c="ink">［◯］</T>
    </>
  ),

  // ---- お金・社会保険 ----
  'kosodate-shienkin': (
    <>
      {[
        ['2026', 40],
        ['2027', 56],
        ['2028', 72],
      ].map(([y, h], i) => (
        <g key={y as string}>
          <rect x={40 + i * 70} y={112 - (h as number)} width="50" height={h as number} rx="4" {...(i === 2 ? INK : MID)} />
          <T x={65 + i * 70} y={128} s={11} c="muted" a="middle">{`${y}年度`}</T>
        </g>
      ))}
      <T x={250} y={56} s={11} c="muted">毎月の天引き</T>
      <T x={250} y={84} s={18} w={900} c="ink">［◯円］</T>
    </>
  ),
  'furusato-nozei': (
    <>
      <T x={24} y={40} s={12} c="muted">寄付の上限</T>
      <T x={96} y={40} s={16} w={900} c="ink">［◯円］</T>
      <rect x="24" y="58" width="24" height="24" rx="4" {...TINT} />
      <rect x="50" y="58" width="90" height="24" rx="4" {...MID} />
      <rect x="142" y="58" width="174" height="24" rx="4" {...INK} />
      <T x={36} y={102} s={10} c="muted" a="middle">2,000円</T>
      <T x={95} y={102} s={11} c="muted" a="middle">所得税</T>
      <T x={229} y={102} s={11} c="muted" a="middle">住民税</T>
      <T x={24} y={126} s={11} c="muted">自己負担2,000円をのぞいて戻る</T>
    </>
  ),
  'nenmatsu-chosei': (
    <>
      <T x={24} y={40} s={11} c="muted">源泉徴収された税</T>
      <rect x="24" y="46" width="240" height="18" rx="4" {...TINT} />
      <T x={24} y={88} s={11} c="muted">1年の正しい税額</T>
      <rect x="24" y="94" width="176" height="18" rx="4" {...MID} />
      <rect x="200" y="94" width="64" height="18" rx="4" {...MARK} />
      <path d="M200 70 v20 M264 70 v20" {...LINE} strokeWidth={2} />
      <T x={278} y={108} s={13} w={700} c="mark">戻る</T>
      <T x={24} y={132} s={11} c="muted">差額が還付金</T>
    </>
  ),
  'zaishoku-rorei-nenkin': (
    <>
      <rect x="40" y="56" width="60" height="62" rx="4" {...INK} />
      <rect x="40" y="30" width="60" height="26" rx="4" {...MID} />
      <rect x="40" y="30" width="60" height="12" rx="4" {...MARK} />
      <path d="M24 42 H210" stroke="currentColor" strokeWidth={2} strokeDasharray="5 5" />
      <T x={214} y={46} s={12} w={700} c="ink">基準額 65万円</T>
      <T x={108} y={36} s={11} w={700} c="mark">止まる分</T>
      <T x={108} y={74} s={11} c="muted">年金</T>
      <T x={108} y={104} s={11} c="muted">給与</T>
      <T x={214} y={90} s={11} c="muted">あと稼げる額</T>
      <T x={214} y={112} s={16} w={900} c="ink">［◯万円］</T>
    </>
  ),
  ideco: (
    <>
      <T x={316} y={42} s={13} w={700} c="ink" a="end">月6.2万円</T>
      <rect x="24" y="52" width="292" height="26" rx="5" {...TINT} />
      <rect x="24" y="52" width="88" height="26" rx="5" {...MID} />
      <rect x="114" y="52" width="202" height="26" rx="5" {...INK} />
      <T x={68} y={98} s={11} c="muted" a="middle">事業主掛金</T>
      <T x={215} y={98} s={12} w={700} c="ink" a="middle">あなたの上限</T>
      <T x={24} y={128} s={11} c="muted">年間の節税額 ［◯円］</T>
    </>
  ),
  'koko-jugyoryo': (
    <>
      <T x={24} y={40} s={11} c="muted">授業料など</T>
      <rect x="24" y="48" width="292" height="26" rx="5" {...TINT} />
      <rect x="24" y="48" width="220" height="26" rx="5" {...INK} />
      <rect x="246" y="48" width="70" height="26" rx="5" {...MARK} />
      <T x={134} y={92} s={11} c="muted" a="middle">就学支援金</T>
      <T x={281} y={92} s={11} w={700} c="mark" a="middle">自己負担</T>
      <T x={24} y={126} s={11} c="muted">3年間の総額 ［◯円］</T>
    </>
  ),
  'yoikuhi-keisan': (
    <>
      <path d="M24 74 H316" {...LINE} strokeWidth={2} />
      <rect x="120" y="62" width="110" height="24" rx="12" {...TINT} />
      <circle cx="170" cy="74" r="9" {...INK} />
      <T x={175} y={50} s={14} w={900} c="ink" a="middle">月［◯万円］</T>
      <T x={175} y={106} s={11} c="muted" a="middle">算定表のレンジ</T>
      <T x={24} y={132} s={11} c="muted">法定養育費は子1人あたり月2万円</T>
    </>
  ),
  'tabako-zei-neage': (
    <>
      {['2027', '2028', '2029'].map((y, i) => (
        <g key={y}>
          <rect x={44 + i * 92} y={88 - i * 22} width="68" height={30 + i * 22} rx="4" {...(i === 2 ? INK : MID)} />
          <T x={78 + i * 92} y={80 - i * 22} s={12} w={700} c="mark" a="middle">+0.5円</T>
          <T x={78 + i * 92} y={134} s={11} c="muted" a="middle">{`${y}年4月`}</T>
        </g>
      ))}
    </>
  ),
  'shohizei-keisan': (
    <>
      {[
        ['10%', 'INK'],
        ['8%', 'MID'],
        ['1%', 'DASH'],
      ].map(([rate, kind], i) => (
        <g key={rate}>
          {kind === 'DASH' ? (
            <rect x={28 + i * 98} y="30" width="86" height="70" rx="8" fill="none" stroke="currentColor" strokeWidth={2.5} strokeDasharray="5 5" />
          ) : (
            <rect x={28 + i * 98} y="30" width="86" height="70" rx="8" {...(kind === 'INK' ? INK : MID)} />
          )}
          <T x={71 + i * 98} y={74} s={22} w={900} c={kind === 'DASH' ? 'ink' : 'bg'} a="middle">{rate}</T>
          <T x={71 + i * 98} y={124} s={11} c="muted" a="middle">［税込］</T>
        </g>
      ))}
    </>
  ),
  'shuzei-kaisei': (
    <>
      {[
        ['ビール', '−9.10円', 'ink', 'M300 34 l-8 10 h16 Z'],
        ['発泡酒・第三のビール', '+7.26円', 'mark', ''],
        ['チューハイ等', '+7.00円', 'mark', ''],
      ].map(([name, diff, tone], i) => (
        <g key={name}>
          <rect x="24" y={24 + i * 36} width="292" height="28" rx="6" {...TINT} />
          <T x={36} y={43 + i * 36} s={12}>{name}</T>
          <T x={304} y={43 + i * 36} s={13} w={700} c={tone as Tone} a="end">{diff}</T>
        </g>
      ))}
      <T x={24} y={136} s={10} c="muted">350mlあたり（2026年10月から）</T>
    </>
  ),
  'nenshu-kabe': (
    <>
      <path d="M24 90 H316" stroke="var(--text)" strokeWidth={3} strokeLinecap="round" />
      <rect x="24" y="84" width="160" height="12" rx="6" {...MID} />
      <path d="M104 70 V110 M146 70 V110 M262 70 V110" {...LINE} strokeWidth={4} />
      <T x={104} y={62} s={12} w={700} c="ink" a="middle">119万</T>
      <T x={146} y={62} s={12} w={700} c="ink" a="middle">130万</T>
      <T x={262} y={62} s={12} w={700} c="ink" a="middle">178万</T>
      <rect x="152" y="20" width="64" height="22" rx="11" {...MARK} />
      <T x={184} y={36} s={11} w={700} c="bg" a="middle">あなた</T>
      <path d="M184 42 v40" style={{ stroke: 'var(--cat-mark)' }} strokeWidth={2.5} strokeDasharray="4 4" />
      <T x={24} y={130} s={11} c="muted">次の壁まで ［あと◯万円］</T>
    </>
  ),
  'invoice-nozeigaku': (
    <>
      {[
        ['3割特例', 64, false],
        ['簡易課税', 46, true],
        ['本則課税', 82, false],
      ].map(([name, h, best], i) => (
        <g key={name as string}>
          <rect x={40 + i * 96} y={112 - (h as number)} width="64" height={h as number} rx="4" {...(best ? INK : TINT)} />
          <T x={72 + i * 96} y={130} s={11} c="muted" a="middle">{name}</T>
          {best ? (
            <T x={72 + i * 96} y={112 - (h as number) - 8} s={12} w={700} c="mark" a="middle">いちばん安い</T>
          ) : null}
        </g>
      ))}
    </>
  ),
  'tedori-keisan': (
    <>
      <circle cx="84" cy="75" r="40" fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={20} />
      <Ring cx={84} cy={75} r={40} w={20} from={0} len={0.74} tone="ink" />
      <Ring cx={84} cy={75} r={40} w={20} from={0.74} len={0.12} tone="mark" />
      <T x={84} y={80} s={12} w={700} c="ink" a="middle">手取り</T>
      <rect x="160" y="40" width="12" height="12" rx="3" {...INK} />
      <T x={180} y={50} s={12}>手取り</T>
      <rect x="160" y="66" width="12" height="12" rx="3" {...TINT} />
      <T x={180} y={76} s={12}>社会保険料</T>
      <rect x="160" y="92" width="12" height="12" rx="3" {...MARK} />
      <T x={180} y={102} s={12}>所得税・住民税</T>
    </>
  ),
  'shoyo-tedori': (
    <>
      <rect x="30" y="28" width="56" height="84" rx="4" {...TINT} />
      <rect x="104" y="28" width="56" height="14" rx="3" {...MID} />
      <rect x="178" y="42" width="56" height="8" rx="2" {...MARK} />
      <rect x="252" y="50" width="56" height="62" rx="4" {...INK} />
      <path d="M86 28 h18 M160 42 h18 M234 50 h18" stroke="currentColor" strokeWidth={1.5} strokeDasharray="3 3" />
      {['額面', '社会保険料', '所得税', '手取り'].map((s, i) => (
        <T key={s} x={58 + i * 74} y={130} s={11} c="muted" a="middle">{s}</T>
      ))}
    </>
  ),
  hatarakizon: (
    <>
      <path d="M24 116 H316 M24 116 V24" stroke="var(--muted)" strokeWidth={1.5} />
      <rect x="132" y="24" width="70" height="92" {...MARK} fillOpacity={0.15} />
      <path d="M28 104 L132 64 L140 86 L202 64 L304 30" {...LINE} />
      <circle cx="202" cy="64" r="5" {...INK} />
      <T x={167} y={40} s={11} w={700} c="mark" a="middle">働き損</T>
      <T x={210} y={84} s={11} c="muted">損益分岐点</T>
      <T x={300} y={132} s={10} c="muted" a="end">年収</T>
    </>
  ),
  'shitsugyo-hoken': (
    <>
      <T x={24} y={36} s={10} c="muted">待期</T>
      <T x={66} y={36} s={10} c="muted">給付制限</T>
      <T x={150} y={36} s={10} c="muted">支給される期間</T>
      <rect x="24" y="44" width="38" height="20" rx="4" {...TINT} />
      <rect x="66" y="44" width="80" height="20" rx="4" {...MID} />
      <rect x="150" y="44" width="166" height="20" rx="4" {...INK} />
      <T x={150} y={90} s={13} w={700} c="ink">［◯月◯日］から</T>
      <T x={24} y={124} s={12}>日額 ［◯円］ × ［◯］日分</T>
    </>
  ),
  'ikuji-kyugyo-kyufu': (
    <>
      {[76, 62, 62, 62, 44].map((h, i) => (
        <rect key={i} x={30 + i * 58} y={116 - h} width="48" height={h} rx="4" {...(i === 0 ? INK : i === 4 ? TINT : MID)} />
      ))}
      <T x={54} y={34} s={13} w={700} c="ink" a="middle">80%</T>
      <T x={170} y={48} s={13} w={700} c="ink" a="middle">67%</T>
      <T x={286} y={66} s={13} w={700} c="ink" a="middle">50%</T>
      <T x={54} y={134} s={10} c="muted" a="middle">最初の28日</T>
      <T x={286} y={134} s={10} c="muted" a="middle">181日目から</T>
    </>
  ),
  'taishokukin-tedori': (
    <>
      <T x={24} y={34} s={11} c="muted">退職金</T>
      <rect x="24" y="40" width="292" height="16" rx="4" {...TINT} />
      <T x={24} y={74} s={11} c="muted">退職所得控除</T>
      <rect x="24" y="80" width="210" height="16" rx="4" {...MID} />
      <rect x="236" y="80" width="80" height="16" rx="4" {...MARK} />
      <T x={276} y={74} s={11} w={700} c="mark" a="middle">課税（1/2）</T>
      <T x={24} y={126} s={12}>手取り ［◯円］</T>
    </>
  ),
  'shobyo-teate': (
    <>
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={24 + i * 29} y="48" width="24" height="30" rx="4" {...(i < 3 ? TINT : INK)} />
      ))}
      <T x={60} y={38} s={11} c="muted" a="middle">待期3日</T>
      <T x={111} y={38} s={11} w={700} c="ink">4日目から支給</T>
      <T x={24} y={112} s={12}>日額 ［◯円］</T>
      <T x={160} y={112} s={12}>合計 ［◯円］</T>
    </>
  ),
  'shussan-teate': (
    <>
      <rect x="24" y="52" width="110" height="26" rx="5" {...MID} />
      <rect x="138" y="52" width="178" height="26" rx="5" {...INK} />
      <path d="M136 36 V96" style={{ stroke: 'var(--cat-mark)' }} strokeWidth={3} />
      <T x={136} y={30} s={11} w={700} c="mark" a="middle">予定日</T>
      <T x={79} y={98} s={11} c="muted" a="middle">産前42日</T>
      <T x={227} y={98} s={11} c="muted" a="middle">産後56日</T>
      <T x={24} y={130} s={12}>日額 ［◯円］ ・ 支給期間を日付で</T>
    </>
  ),
  'kokunen-ikuji-menjo': (
    <>
      {Array.from({ length: 12 }, (_, i) => {
        const row = Math.floor(i / 6);
        const col = i % 6;
        const on = i >= 2 && i <= 9;
        return <rect key={i} x={30 + col * 48} y={28 + row * 40} width="40" height="32" rx="5" {...(on ? INK : TINT)} />;
      })}
      <T x={24} y={130} s={12}>保険料が免除される月 ［◯］か月</T>
    </>
  ),
  'ikuji-jitan-kyufu': (
    <>
      <T x={24} y={48} s={11} c="muted">時短前</T>
      <rect x="84" y="34" width="232" height="20" rx="5" {...TINT} />
      <T x={24} y={92} s={11} c="muted">時短後</T>
      <rect x="84" y="78" width="160" height="20" rx="5" {...INK} />
      <rect x="246" y="78" width="26" height="20" rx="5" {...MARK} />
      <T x={278} y={93} s={12} w={700} c="mark">+10%</T>
      <T x={24} y={130} s={12}>毎月の給付 ［◯円］</T>
    </>
  ),
  'zoyozei-keisan': (
    <>
      <path d="M24 92 H296" {...LINE} strokeWidth={2} />
      <path d="M300 30 V110" style={{ stroke: 'var(--cat-mark)' }} strokeWidth={3} />
      <T x={300} y={24} s={11} w={700} c="mark" a="middle">相続</T>
      {[48, 88, 128].map((x) => (
        <rect key={x} x={x - 9} y="74" width="18" height="18" rx="3" {...TINT} />
      ))}
      {[190, 230, 270].map((x) => (
        <rect key={x} x={x - 9} y="74" width="18" height="18" rx="3" {...INK} />
      ))}
      <path d="M172 62 V54 H292 V62" {...LINE} strokeWidth={2} />
      <T x={232} y={46} s={12} w={700} c="ink" a="middle">足し戻される</T>
      <T x={24} y={126} s={11} c="muted">贈与した年ごとに判定</T>
    </>
  ),
  'jutaku-shutoku-shikin': (
    <>
      <T x={24} y={38} s={11} c="muted">贈与された額</T>
      <rect x="24" y="46" width="292" height="28" rx="5" {...TINT} />
      <rect x="24" y="46" width="200" height="28" rx="5" {...INK} />
      <T x={124} y={65} s={12} w={700} c="bg" a="middle">非課税</T>
      <T x={270} y={65} s={12} w={700} c="mark" a="middle">残り</T>
      <T x={24} y={104} s={11} c="muted">省エネ等住宅は1,000万円・それ以外は500万円まで</T>
      <T x={24} y={128} s={12}>残りの贈与税 ［◯円］</T>
    </>
  ),
  'sozoku-toki-kigen': (
    <>
      <rect x="24" y="22" width="120" height="100" rx="10" {...PANEL} stroke="currentColor" strokeWidth={2.5} />
      <path d="M24 32 a10 10 0 0 1 10 -10 h100 a10 10 0 0 1 10 10 v14 H24 Z" {...INK} />
      <T x={84} y={39} s={12} w={700} c="bg" a="middle">期限</T>
      <T x={84} y={88} s={14} w={900} a="middle">［年月日］</T>
      <T x={166} y={48} s={12} c="muted">のこり</T>
      <T x={166} y={84} s={24} w={900} c="mark">［◯］日</T>
      <rect x="166" y="100" width="150" height="10" rx="5" {...TINT} />
      <rect x="166" y="100" width="96" height="10" rx="5" {...INK} />
    </>
  ),
  'jusho-henko-toki': (
    <>
      <path d="M40 76 H286" {...LINE} />
      <circle cx="40" cy="76" r="8" {...INK} />
      <path d="M296 54 v40 M296 54 h22 l-6 8 6 8 h-22" style={{ stroke: 'var(--cat-mark)', fill: 'var(--cat-mark)' }} strokeWidth={3} strokeLinejoin="round" />
      <T x={160} y={64} s={14} w={700} c="ink" a="middle">2年以内</T>
      <T x={40} y={104} s={11} c="muted" a="middle">変わった日</T>
      <T x={296} y={112} s={11} w={700} c="mark" a="middle">期限</T>
      <T x={24} y={136} s={10} c="muted">2026年4月より前の変更は2028年3月31日まで</T>
    </>
  ),
  'kogaku-ryoyohi': (
    <>
      <rect x="44" y="24" width="70" height="92" rx="4" {...TINT} />
      <T x={79} y={52} s={12} a="middle">医療費</T>
      <rect x="168" y="72" width="70" height="44" rx="4" {...INK} />
      <T x={203} y={99} s={11} w={700} c="bg" a="middle">自己負担</T>
      <path d="M24 72 H316" style={{ stroke: 'var(--cat-mark)' }} strokeWidth={2.5} strokeDasharray="6 5" />
      <T x={316} y={64} s={12} w={700} c="mark" a="end">ここまで</T>
      <T x={24} y={136} s={11} c="muted">1か月の上限 ［◯円］</T>
    </>
  ),
  'iryohi-kojo': (
    <>
      <rect x="24" y="24" width="138" height="84" rx="10" {...PANEL} stroke="currentColor" strokeWidth={3} />
      <T x={93} y={48} s={12} w={700} a="middle">医療費控除</T>
      <T x={93} y={82} s={14} w={900} c="ink" a="middle">［◯円］</T>
      <circle cx="146" cy="30" r="12" {...INK} />
      <path d="M140 30 l4 4 8 -8" fill="none" style={{ stroke: 'var(--tile-bg, var(--accent-soft))' }} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <rect x="178" y="24" width="138" height="84" rx="10" {...TINT} />
      <T x={247} y={48} s={11} w={700} a="middle">セルフメディケーション</T>
      <T x={247} y={82} s={14} w={900} c="muted" a="middle">［◯円］</T>
      <T x={24} y={130} s={11} c="muted">戻る額をくらべて、得なほうに印</T>
    </>
  ),
  'saitei-chingin': (
    <>
      {[220, 204, 190, 182, 170].map((w, i) => (
        <rect key={i} x="24" y={26 + i * 20} width={w} height="10" rx="5" {...(i === 2 ? INK : TINT)} />
      ))}
      <path d="M262 52 c-12 0 -12 18 0 30 c12 -12 12 -30 0 -30 Z" {...MARK} />
      <circle cx="262" cy="62" r="4" {...PANEL} />
      <path d="M220 71 h28" style={{ stroke: 'var(--cat-mark)' }} strokeWidth={2.5} strokeLinecap="round" />
      <T x={24} y={136} s={11} c="muted">都道府県の額と、あなたの時給</T>
    </>
  ),
  'zangyodai-keisan': (
    <>
      <rect x="24" y="52" width="80" height="30" rx="4" {...TINT} />
      <rect x="106" y="52" width="96" height="30" rx="4" {...MID} />
      <rect x="204" y="52" width="70" height="30" rx="4" {...INK} />
      <rect x="276" y="52" width="40" height="30" rx="4" {...MARK} />
      <T x={64} y={44} s={11} c="muted" a="middle">通常</T>
      <T x={154} y={44} s={12} w={700} c="ink" a="middle">×1.25</T>
      <T x={239} y={44} s={12} w={700} c="ink" a="middle">×1.5</T>
      <T x={296} y={44} s={12} w={700} c="mark" a="middle">+0.25</T>
      <T x={154} y={102} s={10} c="muted" a="middle">時間外</T>
      <T x={239} y={102} s={10} c="muted" a="middle">月60時間超</T>
      <T x={296} y={102} s={10} c="muted" a="middle">深夜</T>
      <T x={24} y={134} s={12}>残業代 ［◯円］</T>
    </>
  ),
  'tsukin-teate-hikazei': (
    <>
      <T x={24} y={38} s={12}>片道 ［◯］km</T>
      <rect x="24" y="52" width="230" height="28" rx="5" {...INK} />
      <rect x="256" y="52" width="60" height="28" rx="5" {...MARK} />
      <T x={139} y={71} s={12} w={700} c="bg" a="middle">非課税</T>
      <T x={286} y={100} s={12} w={700} c="mark" a="middle">課税</T>
      <T x={24} y={130} s={11} c="muted">通勤手当のうち、税がかかる分</T>
    </>
  ),
  'jitensha-hansokukin': (
    <>
      {['イヤホン', '傘さし', '歩道通行'].map((s, i) => (
        <g key={s}>
          <rect x="24" y={22 + i * 36} width="292" height="28" rx="6" {...TINT} />
          <T x={36} y={41 + i * 36} s={12}>{s}</T>
          <rect x="200" y={27 + i * 36} width="44" height="18" rx="3" {...INK} />
          <T x={222} y={40 + i * 36} s={10} w={700} c="bg" a="middle">青切符</T>
          <T x={306} y={41 + i * 36} s={12} w={700} c="ink" a="end">［◯円］</T>
        </g>
      ))}
    </>
  ),

  // ---- 生活・健康 ----
  'bosai-bichiku-keisan': (
    <>
      {[
        ['水', 220],
        ['食料', 170],
        ['簡易トイレ', 120],
      ].map(([s, w], i) => (
        <g key={s as string}>
          <T x={24} y={42 + i * 32} s={11} c="muted">{s}</T>
          <rect x="96" y={30 + i * 32} width="220" height="16" rx="8" {...TINT} />
          <rect x="96" y={30 + i * 32} width={w as number} height="16" rx="8" {...INK} />
        </g>
      ))}
      <rect x="24" y="118" width="54" height="22" rx="11" {...INK} />
      <T x={51} y={133} s={11} w={700} c="bg" a="middle">3日分</T>
      <rect x="84" y="118" width="54" height="22" rx="11" {...TINT} />
      <T x={111} y={133} s={11} c="muted" a="middle">7日分</T>
    </>
  ),
  'interval-timer': (
    <>
      <circle cx="70" cy="75" r="40" fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={12} />
      <Ring cx={70} cy={75} r={40} w={12} from={0} len={0.65} tone="ink" />
      <T x={70} y={82} s={18} w={900} c="ink" a="middle">［◯］</T>
      {Array.from({ length: 4 }, (_, i) => (
        <g key={i}>
          <rect x={136 + i * 46} y="56" width="30" height="34" rx="4" {...INK} />
          <rect x={168 + i * 46} y="56" width="12" height="34" rx="3" {...TINT} />
        </g>
      ))}
      <T x={136} y={48} s={11} w={700} c="ink">運動</T>
      <T x={174} y={112} s={11} c="muted" a="middle">休憩</T>
    </>
  ),
  'sleep-cycle': (
    <>
      <path d="M24 92 q22 -44 44 0 t44 0 t44 0 t44 0 t44 0 t44 0" {...LINE} strokeOpacity={0.5} />
      <circle cx="112" cy="92" r="6" {...INK} />
      <circle cx="200" cy="92" r="6" {...INK} />
      <circle cx="288" cy="92" r="8" {...MARK} />
      <T x={112} y={124} s={11} w={700} c="ink" a="middle">［◯:◯］</T>
      <T x={200} y={124} s={11} w={700} c="ink" a="middle">［◯:◯］</T>
      <T x={288} y={124} s={11} w={700} c="mark" a="middle">起床</T>
      <T x={24} y={34} s={11} c="muted">90分の眠りの波</T>
    </>
  ),
  'aircon-denkidai': (
    <>
      <rect x="24" y="26" width="138" height="96" rx="10" {...TINT} />
      <T x={93} y={56} s={12} c="muted" a="middle">1日</T>
      <T x={93} y={94} s={18} w={900} c="ink" a="middle">［◯円］</T>
      <rect x="178" y="26" width="138" height="96" rx="10" {...INK} />
      <T x={247} y={56} s={12} c="bg" a="middle">1か月</T>
      <T x={247} y={94} s={18} w={900} c="bg" a="middle">［◯円］</T>
    </>
  ),
  warikan: (
    <>
      {[
        [62, 'M'],
        [44, 'S'],
        [44, 'S'],
        [30, 'X'],
      ].map(([h, k], i) => (
        <g key={i}>
          <circle cx={56 + i * 76} cy={30} r={10} {...(k === 'M' ? INK : MID)} />
          <rect x={36 + i * 76} y={110 - (h as number)} width="40" height={h as number} rx="4" {...(k === 'M' ? INK : TINT)} />
          <T x={56 + i * 76} y={130} s={11} c="muted" a="middle">［◯円］</T>
        </g>
      ))}
    </>
  ),

  // ---- 計算・変換 ----
  'waribiki-percent': (
    <>
      <path d="M30 34 h130 l28 41 -28 41 h-130 Z" {...TINT} stroke="currentColor" strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx="166" cy="75" r="6" {...PANEL} stroke="currentColor" strokeWidth={2.5} />
      <T x={46} y={66} s={13} c="muted">［元の価格］</T>
      <path d="M44 61 h84" style={{ stroke: 'var(--cat-mark)' }} strokeWidth={2.5} />
      <T x={46} y={98} s={17} w={900} c="ink">［割引後］</T>
      <circle cx="256" cy="66" r="34" {...INK} />
      <T x={256} y={66} s={18} w={900} c="bg" a="middle">30%</T>
      <T x={256} y={84} s={11} w={700} c="bg" a="middle">OFF</T>
    </>
  ),
  'nenrei-keisan': (
    <>
      <T x={24} y={64} s={14} c="muted">満</T>
      <T x={44} y={66} s={28} w={900} c="ink">［◯］</T>
      <T x={112} y={64} s={14} c="muted">歳</T>
      <T x={136} y={66} s={22} w={900} c="ink">［◯］</T>
      <T x={188} y={64} s={14} c="muted">か月</T>
      <rect x="24" y="92" width="130" height="30" rx="15" {...TINT} />
      <T x={89} y={112} s={12} a="middle">西暦［◯］年</T>
      <T x={170} y={112} s={14} w={700} c="ink" a="middle">=</T>
      <rect x="186" y="92" width="130" height="30" rx="15" {...INK} />
      <T x={251} y={112} s={12} w={700} c="bg" a="middle">令和［◯］年</T>
    </>
  ),
  'nissu-keisan': (
    <>
      {Array.from({ length: 15 }, (_, i) => {
        const row = Math.floor(i / 5);
        const col = i % 5;
        const inRange = row === 1 && col >= 1 && col <= 3;
        const edge = row === 1 && (col === 1 || col === 3);
        return (
          <rect key={i} x={24 + col * 34} y={30 + row * 30} width="30" height="26" rx="4" {...(edge ? INK : inRange ? MID : TINT)} />
        );
      })}
      <T x={212} y={74} s={26} w={900} c="ink">［◯］日</T>
      <T x={212} y={100} s={11} c="muted">土日・祝日を除く</T>
    </>
  ),
  'mojisu-count': (
    <>
      {[200, 210, 180, 120].map((w, i) => (
        <rect key={i} x="24" y={32 + i * 22} width={w} height="10" rx="5" {...TINT} />
      ))}
      <rect x="242" y="30" width="74" height="90" rx="10" {...INK} />
      <T x={279} y={72} s={18} w={900} c="bg" a="middle">［◯］</T>
      <T x={279} y={96} s={11} c="bg" a="middle">文字</T>
      <T x={24} y={134} s={11} c="muted">空白・改行あり／なし・原稿用紙</T>
    </>
  ),
  'qr-code': (
    <>
      <rect x="120" y="22" width="100" height="100" rx="8" {...PANEL} />
      {[
        [124, 26],
        [188, 26],
        [124, 90],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="28" height="28" rx="4" {...INK} />
          <rect x={x + 6} y={y + 6} width="16" height="16" rx="2" {...PANEL} />
          <rect x={x + 10} y={y + 10} width="8" height="8" {...INK} />
        </g>
      ))}
      {[
        [160, 28],
        [160, 44],
        [170, 60],
        [128, 64],
        [142, 64],
        [184, 64],
        [200, 72],
        [158, 92],
        [178, 96],
        [198, 100],
        [164, 110],
        [188, 112],
        [206, 112],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="9" height="9" {...INK} />
      ))}
    </>
  ),
  password: (
    <>
      <rect x="24" y="30" width="292" height="40" rx="8" {...PANEL} stroke="currentColor" strokeWidth={2.5} />
      {Array.from({ length: 12 }, (_, i) => (
        <circle key={i} cx={46 + i * 20} cy={50} r={5} {...INK} />
      ))}
      <T x={24} y={104} s={11} c="muted">強さ</T>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={60 + i * 64} y="94" width="58" height="12" rx="6" {...(i < 3 ? INK : TINT)} />
      ))}
      <T x={24} y={134} s={11} c="muted">10件まとめて作成</T>
    </>
  ),
  'hebon-romaji': (
    <>
      <rect x="24" y="40" width="120" height="44" rx="10" {...TINT} />
      <T x={84} y={68} s={15} w={700} a="middle">やまだ はなこ</T>
      <path d="M154 62 h26 m-8 -8 l8 8 -8 8" {...LINE} />
      <rect x="190" y="40" width="126" height="44" rx="10" {...INK} />
      <T x={253} y={68} s={13} w={900} c="bg" a="middle">YAMADA HANAKO</T>
      <T x={24} y={124} s={11} c="muted">パスポートのヘボン式表記</T>
    </>
  ),
  'hankaku-zenkaku': (
    <>
      <rect x="24" y="40" width="120" height="44" rx="10" {...TINT} />
      <T x={84} y={68} s={15} w={700} a="middle">ＡＢＣ１２３</T>
      <path d="M154 54 h26 m-8 -6 l8 6 -8 6 M180 72 h-26 m8 -6 l-8 6 8 6" {...LINE} strokeWidth={2.5} />
      <rect x="190" y="40" width="126" height="44" rx="10" {...INK} />
      <T x={253} y={68} s={15} w={700} c="bg" a="middle">ABC123</T>
      <T x={24} y={124} s={11} c="muted">英数字・カタカナ・記号を選んで</T>
    </>
  ),
  'gazo-resize': (
    <>
      <rect x="24" y="24" width="140" height="98" rx="6" {...TINT} stroke="currentColor" strokeWidth={2} />
      <path d="M36 110 l36 -40 26 28 18 -16 36 28 Z" {...MID} />
      <circle cx="132" cy="48" r="10" {...MID} />
      <path d="M178 74 h28 m-8 -8 l8 8 -8 8" {...LINE} />
      <rect x="220" y="46" width="70" height="50" rx="5" {...INK} />
      <T x={255} y={118} s={13} w={700} c="ink" a="middle">［◯］KB</T>
    </>
  ),
  'tsubo-heibei': (
    <>
      <rect x="24" y="24" width="96" height="96" rx="3" {...TINT} stroke="currentColor" strokeWidth={2} />
      <rect x="24" y="24" width="64" height="32" {...MID} />
      <rect x="88" y="24" width="32" height="64" {...TINT} stroke="currentColor" strokeWidth={1.5} />
      <rect x="56" y="88" width="64" height="32" {...MID} />
      <rect x="24" y="56" width="32" height="64" {...TINT} stroke="currentColor" strokeWidth={1.5} />
      <rect x="56" y="56" width="32" height="32" {...INK} />
      <T x={142} y={56} s={16} w={900} c="ink">［◯］坪</T>
      <T x={142} y={84} s={16} w={900} c="ink">［◯］㎡</T>
      <T x={142} y={112} s={16} w={900} c="ink">［◯］畳</T>
    </>
  ),
  'aspect-ratio': (
    <>
      <rect x="24" y="30" width="160" height="90" rx="6" {...INK} />
      <T x={104} y={82} s={22} w={900} c="bg" a="middle">16:9</T>
      <rect x="206" y="44" width="90" height="62" rx="5" {...TINT} stroke="currentColor" strokeWidth={2} strokeDasharray="5 4" />
      <T x={251} y={80} s={12} w={700} c="ink" a="middle">［幅×高さ］</T>
      <T x={24} y={140} s={10} c="muted">縦横比とリサイズ後のサイズ</T>
    </>
  ),
};

export const TOOL_PREVIEW_SLUGS: readonly string[] = Object.keys(PREVIEW);

/**
 * 一覧カードの「結果の形」の絵。地と紙面の2枚を敷いてから中身を描く。
 * 絵の無い slug は null（呼ぶ側は従来の ToolArt に戻す）
 */
export default function ToolPreview({ slug }: { slug: string }) {
  const art = PREVIEW[slug];
  if (!art) return null;
  return (
    <svg viewBox="0 0 340 150" aria-hidden="true" focusable="false" style={{ display: 'block', width: '100%', height: 'auto' }}>
      <rect width="340" height="150" {...BG} />
      <rect x="10" y="10" width="320" height="130" rx="10" {...PANEL} />
      {art}
    </svg>
  );
}
