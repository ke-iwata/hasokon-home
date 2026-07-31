import { describe, expect, it } from 'vitest';
import {
  gcd,
  simplify,
  nearestCommonRatio,
  scaleByWidth,
  scaleByHeight,
} from '@/lib/aspect-ratio';

describe('gcd', () => {
  it('gcd(1920, 1080) = 120', () => {
    expect(gcd(1920, 1080)).toBe(120);
  });

  it('境界: gcd(a, 0) = a、gcd(0, 0) = 0', () => {
    expect(gcd(12, 0)).toBe(12);
    expect(gcd(0, 12)).toBe(12);
    expect(gcd(0, 0)).toBe(0);
  });

  it('負の数は絶対値で計算する', () => {
    expect(gcd(-48, 36)).toBe(12);
  });
});

describe('simplify（最簡分数の比）', () => {
  it('1920x1080 → 16:9', () => {
    expect(simplify(1920, 1080)).toEqual({ w: 16, h: 9 });
  });

  it('1280x1024 → 5:4', () => {
    expect(simplify(1280, 1024)).toEqual({ w: 5, h: 4 });
  });

  it('互いに素な値（1919x1080）はそのまま', () => {
    expect(simplify(1919, 1080)).toEqual({ w: 1919, h: 1080 });
  });

  it('0や負の入力は null', () => {
    expect(simplify(0, 1080)).toBeNull();
    expect(simplify(1920, 0)).toBeNull();
    expect(simplify(-1920, 1080)).toBeNull();
  });
});

describe('nearestCommonRatio（よく使う比率との照合）', () => {
  it('1920x1080 は 16:9 にぴったり一致', () => {
    const m = nearestCommonRatio(1920, 1080);
    expect(m?.label).toBe('16:9');
    expect(m?.exact).toBe(true);
    expect(m?.diffPercent).toBe(0);
  });

  it('1919x1080 は 16:9 に近い（完全一致ではない）', () => {
    const m = nearestCommonRatio(1919, 1080);
    expect(m?.label).toBe('16:9');
    expect(m?.exact).toBe(false);
    expect(m?.diffPercent).toBeGreaterThan(0);
    expect(m?.diffPercent).toBeLessThan(1);
  });

  it('1280x1024 は 5:4 にぴったり一致', () => {
    const m = nearestCommonRatio(1280, 1024);
    expect(m?.label).toBe('5:4');
    expect(m?.exact).toBe(true);
  });

  it('1080x1920（縦動画）は 9:16', () => {
    const m = nearestCommonRatio(1080, 1920);
    expect(m?.label).toBe('9:16');
    expect(m?.exact).toBe(true);
  });

  it('0入力は null', () => {
    expect(nearestCommonRatio(0, 1080)).toBeNull();
    expect(nearestCommonRatio(1920, 0)).toBeNull();
  });
});

describe('scaleByWidth / scaleByHeight（比率を保った変換）', () => {
  it('16:9 で幅1280 → 高さ720', () => {
    expect(scaleByWidth(1920, 1080, 1280)).toBe(720);
  });

  it('端数は四捨五入する（16:9 で幅1000 → 563）', () => {
    expect(scaleByWidth(1920, 1080, 1000)).toBe(563);
  });

  it('scaleByHeight: 16:9 で高さ720 → 幅1280', () => {
    expect(scaleByHeight(1920, 1080, 720)).toBe(1280);
  });

  it('元サイズが0なら null、新しい幅が0なら 0', () => {
    expect(scaleByWidth(0, 1080, 1280)).toBeNull();
    expect(scaleByWidth(1920, 0, 1280)).toBeNull();
    expect(scaleByWidth(1920, 1080, 0)).toBe(0);
  });
});
