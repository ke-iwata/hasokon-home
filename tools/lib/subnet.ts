/**
 * サブネット計算（CIDR・IPアドレス範囲）のロジック。純関数のみ。
 *
 * 仕様: docs/features/subnet-keisan.md
 *
 * - IPv4 は 32 ビットの**符号なし**整数（number）で扱う。JS のビット演算は符号付き 32 ビット
 *   なので、演算のたびに `>>> 0` で戻す。**プレフィックス長 0 と 32 の境界で落ちやすい**（`1 << 32` は 1 になる）ので、
 *   マスクは `prefixToMask()` の1か所でだけ作る
 * - 件数（アドレス数・分割の個数）は 2^32 まで出るので、ビット演算ではなく `2 ** n` で数える
 * - IPv6 は BigInt で 128 ビット。範囲とアドレス数だけ（予約アドレス・分割はやらない）
 * - 入力はどこにも送らない。共有の URL もボタンを押したときだけ組み立てる
 */

// ───────────────────────────── IPv4 の基本 ─────────────────────────────

/** 2^32（IPv4 のアドレスの総数）。number で正確に表せる */
export const IPV4_SPACE = 2 ** 32;

/** "192.168.10.0" → 3232238080。不正なら null（各オクテット 0〜255、先頭の 0 埋めは 1 桁ぶんまで許さない） */
export function parseIPv4(s: string): number | null {
  const parts = s.trim().split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    // 010 のような先頭0は 8進と読む実装があり意味がぶれるので受け付けない
    if (!/^(0|[1-9]\d{0,2})$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

/** 3232238080 → "192.168.10.0" */
export function formatIPv4(n: number): string {
  const u = n >>> 0;
  return [u >>> 24, (u >>> 16) & 255, (u >>> 8) & 255, u & 255].join('.');
}

/** プレフィックス長 → サブネットマスク（uint32）。/0 は 0、/32 は 0xFFFFFFFF */
export function prefixToMask(prefix: number): number {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new RangeError(`prefix: ${prefix}`);
  // `-1 << 32` は JS では `-1 << 0` と同じになるので /0 を別に扱う
  return prefix === 0 ? 0 : (-1 << (32 - prefix)) >>> 0;
}

/** サブネットマスク → プレフィックス長。1が上から連続していなければ null */
export function maskToPrefix(mask: number): number | null {
  const m = mask >>> 0;
  for (let p = 0; p <= 32; p++) if (prefixToMask(p) === m) return p;
  return null;
}

/** ワイルドカードマスク（0 が上から連続し、そのあと 1 が連続）→ プレフィックス長。読めなければ null */
export function wildcardToPrefix(wildcard: number): number | null {
  return maskToPrefix(~wildcard >>> 0);
}

/** プレフィックス長 → ワイルドカードマスク */
export function prefixToWildcard(prefix: number): number {
  return ~prefixToMask(prefix) >>> 0;
}

/** そのプレフィックスのブロックに含まれるアドレス数（/0 → 2^32、/32 → 1） */
export function addressCount(prefix: number): number {
  return 2 ** (32 - prefix);
}

/**
 * 使えるホスト数（クラウドを選ばないとき）。
 * /31 は RFC 3021 の対向リンクで2個、/32 はホスト1台。**−2 を機械的に当てない**
 */
export function usableHosts(prefix: number): number {
  if (prefix === 32) return 1;
  if (prefix === 31) return 2;
  return addressCount(prefix) - 2;
}

// ───────────────────────────── クラウドの予約 ─────────────────────────────

export type Cloud = 'none' | 'aws' | 'azure' | 'gcp';

export const CLOUDS: Cloud[] = ['none', 'aws', 'azure', 'gcp'];

/** 予約される1個のアドレス（サブネットの先頭からの位置。負なら末尾から） */
export interface ReservedSlot {
  offset: number;
  label: string;
}

export interface CloudRule {
  label: string;
  /** 作れるサブネットの最小のプレフィックス長（＝いちばん大きいサブネット）。決まりが無ければ 0 */
  minPrefix: number;
  /** 作れるサブネットの最大のプレフィックス長（＝いちばん小さいサブネット） */
  maxPrefix: number;
  reserved: ReservedSlot[];
  source: { title: string; url: string };
}

/**
 * 【データ更新箇所】クラウドごとの予約アドレスと作れる大きさ。
 *
 * - AWS: https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html
 *   「Subnet CIDR blocks」。/16〜/28。先頭4つ（ネットワーク・VPC ルーター・DNS・将来用）と末尾1つ（ブロードキャスト）の5個。
 *   .2 は本来「VPC の CIDR の先頭＋2」が Amazon の DNS で、どのサブネットでも先頭＋2 は予約として外される
 * - Azure: https://learn.microsoft.com/ja-jp/azure/virtual-network/virtual-networks-faq
 *   「Azure Virtual Network の FAQ」。最小 /29。.0 ネットワーク・.1 既定のゲートウェイ・.2 と .3 Azure DNS・末尾（ブロードキャスト）の5個
 * - Google Cloud: https://cloud.google.com/vpc/docs/subnets
 *   「Subnets」。最小 /29。ネットワーク・既定のゲートウェイ・末尾から2つ目（将来用）・末尾（ブロードキャスト）の4個
 *
 * Azure・Google Cloud の「いちばん大きいサブネット」は仕様書の範囲外なので見ない（minPrefix: 0）。
 */
export const CLOUD_RULES: Record<Exclude<Cloud, 'none'>, CloudRule> = {
  aws: {
    label: 'AWS',
    minPrefix: 16,
    maxPrefix: 28,
    reserved: [
      { offset: 0, label: 'ネットワークアドレス' },
      { offset: 1, label: 'VPC ルーター' },
      { offset: 2, label: 'DNS（Amazon の DNS 用に予約）' },
      { offset: 3, label: '将来用' },
      { offset: -1, label: 'ブロードキャスト（VPC は非対応のため予約）' },
    ],
    source: { title: 'Amazon VPC ユーザーガイド「Subnet CIDR blocks」', url: 'https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html' },
  },
  azure: {
    label: 'Azure',
    minPrefix: 0,
    maxPrefix: 29,
    reserved: [
      { offset: 0, label: 'ネットワークアドレス' },
      { offset: 1, label: '既定のゲートウェイ' },
      { offset: 2, label: 'Azure DNS' },
      { offset: 3, label: 'Azure DNS' },
      { offset: -1, label: 'ブロードキャスト' },
    ],
    source: { title: 'Microsoft Learn「Azure Virtual Network の FAQ」', url: 'https://learn.microsoft.com/ja-jp/azure/virtual-network/virtual-networks-faq' },
  },
  gcp: {
    label: 'Google Cloud',
    minPrefix: 0,
    maxPrefix: 29,
    reserved: [
      { offset: 0, label: 'ネットワークアドレス' },
      { offset: 1, label: '既定のゲートウェイ' },
      { offset: -2, label: '将来用（Google Cloud が予約）' },
      { offset: -1, label: 'ブロードキャスト' },
    ],
    source: { title: 'Google Cloud「Subnets」', url: 'https://cloud.google.com/vpc/docs/subnets' },
  },
};

export function cloudLabel(cloud: Cloud): string {
  return cloud === 'none' ? 'なし' : CLOUD_RULES[cloud].label;
}

/** そのプレフィックスのサブネットをそのクラウドで作れるか */
export function cloudAllows(cloud: Cloud, prefix: number): boolean {
  if (cloud === 'none') return true;
  const r = CLOUD_RULES[cloud];
  return prefix >= r.minPrefix && prefix <= r.maxPrefix;
}

/** クラウドで実際に使える数。作れない大きさなら null */
export function cloudUsableHosts(cloud: Cloud, prefix: number): number | null {
  if (cloud === 'none') return usableHosts(prefix);
  if (!cloudAllows(cloud, prefix)) return null;
  return addressCount(prefix) - CLOUD_RULES[cloud].reserved.length;
}

/** 予約される具体的なアドレス（ネットワークアドレス network のサブネットで） */
export function reservedAddresses(cloud: Exclude<Cloud, 'none'>, network: number, prefix: number): { address: string; label: string }[] {
  const size = addressCount(prefix);
  return CLOUD_RULES[cloud].reserved.map((r) => ({
    address: formatIPv4(network + (r.offset >= 0 ? r.offset : size + r.offset)),
    label: r.label,
  }));
}

// ───────────────────────────── 特殊用途の判定 ─────────────────────────────

export type AddressKind =
  | 'this-network'
  | 'private'
  | 'cgnat'
  | 'loopback'
  | 'link-local'
  | 'ietf'
  | 'documentation'
  | '6to4-relay'
  | 'benchmark'
  | 'multicast'
  | 'reserved'
  | 'broadcast'
  | 'global';

interface SpecialBlock {
  cidr: string;
  kind: AddressKind;
  label: string;
}

/**
 * 【データ更新箇所】特殊用途のアドレス。RFC 6890（IANA の特殊用途アドレスの登録簿）にもとづく。
 * 狭いブロックを先に並べる必要はない（包含の判定はプレフィックス長で行う）。
 */
export const SPECIAL_BLOCKS: SpecialBlock[] = [
  { cidr: '0.0.0.0/8', kind: 'this-network', label: '「このネットワーク」（RFC 791・RFC 6890）。宛先には使えない' },
  { cidr: '10.0.0.0/8', kind: 'private', label: 'プライベート（RFC 1918）' },
  { cidr: '100.64.0.0/10', kind: 'cgnat', label: 'キャリアグレードNAT用の共有アドレス（RFC 6598）' },
  { cidr: '127.0.0.0/8', kind: 'loopback', label: 'ループバック（自分自身）' },
  { cidr: '169.254.0.0/16', kind: 'link-local', label: 'リンクローカル（RFC 3927。DHCP で取れなかったときの自動割り当てなど）' },
  { cidr: '172.16.0.0/12', kind: 'private', label: 'プライベート（RFC 1918）' },
  { cidr: '192.0.0.0/24', kind: 'ietf', label: 'IETF のプロトコル用（RFC 6890）' },
  { cidr: '192.0.2.0/24', kind: 'documentation', label: 'ドキュメント用 TEST-NET-1（RFC 5737）' },
  { cidr: '192.88.99.0/24', kind: '6to4-relay', label: '6to4 リレー用（廃止。RFC 7526）' },
  { cidr: '192.168.0.0/16', kind: 'private', label: 'プライベート（RFC 1918）' },
  { cidr: '198.18.0.0/15', kind: 'benchmark', label: 'ベンチマーク試験用（RFC 2544）' },
  { cidr: '198.51.100.0/24', kind: 'documentation', label: 'ドキュメント用 TEST-NET-2（RFC 5737）' },
  { cidr: '203.0.113.0/24', kind: 'documentation', label: 'ドキュメント用 TEST-NET-3（RFC 5737）' },
  { cidr: '224.0.0.0/4', kind: 'multicast', label: 'マルチキャスト（RFC 5771）' },
  { cidr: '240.0.0.0/4', kind: 'reserved', label: '将来用の予約（RFC 1112）' },
  { cidr: '255.255.255.255/32', kind: 'broadcast', label: '限定ブロードキャスト（RFC 919）' },
];

const PARSED_BLOCKS = SPECIAL_BLOCKS.map((b) => {
  const [a, p] = b.cidr.split('/');
  return { ...b, network: parseIPv4(a)!, prefix: Number(p) };
});

export interface Classification {
  kind: AddressKind | 'mixed';
  label: string;
  /** インターネットから直接届く（グローバル）か */
  global: boolean;
}

/**
 * 範囲（network/prefix）の種類。1つの特殊ブロックにまるごと入っていればその種類、
 * どれとも重ならなければグローバル、一部だけ重なれば「混在」。
 */
export function classifyRange(network: number, prefix: number): Classification {
  const end = network + addressCount(prefix) - 1;
  // いちばん狭い（プレフィックス長の大きい）ブロックを優先する
  let best: (typeof PARSED_BLOCKS)[number] | null = null;
  let overlaps = false;
  for (const b of PARSED_BLOCKS) {
    const bEnd = b.network + addressCount(b.prefix) - 1;
    if (network >= b.network && end <= bEnd) {
      if (!best || b.prefix > best.prefix) best = b;
    } else if (network <= bEnd && end >= b.network) {
      overlaps = true;
    }
  }
  if (best) return { kind: best.kind, label: best.label, global: false };
  if (overlaps) return { kind: 'mixed', label: 'グローバルと特殊用途のアドレスが混ざった範囲', global: false };
  return { kind: 'global', label: 'グローバル（インターネット上で使われるアドレス）', global: true };
}

/** 1つのアドレスの種類 */
export function classifyIPv4(address: number): Classification {
  return classifyRange(address, 32);
}

// ───────────────────────────── マスクの読み方 ─────────────────────────────

/**
 * ドット区切りの値をマスクとして読んだ結果。
 * 規則（仕様書「マスクとワイルドカードマスクの見分け方」）:
 * 1. まずサブネットマスクとして読む
 * 2. 読めなければワイルドカードマスクとして読む
 * 3. どちらでもなければ不正
 * 両方に読める `0.0.0.0`（/0）と `255.255.255.255`（/32）は、マスクとして読んだうえで `alternative` に
 * ワイルドカードとしての読み（/32・/0）を付ける。
 */
export type MaskReading =
  | { kind: 'mask'; prefix: number; alternative?: number }
  | { kind: 'wildcard'; prefix: number }
  | { kind: 'invalid' };

export function readMask(value: number): MaskReading {
  const asMask = maskToPrefix(value);
  if (asMask !== null) {
    const asWildcard = wildcardToPrefix(value);
    return asWildcard !== null ? { kind: 'mask', prefix: asMask, alternative: asWildcard } : { kind: 'mask', prefix: asMask };
  }
  const asWildcard = wildcardToPrefix(value);
  if (asWildcard !== null) return { kind: 'wildcard', prefix: asWildcard };
  return { kind: 'invalid' };
}

// ───────────────────────────── 入力の解釈 ─────────────────────────────

/** プレフィックス長をどこから読んだか */
export type PrefixSource = 'prefix' | 'mask' | 'wildcard' | 'host';

export type ParsedInput =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | {
      kind: 'v4';
      address: number;
      prefix: number;
      source: PrefixSource;
      /** 両方に読めるマスクのとき、ワイルドカードとして読んだ場合のプレフィックス長 */
      alternative?: number;
    }
  | { kind: 'mask-only'; prefix: number; source: Exclude<PrefixSource, 'host'>; alternative?: number }
  | { kind: 'v6'; address: bigint; prefix: number };

export const INVALID_MASK_MESSAGE = 'マスクとして使えない形です（1 が上から続き、そのあと 0 が続く形だけがサブネットマスクです）';

function parsePrefix(s: string, max: number): number | null {
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n <= max ? n : null;
}

/** 1本の入力欄の文字列を解釈する */
export function parseInput(raw: string): ParsedInput {
  const s = raw.trim().replace(/／/g, '/').replace(/[　\s]+/g, ' ');
  if (s === '') return { kind: 'empty' };

  // `/26` だけ
  if (/^\/\s*\d+$/.test(s)) {
    const p = parsePrefix(s.slice(1).trim(), 32);
    if (p === null) return { kind: 'error', message: 'プレフィックス長は /0〜/32 で入れてください' };
    return { kind: 'mask-only', prefix: p, source: 'prefix' };
  }

  // IPv6（コロンを含む）
  if (s.includes(':')) {
    const [a, p, ...rest] = s.split('/').map((x) => x.trim());
    if (rest.length > 0) return { kind: 'error', message: '「/」は1つだけにしてください' };
    const address = parseIPv6(a);
    if (address === null) return { kind: 'error', message: 'IPv6 アドレスとして読めません（例：2001:db8::/48）' };
    if (p === undefined) return { kind: 'v6', address, prefix: 128 };
    const prefix = parsePrefix(p, 128);
    if (prefix === null) return { kind: 'error', message: 'IPv6 のプレフィックス長は /0〜/128 で入れてください' };
    return { kind: 'v6', address, prefix };
  }

  // アドレスと、プレフィックス長かマスク（空白・スラッシュ区切り）
  const parts = s.split(/\s*\/\s*|\s+/).filter((x) => x !== '');
  if (parts.length > 2) return { kind: 'error', message: '「アドレス/長さ」か「アドレス マスク」の形で入れてください（例：192.168.10.0/26）' };
  const address = parseIPv4(parts[0]);
  if (address === null) return { kind: 'error', message: 'IPv4 アドレスとして読めません（0〜255 の数を「.」で4つ）' };

  if (parts.length === 1) {
    // 単独のドット区切り：マスクとして読めればマスクの換算、そうでなければ1台（/32）のアドレス
    const m = readMask(address);
    if (m.kind === 'mask') return { kind: 'mask-only', prefix: m.prefix, source: 'mask', ...(m.alternative !== undefined ? { alternative: m.alternative } : {}) };
    if (m.kind === 'wildcard') return { kind: 'mask-only', prefix: m.prefix, source: 'wildcard' };
    return { kind: 'v4', address, prefix: 32, source: 'host' };
  }

  const second = parts[1];
  if (/^\d{1,3}$/.test(second)) {
    const prefix = parsePrefix(second, 32);
    if (prefix === null) return { kind: 'error', message: 'プレフィックス長は /0〜/32 で入れてください' };
    return { kind: 'v4', address, prefix, source: 'prefix' };
  }
  const maskValue = parseIPv4(second);
  if (maskValue === null) return { kind: 'error', message: 'マスクは 255.255.255.0 のような形か、/24 のような長さで入れてください' };
  const m = readMask(maskValue);
  if (m.kind === 'invalid') return { kind: 'error', message: INVALID_MASK_MESSAGE };
  if (m.kind === 'wildcard') return { kind: 'v4', address, prefix: m.prefix, source: 'wildcard' };
  return { kind: 'v4', address, prefix: m.prefix, source: 'mask', ...(m.alternative !== undefined ? { alternative: m.alternative } : {}) };
}

/**
 * 読み方の一文（結果の上に出す）。ふつうの読み方（/26・255.255.255.192）なら null。
 */
export function readingNote(p: ParsedInput): string | null {
  if (p.kind !== 'v4' && p.kind !== 'mask-only') return null;
  if (p.source === 'mask' && p.alternative !== undefined) {
    return `サブネットマスクとして読みました（/${p.prefix}）。ワイルドカードマスクのつもりなら /${p.alternative} です`;
  }
  if (p.source === 'wildcard') return `ワイルドカードマスクとして読みました（/${p.prefix} と同じ範囲）`;
  if (p.source === 'host') return 'プレフィックス長が無いので、1台ぶん（/32）として読みました';
  return null;
}

// ───────────────────────────── 範囲の結果（IPv4） ─────────────────────────────

export interface V4Summary {
  network: string;
  broadcast: string;
  /** 使える範囲。/32 は1個だけ、/31 は2個とも */
  firstUsable: string;
  lastUsable: string;
  total: number;
  usable: number;
  /** /31・/32 の特例の注記 */
  specialNote: string | null;
  mask: string;
  wildcard: string;
  prefix: number;
  /** 2進数（オクテットごと）。prefix ビット目までがネットワーク部 */
  binary: string[];
  classification: Classification;
  hex: string;
  integer: number;
  /** 入力がネットワークアドレスでなかったとき、範囲の何番目か（1始まり）。揃っていれば null */
  position: number | null;
  inputAddress: string;
  cloud: Cloud;
  /** クラウドで使える数（作れない大きさなら null） */
  cloudUsable: number | null;
  /** クラウドで作れない大きさのときの説明 */
  cloudNote: string | null;
  cloudReserved: { address: string; label: string }[];
}

export function networkOf(address: number, prefix: number): number {
  return (address & prefixToMask(prefix)) >>> 0;
}

export function summarizeV4(address: number, prefix: number, cloud: Cloud = 'none'): V4Summary {
  const network = networkOf(address, prefix);
  const total = addressCount(prefix);
  const broadcast = network + total - 1;
  let first = network + 1;
  let last = broadcast - 1;
  let specialNote: string | null = null;
  if (prefix === 32) {
    first = last = network;
    specialNote = '1個（ホスト1台。ネットワークアドレス・ブロードキャストの区別はありません）';
  } else if (prefix === 31) {
    first = network;
    last = broadcast;
    specialNote = '2個（RFC 3021 の対向リンク。ブロードキャストはありません）';
  }

  let cloudUsable: number | null = null;
  let cloudNote: string | null = null;
  let cloudReserved: { address: string; label: string }[] = [];
  if (cloud !== 'none') {
    cloudUsable = cloudUsableHosts(cloud, prefix);
    if (cloudUsable === null) {
      cloudNote = cloudRangeNote(cloud);
    } else {
      cloudReserved = reservedAddresses(cloud, network, prefix);
    }
  }

  const bits = network.toString(2).padStart(32, '0');
  return {
    network: formatIPv4(network),
    broadcast: formatIPv4(broadcast),
    firstUsable: formatIPv4(first),
    lastUsable: formatIPv4(last),
    total,
    usable: usableHosts(prefix),
    specialNote,
    mask: formatIPv4(prefixToMask(prefix)),
    wildcard: formatIPv4(prefixToWildcard(prefix)),
    prefix,
    binary: [0, 8, 16, 24].map((i) => bits.slice(i, i + 8)),
    classification: classifyRange(network, prefix),
    hex: '0x' + network.toString(16).toUpperCase().padStart(8, '0'),
    integer: network,
    position: address === network ? null : address - network + 1,
    inputAddress: formatIPv4(address),
    cloud,
    cloudUsable,
    cloudNote,
    cloudReserved,
  };
}

/** 「AWS のサブネットは /16〜/28 です」 */
export function cloudRangeNote(cloud: Exclude<Cloud, 'none'>): string {
  const r = CLOUD_RULES[cloud];
  return r.minPrefix > 0
    ? `${r.label} のサブネットは /${r.minPrefix}〜/${r.maxPrefix} で作ります。この大きさでは作れません`
    : `${r.label} のサブネットは最小 /${r.maxPrefix} です。この大きさでは作れません`;
}

// ───────────────────────────── このIPは入るか ─────────────────────────────

export interface ContainsRow {
  input: string;
  result: 'in' | 'out' | 'invalid';
}

/** 1行1つの IP が範囲（network/prefix）に入るか。空行は飛ばす */
export function checkContains(network: number, prefix: number, text: string): ContainsRow[] {
  const net = networkOf(network, prefix);
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .map((input) => {
      const a = parseIPv4(input);
      if (a === null) return { input, result: 'invalid' as const };
      return { input, result: networkOf(a, prefix) === net ? ('in' as const) : ('out' as const) };
    });
}

// ───────────────────────────── 分割 ─────────────────────────────

/** 画面に並べる件数 */
export const SPLIT_DISPLAY_LIMIT = 64;
/** 「全件コピー」を出す上限（2^16）。超えたら個数と先頭・末尾だけ */
export const SPLIT_COPY_LIMIT = 65536;
/** 上限を超えたときに見せる先頭・末尾の件数 */
export const SPLIT_EDGE = 3;

export interface SplitRow {
  index: number;
  cidr: string;
  first: string;
  last: string;
}

export type SplitResult =
  | { ok: false; message: string }
  | {
      ok: true;
      count: number;
      newPrefix: number;
      /** 画面に出す行（上限内なら先頭 64 件、超えたら先頭の数件） */
      head: SplitRow[];
      /** 上限を超えたときの末尾の数件（上限内なら空） */
      tail: SplitRow[];
      /** 全件コピーを出すか */
      copyable: boolean;
      /** 一覧を出さない（数が多すぎる）か */
      tooMany: boolean;
    };

/** 分割したうちの index 番目（0始まり） */
export function subnetAt(network: number, newPrefix: number, index: number): SplitRow {
  const size = addressCount(newPrefix);
  const start = network + index * size;
  return { index: index + 1, cidr: `${formatIPv4(start)}/${newPrefix}`, first: formatIPv4(start), last: formatIPv4(start + size - 1) };
}

export function splitSubnet(address: number, prefix: number, newPrefix: number): SplitResult {
  if (!Number.isInteger(newPrefix) || newPrefix < 0 || newPrefix > 32) return { ok: false, message: '新しいプレフィックス長は /0〜/32 で入れてください' };
  if (newPrefix < prefix) return { ok: false, message: `/${prefix} より小さい数（大きい範囲）には分けられません。/${prefix}〜/32 を選んでください` };
  const network = networkOf(address, prefix);
  const count = 2 ** (newPrefix - prefix);
  const tooMany = count > SPLIT_COPY_LIMIT;
  if (tooMany) {
    const head = Array.from({ length: SPLIT_EDGE }, (_, i) => subnetAt(network, newPrefix, i));
    const tail = Array.from({ length: SPLIT_EDGE }, (_, i) => subnetAt(network, newPrefix, count - SPLIT_EDGE + i));
    return { ok: true, count, newPrefix, head, tail, copyable: false, tooMany: true };
  }
  const n = Math.min(count, SPLIT_DISPLAY_LIMIT);
  const head = Array.from({ length: n }, (_, i) => subnetAt(network, newPrefix, i));
  return { ok: true, count, newPrefix, head, tail: [], copyable: true, tooMany: false };
}

/** 全件コピー用のテキスト（1行1つの CIDR）。上限を超えるなら null */
export function splitAllText(address: number, prefix: number, newPrefix: number): string | null {
  if (newPrefix < prefix || newPrefix > 32) return null;
  const count = 2 ** (newPrefix - prefix);
  if (count > SPLIT_COPY_LIMIT) return null;
  const network = networkOf(address, prefix);
  const size = addressCount(newPrefix);
  const lines: string[] = new Array(count);
  for (let i = 0; i < count; i++) lines[i] = `${formatIPv4(network + i * size)}/${newPrefix}`;
  return lines.join('\n');
}

// ───────────────────────────── 台数から逆算 ─────────────────────────────

export type ReverseResult =
  | { ok: false; message: string }
  | { ok: true; prefix: number; total: number; usable: number; note: string | null };

export const SMALL_HOSTS_NOTE = 'ルーターどうしの対向リンクだけなら /31（RFC 3021）、1台だけなら /32 も使えます';

/** 必要な台数が置ける最小のサブネット（いちばん大きいプレフィックス長） */
export function reverseFromHosts(hosts: number, cloud: Cloud = 'none'): ReverseResult {
  if (!Number.isInteger(hosts) || hosts < 1) return { ok: false, message: '台数は 1 以上の整数で入れてください' };
  const reservedCount = cloud === 'none' ? 2 : CLOUD_RULES[cloud].reserved.length;
  // 「なし」は /30 まで（/31・/32 は注記にとどめる）、クラウドはそのクラウドの最小まで
  const maxPrefix = cloud === 'none' ? 30 : CLOUD_RULES[cloud].maxPrefix;
  const minPrefix = cloud === 'none' ? 0 : CLOUD_RULES[cloud].minPrefix;
  for (let p = maxPrefix; p >= minPrefix; p--) {
    const usable = addressCount(p) - reservedCount;
    if (usable >= hosts) {
      return { ok: true, prefix: p, total: addressCount(p), usable, note: cloud === 'none' && hosts <= 2 ? SMALL_HOSTS_NOTE : null };
    }
  }
  if (cloud === 'none') return { ok: false, message: 'IPv4 の1つのサブネットには入りきりません' };
  const r = CLOUD_RULES[cloud];
  return {
    ok: false,
    message: `${r.label} の1つのサブネットには入りきりません（いちばん大きい /${minPrefix} で ${(addressCount(minPrefix) - reservedCount).toLocaleString('en-US')} 台）`,
  };
}

// ───────────────────────────── IPv6 ─────────────────────────────

const V6_MAX = (1n << 128n) - 1n;

/** IPv6 の文字列 → 128 ビットの BigInt。`::` の省略に対応。不正なら null（IPv4 埋め込み形式は扱わない） */
export function parseIPv6(s: string): bigint | null {
  const t = s.trim().toLowerCase();
  if (t === '' || /[^0-9a-f:]/.test(t)) return null;
  const halves = t.split('::');
  if (halves.length > 2) return null;
  const toGroups = (h: string): string[] | null => {
    if (h === '') return [];
    const g = h.split(':');
    return g.every((x) => /^[0-9a-f]{1,4}$/.test(x)) ? g : null;
  };
  const left = toGroups(halves[0]);
  const right = halves.length === 2 ? toGroups(halves[1]) : [];
  if (left === null || right === null) return null;
  let groups: string[];
  if (halves.length === 2) {
    const fill = 8 - left.length - right.length;
    if (fill < 1) return null;
    groups = [...left, ...Array(fill).fill('0'), ...right];
  } else {
    if (left.length !== 8) return null;
    groups = left;
  }
  let n = 0n;
  for (const g of groups) n = (n << 16n) | BigInt(parseInt(g, 16));
  return n;
}

/** 128 ビットの BigInt → RFC 5952 の短縮表記（小文字・先頭0省略・2つ以上続く0の最長1か所を ::） */
export function formatIPv6(n: bigint): string {
  const groups: number[] = [];
  for (let i = 7; i >= 0; i--) groups.push(Number((n >> BigInt(i * 16)) & 0xffffn));
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > bestLen) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }
  const hex = groups.map((g) => g.toString(16));
  if (bestLen < 2) return hex.join(':');
  const left = hex.slice(0, bestStart).join(':');
  const right = hex.slice(bestStart + bestLen).join(':');
  return `${left}::${right}`;
}

export interface V6Summary {
  network: string;
  last: string;
  prefix: number;
  /** アドレス数（2^(128−prefix)） */
  count: bigint;
  /** 2 の何乗か */
  exponent: number;
  inputAddress: string;
  aligned: boolean;
}

export function summarizeV6(address: bigint, prefix: number): V6Summary {
  const hostBits = BigInt(128 - prefix);
  const hostMask = (1n << hostBits) - 1n;
  const network = address & (V6_MAX ^ hostMask);
  return {
    network: formatIPv6(network),
    last: formatIPv6(network | hostMask),
    prefix,
    count: 1n << hostBits,
    exponent: 128 - prefix,
    inputAddress: formatIPv6(address),
    aligned: network === address,
  };
}

/** 3桁区切り（BigInt・number 両方） */
export function groupDigits(n: number | bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ───────────────────────────── 早見表 ─────────────────────────────

/** マスクの第4オクテットの早見表（/25〜/32）。本文で使う */
export function lastOctetTable(): { prefix: number; lastOctet: number; total: number; usable: number }[] {
  return [25, 26, 27, 28, 29, 30, 31, 32].map((p) => ({
    prefix: p,
    lastOctet: prefixToMask(p) & 255,
    total: addressCount(p),
    usable: usableHosts(p),
  }));
}

// ───────────────────────────── 共有の URL と計測 ─────────────────────────────

export const SHARE_BASE_URL = 'https://hasokon.com/tools/subnet/';
export const SHARE_QUERY = 'q';

/** 「共有用のURLをコピー」で組み立てる URL。**入力のたびには作らない**（ボタンを押したときだけ） */
export function buildShareUrl(input: string): string {
  return `${SHARE_BASE_URL}?${SHARE_QUERY}=${encodeURIComponent(input.trim())}`;
}

/** `?q=…` の値。無ければ null */
export function readShareQuery(search: string): string | null {
  const v = new URLSearchParams(search).get(SHARE_QUERY);
  return v === null || v.trim() === '' ? null : v;
}

/** tool_use の action（入力値・件数は載せない）。クラウドを選んでいれば `calc-cloud-aws` のように足す */
export type SubnetAction = 'calc' | 'split' | 'reverse' | 'contains' | 'share';

export function toolUseAction(action: SubnetAction, cloud: Cloud = 'none'): string {
  return cloud === 'none' ? action : `${action}-cloud-${cloud}`;
}

/**
 * いま tool_use を送るなら、その action。送らないなら null。
 *
 * **利用者が触っていない（既定の例のまま）なら送らない。** 入力欄の既定値（192.168.10.0/26）と
 * 逆算の既定の台数（50）で、開いただけの人まで「計算した」と数えないため
 * （tool_use は「開かれたが使われなかった」を page_view と分けるためのイベント。#553 のレビュー）。
 * 触った＝入力を変えた・`?q=` で開かれた・クラウドのボタンを押した。
 */
export function trackableAction(action: SubnetAction, opts: { touched: boolean; ok: boolean; cloud?: Cloud }): string | null {
  if (!opts.touched || !opts.ok) return null;
  return toolUseAction(action, opts.cloud ?? 'none');
}
