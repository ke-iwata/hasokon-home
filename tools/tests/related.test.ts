import { afterEach, describe, expect, it } from 'vitest';
import { publicTools, tools, type ToolDef } from '@/lib/registry';
import { pickRelatedTools, relatedHeading } from '@/lib/related';
import { relatedClickParams, trackRelatedClick } from '@/lib/analytics';

/**
 * ページ下部の関連ツール（docs/features/related-tools-topical.md）。
 *
 * 見張っているのは、registry の `related` の書き間違いでカードが黙って消えないこと、
 * 公開前のツールが出ないこと、`related` の無いツールの見え方が変わっていないこと、
 * そして最終的な一覧に同じ slug が2回出ないこと。
 */

const bySlug = new Map(tools.map((t) => [t.slug, t]));
const withRelated = tools.filter((t) => t.related && t.related.length > 0);

/** 以前の RelatedTools の並べ方（同カテゴリ → 他カテゴリを registry 順で先頭から） */
function legacyList(current: string, limit = 6): string[] {
  const self = bySlug.get(current);
  const candidates = publicTools.filter((t) => t.slug !== current);
  const same = candidates.filter((t) => t.category === self?.category);
  const others = candidates.filter((t) => t.category !== self?.category);
  return [...same, ...others].slice(0, limit).map((t) => t.slug);
}

function tool(slug: string, extra: Partial<ToolDef> = {}): ToolDef {
  return {
    slug,
    name: slug,
    description: slug,
    category: 'お金・社会保険',
    icon: 'Gift',
    stage: 'public',
    updatedAt: '2026-11-23',
    ...extra,
  };
}

describe('registry の related', () => {
  it.each(withRelated.map((t) => [t.slug, t.related!] as const))(
    '%s の related はすべて registry に存在する',
    (_slug, related) => {
      for (const s of related) expect(bySlug.has(s), `${s} が registry に無い`).toBe(true);
    },
  );

  it.each(withRelated.map((t) => [t.slug, t.related!] as const))(
    '%s の related に自分自身・重複が無い',
    (slug, related) => {
      expect(related).not.toContain(slug);
      expect(new Set(related).size).toBe(related.length);
    },
  );

  it.each(withRelated.map((t) => [t.slug, t.related!] as const))(
    '%s の related は3〜5本',
    (_slug, related) => {
      expect(related.length).toBeGreaterThanOrEqual(3);
      expect(related.length).toBeLessThanOrEqual(5);
    },
  );

  it.each([
    'furusato-nozei',
    'yoikuhi-keisan',
    'nenrei-keisan',
    'tabako-zei-neage',
    'hatarakizon',
    'shuzei-kaisei',
    'shichigosan',
  ])('着地上位の %s に related が書かれている', (slug) => {
    expect(bySlug.get(slug)?.related?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('pickRelatedTools', () => {
  it('related を書いた順に先頭へ出す（ふるさと納税）', () => {
    const list = pickRelatedTools('furusato-nozei');
    expect(list.slice(0, 5).map((e) => e.tool.slug)).toEqual([
      'nenmatsu-chosei',
      'kakutei-shinkoku-hantei',
      'iryohi-kojo',
      'tedori-keisan',
      'juminzei-hikazei',
    ]);
    expect(list.slice(0, 5).every((e) => e.source === 'related')).toBe(true);
    expect(list).toHaveLength(6);
    expect(list[5].source).toBe('category');
  });

  it.each(tools.map((t) => t.slug))('%s: 最終的な一覧に同じ slug が2回出ず、自分自身も出ない', (slug) => {
    const list = pickRelatedTools(slug).map((e) => e.tool.slug);
    expect(new Set(list).size).toBe(list.length);
    expect(list).not.toContain(slug);
    expect(list.length).toBeLessThanOrEqual(6);
  });

  it.each(tools.map((t) => t.slug))('%s: 公開中のツールだけを出す', (slug) => {
    for (const e of pickRelatedTools(slug)) expect(e.tool.stage).toBe('public');
  });

  it('related に書いた wip のツールは出ない（password → hash-keisan・base64）', () => {
    expect(bySlug.get('password')?.related).toContain('hash-keisan');
    expect(bySlug.get('hash-keisan')?.stage).not.toBe('public');
    const list = pickRelatedTools('password').map((e) => e.tool.slug);
    expect(list).not.toContain('hash-keisan');
    expect(list).not.toContain('base64');
    expect(list.slice(0, 3)).toEqual(['qr-code', 'hankaku-zenkaku', 'mojisu-count']);
  });

  it('公開した日から自動で出る（stage を public にすると related の位置に入る）', () => {
    const all = [
      tool('a', { related: ['c', 'b'] }),
      tool('b'),
      tool('c', { stage: 'wip' }),
      tool('d'),
    ];
    expect(pickRelatedTools('a', 6, all).map((e) => e.tool.slug)).toEqual(['b', 'd']);
    all[2] = tool('c');
    expect(pickRelatedTools('a', 6, all).map((e) => [e.tool.slug, e.source])).toEqual([
      ['c', 'related'],
      ['b', 'related'],
      ['d', 'category'],
    ]);
  });

  it('related のツールが同カテゴリの埋め草に再び現れない', () => {
    const all = [tool('a', { related: ['c'] }), tool('b'), tool('c'), tool('d')];
    expect(pickRelatedTools('a', 6, all).map((e) => e.tool.slug)).toEqual(['c', 'b', 'd']);
  });

  it('埋め草は同カテゴリ → 他カテゴリの順', () => {
    const all = [
      tool('a', { related: ['x'] }),
      tool('x', { category: '計算・変換' }),
      tool('y', { category: '計算・変換' }),
      tool('b'),
    ];
    expect(pickRelatedTools('a', 6, all).map((e) => e.tool.slug)).toEqual(['x', 'b', 'y']);
  });

  it('limit で打ち切る（related が多くても既定の6本を超えない）', () => {
    const all = [tool('a', { related: ['b', 'c', 'd'] }), tool('b'), tool('c'), tool('d'), tool('e')];
    expect(pickRelatedTools('a', 2, all).map((e) => e.tool.slug)).toEqual(['b', 'c']);
  });

  it.each(tools.filter((t) => !t.related).map((t) => t.slug))(
    'related の無い %s は以前と同じ6本（同カテゴリ先頭から）',
    (slug) => {
      const list = pickRelatedTools(slug);
      expect(list.map((e) => e.tool.slug)).toEqual(legacyList(slug));
      expect(list.every((e) => e.source === 'category')).toBe(true);
    },
  );
});

describe('relatedHeading', () => {
  it('related が出ていれば「あわせて確認したいツール」', () => {
    expect(relatedHeading('furusato-nozei', pickRelatedTools('furusato-nozei'))).toBe(
      'あわせて確認したいツール',
    );
  });

  it('related が無ければ「◯◯の他のツール」のまま', () => {
    const slug = 'aspect-ratio';
    const self = bySlug.get(slug)!;
    expect(self.related).toBeUndefined();
    expect(relatedHeading(slug, pickRelatedTools(slug))).toBe(`${self.category}の他のツール`);
  });
});

describe('trackRelatedClick', () => {
  const globals = globalThis as unknown as { window?: unknown };
  let calls: unknown[][] = [];

  afterEach(() => {
    delete globals.window;
    calls = [];
  });

  it('relatedClickParams は from_tool・to_tool・link_source・transport_type だけを返す', () => {
    expect(relatedClickParams('furusato-nozei', 'nenmatsu-chosei', 'related')).toEqual({
      from_tool: 'furusato-nozei',
      to_tool: 'nenmatsu-chosei',
      link_source: 'related',
      transport_type: 'beacon',
    });
  });

  it('本番ホストでは related_click を beacon で送る', () => {
    globals.window = {
      location: { href: 'https://hasokon.com/tools/furusato-nozei/', hostname: 'hasokon.com' },
      gtag: (...args: unknown[]) => calls.push(args),
    };
    trackRelatedClick('furusato-nozei', 'aspect-ratio', 'category');
    expect(calls).toEqual([
      [
        'event',
        'related_click',
        {
          from_tool: 'furusato-nozei',
          to_tool: 'aspect-ratio',
          link_source: 'category',
          transport_type: 'beacon',
        },
      ],
    ]);
  });

  it('本番以外のホストでは送らない', () => {
    globals.window = {
      location: { href: 'https://test.hasokon.com/tools/', hostname: 'test.hasokon.com' },
      gtag: (...args: unknown[]) => calls.push(args),
    };
    trackRelatedClick('furusato-nozei', 'nenmatsu-chosei', 'related');
    expect(calls).toHaveLength(0);
  });
});
