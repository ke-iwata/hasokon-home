import type { CSSProperties, ReactNode } from 'react';
import ToolIcon from '@/app/ToolIcon';
import type { ToolCategory } from '@/lib/registry';

/**
 * 一覧カードの絵（60px のタイルに 40px で描く）。
 *
 * **描くのは道具ではなく「使うと出てくるもの」。** 電卓ではなく戻ってくる硬貨、
 * 書類ではなく内訳のドーナツ図。Phosphor の線画は概念を描くので、
 * お金の計算機が24本並ぶと全部「書類と丸」に見えて区別がつかなかった
 * （docs/features/card-illustrations.md）。
 *
 * 色は3つだけ使う。
 * - 線と塗り：`currentColor`（タイルの --tile-ink）
 * - 淡い面：`currentColor` を薄く
 * - 抜き：タイルの地色（--tile-bg）。塗りの上に線を「抜いて」描くときに使う
 *
 * **色は分類を示すだけで、見分けは形が担う。** 色を外しても何のツールか分かる形にする
 * （learn/CLAUDE.md「色だけで区別しない」と同じ約束）。
 *
 * 絵の無い slug は ToolIcon（Phosphor）にフォールバックする。公開前のツールは
 * `public` にするPRで描く（tests/tool-art.test.ts が「公開中は必ず絵がある」を見張る）。
 */

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;
const F = { fill: 'currentColor', fillOpacity: 0.2 } as const;
const SOLID = { fill: 'currentColor' } as const;
/** 抜き（面）。地色の変数が無い所で使われても真っ黒にならないよう、緑の地に落とす */
const CUT = { style: { fill: 'var(--tile-bg, var(--accent-soft))' } } as const;
/** 抜き（線） */
const CUT_S = {
  fill: 'none',
  strokeWidth: 3,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  style: { stroke: 'var(--tile-bg, var(--accent-soft))' },
} as const;

/** 硬貨に「¥」を抜いたもの。お金が手元に来る・戻ることを示す印として共通で使う */
function YenCoin({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const k = r / 11;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} {...SOLID} />
      <path
        d={`M${cx - 4 * k} ${cy - 5 * k}l${4 * k} ${5 * k} ${4 * k} ${-5 * k}M${cx} ${cy}v${6 * k}M${cx - 4 * k} ${cy + 3 * k}h${8 * k}`}
        {...CUT_S}
        strokeWidth={2.6}
      />
    </>
  );
}

const ART: Record<string, ReactNode> = {
  // ---- 決める・選ぶ ----
  roulette: (
    <>
      <circle cx="32" cy="35" r="21" {...F} />
      <path d="M32 35 L32 14 A21 21 0 0 1 50.19 24.5 Z" {...SOLID} />
      <circle cx="32" cy="35" r="21" {...S} />
      <path d="M32 35 L50.19 45.5 M32 35 L13.81 45.5" {...S} />
      <circle cx="32" cy="35" r="3.5" {...SOLID} />
      <path d="M32 4 l5 8 h-10 z" {...SOLID} />
    </>
  ),
  group: (
    <>
      <circle cx="24" cy="12" r="4.5" {...SOLID} />
      <circle cx="32" cy="9" r="4.5" {...SOLID} />
      <circle cx="40" cy="12" r="4.5" {...SOLID} />
      <path d="M32 18v6 M32 24 L18 34 M32 24 L46 34" {...S} />
      <rect x="5" y="36" width="24" height="20" rx="5" {...F} />
      <rect x="5" y="36" width="24" height="20" rx="5" {...S} />
      <rect x="35" y="36" width="24" height="20" rx="5" {...SOLID} />
      <circle cx="13" cy="46" r="3" {...SOLID} />
      <circle cx="21" cy="46" r="3" {...SOLID} />
      <circle cx="43" cy="46" r="3" {...CUT} />
      <circle cx="51" cy="46" r="3" {...CUT} />
    </>
  ),
  dice: (
    <>
      <rect x="7" y="7" width="32" height="32" rx="7" {...F} />
      <rect x="7" y="7" width="32" height="32" rx="7" {...S} />
      <circle cx="16" cy="16" r="3.2" {...SOLID} />
      <circle cx="23" cy="23" r="3.2" {...SOLID} />
      <rect x="29" y="29" width="28" height="28" rx="6" {...SOLID} />
      <circle cx="37" cy="37" r="3" {...CUT} />
      <circle cx="49" cy="37" r="3" {...CUT} />
      <circle cx="37" cy="49" r="3" {...CUT} />
      <circle cx="49" cy="49" r="3" {...CUT} />
    </>
  ),

  // ---- お金・社会保険 ----
  // 給与明細から天引きされる子育ての支援金
  'kosodate-shienkin': (
    <>
      <rect x="8" y="7" width="32" height="42" rx="4" {...F} />
      <rect x="8" y="7" width="32" height="42" rx="4" {...S} />
      <path d="M15 18h18 M15 26h18 M15 34h9" {...S} />
      <circle cx="45" cy="44" r="13" {...SOLID} />
      <circle cx="45" cy="39" r="3.4" {...CUT} />
      <path d="M38.5 52 a6.5 6 0 0 1 13 0 z" {...CUT} />
    </>
  ),
  // 返礼品の箱
  'furusato-nozei': (
    <>
      <path d="M12 26h40v24a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V26z" {...F} />
      <path d="M12 26h40v24a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V26z" {...S} />
      <rect x="8" y="18" width="48" height="10" rx="3" {...SOLID} />
      <path d="M32 18v36" {...CUT_S} />
      <path d="M32 18c-6-9-15-5-12 1 2 4 8 3 12-1zm0 0c6-9 15-5 12 1-2 4-8 3-12-1z" {...SOLID} />
    </>
  ),
  // 給与明細と、戻ってくる硬貨
  'nenmatsu-chosei': (
    <>
      <rect x="8" y="7" width="30" height="42" rx="4" {...F} />
      <rect x="8" y="7" width="30" height="42" rx="4" {...S} />
      <path d="M15 18h16 M15 26h16 M15 34h10" {...S} />
      <path d="M40 16a14 14 0 0 1 12 10" {...S} />
      <path d="M53 20v7h-7" {...S} />
      <YenCoin cx={45} cy={44} r={12} />
    </>
  ),
  // 積み上がった年金が、途中で止まる
  'zaishoku-rorei-nenkin': (
    <>
      <rect x="7" y="44" width="30" height="9" rx="4.5" {...F} />
      <rect x="7" y="44" width="30" height="9" rx="4.5" {...S} />
      <rect x="7" y="33" width="30" height="9" rx="4.5" {...F} />
      <rect x="7" y="33" width="30" height="9" rx="4.5" {...S} />
      <rect x="7" y="22" width="30" height="9" rx="4.5" {...SOLID} />
      <circle cx="47" cy="17" r="12" {...SOLID} />
      <rect x="41.5" y="11" width="4" height="12" rx="1.2" {...CUT} />
      <rect x="48.5" y="11" width="4" height="12" rx="1.2" {...CUT} />
    </>
  ),
  // 積み立ての瓶から芽が出る
  ideco: (
    <>
      <path d="M16 28h32v22a5 5 0 0 1-5 5H21a5 5 0 0 1-5-5V28z" {...F} />
      <path d="M16 28h32v22a5 5 0 0 1-5 5H21a5 5 0 0 1-5-5V28z" {...S} />
      <path d="M12 28h40" {...S} />
      <rect x="22" y="40" width="20" height="6" rx="3" {...SOLID} />
      <path d="M32 28V15" {...S} />
      <path d="M32 16c0-6 6-9 11-7-2 6-6 7-11 7zm0 0c0-6-6-9-11-7 2 6 6 7 11 7z" {...SOLID} />
    </>
  ),
  // 高校の角帽
  'koko-jugyoryo': (
    <>
      <path d="M16 29v11c0 5 7 8 16 8s16-3 16-8V29" {...F} />
      <path d="M16 29v11c0 5 7 8 16 8s16-3 16-8V29" {...S} />
      <path d="M32 11 L58 23 L32 35 L6 23 Z" {...SOLID} />
      <path d="M52 26v15" {...S} />
      <circle cx="52" cy="44" r="3.4" {...SOLID} />
    </>
  ),
  // 親から子へ、毎月の額
  'yoikuhi-keisan': (
    <>
      <circle cx="18" cy="16" r="6" {...SOLID} />
      <path d="M7 46c0-11 5-18 11-18s11 7 11 18z" {...F} />
      <path d="M7 46c0-11 5-18 11-18s11 7 11 18" {...S} />
      <circle cx="42" cy="31" r="4.5" {...SOLID} />
      <path d="M33 52c0-8 4-13 9-13s9 5 9 13z" {...F} />
      <path d="M33 52c0-8 4-13 9-13s9 5 9 13" {...S} />
      <YenCoin cx={46} cy={13} r={9} />
    </>
  ),
  // たばこと、3回の値上げ
  'tabako-zei-neage': (
    <>
      <rect x="5" y="42" width="34" height="10" rx="2.5" {...F} />
      <rect x="5" y="42" width="34" height="10" rx="2.5" {...S} />
      <rect x="5" y="42" width="11" height="10" rx="2.5" {...SOLID} />
      <path d="M36 36c0-4 4-4 4-8s-4-4-4-8" {...S} strokeOpacity={0.5} />
      <rect x="44" y="40" width="4.5" height="12" rx="1.2" {...SOLID} />
      <rect x="50" y="32" width="4.5" height="20" rx="1.2" {...SOLID} />
      <rect x="56" y="24" width="4.5" height="28" rx="1.2" {...SOLID} />
      <path d="M44 22 L54 12 M48 11h7v7" {...S} />
    </>
  ),
  // 買い物かご
  'shohizei-keisan': (
    <>
      <path d="M16 20h38l-6 18H20z" {...F} />
      <path d="M5 11h7l7 27h29l6-18H16" {...S} />
      <circle cx="23" cy="48" r="4.5" {...SOLID} />
      <circle cx="44" cy="48" r="4.5" {...SOLID} />
      <path d="M27 29h16" {...S} />
    </>
  ),
  // ビールのジョッキ
  'shuzei-kaisei': (
    <>
      <rect x="12" y="20" width="28" height="34" rx="4" {...F} />
      <rect x="12" y="20" width="28" height="34" rx="4" {...S} />
      <path d="M40 27h6a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5h-6" {...S} />
      <path d="M10 22c0-5 4-8 8-7 2-4 8-5 11-1 3-3 9-1 10 4 3 0 5 2 5 4z" {...SOLID} />
      <path d="M21 31v15 M31 31v15" {...S} strokeOpacity={0.5} />
    </>
  ),
  // 超えると手取りが変わる壁
  'nenshu-kabe': (
    <>
      <rect x="8" y="18" width="48" height="36" rx="2" {...F} />
      <path
        d="M8 30h48 M8 42h48 M22 18v12 M42 18v12 M32 30v12 M16 30v12 M48 30v12 M22 42v12 M42 42v12"
        {...S}
        strokeWidth={2.4}
        strokeOpacity={0.55}
      />
      <rect x="8" y="18" width="48" height="36" rx="2" {...S} />
      <rect x="5" y="11" width="54" height="7" rx="2.5" {...SOLID} />
    </>
  ),
  // 3つの方式を並べて、いちばん安い1本
  'invoice-nozeigaku': (
    <>
      <rect x="7" y="7" width="28" height="38" rx="4" {...F} />
      <rect x="7" y="7" width="28" height="38" rx="4" {...S} />
      <path d="M13 17h16 M13 25h11" {...S} />
      <rect x="36" y="34" width="6" height="20" rx="1.5" {...F} />
      <rect x="36" y="34" width="6" height="20" rx="1.5" {...S} strokeWidth={2.4} />
      <rect x="45" y="44" width="6" height="10" rx="1.5" {...SOLID} />
      <rect x="54" y="28" width="6" height="26" rx="1.5" {...F} />
      <rect x="54" y="28" width="6" height="26" rx="1.5" {...S} strokeWidth={2.4} />
    </>
  ),
  // 手取りと天引きの内訳（ドーナツ）
  'tedori-keisan': (
    <>
      <circle cx="32" cy="32" r="20" fill="none" stroke="currentColor" strokeOpacity={0.24} strokeWidth={12} />
      <path d="M32 12 A20 20 0 1 1 12.98 38.18" fill="none" stroke="currentColor" strokeWidth={12} />
      <circle cx="32" cy="32" r="4" {...SOLID} />
    </>
  ),
  // 損と得の天秤
  hatarakizon: (
    <>
      <path d="M32 12v38 M20 54h24" {...S} />
      <path d="M11 25 L53 15" {...S} />
      <circle cx="32" cy="12" r="3.4" {...SOLID} />
      <path d="M11 25 L5 39 M11 25 L17 39" {...S} strokeWidth={2.4} />
      <path d="M3 39h16a8 6 0 0 1-16 0z" {...SOLID} />
      <path d="M53 15 L47 29 M53 15 L59 29" {...S} strokeWidth={2.4} />
      <path d="M45 29h16a8 6 0 0 1-16 0z" {...F} />
      <path d="M45 29h16a8 6 0 0 1-16 0z" {...S} strokeWidth={2.4} />
    </>
  ),
  // 雨の日の傘（失業のときの保険）
  'shitsugyo-hoken': (
    <>
      <path d="M6 30a26 22 0 0 1 52 0z" {...F} />
      <path d="M6 30a26 22 0 0 1 52 0" {...S} />
      <path d="M6 30c4.3-4 8.7-4 13 0 4.3-4 8.7-4 13 0 4.3-4 8.7-4 13 0 4.3-4 8.7-4 13 0" {...S} />
      <path d="M32 8v-3" {...S} />
      <path d="M32 30v17a5 5 0 0 1-10 0" {...S} />
      <YenCoin cx={48} cy={48} r={9} />
    </>
  ),
  // ベビーカー
  'ikuji-kyugyo-kyufu': (
    <>
      <path d="M13 28a19 19 0 0 1 19-19v19z" {...SOLID} />
      <path d="M13 28h33c0 9-7 15-16.5 15S13 37 13 28z" {...F} />
      <path d="M13 28h33c0 9-7 15-16.5 15S13 37 13 28z" {...S} />
      <path d="M46 28l6-13h5" {...S} />
      <circle cx="20" cy="51" r="5" {...S} />
      <circle cx="41" cy="51" r="5" {...S} />
    </>
  ),
  // 退職の日の鞄と、手元に残る額
  'taishokukin-tedori': (
    <>
      <rect x="6" y="20" width="38" height="30" rx="5" {...F} />
      <rect x="6" y="20" width="38" height="30" rx="5" {...S} />
      <path d="M18 20v-5a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v5 M6 32h38" {...S} />
      <YenCoin cx={47} cy={46} r={11} />
    </>
  ),
  // 休んでいるベッドと、医療の十字
  'shobyo-teate': (
    <>
      <rect x="6" y="34" width="52" height="10" rx="3" {...F} />
      <path d="M6 20v34 M58 36v18 M6 44h52" {...S} />
      <rect x="6" y="34" width="52" height="10" rx="3" {...S} />
      <rect x="10" y="26" width="15" height="9" rx="3.5" {...SOLID} />
      <path d="M46 8v18 M37 17h18" {...S} strokeWidth={5.5} />
    </>
  ),
  // 予定日から日付で出る
  'shussan-teate': (
    <>
      <rect x="7" y="12" width="42" height="38" rx="5" {...F} />
      <path d="M7 22v-5a5 5 0 0 1 5-5h32a5 5 0 0 1 5 5v5z" {...SOLID} />
      <rect x="7" y="12" width="42" height="38" rx="5" {...S} />
      <path d="M17 7v9 M39 7v9" {...S} />
      <path d="M47 59 l-11-10.5 a6.5 6.5 0 0 1 11-7 a6.5 6.5 0 0 1 11 7z" {...SOLID} />
    </>
  ),
  // 上限で頭打ちになる医療費
  'kogaku-ryoyohi': (
    <>
      <rect x="5" y="15" width="40" height="5" rx="2" {...SOLID} />
      <rect x="7" y="38" width="8" height="16" rx="1.5" {...F} />
      <rect x="7" y="38" width="8" height="16" rx="1.5" {...S} strokeWidth={2.4} />
      <rect x="19" y="28" width="8" height="26" rx="1.5" {...F} />
      <rect x="19" y="28" width="8" height="26" rx="1.5" {...S} strokeWidth={2.4} />
      <rect x="31" y="23" width="8" height="31" rx="1.5" {...F} />
      <rect x="31" y="23" width="8" height="31" rx="1.5" {...S} strokeWidth={2.4} />
      <circle cx="49" cy="44" r="11" {...SOLID} />
      <path d="M49 38v12 M43 44h12" {...CUT_S} strokeWidth={3.4} />
    </>
  ),
  // 薬と、戻ってくる硬貨
  'iryohi-kojo': (
    <>
      <g transform="rotate(-35 25 26)">
        <rect x="9" y="18" width="32" height="16" rx="8" {...F} />
        <path d="M25 18h-8a8 8 0 0 0 0 16h8z" {...SOLID} />
        <rect x="9" y="18" width="32" height="16" rx="8" {...S} />
      </g>
      <YenCoin cx={46} cy={46} r={12} />
    </>
  ),
  // 都道府県ごとの額（地図のピン）
  'saitei-chingin': (
    <>
      <path d="M32 58s-18-16-18-30a18 18 0 0 1 36 0c0 14-18 30-18 30z" {...F} />
      <path d="M32 58s-18-16-18-30a18 18 0 0 1 36 0c0 14-18 30-18 30z" {...S} />
      <YenCoin cx={32} cy={28} r={11} />
    </>
  ),
  // 時計と、割増の「＋」
  'zangyodai-keisan': (
    <>
      <circle cx="28" cy="35" r="21" {...F} />
      <circle cx="28" cy="35" r="21" {...S} />
      <path d="M28 23v12l8 5" {...S} strokeWidth={3.4} />
      <circle cx="48" cy="15" r="11" {...SOLID} />
      <path d="M48 9v12 M42 15h12" {...CUT_S} strokeWidth={3.4} />
    </>
  ),
  // 自転車と青切符
  'jitensha-hansokukin': (
    <>
      <circle cx="15" cy="44" r="10" {...F} />
      <circle cx="15" cy="44" r="10" {...S} />
      <circle cx="49" cy="44" r="10" {...F} />
      <circle cx="49" cy="44" r="10" {...S} />
      <path d="M15 44 L25 28 L30 44 Z M25 28 H43 L30 44 M43 28 L49 44 M43 28 l-2-6 h6 M22 28 h7" {...S} />
      <rect x="5" y="5" width="24" height="14" rx="2.5" {...SOLID} />
      <path d="M10 12h14" {...CUT_S} strokeWidth={2.6} />
    </>
  ),

  // ---- 生活・健康 ----
  // 水と缶詰
  'bosai-bichiku-keisan': (
    <>
      <path d="M23 11h9v6l4 5v31a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4V22l4-5z" {...F} />
      <path d="M23 11h9v6l4 5v31a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4V22l4-5z" {...S} />
      <rect x="22" y="5" width="11" height="6" rx="1.8" {...SOLID} />
      <rect x="19" y="31" width="17" height="10" {...SOLID} />
      <rect x="41" y="29" width="17" height="28" rx="3" {...F} />
      <rect x="41" y="29" width="17" height="28" rx="3" {...S} />
      <path d="M41 35h17 M41 51h17" {...S} />
    </>
  ),
  'interval-timer': (
    <>
      <circle cx="32" cy="37" r="20" {...F} />
      <circle cx="32" cy="37" r="20" {...S} />
      <path d="M32 37 L32 17 A20 20 0 0 1 49.3 27 Z" {...SOLID} />
      <path d="M32 26v11h9" {...S} strokeWidth={3.4} />
      <rect x="26" y="5" width="12" height="7" rx="2.5" {...SOLID} />
      <path d="M32 12v5 M49 20l4-4" {...S} strokeWidth={3.4} />
    </>
  ),
  'sleep-cycle': (
    <>
      <path d="M42 8a22 22 0 1 0 14 34A24 24 0 0 1 42 8z" {...SOLID} />
      <path d="M6 54c4.5-5 8.5-5 13 0s8.5 5 13 0 8.5-5 13 0 8.5 5 13 0" {...S} strokeOpacity={0.55} />
      <circle cx="16" cy="14" r="2.6" {...SOLID} fillOpacity={0.6} />
      <circle cx="24" cy="24" r="1.8" {...SOLID} fillOpacity={0.45} />
    </>
  ),
  // エアコンと電気
  'aircon-denkidai': (
    <>
      <rect x="6" y="10" width="52" height="22" rx="5" {...F} />
      <rect x="6" y="10" width="52" height="22" rx="5" {...S} />
      <path d="M13 25h38" {...S} />
      <path d="M35 36l-9 12h10l-5 12 13-15h-10l6-9z" {...SOLID} />
      <path d="M15 38c0 4 2 7 2 7 M23 38c0 4 2 7 2 7" {...S} strokeOpacity={0.5} />
    </>
  ),
  // 1つを3人で分ける（1切れを取り出した円）。
  // 伝票を縦に3分割した初版は、そろばんに見えた（実測のスクリーンショットで判断）
  warikan: (
    <>
      <path d="M30 35 L47.32 45 A20 20 0 0 1 12.68 45 Z" {...F} />
      <path d="M30 35 L47.32 45 A20 20 0 0 1 12.68 45 Z" {...S} />
      <path d="M30 35 L12.68 45 A20 20 0 0 1 30 15 Z" {...F} />
      <path d="M30 35 L12.68 45 A20 20 0 0 1 30 15 Z" {...S} />
      <path d="M35 30 L35 10 A20 20 0 0 1 52.32 40 Z" {...SOLID} />
    </>
  ),

  // ---- 計算・変換 ----
  // 値札と割合
  'waribiki-percent': (
    <>
      <path d="M34 9H14a5 5 0 0 0-5 5v20l23 23 23-23z" {...F} />
      <path d="M34 9H14a5 5 0 0 0-5 5v20l23 23 23-23z" {...S} />
      <circle cx="21" cy="21" r="4" {...SOLID} />
      <path d="M28 41 L43 26" {...S} strokeWidth={3.4} />
      <circle cx="29" cy="28" r="3.6" {...S} strokeWidth={2.6} />
      <circle cx="42" cy="40" r="3.6" {...S} strokeWidth={2.6} />
    </>
  ),
  // 誕生日のケーキ
  'nenrei-keisan': (
    <>
      <rect x="10" y="32" width="44" height="20" rx="4" {...F} />
      <rect x="10" y="32" width="44" height="20" rx="4" {...S} />
      <path d="M10 39c3.7 4 7.3 4 11 0s7.3-4 11 0 7.3 4 11 0 7.3-4 11 0" {...S} />
      <path d="M6 57h52" {...S} />
      <rect x="20" y="20" width="4.5" height="12" rx="1.2" {...SOLID} />
      <rect x="30" y="20" width="4.5" height="12" rx="1.2" {...SOLID} />
      <rect x="40" y="20" width="4.5" height="12" rx="1.2" {...SOLID} />
      <ellipse cx="22.2" cy="14" rx="2.4" ry="3.6" {...SOLID} />
      <ellipse cx="32.2" cy="14" rx="2.4" ry="3.6" {...SOLID} />
      <ellipse cx="42.2" cy="14" rx="2.4" ry="3.6" {...SOLID} />
    </>
  ),
  // 2つの日付のあいだ
  'nissu-keisan': (
    <>
      <rect x="7" y="12" width="50" height="44" rx="5" {...F} />
      <path d="M7 23v-6a5 5 0 0 1 5-5h40a5 5 0 0 1 5 5v6z" {...SOLID} />
      <rect x="7" y="12" width="50" height="44" rx="5" {...S} />
      <path d="M19 7v9 M45 7v9" {...S} />
      <path d="M18 34 L46 46" {...S} strokeDasharray="3 4" />
      <circle cx="18" cy="34" r="5.5" {...SOLID} />
      <circle cx="46" cy="46" r="5.5" {...SOLID} />
      <circle cx="32" cy="34" r="2" {...SOLID} fillOpacity={0.45} />
      <circle cx="18" cy="46" r="2" {...SOLID} fillOpacity={0.45} />
      <circle cx="46" cy="34" r="2" {...SOLID} fillOpacity={0.45} />
    </>
  ),
  // 文章と、数えた結果
  'mojisu-count': (
    <>
      <rect x="7" y="9" width="34" height="42" rx="4" {...F} />
      <rect x="7" y="9" width="34" height="42" rx="4" {...S} />
      <path d="M14 20h20 M14 28h20 M14 36h12" {...S} />
      <rect x="32" y="36" width="26" height="18" rx="6" {...SOLID} />
      <path d="M38 45h14" {...CUT_S} />
    </>
  ),
  'qr-code': (
    <>
      <rect x="8" y="8" width="19" height="19" rx="3" {...S} strokeWidth={3.4} />
      <rect x="37" y="8" width="19" height="19" rx="3" {...S} strokeWidth={3.4} />
      <rect x="8" y="37" width="19" height="19" rx="3" {...S} strokeWidth={3.4} />
      <rect x="14" y="14" width="7" height="7" {...SOLID} />
      <rect x="43" y="14" width="7" height="7" {...SOLID} />
      <rect x="14" y="43" width="7" height="7" {...SOLID} />
      <rect x="37" y="37" width="7" height="7" {...SOLID} />
      <rect x="49" y="49" width="7" height="7" {...SOLID} />
      <rect x="37" y="49" width="7" height="7" {...SOLID} fillOpacity={0.45} />
      <rect x="49" y="37" width="7" height="7" {...SOLID} fillOpacity={0.45} />
    </>
  ),
  // 鍵と伏せ字
  password: (
    <>
      <path d="M20 29v-8a12 12 0 0 1 24 0v8" {...S} strokeWidth={4} />
      <rect x="10" y="29" width="44" height="28" rx="6" {...SOLID} />
      <path
        d="M22 38v8 M18.5 40l7 4 M25.5 40l-7 4 M32 38v8 M28.5 40l7 4 M35.5 40l-7 4 M42 38v8 M38.5 40l7 4 M45.5 40l-7 4"
        {...CUT_S}
        strokeWidth={2.4}
      />
    </>
  ),
  // パスポート
  'hebon-romaji': (
    <>
      <rect x="12" y="6" width="40" height="52" rx="4" {...SOLID} />
      <circle cx="32" cy="27" r="10.5" {...CUT_S} strokeWidth={2.6} />
      <path d="M21.5 27h21 M32 16.5c-4.5 5-4.5 16 0 21 M32 16.5c4.5 5 4.5 16 0 21" {...CUT_S} strokeWidth={2.2} />
      <path d="M22 47h20" {...CUT_S} />
    </>
  ),
  // 細い A と、幅のある Ａ
  'hankaku-zenkaku': (
    <>
      <path d="M6 44 L12 22 L18 44 M8.5 36h7" {...S} strokeWidth={3.2} />
      <rect x="27" y="14" width="32" height="38" rx="6" {...SOLID} />
      <path d="M32 44 L43 20 L54 44 M36 36h14" {...CUT_S} strokeWidth={3.4} />
      <path d="M20 54 h8 M25 51 l3 3 -3 3" {...S} />
    </>
  ),
  // 写真の大きさを変える
  'gazo-resize': (
    <>
      <rect x="6" y="6" width="52" height="52" rx="5" {...S} strokeDasharray="4 4" strokeOpacity={0.6} />
      <rect x="11" y="25" width="30" height="28" rx="3" {...F} />
      <rect x="11" y="25" width="30" height="28" rx="3" {...S} />
      <path d="M14 49l7-8 5 5 4-4 8 7" {...S} strokeWidth={2.6} />
      <circle cx="33" cy="33" r="2.8" {...SOLID} />
      <path d="M44 22 L54 12 M46 12h8v8" {...S} strokeWidth={3.4} />
    </>
  ),
  // 四畳半の敷き方（4枚が半畳を囲む）。
  // 縁のある1枚だけの初版は、ノートに見えた（実測のスクリーンショットで判断）
  'tsubo-heibei': (
    <>
      <rect x="8" y="8" width="32" height="16" rx="1.5" {...F} />
      <rect x="40" y="8" width="16" height="32" rx="1.5" {...F} />
      <rect x="24" y="40" width="32" height="16" rx="1.5" {...F} />
      <rect x="8" y="24" width="16" height="32" rx="1.5" {...F} />
      <rect x="24" y="24" width="16" height="16" {...SOLID} />
      {/* 外枠と、畳どうしの境目 */}
      <path d="M8 8h48v48H8z M40 8v32 M8 24h32 M24 24v32 M24 40h32" {...S} strokeWidth={2.6} />
    </>
  ),
  // 縦横の寸法
  'aspect-ratio': (
    <>
      <rect x="7" y="12" width="40" height="24" rx="3" {...F} />
      <rect x="7" y="12" width="40" height="24" rx="3" {...S} />
      <rect x="7" y="12" width="18" height="24" rx="3" {...SOLID} fillOpacity={0.55} />
      <path d="M7 46h40 M7 43v6 M47 43v6" {...S} />
      <path d="M56 12v24 M53 12h6 M53 36h6" {...S} />
    </>
  ),
};

/** 絵のある slug（tests/tool-art.test.ts が、公開中のツールがすべて含まれるかを見る） */
export const TOOL_ART_SLUGS: readonly string[] = Object.keys(ART);

/** 分類ごとの色の名前。globals.css の --cat-{name} / --cat-{name}-bg を指す */
const CATEGORY_TOKEN: Record<ToolCategory, string> = {
  'お金・社会保険': 'money',
  '生活・健康': 'life',
  '計算・変換': 'calc',
  '決める・選ぶ': 'pick',
};

/** 分類の色の名前（tests/tool-art.test.ts が globals.css との対応を見る） */
export function categoryToken(category: ToolCategory): string {
  return CATEGORY_TOKEN[category];
}

/**
 * カードに渡すインラインの style。タイルの地色と線の色が決まる。
 * **クラスではなく変数で渡す**のは、tools/CLAUDE.md の「新しいCSSクラスを増やさない」に合わせるため。
 * 色の値そのものは globals.css のトークンにあり、明暗テーマで切り替わる
 */
export function categoryStyle(category: ToolCategory): CSSProperties {
  const t = CATEGORY_TOKEN[category];
  return { '--tile-ink': `var(--cat-${t})`, '--tile-bg': `var(--cat-${t}-bg)` } as CSSProperties;
}

export default function ToolArt({ slug, icon }: { slug: string; icon: string }) {
  const art = ART[slug];
  // 絵がまだ無いもの（公開前のツール）は、これまでの線画を大きめに出す
  if (!art) return <ToolIcon name={icon} size={34} />;
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {art}
    </svg>
  );
}
