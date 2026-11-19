// @vitest-environment jsdom
/**
 * 大富豪の最初の画面。
 * 仕様: docs/features/daifugo-first-view.md
 *
 * - A. スタート前は CPU の席に「考え中…」を出さず、♦3 を持つ CPU 席だけに「♦3を持っています」
 * - B. 戦績の帯は1試合以上遊んだ人だけ／ローカルルールは強さ・速さの行の中／
 *      手札と「出す」はひとまとめの箱（スマホではこれを画面の下に貼り付ける）
 * - C. スタートの幕には1行の案内とボタンだけ。場の文言は出さず、幕は手札を覆わない
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Game from '@/app/daifugo/Game';
import { DEFAULT_RULES, newMatch } from '@/lib/daifugo';
import { recordResult } from '@/lib/records';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics', () => ({ trackToolUse: track }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 再現できる乱数。配りを決め打ちするために Math.random を差し替える */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ♦3 を持つ人（＝配った直後の手番）が `who` になる種を探す */
function seedWhere(who: 'human' | 'cpu'): number {
  for (let seed = 1; seed < 500; seed++) {
    const turn = newMatch('normal', DEFAULT_RULES, mulberry32(seed)).state.turn;
    if ((who === 'human') === (turn === 0)) return seed;
  }
  throw new Error('種が見つからない');
}

let root: Root | null = null;
let host: HTMLDivElement;

function mount(seed: number) {
  vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(Game)));
}

beforeEach(() => {
  vi.useFakeTimers();
  track.mockClear();
  localStorage.clear();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const $ = (sel: string) => host.querySelector(sel);
const $$ = (sel: string) => Array.from(host.querySelectorAll(sel));
const byText = (text: string) => {
  const b = $$('button').find((x) => x.textContent?.trim() === text) as HTMLButtonElement | undefined;
  if (!b) throw new Error(`ボタン「${text}」が無い`);
  return b;
};
const seatStates = () => $$('.df-seat-state').map((e) => e.textContent ?? '');

describe('A. スタート前の席の表示', () => {
  it('CPU が ♦3 を持つ配り：考え中は出さず、その席だけに「♦3を持っています」', () => {
    mount(seedWhere('cpu'));
    expect(host.textContent).not.toContain('考え中');
    expect($$('.df-seat.active')).toHaveLength(0);
    const holders = seatStates().filter((t) => t.includes('♦3を持っています'));
    expect(holders).toEqual(['♦3を持っています（先に出します）']);

    // しばらく待っても CPU は動かず、表示も変わらない
    act(() => vi.advanceTimersByTime(5000));
    expect(host.textContent).not.toContain('考え中');

    // スタートを押すと、その席が「考え中…」になり枠が強調される
    act(() => byText('スタート').click());
    expect(seatStates().some((t) => t.includes('♦3を持っています'))).toBe(false);
    expect(seatStates()).toContain('考え中…');
    expect($$('.df-seat.active')).toHaveLength(1);
  });

  it('自分が ♦3 を持つ配り：席には何も出さず、案内は下の1行が言う', () => {
    mount(seedWhere('human'));
    expect(host.textContent).not.toContain('考え中');
    expect(seatStates().some((t) => t.includes('♦3'))).toBe(false);
    expect($('.df-msg')?.textContent).toContain('あなたが♦3を持っています');
  });
});

describe('C. スタートの幕', () => {
  it('幕には1行の案内とスタートだけ。場の「場は空です」は出さない', () => {
    mount(seedWhere('cpu'));
    expect($('.start-gate-note')?.textContent).toBe(
      'あなたが大富豪を目指す5回戦。最初に ♦3 を持つ人が出します',
    );
    expect($('.df-field')?.textContent).not.toContain('場は空です');
    act(() => byText('スタート').click());
    expect($('.start-gate-note')).toBeNull();
  });

  it('幕は場の上だけにかかり、手札と「出す」を覆わない。♦3を選んで出すと始まる', () => {
    mount(seedWhere('human'));
    const gate = $('.start-gate')!;
    expect(gate.querySelector('.start-gate-veil')).not.toBeNull();
    expect(gate.contains($('.df-hand'))).toBe(false);
    expect(gate.contains(byText('出す'))).toBe(false);

    // 出せる札（薄くなっていない札）を1枚選んで出す。最初の手は♦3を含む役だけが出せる
    const playable = $$('.df-hand .df-slot:not(.dim) button')[0] as HTMLButtonElement;
    act(() => playable.click());
    const play = $$('button').find((b) => b.textContent?.startsWith('出す')) as HTMLButtonElement;
    expect(play.disabled).toBe(false);
    act(() => play.click());

    expect($('.start-gate-veil')).toBeNull();
    expect(track).toHaveBeenCalledWith('daifugo', 'begin-normal');
  });
});

describe('B. 最初の画面に手札を入れる', () => {
  it('初めての人には戦績の帯を出さない', () => {
    mount(seedWhere('cpu'));
    expect($('.rec-strip')).toBeNull();
  });

  it('1試合以上遊んだ人には戦績の帯を出す（強さを変えても出たまま）', () => {
    recordResult('daifugo', { outcome: 'win', score: 12 }, 'hard');
    mount(seedWhere('cpu'));
    expect($('.rec-strip')?.textContent).toContain('ふつうとの対戦');
    act(() => byText('つよい').click());
    expect($('.rec-strip')?.textContent).toContain('1回 大富豪 / 1試合');
  });

  it('ローカルルールは強さ・速さの行の中にあり、切り替えの説明が先頭にある', () => {
    mount(seedWhere('cpu'));
    const rules = $('.df-toolbar > details.df-rules')!;
    expect(rules).not.toBeNull();
    expect(rules.querySelector('.df-rules-body > .df-rule-note')?.textContent).toBe(
      '切り替えると試合を最初からやり直します。',
    );
  });

  it('席の名前と枚数は1つの行に並ぶ', () => {
    mount(seedWhere('cpu'));
    const heads = $$('.df-seat-head');
    expect(heads).toHaveLength(3);
    for (const h of heads) {
      expect(h.querySelector('.df-seat-name')).not.toBeNull();
      expect(h.querySelector('.df-seat-count')?.textContent).toMatch(/^\d+枚$/);
    }
  });

  it('手札と「出す／パス」は1つの箱（.df-dock）に入っている', () => {
    mount(seedWhere('cpu'));
    const dock = $('.df-dock')!;
    expect(dock.querySelector('.df-hand')).not.toBeNull();
    expect(dock.contains(byText('パス'))).toBe(true);
  });
});

describe('B-4. スマホの貼り付け（globals.css）', () => {
  const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');
  /** ファイル末尾側の @media (max-width: 600px) の中にあるか（途中に置くと後ろの規則に負ける） */
  const ruleBody = (selector: string) => {
    const at = css.lastIndexOf(`${selector} {`);
    expect(at, `${selector} が無い`).toBeGreaterThan(0);
    const media = css.lastIndexOf('@media (max-width: 600px)', at);
    expect(media).toBeGreaterThan(css.lastIndexOf('/* ---- 大富豪（docs/features/game-daifugo.md） ---- */'));
    return css.slice(at, css.indexOf('}', at));
  };

  it('手札の箱を下に貼り付け、高さは画面の40%まで・ホームバーを避け・背景は透けない', () => {
    const dock = ruleBody('.df-daifugo .df-dock');
    expect(dock).toContain('position: sticky');
    expect(dock).toContain('bottom: 0');
    expect(dock).toContain('max-height: 40vh');
    expect(dock).toContain('env(safe-area-inset-bottom)');
    expect(dock).toContain('background: var(--surface-2)');
  });

  it('収まらない札は横に送り、縦には伸ばさない', () => {
    const hand = ruleBody('.df-daifugo .df-hand');
    expect(hand).toContain('flex-wrap: nowrap');
    expect(hand).toContain('overflow-x: auto');
  });

  it('パソコン向けの規則では貼り付けない', () => {
    const desktop = css.slice(0, css.indexOf('@media (max-width: 600px)', css.indexOf('.df-daifugo .df-actions {')));
    expect(desktop).not.toMatch(/\.df-daifugo \.df-dock \{[^}]*sticky/);
  });
});
