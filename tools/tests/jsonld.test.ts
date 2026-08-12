import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { breadcrumbFor, breadcrumbList, breadcrumbTrail, HOME_URL } from '@/lib/jsonld';
import { SITE_NAME, SITE_URL, tools } from '@/lib/registry';

/**
 * lib/jsonld.ts のパンくず（docs/features/breadcrumbs.md）のテスト。
 *
 * 見張っているのは3つ。
 *
 * 1. **末尾の段に item を付けないこと**。現在地は自分自身を指すため、
 *    Google の推奨では item を省く
 * 2. **名前を registry から引くこと**。ページ側で手書きすると、
 *    ツール名を変えたときに検索結果のパンくずだけ古い名前が残る
 * 3. **ツールを1本足したらパンくずも付いてくること**。registry にあるのに
 *    ページが Breadcrumb を出していない、という取りこぼしを検知する
 */

const appDir = fileURLToPath(new URL('../app/', import.meta.url));

describe('breadcrumbTrail', () => {
  it('一覧ページ自身は2段で、末尾（一覧）はリンクにしない', () => {
    expect(breadcrumbTrail()).toEqual([
      { name: 'ホーム', url: HOME_URL },
      { name: SITE_NAME },
    ]);
  });

  it('個別ページは ホーム ＞ サイト名 ＞ 現在地 の3段になる', () => {
    expect(breadcrumbTrail('睡眠サイクル計算機')).toEqual([
      { name: 'ホーム', url: HOME_URL },
      { name: SITE_NAME, url: `${SITE_URL}/`, path: '/' },
      { name: '睡眠サイクル計算機' },
    ]);
  });

  it('ホームは basePath の外なので path を持たない（<a> で飛ばすため）', () => {
    const [home, site] = breadcrumbTrail('割り勘計算機');
    expect(home.path).toBeUndefined();
    expect(home.url).toBe('https://hasokon.com/');
    // 一覧は basePath 配下。<Link> 用のパスと JSON-LD 用の絶対URLの両方を持つ
    expect(site.path).toBe('/');
    expect(site.url).toBe('https://hasokon.com/tools/');
  });
});

describe('breadcrumbFor', () => {
  it('名前を registry から引く（ページ側で手書きしない）', () => {
    for (const tool of tools) {
      const trail = breadcrumbFor(tool.slug);
      expect(trail).toHaveLength(3);
      expect(trail[2]).toEqual({ name: tool.name });
    }
  });

  it('registry に無い slug は投げる（ビルドで気づけるようにする）', () => {
    expect(() => breadcrumbFor('sleep-cycl')).toThrow(/registry/);
  });
});

describe('breadcrumbList', () => {
  const list = breadcrumbList(breadcrumbFor('sleep-cycle'));

  it('仕様書どおりの BreadcrumbList になる', () => {
    expect(list).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'ホーム', item: 'https://hasokon.com/' },
        {
          '@type': 'ListItem',
          position: 2,
          name: '無料計算ツール集',
          item: 'https://hasokon.com/tools/',
        },
        { '@type': 'ListItem', position: 3, name: '睡眠サイクル計算機' },
      ],
    });
  });

  it('末尾の要素に item が無い', () => {
    const last = list.itemListElement[list.itemListElement.length - 1];
    expect(last).not.toHaveProperty('item');
  });

  it('position は1から連番で、item はすべて絶対URL', () => {
    for (const [i, el] of list.itemListElement.entries()) {
      expect(el.position).toBe(i + 1);
      if ('item' in el) expect(el.item).toMatch(/^https:\/\/hasokon\.com\//);
    }
  });

  it('一覧ページの2段でも末尾に item が付かない', () => {
    const top = breadcrumbList(breadcrumbTrail());
    expect(top.itemListElement).toHaveLength(2);
    expect(top.itemListElement[1]).toEqual({
      '@type': 'ListItem',
      position: 2,
      name: SITE_NAME,
    });
  });
});

describe('各ツールページ', () => {
  it('registry のツールはすべてパンくずを出している', () => {
    for (const tool of tools) {
      const src = readFileSync(`${appDir}${tool.slug}/page.tsx`, 'utf8');
      expect(src, `${tool.slug}: breadcrumbFor が無い`).toContain(`breadcrumbFor('${tool.slug}')`);
      expect(src, `${tool.slug}: <Breadcrumb> が無い`).toContain('<Breadcrumb trail={trail} />');
      expect(src, `${tool.slug}: BreadcrumbList が @graph に無い`).toContain(
        'breadcrumbList(trail)'
      );
    }
  });

  it('JSON-LD の <script> は1ページに1枚のまま', () => {
    for (const tool of tools) {
      const src = readFileSync(`${appDir}${tool.slug}/page.tsx`, 'utf8');
      expect(src.match(/type="application\/ld\+json"/g)).toHaveLength(1);
    }
  });
});
