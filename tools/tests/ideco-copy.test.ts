import { createRequire } from 'node:module';
import { createElement, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import Calculator from '@/app/ideco/Calculator';
import { metadata } from '@/app/ideco/page';
import { KEIKA_SOCHI_UNTIL, keikaSochiUntilLabel } from '@/lib/ideco';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * iDeCo の文面のテスト（docs/features/r8-12gatsu-1gatsu-shikogo-copy.md）。
 *
 * 1. Calculator の「延びます／延びました」「倍になります／倍になりました」が施行日で切り替わること。
 *    静的HTMLはビルドした日で描かれるので、サーバ描画（= buildDate で判定）で両方の枝を見る
 * 2. 70歳までの加入の条件に、厚労省資料の加入歴の3パターンと経過措置の期限が書かれていること
 */

// tools は @types/react-dom を入れていないので、型だけ書いて require で読む
const { renderToStaticMarkup } = createRequire(join(__dirname, 'x'))('react-dom/server') as {
  renderToStaticMarkup: (el: ReactElement) => string;
};

const render = (buildDate: string) =>
  renderToStaticMarkup(createElement(Calculator, { buildDate }));

describe('Calculator の時制は施行日（2026-12-01）で切り替わる', () => {
  it('施行前（2026-11-30）は「延びます」「倍になります」', () => {
    const html = render('2026-11-30T12:00:00+09:00');
    expect(html).toContain('延びます');
    expect(html).toMatch(/倍になります。/);
    expect(html).not.toContain('延びました');
  });

  it('施行後（2026-12-01）は「延びました」「倍になりました」', () => {
    const html = render('2026-12-01T12:00:00+09:00');
    expect(html).toContain('延びました');
    expect(html).toMatch(/倍になりました。/);
    expect(html).not.toContain('延びます');
    expect(html).not.toMatch(/倍になります。/);
  });

  it('累計の注記は条件の括弧書きを持たず、解説に寄せる', () => {
    for (const d of ['2026-11-30T12:00:00+09:00', '2026-12-01T12:00:00+09:00']) {
      const html = render(d);
      expect(html).not.toContain('受給していないことが条件');
      expect(html).toContain('加入を続けられる条件は下の解説をご覧ください');
      expect(html).toContain('70歳までの累計は、60歳以降も加入を続けられる条件に当たる場合の計算です');
    }
  });
});

describe('70歳までの加入の条件', () => {
  const src = readFileSync(join(__dirname, '../app/ideco/page.tsx'), 'utf8');

  it('経過措置の期限は定数から「2029年11月末」と書く', () => {
    expect(KEIKA_SOCHI_UNTIL).toBe('2029-11-30');
    expect(keikaSochiUntilLabel()).toBe('2029年11月末');
    // 本文に日付を直書きしない（定数を変えたら本文も変わるように）
    expect(src).not.toContain('2029年11月末');
    expect(src).toContain('{keikaSochiUntil}までは経過措置');
  });

  it('本文に厚労省資料の3パターンと受給開始後は加入できない旨がある', () => {
    for (const s of [
      '直前までiDeCoに掛金を出していた',
      '直前まで運用指図者だった',
      '企業型DCなどの資産をiDeCoに移す',
      '老齢基礎年金やiDeCoの老齢給付金を受け取り始めた方は加入できません',
    ]) {
      expect(src, s).toContain(s);
    }
    expect(src).toContain('https://www.mhlw.go.jp/content/12500000/001714615.pdf');
  });

  it('マッチング拠出の除外は一次情報で確認できるまで本文に書かない', () => {
    expect(src).not.toMatch(/マッチング拠出をしている方も加入できません/);
  });

  it('description は数字を変えていない', () => {
    expect(String(metadata.description)).toContain('2.3万円→6.2万円');
  });
});
