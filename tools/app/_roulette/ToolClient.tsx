'use client';

import { useEffect, useRef, useState } from 'react';
import ItemEditor, { makeItem } from './ItemEditor';
import GroupTool from './GroupTool';
import DiceTool from './DiceTool';
import AmidaTool from './AmidaTool';
import TournamentTool from './TournamentTool';
import { LISTS_KEY, type SavedList } from '@/lib/roulette/lists';
import { useLocalStorage } from '@/lib/roulette/useLocalStorage';
import { itemsFromHash } from '@/lib/roulette/share';
import { themeById } from '@/lib/roulette/themes';
import { guessEmoji } from '@/lib/roulette/emoji';
import type { Item } from '@/lib/roulette/types';

/** サイコロは項目の入力を必要としない */
export type RouletteToolId = 'group' | 'amida' | 'dice' | 'tournament';

function fromShared(): Item[] | null {
  const shared = itemsFromHash();
  if (!shared) return null;
  return shared.map((s) => ({
    ...makeItem(s.text),
    emoji: s.emoji || guessEmoji(s.text),
  }));
}

/**
 * グループ分け・あみだくじ・サイコロ・トーナメント表の操作部分。
 *
 * 解説やFAQは各ページのサーバーコンポーネント側にあるので、ここは操作だけを持つ。
 * テーマの色は本サイトと変数名が重複するため、ラッパー要素（.rl）にだけ適用する。
 */
export default function ToolClient({ tool }: { tool: RouletteToolId }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [stored, setStored] = useLocalStorage<Item[]>('roulette:items:v2', []);
  const [themeId] = useLocalStorage<string>('roulette:theme', 'pop');
  const [lists, setLists] = useLocalStorage<SavedList[]>(LISTS_KEY, []);
  const [items, setItems] = useState<Item[]>([]);

  const theme = themeById(themeId);
  const needsItems = tool !== 'dice';

  // 静的書き出しのため、端末に保存された値の読み出しはマウント後に行う
  useEffect(() => {
    setItems(fromShared() ?? stored);
    // stored は初回のみ参照する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    Object.entries(theme.vars).forEach(([k, v]) => el.style.setProperty(k, v));
    el.dataset.theme = theme.id;
  }, [theme]);

  const update = (next: Item[]) => {
    setItems(next);
    setStored(next);
  };

  return (
    <div className="rl" ref={rootRef}>
      <div className="app">
        {needsItems && (
          <ItemEditor items={items} onChange={update} lists={lists} onChangeLists={setLists} />
        )}
        {tool === 'group' && <GroupTool items={items} theme={theme} />}
        {tool === 'amida' && <AmidaTool items={items} theme={theme} />}
        {tool === 'dice' && <DiceTool theme={theme} />}
        {tool === 'tournament' && <TournamentTool items={items} theme={theme} />}
      </div>
    </div>
  );
}
