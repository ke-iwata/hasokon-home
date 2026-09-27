import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import RootLayout from '@/app/layout';
import { ADSENSE_CLIENT, isAdsEnabled } from '@/lib/adsense';
import { GA_MEASUREMENT_ID, isAnalyticsEnabled } from '@/lib/analytics';

/**
 * app/layout.tsx の <head> のテスト（docs/features/mobile-lighthouse-third-party.md の A）。
 *
 * 広告・計測スクリプトの接続を先に張る preconnect が出ていることを見る。
 * RootLayout はフックを使わないので、関数として呼んで返ってきた要素の木をたどる。
 */
type Props = { children?: ReactNode; [key: string]: unknown };

/** 要素の木から、指定したタグの要素の props をすべて集める */
function collect(node: ReactNode, tag: string): Props[] {
  if (Array.isArray(node)) return node.flatMap((n) => collect(n, tag));
  if (!isValidElement(node)) return [];
  const el = node as ReactElement<Props>;
  const self = el.type === tag ? [el.props] : [];
  return [...self, ...collect(el.props.children, tag)];
}

const tree = RootLayout({ children: null });
const head = collect(tree, 'head')[0];

const preconnects = collect(head?.children, 'link')
  .filter((p) => p.rel === 'preconnect')
  .map((p) => ({ href: p.href, crossOrigin: p.crossOrigin !== undefined }));

const scriptSrcs = collect(head?.children, 'script').map((p) => String(p.src));

describe('layout の <head>', () => {
  it('AdSense の配信元へ crossorigin つきで preconnect する（adsbygoogle.js は CORS で取られる）', () => {
    expect(isAdsEnabled()).toBe(true);
    expect(preconnects).toContainEqual({
      href: 'https://pagead2.googlesyndication.com',
      crossOrigin: true,
    });
  });

  it('gtag.js の配信元へ preconnect する', () => {
    expect(isAnalyticsEnabled()).toBe(true);
    expect(preconnects.map((p) => p.href)).toContain('https://www.googletagmanager.com');
  });

  it('preconnect は2本まで（多いほど効かなくなる）', () => {
    expect(preconnects).toHaveLength(2);
  });

  it('AdSense・gtag.js 本体の <script> はそのまま出ている', () => {
    expect(scriptSrcs.some((src) => src.endsWith(`adsbygoogle.js?client=${ADSENSE_CLIENT}`))).toBe(true);
    expect(scriptSrcs.some((src) => src.endsWith(`gtag/js?id=${GA_MEASUREMENT_ID}`))).toBe(true);
  });
});
