'use client';

import { useEffect, useState } from 'react';
import ItemEditor, { makeItem } from './ItemEditor';
import GroupTool from './GroupTool';
import DiceTool from './DiceTool';
import { LISTS_KEY, type SavedList } from '@/lib/roulette/lists';
import { useLocalStorage } from '@/lib/roulette/useLocalStorage';
import { itemsFromHash } from '@/lib/roulette/share';
import { themeById } from '@/lib/roulette/themes';
import { guessEmoji } from '@/lib/roulette/emoji';
import type { Item } from '@/lib/roulette/types';

/** サイコロは項目の入力を必要としない */
export type RouletteToolId = 'group' | 'dice';

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
 * テーマ（配色）はカルーセルの札と共有画像の色にだけ使い、ページの配色は
 * サイト共通トークンに任せる（上書きするとライト/ダーク対応が壊れるため）。
 */
export default function ToolClient({ tool }: { tool: RouletteToolId }) {
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

  const update = (next: Item[]) => {
    setItems(next);
    setStored(next);
  };

  return (
    <div className="rl">
      <div className="app">
        {needsItems && (
          <ItemEditor
            items={items}
            onChange={update}
            lists={lists}
            onChangeLists={setLists}
            samples={tool === 'group' ? 'people' : 'choices'}
          />
        )}
        {tool === 'group' && <GroupTool items={items} theme={theme} />}
        {tool === 'dice' && <DiceTool theme={theme} />}
      </div>
    </div>
  );
}
