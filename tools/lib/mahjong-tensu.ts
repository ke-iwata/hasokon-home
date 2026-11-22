/**
 * 麻雀の点数計算（符計算・点数早見表）
 *
 * 仕様: docs/features/mahjong-tensu-keisan.md
 *
 * - 点数の数え方（符・翻・満貫の区切り）は**ルール**であって、制度の改定は無い。
 *   ルールの差（切り上げ満貫・連風牌の符・数え役満・ダブル役満）は `MahjongRules` で切り替える
 * - **点数を円に換算する・精算する機能は持たない**（賭けを助長しない。仕様の「やらないこと」）
 * - 役の自動判定はしない。符は利用者が選んだ形から組み立てる
 *
 * 純関数のみ（DOM/React に依存しない）。
 */

// ---------------------------------------------------------------------------
// ルール
// ---------------------------------------------------------------------------

export interface MahjongRules {
  /** 切り上げ満貫（4翻30符・3翻60符を満貫にする） */
  kiriageMangan: boolean;
  /** 連風牌の雀頭の符（2 か 4） */
  renpuFu: 2 | 4;
  /** 数え役満（13翻以上を役満にする）。false なら三倍満止め */
  kazoeYakuman: boolean;
  /** ダブル役満（役満の倍数）を認める。false なら役満は1倍で止める */
  doubleYakuman: boolean;
}

/** 既定値（一般的なルール） */
export const DEFAULT_RULES: MahjongRules = {
  kiriageMangan: false,
  renpuFu: 2,
  kazoeYakuman: true,
  doubleYakuman: true,
};

/** localStorage に保存されていた値を、壊れていても既定値で埋めて読む */
export function parseRules(raw: unknown): MahjongRules {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_RULES };
  const r = raw as Record<string, unknown>;
  return {
    kiriageMangan: typeof r.kiriageMangan === 'boolean' ? r.kiriageMangan : DEFAULT_RULES.kiriageMangan,
    renpuFu: r.renpuFu === 4 ? 4 : r.renpuFu === 2 ? 2 : DEFAULT_RULES.renpuFu,
    kazoeYakuman: typeof r.kazoeYakuman === 'boolean' ? r.kazoeYakuman : DEFAULT_RULES.kazoeYakuman,
    doubleYakuman: typeof r.doubleYakuman === 'boolean' ? r.doubleYakuman : DEFAULT_RULES.doubleYakuman,
  };
}

// ---------------------------------------------------------------------------
// 点数（符と翻から）
// ---------------------------------------------------------------------------

/** タブ1・早見表で選べる符 */
export const FU_OPTIONS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110] as const;

export type WinType = 'ron' | 'tsumo';

/**
 * 翻の指定。1〜13 は翻数（13 は「13翻以上」）。
 * 役満は翻と別に倍数で持つ（`{ yakuman: 1 }` が役満、2 がダブル役満）。
 */
export type HanSpec = number | { yakuman: number };

export type LimitName = '満貫' | '跳満' | '倍満' | '三倍満' | '数え役満' | '役満' | 'ダブル役満' | 'トリプル役満';

export interface BasePoints {
  /** 基本点（子のロンはこの4倍・親のロンは6倍） */
  base: number;
  /** 満貫以上の名前。満貫未満は null */
  limit: LimitName | null;
}

const MANGAN = 2000;

function yakumanName(multiple: number): LimitName {
  if (multiple >= 3) return 'トリプル役満';
  if (multiple === 2) return 'ダブル役満';
  return '役満';
}

/**
 * 基本点を出す。
 * 基本点 = 符 × 2^(翻 + 2)。2,000 を超えたら満貫（2,000）。
 * 5翻 満貫・6〜7翻 跳満 3,000・8〜10翻 倍満 4,000・11〜12翻 三倍満 6,000・13翻以上 数え役満 8,000。
 */
export function basePoints(fu: number, han: HanSpec, rules: MahjongRules = DEFAULT_RULES): BasePoints {
  if (typeof han === 'object') {
    const multiple = rules.doubleYakuman ? Math.max(1, Math.floor(han.yakuman)) : 1;
    return { base: 8000 * multiple, limit: yakumanName(multiple) };
  }
  if (han >= 13) {
    return rules.kazoeYakuman ? { base: 8000, limit: '数え役満' } : { base: 6000, limit: '三倍満' };
  }
  if (han >= 11) return { base: 6000, limit: '三倍満' };
  if (han >= 8) return { base: 4000, limit: '倍満' };
  if (han >= 6) return { base: 3000, limit: '跳満' };
  if (han === 5) return { base: MANGAN, limit: '満貫' };
  const raw = fu * 2 ** (han + 2);
  if (raw >= MANGAN) return { base: MANGAN, limit: '満貫' };
  if (rules.kiriageMangan && ((han === 4 && fu === 30) || (han === 3 && fu === 60))) {
    return { base: MANGAN, limit: '満貫' };
  }
  return { base: raw, limit: null };
}

/** 100点未満を切り上げる */
export function ceil100(n: number): number {
  return Math.ceil(n / 100) * 100;
}

/**
 * ありえない符と翻の組み合わせなら理由を返す（なければ null）。
 * 符が点数に効かない5翻以上・役満では見ない。
 */
export function impossibleReason(fu: number, han: HanSpec, win: WinType): string | null {
  if (typeof han === 'object' || han >= 5) return null;
  if (fu === 20 && win === 'ron') return '20符のロンはありません（平和のロンは30符です）';
  if (fu === 20 && han === 1) return '20符の1翻はありません（20符は平和ツモで、平和＋門前清自摸和の2翻以上です）';
  if (fu === 25 && han === 1) return '25符の1翻はありません（25符は七対子で、七対子だけで2翻です）';
  if (fu === 25 && han === 2 && win === 'tsumo')
    return '25符2翻のツモはありません（七対子は門前なので、ツモなら門前清自摸和が付いて3翻以上です）';
  return null;
}

export interface ScoreInput {
  dealer: boolean;
  win: WinType;
  fu: number;
  han: HanSpec;
  /** 本場（0〜） */
  honba?: number;
  /** 供託のリーチ棒の本数（0〜） */
  kyotaku?: number;
}

export interface ScoreResult {
  ok: true;
  base: number;
  limit: LimitName | null;
  /** ロンの額（本場・供託を除く） */
  ron?: number;
  /** 子のツモ：子1人の払い（本場を除く） */
  tsumoKo?: number;
  /** ツモ：親の払い（子のツモ）／親のツモでは各自の払い（本場を除く） */
  tsumoOya?: number;
  /** 本場で増える額（あがった人が受け取る合計） */
  honbaBonus: number;
  /** 供託で受け取る額 */
  kyotakuBonus: number;
  /** 本場・供託を除いた額（ツモは3人分の合計） */
  basic: number;
  /** 受け取る合計（本場・供託込み） */
  total: number;
  /** ツモのとき、本場込みの各自の払い（子のツモの子・親／親のツモの各自） */
  payKo?: number;
  payOya?: number;
}

export interface ScoreError {
  ok: false;
  error: string;
}

function nonNegInt(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/** 符と翻から点数を出す */
export function calcScore(input: ScoreInput, rules: MahjongRules = DEFAULT_RULES): ScoreResult | ScoreError {
  const reason = impossibleReason(input.fu, input.han, input.win);
  if (reason) return { ok: false, error: reason };
  const honba = nonNegInt(input.honba);
  const kyotaku = nonNegInt(input.kyotaku);
  const { base, limit } = basePoints(input.fu, input.han, rules);
  const kyotakuBonus = 1000 * kyotaku;

  if (input.win === 'ron') {
    const ron = ceil100(base * (input.dealer ? 6 : 4));
    const honbaBonus = 300 * honba;
    return { ok: true, base, limit, ron, honbaBonus, kyotakuBonus, basic: ron, total: ron + honbaBonus + kyotakuBonus };
  }

  if (input.dealer) {
    const each = ceil100(base * 2);
    const payKo = each + 100 * honba;
    return {
      ok: true,
      base,
      limit,
      tsumoOya: each,
      payKo,
      honbaBonus: 300 * honba,
      kyotakuBonus,
      basic: each * 3,
      total: payKo * 3 + kyotakuBonus,
    };
  }

  const ko = ceil100(base);
  const oya = ceil100(base * 2);
  const payKo = ko + 100 * honba;
  const payOya = oya + 100 * honba;
  return {
    ok: true,
    base,
    limit,
    tsumoKo: ko,
    tsumoOya: oya,
    payKo,
    payOya,
    honbaBonus: 300 * honba,
    kyotakuBonus,
    basic: ko * 2 + oya,
    total: payKo * 2 + payOya + kyotakuBonus,
  };
}

/** 点数を「7,700」の形にする */
export function fmt(n: number): string {
  return n.toLocaleString('ja-JP');
}

/**
 * 結果を卓で読み上げる形にする（本場・供託を除く）。
 * ロン「7,700」・子のツモ「2,000・3,900」・親のツモ「3,900オール」。
 */
export function scoreLabel(r: ScoreResult, dealer: boolean, win: WinType): string {
  if (win === 'ron') return fmt(r.ron!);
  if (dealer) return `${fmt(r.tsumoOya!)}オール`;
  return `${fmt(r.tsumoKo!)}・${fmt(r.tsumoOya!)}`;
}

// ---------------------------------------------------------------------------
// 早見表
// ---------------------------------------------------------------------------

/** 早見表のセル。ありえない組み合わせは null（画面では「—」） */
export function tableCell(
  fu: number,
  han: HanSpec,
  dealer: boolean,
  win: WinType,
  rules: MahjongRules = DEFAULT_RULES,
): string | null {
  const r = calcScore({ dealer, win, fu, han }, rules);
  if (!r.ok) return null;
  return scoreLabel(r, dealer, win);
}

/** 早見表の「満貫以上」の行 */
export function limitRows(rules: MahjongRules = DEFAULT_RULES): { name: string; han: HanSpec }[] {
  const rows: { name: string; han: HanSpec }[] = [
    { name: '満貫（5翻）', han: 5 },
    { name: '跳満（6・7翻）', han: 6 },
    { name: '倍満（8〜10翻）', han: 8 },
    { name: '三倍満（11・12翻）', han: 11 },
  ];
  if (rules.kazoeYakuman) rows.push({ name: '数え役満（13翻以上）', han: 13 });
  rows.push({ name: '役満', han: { yakuman: 1 } });
  if (rules.doubleYakuman) rows.push({ name: 'ダブル役満', han: { yakuman: 2 } });
  return rows;
}

// ---------------------------------------------------------------------------
// 符の組み立て
// ---------------------------------------------------------------------------

export type MeldKind = 'shuntsu' | 'koutsu' | 'kantsu';

export interface Meld {
  kind: MeldKind;
  /** 明（鳴いた）なら true・暗なら false */
  open: boolean;
  /** 么九牌（1・9・字牌）なら true・中張牌（2〜8）なら false */
  yaochu: boolean;
}

/** 雀頭。数牌・客風／役牌（三元牌・場風・自風）／連風牌 */
export type PairKind = 'plain' | 'yakuhai' | 'renpu';

export type WaitKind = 'ryanmen' | 'shanpon' | 'kanchan' | 'penchan' | 'tanki';

export type SpecialForm = 'none' | 'chiitoi' | 'pinfu';

export interface FuInput {
  win: WinType;
  menzen: boolean;
  special: SpecialForm;
  melds: [Meld, Meld, Meld, Meld];
  pair: PairKind;
  wait: WaitKind;
  /** 双碰待ちのロンで完成した刻子の位置（0〜3）。暗刻の行だけが選べる */
  ronCompleted: number | null;
}

export const WAIT_LABELS: Record<WaitKind, string> = {
  ryanmen: '両面',
  shanpon: '双碰',
  kanchan: '嵌張',
  penchan: '辺張',
  tanki: '単騎',
};

export const PAIR_LABELS: Record<PairKind, string> = {
  plain: '数牌・客風',
  yakuhai: '役牌',
  renpu: '連風牌',
};

export const MELD_KIND_LABELS: Record<MeldKind, string> = {
  shuntsu: '順子',
  koutsu: '刻子',
  kantsu: '槓子',
};

const SHUNTSU_CLOSED: Meld = { kind: 'shuntsu', open: false, yaochu: false };

export function defaultFuInput(): FuInput {
  return {
    win: 'ron',
    menzen: true,
    special: 'none',
    melds: [{ ...SHUNTSU_CLOSED }, { ...SHUNTSU_CLOSED }, { ...SHUNTSU_CLOSED }, { ...SHUNTSU_CLOSED }],
    pair: 'plain',
    wait: 'ryanmen',
    ronCompleted: null,
  };
}

/**
 * 特殊形に合わせて入力を固定する（自動判定はしない）。
 * - 平和：門前＝はい・面子4つ＝順子（暗・中張）・待ち＝両面・雀頭＝数牌・客風
 * - 七対子：門前＝はい（面子・雀頭・待ちは使わない）
 */
export function applySpecialForm(input: FuInput): FuInput {
  if (input.special === 'pinfu') {
    return {
      ...input,
      menzen: true,
      melds: [{ ...SHUNTSU_CLOSED }, { ...SHUNTSU_CLOSED }, { ...SHUNTSU_CLOSED }, { ...SHUNTSU_CLOSED }],
      wait: 'ryanmen',
      pair: 'plain',
      ronCompleted: null,
    };
  }
  if (input.special === 'chiitoi') return { ...input, menzen: true, ronCompleted: null };
  return input;
}

/** 双碰待ちのロンで「ロンで完成」を聞くかどうか */
export function asksRonCompleted(input: FuInput): boolean {
  return input.special === 'none' && input.wait === 'shanpon' && input.win === 'ron';
}

/** 「ロンで完成」を選べる面子（暗の刻子）かどうか */
export function canBeRonCompleted(meld: Meld): boolean {
  return meld.kind === 'koutsu' && !meld.open;
}

export interface FuItem {
  label: string;
  fu: number;
}

export interface FuResult {
  ok: true;
  items: FuItem[];
  /** 切り上げ前の合計 */
  raw: number;
  /** 10符単位に切り上げた符（七対子は25のまま） */
  fu: number;
  /** 補足（喰い平和形の30符・ロンで完成した刻子は明刻 など） */
  notes: string[];
}

export interface FuError {
  ok: false;
  error: string;
}

function meldFu(meld: Meld): number {
  if (meld.kind === 'shuntsu') return 0;
  const base = meld.kind === 'koutsu' ? 2 : 8;
  return base * (meld.open ? 1 : 2) * (meld.yaochu ? 2 : 1);
}

function meldLabel(meld: Meld): string {
  const kind = meld.kind === 'koutsu' ? '刻' : '槓';
  return `${meld.open ? '明' : '暗'}${kind} ${meld.yaochu ? '么九' : '中張'}`;
}

/** 選んだ形から符を組み立てる */
export function calcFu(rawInput: FuInput, rules: MahjongRules = DEFAULT_RULES): FuResult | FuError {
  const input = applySpecialForm(rawInput);

  if (input.special === 'chiitoi') {
    return { ok: true, items: [{ label: '七対子', fu: 25 }], raw: 25, fu: 25, notes: ['七対子は25符で固定です（切り上げません）'] };
  }
  if (input.special === 'pinfu') {
    if (input.win === 'tsumo') {
      return { ok: true, items: [{ label: '平和のツモ', fu: 20 }], raw: 20, fu: 20, notes: ['平和のツモは20符で固定です（ツモの2符は付けません）'] };
    }
    return {
      ok: true,
      items: [
        { label: '副底', fu: 20 },
        { label: '門前でロン', fu: 10 },
      ],
      raw: 30,
      fu: 30,
      notes: [],
    };
  }

  const anyOpen = input.melds.some((m) => m.open);
  if (!input.menzen && !anyOpen) return { ok: false, error: '鳴いた面子を1つ以上『明』にしてください' };
  if (input.menzen && anyOpen)
    return { ok: false, error: '門前のときは『明』の面子はありません（鳴いたなら門前を「いいえ」に、暗槓は『暗』にしてください）' };

  const ronCompleted = asksRonCompleted(input) ? input.ronCompleted : null;
  if (asksRonCompleted(input)) {
    if (ronCompleted === null || !input.melds[ronCompleted] || !canBeRonCompleted(input.melds[ronCompleted])) {
      return { ok: false, error: 'どちらの刻子がロンで完成しましたか（『暗』の刻子から「ロンで完成」を選んでください）' };
    }
  }

  const items: FuItem[] = [{ label: '副底', fu: 20 }];
  const notes: string[] = [];
  if (input.menzen && input.win === 'ron') items.push({ label: '門前でロン', fu: 10 });
  if (input.win === 'tsumo') items.push({ label: 'ツモ', fu: 2 });

  input.melds.forEach((m, i) => {
    if (m.kind === 'shuntsu') return;
    const counted = i === ronCompleted ? { ...m, open: true } : m;
    const fu = meldFu(counted);
    const label = i === ronCompleted ? `${meldLabel(counted)}（ロンで完成した刻子）` : meldLabel(counted);
    items.push({ label, fu });
  });
  if (ronCompleted !== null) notes.push('双碰待ちでロンして完成した刻子は、暗刻ではなく明刻として数えます');

  if (input.pair === 'yakuhai') items.push({ label: '雀頭が役牌', fu: 2 });
  if (input.pair === 'renpu') items.push({ label: '雀頭が連風牌', fu: rules.renpuFu });

  if (input.wait === 'kanchan' || input.wait === 'penchan' || input.wait === 'tanki') {
    items.push({ label: `${WAIT_LABELS[input.wait]}待ち`, fu: 2 });
  }

  const raw = items.reduce((s, it) => s + it.fu, 0);
  let fu = Math.ceil(raw / 10) * 10;
  if (!input.menzen && input.win === 'ron' && raw === 20) {
    fu = 30;
    notes.push('鳴いて符が20のままのロン（喰い平和形）は30符にします');
  }
  if (
    input.menzen &&
    input.win === 'tsumo' &&
    raw === 22 &&
    input.wait === 'ryanmen' &&
    input.pair === 'plain' &&
    input.melds.every((m) => m.kind === 'shuntsu')
  ) {
    notes.push('この形は平和です。特殊形で「平和」を選ぶと、ツモは20符になります');
  }
  return { ok: true, items, raw, fu, notes };
}
