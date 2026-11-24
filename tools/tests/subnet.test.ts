import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IPV4_SPACE,
  SPLIT_COPY_LIMIT,
  SPLIT_DISPLAY_LIMIT,
  SMALL_HOSTS_NOTE,
  INVALID_MASK_MESSAGE,
  addressCount,
  buildShareUrl,
  checkContains,
  classifyIPv4,
  cloudUsableHosts,
  formatIPv4,
  formatIPv6,
  lastOctetTable,
  maskToPrefix,
  parseIPv4,
  parseIPv6,
  parseInput,
  prefixToMask,
  readMask,
  readShareQuery,
  readingNote,
  reservedAddresses,
  reverseFromHosts,
  splitAllText,
  splitSubnet,
  summarizeV4,
  summarizeV6,
  toolUseAction,
  trackableAction,
  wildcardToPrefix,
} from '@/lib/subnet';
import { pageLocationForAnalytics, trackPageView, trackToolUse } from '@/lib/analytics';

vi.mock('web-vitals', () => ({ onLCP: () => {}, onINP: () => {}, onCLS: () => {} }));

/**
 * サブネット計算（docs/features/subnet-keisan.md）のテスト。
 * 仕様書の「テスト」の節の項目を上から順に押さえる。
 */

const ip = (s: string) => {
  const n = parseIPv4(s);
  if (n === null) throw new Error(s);
  return n;
};

function v4(input: string, cloud: Parameters<typeof summarizeV4>[2] = 'none') {
  const p = parseInput(input);
  if (p.kind !== 'v4') throw new Error(`v4 として読めない: ${input} → ${p.kind}`);
  return summarizeV4(p.address, p.prefix, cloud);
}

describe('IPv4 の基本', () => {
  it('アドレスの読み書きが往復する（境界の 0.0.0.0 と 255.255.255.255 も）', () => {
    for (const s of ['0.0.0.0', '10.0.0.1', '192.168.10.0', '255.255.255.255']) {
      expect(formatIPv4(ip(s))).toBe(s);
    }
    expect(ip('255.255.255.255')).toBe(IPV4_SPACE - 1);
    expect(ip('192.168.10.0')).toBe(3232238080);
  });

  it('不正なアドレスを拒む', () => {
    for (const s of ['256.0.0.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', 'a.b.c.d', '1..2.3']) {
      expect(parseIPv4(s), s).toBeNull();
    }
  });
});

describe('範囲と使える数（/0・/8・/24・/26・/30・/31・/32）', () => {
  it('/26（仕様書の例）', () => {
    const r = v4('192.168.10.0/26');
    expect(r.network).toBe('192.168.10.0');
    expect(r.broadcast).toBe('192.168.10.63');
    expect([r.firstUsable, r.lastUsable]).toEqual(['192.168.10.1', '192.168.10.62']);
    expect(r.total).toBe(64);
    expect(r.usable).toBe(62);
    expect(r.mask).toBe('255.255.255.192');
    expect(r.wildcard).toBe('0.0.0.63');
    expect(r.hex).toBe('0xC0A80A00');
    expect(r.integer).toBe(3232238080);
    expect(r.binary).toEqual(['11000000', '10101000', '00001010', '00000000']);
    expect(r.classification.kind).toBe('private');
    expect(r.position).toBeNull();
  });

  it('ネットワークアドレスに揃え、入力が範囲の何番目かを添える', () => {
    const r = v4('192.168.10.37/26');
    expect(r.network).toBe('192.168.10.0');
    expect(r.position).toBe(38);
  });

  it('/0（32 ビット整数であふれない）', () => {
    const r = v4('0.0.0.0/0');
    expect(r.network).toBe('0.0.0.0');
    expect(r.broadcast).toBe('255.255.255.255');
    expect(r.total).toBe(2 ** 32);
    expect(r.usable).toBe(2 ** 32 - 2);
    expect(r.mask).toBe('0.0.0.0');
    expect(r.wildcard).toBe('255.255.255.255');
    expect(r.classification.kind).toBe('mixed');
  });

  it('/8・/24・/30', () => {
    expect(v4('10.20.30.40/8')).toMatchObject({ network: '10.0.0.0', broadcast: '10.255.255.255', total: 16777216, usable: 16777214, mask: '255.0.0.0' });
    expect(v4('172.16.5.9/24')).toMatchObject({ network: '172.16.5.0', broadcast: '172.16.5.255', usable: 254 });
    expect(v4('203.0.113.9/30')).toMatchObject({ network: '203.0.113.8', firstUsable: '203.0.113.9', lastUsable: '203.0.113.10', usable: 2 });
  });

  it('/31 は2個（RFC 3021）、/32 は1個。−2 を機械的に当てない', () => {
    const r31 = v4('10.0.0.5/31');
    expect(r31.network).toBe('10.0.0.4');
    expect(r31.usable).toBe(2);
    expect([r31.firstUsable, r31.lastUsable]).toEqual(['10.0.0.4', '10.0.0.5']);
    expect(r31.specialNote).toContain('RFC 3021');
    const r32 = v4('10.0.0.5/32');
    expect(r32.usable).toBe(1);
    expect(r32.total).toBe(1);
    expect([r32.firstUsable, r32.lastUsable]).toEqual(['10.0.0.5', '10.0.0.5']);
    expect(r32.mask).toBe('255.255.255.255');
  });

  it('アドレスだけなら /32 として読み、そう書く', () => {
    const p = parseInput('8.8.8.8');
    expect(p).toMatchObject({ kind: 'v4', prefix: 32, source: 'host' });
    expect(readingNote(p)).toContain('/32');
  });
});

describe('マスク⇔プレフィックス長', () => {
  it('全 33 通りが往復する', () => {
    for (let p = 0; p <= 32; p++) {
      const mask = prefixToMask(p);
      expect(maskToPrefix(mask), `/${p}`).toBe(p);
      const parsed = parseInput(`10.0.0.0 ${formatIPv4(mask)}`);
      expect(parsed.kind === 'v4' && parsed.prefix, `/${p}`).toBe(p);
    }
    expect(formatIPv4(prefixToMask(0))).toBe('0.0.0.0');
    expect(formatIPv4(prefixToMask(1))).toBe('128.0.0.0');
    expect(formatIPv4(prefixToMask(32))).toBe('255.255.255.255');
  });

  it('不正なマスクを拒む', () => {
    expect(maskToPrefix(ip('255.255.0.255'))).toBeNull();
    expect(readMask(ip('255.255.0.255'))).toEqual({ kind: 'invalid' });
    expect(parseInput('10.0.0.0 255.255.0.255')).toEqual({ kind: 'error', message: INVALID_MASK_MESSAGE });
    expect(INVALID_MASK_MESSAGE).toContain('マスクとして使えない形です');
    expect(parseInput('255.255.0.255')).toMatchObject({ kind: 'v4', source: 'host' });
  });

  it('スラッシュ区切りのマスク・/26 だけ・マスクだけ', () => {
    expect(parseInput('192.168.10.0/255.255.255.192')).toMatchObject({ kind: 'v4', prefix: 26, source: 'mask' });
    expect(parseInput('/26')).toEqual({ kind: 'mask-only', prefix: 26, source: 'prefix' });
    expect(parseInput('255.255.255.192')).toEqual({ kind: 'mask-only', prefix: 26, source: 'mask' });
    expect(parseInput('/33').kind).toBe('error');
    expect(parseInput('10.0.0.0/33').kind).toBe('error');
    expect(parseInput('').kind).toBe('empty');
  });
});

describe('マスクの見分け方（仕様書の表）', () => {
  it('0.0.0.63 はワイルドカード（/26）', () => {
    expect(wildcardToPrefix(ip('0.0.0.63'))).toBe(26);
    const p = parseInput('192.168.10.0 0.0.0.63');
    expect(p).toMatchObject({ kind: 'v4', prefix: 26, source: 'wildcard' });
    expect(readingNote(p)).toBe('ワイルドカードマスクとして読みました（/26 と同じ範囲）');
    expect(parseInput('0.0.0.63')).toEqual({ kind: 'mask-only', prefix: 26, source: 'wildcard' });
  });

  it('0.0.0.0 は /0 のマスク。ワイルドカードなら /32 の案内つき', () => {
    const p = parseInput('0.0.0.0');
    expect(p).toEqual({ kind: 'mask-only', prefix: 0, source: 'mask', alternative: 32 });
    expect(readingNote(p)).toBe('サブネットマスクとして読みました（/0）。ワイルドカードマスクのつもりなら /32 です');
  });

  it('255.255.255.255 は /32 のマスク。ワイルドカードなら /0 の案内つき', () => {
    const p = parseInput('255.255.255.255');
    expect(p).toEqual({ kind: 'mask-only', prefix: 32, source: 'mask', alternative: 0 });
    expect(readingNote(p)).toBe('サブネットマスクとして読みました（/32）。ワイルドカードマスクのつもりなら /0 です');
    expect(parseInput('10.0.0.1 255.255.255.255')).toMatchObject({ kind: 'v4', prefix: 32, alternative: 0 });
  });

  it('255.255.255.192 はふつうのマスクなので一文を出さない', () => {
    expect(readingNote(parseInput('192.168.10.0 255.255.255.192'))).toBeNull();
    expect(readingNote(parseInput('192.168.10.0/26'))).toBeNull();
  });
});

describe('クラウドの予約', () => {
  it('/26 は AWS・Azure で 59、Google Cloud で 60', () => {
    expect(cloudUsableHosts('aws', 26)).toBe(59);
    expect(cloudUsableHosts('azure', 26)).toBe(59);
    expect(cloudUsableHosts('gcp', 26)).toBe(60);
    expect(v4('192.168.10.0/26', 'aws').cloudUsable).toBe(59);
  });

  it('/28 は AWS で 11', () => {
    expect(cloudUsableHosts('aws', 28)).toBe(11);
  });

  it('作れる大きさの範囲外なら null（AWS は /16〜/28、Azure・Google Cloud は最小 /29）', () => {
    expect(cloudUsableHosts('aws', 29)).toBeNull();
    expect(cloudUsableHosts('aws', 15)).toBeNull();
    expect(cloudUsableHosts('aws', 16)).toBe(65536 - 5);
    expect(cloudUsableHosts('azure', 29)).toBe(3);
    expect(cloudUsableHosts('azure', 30)).toBeNull();
    expect(cloudUsableHosts('gcp', 29)).toBe(4);
    expect(cloudUsableHosts('gcp', 30)).toBeNull();
    expect(v4('10.0.0.0/30', 'aws').cloudNote).toContain('/16〜/28');
  });

  it('予約される具体的なアドレス', () => {
    expect(reservedAddresses('aws', ip('192.168.10.0'), 26).map((r) => r.address)).toEqual([
      '192.168.10.0', '192.168.10.1', '192.168.10.2', '192.168.10.3', '192.168.10.63',
    ]);
    expect(reservedAddresses('gcp', ip('10.0.1.0'), 28).map((r) => r.address)).toEqual([
      '10.0.1.0', '10.0.1.1', '10.0.1.14', '10.0.1.15',
    ]);
  });
});

describe('このIPは入るか', () => {
  it('1行1つで判定し、空行は飛ばす', () => {
    expect(checkContains(ip('192.168.10.0'), 26, '192.168.10.5\n\n192.168.10.64\nabc\n')).toEqual([
      { input: '192.168.10.5', result: 'in' },
      { input: '192.168.10.64', result: 'out' },
      { input: 'abc', result: 'invalid' },
    ]);
  });
});

describe('分割', () => {
  it('10.0.0.0/16 → /24 で 256 個、先頭と末尾', () => {
    const r = splitSubnet(ip('10.0.0.0'), 16, 24);
    if (!r.ok) throw new Error();
    expect(r.count).toBe(256);
    expect(r.head).toHaveLength(SPLIT_DISPLAY_LIMIT);
    expect(r.head[0]).toMatchObject({ index: 1, cidr: '10.0.0.0/24', last: '10.0.0.255' });
    expect(r.copyable).toBe(true);
    const all = splitAllText(ip('10.0.0.0'), 16, 24)!.split('\n');
    expect(all).toHaveLength(256);
    expect(all[255]).toBe('10.0.255.0/24');
  });

  it('上限：10.0.0.0/8 → /30 は 4,194,304 件と出し、一覧・全件コピーを出さない', () => {
    const r = splitSubnet(ip('10.0.0.0'), 8, 30);
    if (!r.ok) throw new Error();
    expect(r.count).toBe(4194304);
    expect(r.tooMany).toBe(true);
    expect(r.copyable).toBe(false);
    expect(r.head.length).toBeLessThanOrEqual(5);
    expect(r.tail.at(-1)).toMatchObject({ index: 4194304, cidr: '10.255.255.252/30' });
    expect(splitAllText(ip('10.0.0.0'), 8, 30)).toBeNull();
  });

  it('0.0.0.0/0 → /32 は 4,294,967,296 件（2^32 であふれない）', () => {
    const r = splitSubnet(0, 0, 32);
    if (!r.ok) throw new Error();
    expect(r.count).toBe(4294967296);
    expect(r.tail.at(-1)).toMatchObject({ cidr: '255.255.255.255/32' });
  });

  it('/16 → /32 の 65,536 件はコピーできる', () => {
    const r = splitSubnet(ip('172.16.0.0'), 16, 32);
    if (!r.ok) throw new Error();
    expect(r.count).toBe(SPLIT_COPY_LIMIT);
    expect(r.copyable).toBe(true);
    expect(splitAllText(ip('172.16.0.0'), 16, 32)!.split('\n')).toHaveLength(65536);
  });

  it('元より大きい範囲には分けられない', () => {
    expect(splitSubnet(ip('10.0.0.0'), 24, 16).ok).toBe(false);
  });
});

describe('必要な台数から逆算', () => {
  it('50 台・AWS → /26（64−5＝59 ≥ 50）', () => {
    expect(reverseFromHosts(50, 'aws')).toMatchObject({ ok: true, prefix: 26, usable: 59 });
  });

  it('60 台・AWS → /25（/26 は 59 で足りない）', () => {
    expect(reverseFromHosts(60, 'aws')).toMatchObject({ ok: true, prefix: 25, usable: 123 });
  });

  it('「なし」で 1 台・2 台 → /30（/31・/32 は注記）', () => {
    expect(reverseFromHosts(1)).toEqual({ ok: true, prefix: 30, total: 4, usable: 2, note: SMALL_HOSTS_NOTE });
    expect(reverseFromHosts(2)).toMatchObject({ ok: true, prefix: 30, note: SMALL_HOSTS_NOTE });
    expect(reverseFromHosts(3)).toMatchObject({ ok: true, prefix: 29, note: null });
    expect(reverseFromHosts(254)).toMatchObject({ prefix: 24 });
    expect(reverseFromHosts(255)).toMatchObject({ prefix: 23 });
  });

  it('クラウドの小さい側の限界（AWS は /28 未満を出さない・Google Cloud は /29）', () => {
    expect(reverseFromHosts(1, 'aws')).toMatchObject({ ok: true, prefix: 28, usable: 11 });
    expect(reverseFromHosts(1, 'gcp')).toMatchObject({ ok: true, prefix: 29, usable: 4 });
  });

  it('入りきらない台数・不正な台数', () => {
    expect(reverseFromHosts(65532, 'aws').ok).toBe(false);
    expect(reverseFromHosts(65531, 'aws')).toMatchObject({ ok: true, prefix: 16 });
    expect(reverseFromHosts(0).ok).toBe(false);
    expect(reverseFromHosts(1.5).ok).toBe(false);
  });
});

describe('特殊用途の判定', () => {
  const cases: [string, string, boolean][] = [
    ['10.0.0.1', 'private', false],
    ['172.16.0.1', 'private', false],
    ['172.31.255.255', 'private', false],
    ['172.32.0.1', 'global', true],
    ['100.64.0.1', 'cgnat', false],
    ['169.254.1.1', 'link-local', false],
    ['192.0.2.1', 'documentation', false],
    ['198.18.0.1', 'benchmark', false],
    ['224.0.0.1', 'multicast', false],
    ['127.0.0.1', 'loopback', false],
    ['8.8.8.8', 'global', true],
  ];
  it.each(cases)('%s → %s', (addr, kind, global) => {
    const c = classifyIPv4(ip(addr));
    expect(c.kind).toBe(kind);
    expect(c.global).toBe(global);
  });

  it('172.32.0.1 はプライベートと判定されない', () => {
    expect(v4('172.32.0.1/32').classification.kind).not.toBe('private');
  });
});

describe('IPv6', () => {
  it('2001:db8::/32 のアドレス数は 2^96', () => {
    const p = parseInput('2001:db8::/32');
    if (p.kind !== 'v6') throw new Error();
    const r = summarizeV6(p.address, p.prefix);
    expect(r.count).toBe(2n ** 96n);
    expect(r.exponent).toBe(96);
    expect(r.network).toBe('2001:db8::');
    expect(r.last).toBe('2001:db8:ffff:ffff:ffff:ffff:ffff:ffff');
  });

  it('RFC 5952 の短縮表記（小文字・先頭0省略・最長の0の連続を ::・同じ長さなら左）', () => {
    expect(formatIPv6(parseIPv6('2001:0DB8:0000:0000:0000:0000:0000:0001')!)).toBe('2001:db8::1');
    expect(formatIPv6(parseIPv6('2001:db8:0:0:1:0:0:1')!)).toBe('2001:db8::1:0:0:1');
    expect(formatIPv6(parseIPv6('2001:db8:0:1:1:1:1:1')!)).toBe('2001:db8:0:1:1:1:1:1');
    expect(formatIPv6(0n)).toBe('::');
    expect(formatIPv6(1n)).toBe('::1');
  });

  it('ネットワークに揃える・不正な形を拒む', () => {
    const r = summarizeV6(parseIPv6('2001:db8:abcd:12::5')!, 48);
    expect(r.network).toBe('2001:db8:abcd::');
    expect(r.aligned).toBe(false);
    expect(parseIPv6('2001:db8::1::2')).toBeNull();
    expect(parseIPv6('12345::')).toBeNull();
    expect(parseIPv6('1:2:3:4:5:6:7')).toBeNull();
    expect(parseInput('2001:db8::/129').kind).toBe('error');
  });
});

describe('早見表', () => {
  it('第4オクテットは /25＝128 … /30＝252', () => {
    const t = lastOctetTable();
    expect(t.map((r) => r.lastOctet)).toEqual([128, 192, 224, 240, 248, 252, 254, 255]);
    expect(t.find((r) => r.prefix === 31)!.usable).toBe(2);
    expect(addressCount(25)).toBe(128);
  });
});

// ───────── 共有の URL と計測（入力したアドレスを GA4 に送らない） ─────────

const globals = globalThis as unknown as { window?: unknown; document?: unknown };
type Call = [string, string, Record<string, unknown>?];
let calls: Call[] = [];

function stubBrowser(href: string) {
  calls = [];
  globals.window = {
    location: { href, hostname: new URL(href).hostname },
    gtag: (...args: Call) => calls.push(args),
  };
  globals.document = { title: 'サブネット計算' };
}

afterEach(() => {
  delete globals.window;
  delete globals.document;
});

describe('共有のURLと計測', () => {
  it('共有用の URL はボタンで組み立て、?q= で開くと計算できる', () => {
    const url = buildShareUrl('203.0.113.5/24');
    expect(url).toBe('https://hasokon.com/tools/subnet/?q=203.0.113.5%2F24');
    const q = readShareQuery(new URL(url).search);
    expect(q).toBe('203.0.113.5/24');
    expect(v4(q!)).toMatchObject({ network: '203.0.113.0', usable: 254 });
    expect(readShareQuery('')).toBeNull();
    expect(readShareQuery('?q=')).toBeNull();
  });

  it('?q=203.0.113.5/24 で開いたとき、page_view の page_location にアドレスが入らない', () => {
    stubBrowser('https://hasokon.com/tools/subnet/?q=203.0.113.5%2F24');
    trackPageView();
    const pv = calls.find((c) => c[1] === 'page_view')!;
    expect(pv[2]!.page_location).toBe('https://hasokon.com/tools/subnet/');
    expect(JSON.stringify(calls)).not.toContain('203.0.113.5');
  });

  it('ほかのクエリは残し、ほかのページの ?q= は触らない', () => {
    expect(pageLocationForAnalytics('https://hasokon.com/tools/subnet/?q=10.0.0.1&utm_source=x')).toBe(
      'https://hasokon.com/tools/subnet/?utm_source=x',
    );
    expect(pageLocationForAnalytics('https://hasokon.com/tools/cron-shiki/?q=0+9+*+*+*')).toBe(
      'https://hasokon.com/tools/cron-shiki/?q=0+9+*+*+*',
    );
    expect(pageLocationForAnalytics('https://hasokon.com/tools/subnet/')).toBe('https://hasokon.com/tools/subnet/');
  });

  it('tool_use の action に入力値を入れない', () => {
    expect(toolUseAction('calc')).toBe('calc');
    expect(toolUseAction('calc', 'aws')).toBe('calc-cloud-aws');
    expect(toolUseAction('reverse', 'gcp')).toBe('reverse-cloud-gcp');
    stubBrowser('https://hasokon.com/tools/subnet/');
    trackToolUse('subnet', toolUseAction('split'));
    expect(calls.at(-1)).toEqual(['event', 'tool_use', { tool: 'subnet', action: 'split' }]);
  });
});

describe('tool_use は利用者が触ったときだけ（#553 のレビュー）', () => {
  it('既定の例（192.168.10.0/26・50台）のまま＝触っていないなら送らない', () => {
    // 画面の既定値で ok になる計算でも、touched が false なら null
    expect(parseInput('192.168.10.0/26').kind).toBe('v4');
    expect(reverseFromHosts(50).ok).toBe(true);
    expect(trackableAction('calc', { touched: false, ok: true })).toBeNull();
    expect(trackableAction('reverse', { touched: false, ok: true })).toBeNull();
    expect(trackableAction('calc', { touched: false, ok: true, cloud: 'aws' })).toBeNull();
  });

  it('触ったあとでも、結果が出ていなければ送らない', () => {
    expect(trackableAction('calc', { touched: true, ok: false })).toBeNull();
  });

  it('触って結果が出たら action を返す（クラウドを選んでいれば -cloud-…）', () => {
    expect(trackableAction('calc', { touched: true, ok: true })).toBe('calc');
    expect(trackableAction('reverse', { touched: true, ok: true, cloud: 'aws' })).toBe('reverse-cloud-aws');
  });

  it('画面は calc・reverse を trackableAction を通して送っている（既定値で送る形に戻さない）', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../app/subnet/Calculator.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/trackableAction\('calc', \{ touched: inputTouched\.current/);
    expect(src).toMatch(/trackableAction\('reverse', \{ touched: reverseTouched\.current/);
    // 触ったフラグは利用者の操作（onChange・ボタン）と ?q= の読み込みでだけ立てる
    expect(src.match(/inputTouched\.current = true/g)?.length).toBe(3);
    expect(src.match(/reverseTouched\.current = true/g)?.length).toBe(2);
  });
});

