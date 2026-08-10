'use client';

import { useEffect, useRef, useState } from 'react';
import Carousel from './Carousel';
import ItemEditor, { makeItem } from './ItemEditor';
import ResultOverlay from './ResultOverlay';
import { shareCard } from '@/lib/roulette/resultImage';
import { pickWinner } from '@/lib/roulette/draw';
import { LISTS_KEY, type SavedList } from '@/lib/roulette/lists';
import { useLocalStorage } from '@/lib/roulette/useLocalStorage';
import { itemsFromHash, shareUrl } from '@/lib/roulette/share';
import { THEMES, themeById } from '@/lib/roulette/themes';
import { guessEmoji } from '@/lib/roulette/emoji';
import { trackToolUse } from '@/lib/analytics';
import type { Item } from '@/lib/roulette/types';

type Screen = 'setup' | 'play';

export interface RoulettePreset {
  slug: string;
  name: string;
  items: { emoji: string; text: string }[];
}

/** URLのハッシュに項目が埋め込まれていれば読み出す（共有リンク） */
function fromShared(): Item[] | null {
  const shared = itemsFromHash();
  if (!shared) return null;
  return shared.map((s) => ({
    ...makeItem(s.text),
    emoji: s.emoji || guessEmoji(s.text),
  }));
}

/**
 * ルーレット本体。
 *
 * 移植元（spin-roulette）ではテーマの色を documentElement に適用していたが、
 * --bg / --text などの変数名が本サイトと重複しており、ヘッダー・フッターの色まで
 * 変わってしまう。ここではラッパー要素（.rl）にだけ適用する。
 */
export default function RouletteApp({ preset }: { preset?: RoulettePreset }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [stored, setStored] = useLocalStorage<Item[]>('roulette:items:v2', []);
  const [themeId, setThemeId] = useLocalStorage<string>('roulette:theme', 'pop');
  const [items, setItems] = useState<Item[]>([]);
  const [screen, setScreen] = useState<Screen>('setup');
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Item | null>(null);
  const [copied, setCopied] = useState(false);
  const [spinKey, setSpinKey] = useState(0);
  const [lists, setLists] = useLocalStorage<SavedList[]>(LISTS_KEY, []);

  const theme = themeById(themeId);
  const ready = items.length >= 2;

  // 静的書き出しのため、localStorage と URL ハッシュの読み出しはマウント後に行う
  // （サーバー側の描画結果と食い違わせない）
  useEffect(() => {
    const initial =
      fromShared() ??
      (preset ? preset.items.map((i) => ({ ...makeItem(i.text), emoji: i.emoji })) : stored);
    setItems(initial);
    // stored は初回のみ参照する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (next: Item[]) => {
    setItems(next);
    if (!preset) setStored(next);
    if (location.hash) window.history.replaceState(null, '', location.pathname);
  };

  // テーマの色はラッパー要素にだけ適用する
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    Object.entries(theme.vars).forEach(([k, v]) => el.style.setProperty(k, v));
    el.dataset.theme = theme.id;
  }, [theme]);

  useEffect(() => {
    const onHash = () => {
      const shared = fromShared();
      if (shared) setItems(shared);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // ルーレット画面ではスペースキーでも回せる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space' && screen === 'play' && !spinning && !winner && ready) {
        e.preventDefault();
        setSpinKey((n) => n + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, spinning, winner, ready]);

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(items));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* クリップボードが使えない環境では何もしない */
    }
  };

  return (
    <div className="rl" ref={rootRef}>
      <div className="app">
        {screen === 'setup' ? (
          <>
            <ItemEditor items={items} onChange={update} lists={lists} onChangeLists={setLists} />


            <div className="themes" role="group" aria-label="配色を選ぶ">
              <span className="themes-label">配色</span>
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`theme-swatch ${t.id === themeId ? 'active' : ''}`}
                  onClick={() => setThemeId(t.id)}
                  aria-pressed={t.id === themeId}
                >
                  <span className="swatch-dots" aria-hidden>
                    {t.cards.slice(0, 4).map((c) => (
                      <i key={c} style={{ background: c }} />
                    ))}
                  </span>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="go">
              <button
                type="button"
                className="btn btn-primary btn-go"
                onClick={() => setScreen('play')}
                disabled={!ready}
              >
                回す
              </button>
              <p className="go-note">
                {ready
                  ? `${items.length} 個の項目でルーレットを作ります`
                  : '項目を2つ以上入れると回せます'}
              </p>
            </div>
          </>
        ) : (
          <main className="play">
            <div className="play-bar">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setScreen('setup')}
                disabled={spinning}
              >
                ← 項目を編集
              </button>
              <button type="button" className="btn btn-ghost" onClick={copyShare} disabled={spinning}>
                {copied ? 'コピーしました' : 'リンクをコピー'}
              </button>
            </div>

            <Carousel
              items={items}
              theme={theme}
              spinning={spinning}
              spinSignal={spinKey}
              onSpinStart={() => {
                setSpinning(true);
                trackToolUse('roulette', 'spin');
              }}
              pick={(list) => pickWinner(list)}
              onResult={(item) => {
                setSpinning(false);
                setWinner(item);
              }}
            />

            <p className="play-note">
              {spinning ? '回転中…' : 'ボタン、またはスペースキーで回せます'}
            </p>
          </main>
        )}

        {winner && (
          <ResultOverlay
            winner={winner.text}
            emoji={winner.emoji}
            onShareImage={() =>
              shareCard({
                heading: preset ? preset.name : 'ルーレットの結果',
                main: winner.text,
                emoji: winner.emoji,
                accent: theme.vars['--accent'],
              })
            }
            onAgain={() => {
              setWinner(null);
              setSpinKey((n) => n + 1);
            }}
            onRemoveAndAgain={() => {
              const next = items.filter((x) => x.id !== winner.id);
              update(next);
              setWinner(null);
              if (next.length >= 2) setSpinKey((n) => n + 1);
              else setScreen('setup');
            }}
            onClose={() => setWinner(null)}
          />
        )}
      </div>
    </div>
  );
}
