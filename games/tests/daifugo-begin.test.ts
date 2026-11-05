// @vitest-environment jsdom
/**
 * 大富豪の「1局始めた」イベント（`begin-<強さ>`）。
 * 仕様: docs/features/desktop-one-screen-card-games.md の「計測」
 *
 * 試合ごとに最初に begun が true になった瞬間に1回だけ送る。
 * 開いただけ（配った直後）では送らない。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Game from '@/app/daifugo/Game';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics', () => ({ trackToolUse: track }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  track.mockClear();
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(Game)));
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host.remove();
  vi.useRealTimers();
});

const buttons = () => Array.from(host.querySelectorAll('button'));
const byText = (text: string) => {
  const b = buttons().find((x) => x.textContent?.trim() === text);
  if (!b) throw new Error(`ボタン「${text}」が無い`);
  return b;
};
const begins = () =>
  track.mock.calls.filter(([slug, action]) => slug === 'daifugo' && String(action).startsWith('begin-'));

describe('大富豪の begin-* イベント', () => {
  it('開いただけでは送らない', () => {
    act(() => vi.advanceTimersByTime(5000));
    expect(begins()).toHaveLength(0);
  });

  it('スタートを押すと begin-<強さ> を1回だけ送る（その後CPUが動いても増えない）', () => {
    act(() => byText('スタート').click());
    expect(begins()).toEqual([['daifugo', 'begin-normal']]);
    for (let i = 0; i < 20; i++) act(() => vi.advanceTimersByTime(2000));
    expect(begins()).toHaveLength(1);
  });

  it('強さを変えると新しい試合として数え直す', () => {
    act(() => byText('スタート').click());
    act(() => byText('つよい').click());
    expect(track).toHaveBeenCalledWith('daifugo', 'new-hard');
    // 強さを変えた直後（まだスタートしていない）は送らない
    expect(begins()).toEqual([['daifugo', 'begin-normal']]);
    act(() => byText('スタート').click());
    expect(begins()).toEqual([
      ['daifugo', 'begin-normal'],
      ['daifugo', 'begin-hard'],
    ]);
  });
});
