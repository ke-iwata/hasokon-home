import {
  BabyIcon,
  BicycleIcon,
  CalendarCheckIcon,
  CalendarDotsIcon,
  CoinsIcon,
  CropIcon,
  CurrencyJpyIcon,
  DiceFiveIcon,
  FirstAidKitIcon,
  GiftIcon,
  GraduationCapIcon,
  HandHeartIcon,
  HandCoinsIcon,
  HospitalIcon,
  MoonStarsIcon,
  PiggyBankIcon,
  ReceiptIcon,
  ScalesIcon,
  SnowflakeIcon,
  TargetIcon,
  TextAaIcon,
  TimerIcon,
  TranslateIcon,
  UsersThreeIcon,
  WallIcon,
} from '@phosphor-icons/react/dist/ssr';

/**
 * ツールのアイコン。
 *
 * registry の `icon`（Phosphor のアイコン名）から実体を引く。
 * 使うアイコンだけを明示的に import している。ライブラリには3000個あるので
 * 動的に解決するとバンドルに全部入ってしまう。
 *
 * 絵文字をやめた理由: 端末ごとに絵柄も色も変わり、iOSでは常にカラー絵文字として
 * 描画されるためサイトの配色に馴染まない。線画なら太さと色をこちらで統一できる。
 *
 * import 元が `/dist/ssr` なのは、通常のエントリが 'use client' 付きのため。
 * ここはサーバーコンポーネントのまま描画したい。
 * 名前に `Icon` が付くほうを使うこと（素の `Wall` などは非推奨エイリアス）。
 */

/** Phosphor のアイコンコンポーネントの型（/dist/ssr は型を再エクスポートしていない） */
type PhosphorIcon = typeof WallIcon;

const ICONS: Record<string, PhosphorIcon> = {
  Baby: BabyIcon,
  Bicycle: BicycleIcon,
  CalendarCheck: CalendarCheckIcon,
  CalendarDots: CalendarDotsIcon,
  Coins: CoinsIcon,
  Crop: CropIcon,
  CurrencyJpy: CurrencyJpyIcon,
  DiceFive: DiceFiveIcon,
  FirstAidKit: FirstAidKitIcon,
  Gift: GiftIcon,
  GraduationCap: GraduationCapIcon,
  HandHeart: HandHeartIcon,
  HandCoins: HandCoinsIcon,
  Hospital: HospitalIcon,
  MoonStars: MoonStarsIcon,
  PiggyBank: PiggyBankIcon,
  Receipt: ReceiptIcon,
  Scales: ScalesIcon,
  Snowflake: SnowflakeIcon,
  Target: TargetIcon,
  TextAa: TextAaIcon,
  Timer: TimerIcon,
  Translate: TranslateIcon,
  UsersThree: UsersThreeIcon,
  Wall: WallIcon,
};

export default function ToolIcon({ name, size = 22 }: { name: string; size?: number }) {
  const Cmp = ICONS[name];
  // 名前を間違えても落とさない。アイコンが出ないだけで済ませる
  if (!Cmp) return null;
  // 線の太さはサイト全体で regular に統一する
  return <Cmp size={size} weight="regular" aria-hidden="true" />;
}
