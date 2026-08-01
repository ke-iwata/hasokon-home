'use client';

import { useEffect, useRef } from 'react';
import { ADSENSE_CLIENT, AD_SLOTS, isSlotReady, type AdPosition } from '@/lib/adsense';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * AdSenseの広告枠。位置ごとのスロットIDは lib/adsense.ts で管理する。
 *
 * スロットが未設定のときは、開発時のみレイアウト確認用のプレースホルダを表示し、
 * 本番ビルドでは何も出力しない（空の余白が残らないようにするため）。
 */
export default function AdUnit({ position }: { position: AdPosition }) {
  const ref = useRef<HTMLModElement>(null);
  const pushed = useRef(false);
  const ready = isSlotReady(position);

  useEffect(() => {
    if (!ready || pushed.current) return;
    // 開発時のStrictModeによる二重マウントで push が2回走ると
    // 「All ads on this page have already been shown」になるため一度だけにする
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* 広告ブロッカー等で読み込めない場合は何もしない */
    }
  }, [ready]);

  if (!ready) {
    if (process.env.NODE_ENV === 'production') return null;
    return (
      <div
        className="adslot"
        style={{
          border: '1px dashed var(--border)',
          borderRadius: 10,
          color: 'var(--muted)',
          fontSize: '0.8rem',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        広告枠（{position}）／lib/adsense.ts が未設定のため本番では非表示
      </div>
    );
  }

  return (
    <div className="adslot">
      <ins
        ref={ref}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={AD_SLOTS[position]}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
