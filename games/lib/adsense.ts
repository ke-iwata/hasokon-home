/**
 * Google AdSense の設定
 *
 * パブリッシャーIDと広告ユニットのスロットIDをここだけで管理する。
 * これらは公開情報（ページのHTMLに出る）なので、環境変数や Secrets にする必要はない。
 *
 * 旧サイト（roulette.hasokon.com）から引き継いだ審査済みアカウントを使っている。
 * 旧サイトは自動広告のみで運用していたため、AD_SLOTS は未設定のまま。
 * スクリプトが入っていれば自動広告は動く。
 *
 * 【データ更新箇所】
 * - 手動で広告枠を置きたくなったら、AdSense管理画面で広告ユニットを作って
 *   AD_SLOTS にスロットIDを入れる（入れるまで枠は出力されない）
 *
 * ADSENSE_CLIENT を空にすると、広告スクリプトも広告枠も出力されなくなる。
 * ads.txt はドメイン直下の home/ads.txt（静的ファイル）で配信しているため、
 * パブリッシャーIDを変えるときはそちらも揃えて直すこと。
 */

/**
 * AdSenseのパブリッシャーID。
 * 旧サイト（roulette.hasokon.com）で審査に通っているアカウントをそのまま使う。
 */
export const ADSENSE_CLIENT = 'ca-pub-6219232655608058';

/** 広告の設置位置。計算機より上には置かない（UX悪化→直帰率上昇→順位下落を避けるため） */
export type AdPosition = 'below-tool' | 'below-faq';

/**
 * 位置ごとの広告ユニットのスロットID（例: '1234567890'）。
 * 同じ位置の広告は全ページで同じユニットを使い回してよい。
 */
export const AD_SLOTS: Record<AdPosition, string> = {
  'below-tool': '',
  'below-faq': '',
};

/** 広告配信が有効か（パブリッシャーIDが設定済みか） */
export function isAdsEnabled(): boolean {
  return ADSENSE_CLIENT.startsWith('ca-pub-');
}

/** 指定位置の広告を表示できるか（パブリッシャーIDとスロットIDの両方が必要） */
export function isSlotReady(position: AdPosition): boolean {
  return isAdsEnabled() && AD_SLOTS[position] !== '';
}
