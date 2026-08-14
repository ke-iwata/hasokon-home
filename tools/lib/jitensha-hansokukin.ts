/**
 * 自転車の反則金（青切符）早見表・チェッカーのデータとロジック
 *
 * 2026年（令和8年）4月1日から、自転車をはじめとする軽車両にも
 * 交通反則通告制度（いわゆる青切符）が適用された。
 * 根拠は「道路交通法の一部を改正する法律」（**令和6年法律第34号**）。
 * 対象は**16歳以上**の運転者で、16歳未満は従来どおり指導警告にとどまる。
 *
 * このツールは計算機ではなく「行為 → 違反名・反則金」を引くための分類ツール。
 * したがってロジックの中身は検索とグループ化で、テストも
 * 「全項目に金額と根拠条文がある」「行為→違反の対応が壊れていない」を見る。
 *
 * ■ 書き分けの注意（実装時に踏みやすい罠）
 * - **「2026年4月に罰則ができた」ではない。** 酒気帯び運転・ながらスマホの
 *   罰則強化そのものは2024年（令和6年）11月1日に先行して施行されている。
 *   2026年4月に変わったのは「青切符（反則金）の対象になった」こと
 * - **反則行為の数は65項目**（下の VIOLATIONS がそのまま警察庁一覧の全行）。
 *   「113種類」「約110種類」といった数字は二次情報（銀行系コラム等）の
 *   数え方で、警察庁の一覧とは一致しない。ページでは65という実数だけを使う
 * - **金額は警察庁PDFを正とする。** 自治体サイトにも誤りの実例がある
 *
 * ■ 一次情報（2026-08-14 取得・突合済み）
 * - 警察庁「自転車をはじめとする軽車両の反則行為と反則金の額」（公式一覧PDF）
 *   https://www.npa.go.jp/bureau/traffic/bicycle/pdf/jitensyahansokukoui.pdf
 *   → VIOLATIONS の行為名・根拠条文・金額はこのPDFの表をそのまま写したもの（全65行）
 * - 警察庁 自転車ポータル「自転車の新しい制度」（対象年齢・仮納付7日以内などの流れ）
 *   https://www.npa.go.jp/bureau/traffic/bicycle/portal/system.html
 * - 警察庁 自転車ポータル「取締りについて」（青切符の例示・赤切符で残る違反）
 *   https://www.npa.go.jp/bureau/traffic/bicycle/portal/control.html
 * - 愛媛県警「自転車の交通反則通告制度 早見表」（金額と ※1 / ※2 の適用範囲の突合に使用）
 *   https://www.police.pref.ehime.jp/kotsukikaku/080401ao1.pdf
 *
 * 【データ更新箇所】反則金が改定されたら VIOLATIONS を更新する。
 * 行為から引く選択肢は BEHAVIORS、赤切符のまま残る違反は RED_TICKET_VIOLATIONS。
 * 制度そのもの（施行日・対象年齢・納付期限）は SYSTEM に集約している。
 */

/** 反則金の額が状況で変わる項目（放置駐車・駐停車・速度超過）を表すための型 */
export interface FineVariant {
  /** 条件の説明（例: '超過速度が15km/h以上20km/h未満の場合'） */
  condition: string;
  /** その場合の反則金（円） */
  yen: number;
}

/**
 * 適用範囲の限定。警察庁一覧・愛媛県警早見表の注記に対応する。
 * - `bicycle`（※1）: 自転車が対象（自転車以外の軽車両は除く）
 * - `ordinary-bicycle`（※2）: 普通自転車が対象
 * 注記が無い項目は軽車両一般に適用されるので undefined。
 */
export type ViolationScope = 'bicycle' | 'ordinary-bicycle';

/** 警察庁一覧の1行にあたる反則行為 */
export interface Violation {
  /** 内部ID（URLやテストで使う安定した識別子） */
  id: string;
  /** 反則行為の名称。警察庁一覧の表記をそのまま使う */
  name: string;
  /**
   * 反則金の額（円）。
   * 状況で変わる項目は「基準となる額」を入れ、内訳を variants に持たせる。
   */
  yen: number;
  /** 根拠条文（道路交通法）。警察庁一覧の「根拠条文」列 */
  article: string;
  /** 金額が状況で変わる項目の内訳。無い項目では省く */
  variants?: FineVariant[];
  /** yen が代表値であることの補足（例: 点滅信号は5,000円） */
  fineNote?: string;
  /** 適用範囲の限定（※1 / ※2） */
  scope?: ViolationScope;
  /** 日常の自転車利用で問題になりやすい項目か。既定の早見表で先に見せる */
  common?: boolean;
  /** 利用者向けの補足。断定を避け「〜になり得る」の書き方にする */
  note?: string;
}

/** 制度そのものの数値。ページの解説とFAQはここを参照する */
export const SYSTEM = {
  /** 自転車への青切符（交通反則通告制度）の施行日 */
  effectiveFrom: '2026-04-01',
  /** 改正法の番号 */
  law: '令和6年法律第34号',
  /** 青切符の対象となる年齢の下限。これ未満は従来どおり指導警告 */
  minAge: 16,
  /** 告知（青切符の交付）を受けてから仮納付するまでの日数の原則 */
  provisionalPaymentDays: 7,
  /** 通告を受けたあと、反則金を納付するまでの日数 */
  postNoticePaymentDays: 10,
  /** 酒気帯び運転・ながらスマホの罰則強化が先行施行された日 */
  penaltyStrengthenedFrom: '2024-11-01',
} as const;

/**
 * 反則行為と反則金の額（警察庁一覧の全65行）。
 *
 * 並びは警察庁PDFの表と同じ（金額の高い順のグループ）。
 * **項目を足し引きしたら VIOLATION_COUNT も合わせること**（テストが突合する）。
 */
export const VIOLATIONS: Violation[] = [
  {
    id: 'keitai-hoji',
    name: '携帯電話使用等（保持）',
    yen: 12000,
    article: '§71(5)の5',
    scope: 'bicycle',
    common: true,
    note: 'スマホを手に持って通話したり画面を見たりしながら走る行為。反則金は自転車の中で最も高い。これによって交通の危険を生じさせた場合は青切符ではなく赤切符（刑事手続）になる。',
  },
  {
    id: 'hochi-chusha',
    name: '放置駐車違反',
    yen: 9000,
    article: '§44①・§45①・②・§47②・③・§48・§49の3③・§49の4',
    variants: [
      { condition: '駐停車禁止場所かつ高齢運転者等専用場所の場合', yen: 12000 },
      { condition: '駐車禁止場所かつ高齢運転者等専用場所の場合', yen: 11000 },
      { condition: '駐停車禁止場所であって高齢運転者等専用場所以外の場合', yen: 10000 },
      { condition: '駐車禁止場所であって高齢運転者等専用場所以外の場合', yen: 9000 },
    ],
    fineNote: '場所によって9,000円〜12,000円',
  },
  {
    id: 'shadan-fumikiri',
    name: '遮断踏切立入り',
    yen: 7000,
    article: '§33②',
    common: true,
    note: '遮断機が下り始めてから、または警報機が鳴っている踏切に入る行為。',
  },
  {
    id: 'sokudo-choka',
    name: '速度超過',
    yen: 6000,
    article: '§22①',
    variants: [
      { condition: '超過速度が25km/h以上30km/h未満の場合', yen: 12000 },
      { condition: '超過速度が20km/h以上25km/h未満の場合', yen: 10000 },
      { condition: '超過速度が15km/h以上20km/h未満の場合', yen: 7000 },
      { condition: '超過速度が15km/h未満の場合', yen: 6000 },
    ],
    fineNote: '超過速度によって6,000円〜12,000円',
    note: '自転車にも標識の最高速度は適用される。下り坂などで超過し得る。',
  },
  {
    id: 'chuteisha',
    name: '駐停車違反',
    yen: 6000,
    article: '§44①・§45①・②・§47①〜③・§48・§49の3②・③・§49の3④・§49の4・§49の5後段',
    variants: [
      { condition: '駐停車禁止場所かつ高齢運転者等専用場所の場合', yen: 9000 },
      { condition: '駐車禁止場所かつ高齢運転者等専用場所の場合', yen: 8000 },
      { condition: '駐停車禁止場所であって高齢運転者等専用場所以外の場合', yen: 7000 },
      { condition: '駐車禁止場所であって高齢運転者等専用場所以外の場合', yen: 6000 },
    ],
    fineNote: '場所によって6,000円〜9,000円',
  },
  {
    id: 'shingo-mushi',
    name: '信号無視',
    yen: 6000,
    article: '§7',
    fineNote: '点滅信号を無視した場合は5,000円',
    common: true,
    note: '赤信号などを無視した場合は6,000円。点滅信号の場合だけ5,000円と別枠になっている。',
  },
  {
    id: 'tsuko-kubun',
    name: '通行区分違反',
    yen: 6000,
    article: '§17①・②・§17④・⑥',
    common: true,
    note: '車道の右側を走る「逆走」がこれにあたる。自転車は原則として車道の左側端を通行する。',
  },
  {
    id: 'oikoshi',
    name: '追越し違反',
    yen: 6000,
    article: '§28①〜④・§29・§30',
  },
  {
    id: 'fumikiri-futeishi',
    name: '踏切不停止等',
    yen: 6000,
    article: '§33①',
    common: true,
    note: '踏切の直前で一時停止し、安全を確認しないまま通過する行為。',
  },
  {
    id: 'kosaten-anzen-shinko',
    name: '交差点安全進行義務違反',
    yen: 6000,
    article: '§36④',
  },
  {
    id: 'kanjo-kosaten-anzen-shinko',
    name: '環状交差点安全進行義務違反',
    yen: 6000,
    article: '§37の2③',
  },
  {
    id: 'odan-hokosha-bogai',
    name: '横断歩行者等妨害等',
    yen: 6000,
    article: '§38①〜③・§38の2',
    common: true,
    note: '横断歩道を渡ろうとしている歩行者がいるのに、止まらずに進む行為。',
  },
  {
    id: 'anzen-unten-gimu',
    name: '安全運転義務違反',
    yen: 6000,
    article: '§70',
    common: true,
    note: 'ハンドル・ブレーキを確実に操作せず、他人に危害を及ぼすような速度・方法で運転する行為。傘を差すなどして運転操作が不確実になっている場合、こちらで扱われることがある。',
  },
  {
    id: 'tsuko-kinshi',
    name: '通行禁止違反',
    yen: 5000,
    article: '§8①',
    common: true,
    note: '「自転車通行止め」などの標識がある道路に入る行為。',
  },
  {
    id: 'hokosha-yo-doro-jokou',
    name: '歩行者用道路徐行違反',
    yen: 5000,
    article: '§9',
  },
  {
    id: 'hokosha-sokuho-tsuka',
    name: '歩行者等側方通過義務違反',
    yen: 5000,
    article: '§18②',
  },
  {
    id: 'kyu-brake',
    name: '急ブレーキ禁止違反',
    yen: 5000,
    article: '§24',
  },
  {
    id: 'hotei-odan-kinshi',
    name: '法定横断等禁止違反',
    yen: 5000,
    article: '§25の2①',
  },
  {
    id: 'romen-densha-kohou',
    name: '路面電車後方不停止',
    yen: 5000,
    article: '§31',
  },
  {
    id: 'yusen-doro-bogai',
    name: '優先道路通行車妨害等',
    yen: 5000,
    article: '§36②・③',
  },
  {
    id: 'kanjo-kosaten-bogai',
    name: '環状交差点通行車妨害等',
    yen: 5000,
    article: '§37の2①・②',
  },
  {
    id: 'jokou-basho',
    name: '徐行場所違反',
    yen: 5000,
    article: '§42',
  },
  {
    id: 'ichiji-futeishi',
    name: '指定場所一時不停止等',
    yen: 5000,
    article: '§43',
    common: true,
    note: '「止まれ」の標識がある場所で停止しない行為。自転車の取締りで最も多い違反のひとつ。',
  },
  {
    id: 'yoji-tsuko-bogai',
    name: '幼児等通行妨害',
    yen: 5000,
    article: '§71(2)・(2)の3',
  },
  {
    id: 'anzen-chitai-jokou',
    name: '安全地帯徐行違反',
    yen: 5000,
    article: '§71(3)',
  },
  {
    id: 'hi-sokuho-tsuka',
    name: '被側方通過車義務違反',
    yen: 5000,
    article: '§18④',
  },
  {
    id: 'tsukotai',
    name: '通行帯違反',
    yen: 5000,
    article: '§20①〜③',
  },
  {
    id: 'rogai-usasetsu-aizu-bogai',
    name: '道路外出右左折合図車妨害',
    yen: 5000,
    article: '§25③',
  },
  {
    id: 'shitei-odan-kinshi',
    name: '指定横断等禁止違反',
    yen: 5000,
    article: '§25の2②',
  },
  {
    id: 'shakan-kyori',
    name: '車間距離不保持',
    yen: 5000,
    article: '§26',
  },
  {
    id: 'shinro-henko-kinshi',
    name: '進路変更禁止違反',
    yen: 5000,
    article: '§26の2②・③',
  },
  {
    id: 'oitsukareta-sharyo',
    name: '追い付かれた車両の義務違反',
    yen: 5000,
    article: '§27①・②',
  },
  {
    id: 'noriai-hassha-bogai',
    name: '乗合自動車発進妨害',
    yen: 5000,
    article: '§31の2',
  },
  {
    id: 'warikomi',
    name: '割込み等',
    yen: 5000,
    article: '§32',
  },
  {
    id: 'kosaten-usasetsu-aizu-bogai',
    name: '交差点右左折等合図車妨害',
    yen: 5000,
    article: '§34⑥',
  },
  {
    id: 'kosaten-yusensha-bogai',
    name: '交差点優先車妨害',
    yen: 5000,
    article: '§36①・§37',
  },
  {
    id: 'kinkyusha-bogai',
    name: '緊急車妨害等',
    yen: 5000,
    article: '§40①・②・§41の2①・②',
  },
  {
    id: 'kosaten-shinnyu-kinshi',
    name: '交差点等進入禁止違反',
    yen: 5000,
    article: '§50①・②',
  },
  {
    id: 'mutoka',
    name: '無灯火',
    yen: 5000,
    article: '§52①',
    common: true,
    note: '夜間にライトを点けずに走る行為。前照灯と尾灯（または反射器材）が必要。',
  },
  {
    id: 'genko-gimu',
    name: '減光等義務違反',
    yen: 5000,
    article: '§52②',
  },
  {
    id: 'aizu-furiko',
    name: '合図不履行',
    yen: 5000,
    article: '§53①・②',
    scope: 'bicycle',
    note: '右左折や進路変更のときに手で合図をしない行為。',
  },
  {
    id: 'aizu-seigen',
    name: '合図制限違反',
    yen: 5000,
    article: '§53④',
    scope: 'bicycle',
  },
  {
    id: 'keionki-suimei-gimu',
    name: '警音器吹鳴義務違反',
    yen: 5000,
    article: '§54①',
    scope: 'bicycle',
  },
  {
    id: 'josha-sekisai-hoho',
    name: '乗車積載方法違反',
    yen: 5000,
    article: '§55①・②',
  },
  {
    id: 'keisharyo-seibi-furyo',
    name: '軽車両整備不良',
    yen: 5000,
    article: '§62',
  },
  {
    id: 'seido-sochi-furyo',
    name: '自転車制動装置不良',
    yen: 5000,
    article: '§63の9①',
    common: true,
    note: 'ブレーキが前後どちらかに無い、または利かない自転車を運転する行為。いわゆるピスト（競技用の固定ギア車）からブレーキを外している場合が典型。',
  },
  {
    id: 'dorohane',
    name: '泥はね運転',
    yen: 5000,
    article: '§71(1)',
  },
  {
    id: 'tenraku-boshi',
    name: '転落等防止措置義務違反',
    yen: 5000,
    article: '§71(4)',
  },
  {
    id: 'tenraku-sekisaibutsu',
    name: '転落積載物等危険防止措置義務違反',
    yen: 5000,
    article: '§71(4)の2',
  },
  {
    id: 'door-kaiho',
    name: '安全不確認ドア開放等',
    yen: 5000,
    article: '§71(4)の3',
  },
  {
    id: 'teishi-sochi',
    name: '停止措置義務違反',
    yen: 5000,
    article: '§71(5)',
  },
  {
    id: 'koan-iinkai-junshu',
    name: '公安委員会遵守事項違反',
    yen: 5000,
    article: '§71(6)',
    common: true,
    note: 'イヤホンで音が聞こえない状態での運転や傘差し運転など、都道府県の道路交通規則で禁じられている行為がこれにあたる。禁じ方の細部は都道府県ごとに異なる。',
  },
  {
    id: 'tsuko-kyoka-joken',
    name: '通行許可条件違反',
    yen: 3000,
    article: '§8⑤',
  },
  {
    id: 'hodo-jokou-gimu',
    name: '歩道徐行等義務違反',
    yen: 3000,
    article: '§63の4②',
    scope: 'ordinary-bicycle',
    common: true,
    note: '歩道を通行できる場合であっても、車道寄りを徐行しなければならない。歩行者の通行を妨げるときは一時停止が必要。',
  },
  {
    id: 'rosokutai-shinko',
    name: '路側帯進行方法違反',
    yen: 3000,
    article: '§17の3②',
  },
  {
    id: 'heishin-kinshi',
    name: '並進禁止違反',
    yen: 3000,
    article: '§19',
    common: true,
    note: '「並進可」の標識がある場所を除き、自転車が横に並んで走ることは禁じられている。',
  },
  {
    id: 'kidoshiki-nai',
    name: '軌道敷内違反',
    yen: 3000,
    article: '§21①〜③',
  },
  {
    id: 'rogai-usasetsu-hoho',
    name: '道路外出右左折方法違反',
    yen: 3000,
    article: '§25①',
  },
  {
    id: 'kosaten-usasetsu-hoho',
    name: '交差点右左折方法違反',
    yen: 3000,
    article: '§34①・§34③',
  },
  {
    id: 'kanjo-kosaten-sasetsu-hoho',
    name: '環状交差点左折等方法違反',
    yen: 3000,
    article: '§35の2①・②',
  },
  {
    id: 'josha-sekisai-seigen',
    name: '軽車両乗車積載制限違反',
    yen: 3000,
    article: '§57②',
    common: true,
    note: 'いわゆる二人乗り。幼児用座席を備えた自転車で幼児を乗せる場合など、都道府県の規則で認められた例外がある。',
  },
  {
    id: 'seigengai-kyoka-joken',
    name: '制限外許可条件違反',
    yen: 3000,
    article: '§58③',
  },
  {
    id: 'gentsuki-kenin',
    name: '原付等牽引違反',
    yen: 3000,
    article: '§60',
  },
  {
    id: 'jitensha-do-tsuko-gimu',
    name: '自転車道通行義務違反',
    yen: 3000,
    article: '§63の3',
    scope: 'ordinary-bicycle',
    note: '自転車道が設けられている道路では、原則として自転車道を通行する。',
  },
  {
    id: 'keionki-shiyo-seigen',
    name: '警音器使用制限違反',
    yen: 3000,
    article: '§54②',
    common: true,
    note: '標識で指定された場所などを除き、危険を避けるためやむを得ない場合以外にベルを鳴らす行為。歩行者をどかす目的で鳴らすのはこれにあたり得る。',
  },
];

/**
 * 警察庁一覧の項目数。
 * 二次情報の「113種類」「約110種類」と混同しないための実数で、
 * ページに数字を書くときは必ずこれを使う。
 */
export const VIOLATION_COUNT = 65;

/** 反則金として設定され得る額（変動する項目の内訳も含む・降順） */
export const FINE_TIERS = [12000, 11000, 10000, 9000, 8000, 7000, 6000, 5000, 3000] as const;

/**
 * 赤切符（刑事手続）のまま残る違反。
 *
 * 青切符は「反則金を納めれば公訴されない」制度だが、悪質・危険な行為は
 * 対象から外れていて、これまでどおり刑事手続に進む。
 * 警察庁「取締りについて」に挙げられているものをそのまま持っている。
 *
 * **罰則（懲役・罰金）の額はここに持たせない。**一次情報で額まで確認できたもの
 * だけを書く方針で、ページでも「刑事手続に進む」までにとどめる。
 */
export interface RedTicketViolation {
  id: string;
  name: string;
  note: string;
}

export const RED_TICKET_VIOLATIONS: RedTicketViolation[] = [
  {
    id: 'shusui',
    name: '酒酔い運転・酒気帯び運転',
    note: '自転車も「車両」なので飲酒運転は禁止されている。罰則の強化自体は2024年11月1日に先行して施行されており、2026年4月の青切符の対象にも入っていない。',
  },
  {
    id: 'bogai-unten',
    name: '妨害運転（あおり運転）',
    note: '他の車両等の通行を妨害する目的での危険な運転。青切符の対象外で刑事手続に進む。',
  },
  {
    id: 'keitai-kiken',
    name: '携帯電話使用等（交通の危険を生じさせたとき）',
    note: 'スマホを操作していて実際に危険を生じさせた場合。手に持って使っただけであれば青切符（12,000円）だが、危険を生じさせるとこちらになる。',
  },
  {
    id: 'jiko',
    name: '違反により交通事故を発生させた場合',
    note: '反則行為にあたる違反であっても、それによって事故を起こしたときは青切符では処理されない。',
  },
];

/**
 * 行為から引くチェッカーの選択肢。
 *
 * 利用者は「公安委員会遵守事項違反」という条文の言葉では検索しないので、
 * 「イヤホンをして乗る」といった日常の言い方から違反名に橋渡しする。
 *
 * violationIds は該当し得る違反。**複数を持てるようにしてある**のは、
 * 傘差しのように「原則は公安委員会遵守事項違反だが、運転操作が不確実なら
 * 安全運転義務違反にもなり得る」というケースがあるため。
 * 先頭が主たる該当先で、2つ目以降は「〜になり得る」もの。
 */
export interface Behavior {
  id: string;
  /** 日常の言い方での行為 */
  label: string;
  /** 検索用のキーワード（ひらがな・カタカナ・言い換えを含める） */
  keywords: string[];
  /** 該当し得る違反のID。先頭が主たる該当先 */
  violationIds: string[];
  /** 赤切符に該当し得る場合、そのID */
  redTicketIds?: string[];
  /** 注意点。例外や都道府県差はここに書く */
  caution?: string;
}

export const BEHAVIORS: Behavior[] = [
  {
    id: 'earphone',
    label: 'イヤホン・ヘッドホンをして乗る',
    keywords: ['イヤホン', 'ヘッドホン', '音楽', '片耳', 'ワイヤレス'],
    violationIds: ['koan-iinkai-junshu'],
    caution:
      '禁じ方は都道府県の道路交通規則で決まっていて、多くは「安全な運転に必要な音や声が聞こえない状態」を禁じる書き方をしている。音量や片耳かどうかで一律に線が引かれているわけではないため、片耳なら必ず適法とは言えない。お住まいの都道府県警の道路交通規則で確認してほしい。',
  },
  {
    id: 'umbrella',
    label: '傘をさして乗る',
    keywords: ['傘', 'かさ', '雨', '傘さし', '傘立て'],
    violationIds: ['koan-iinkai-junshu', 'anzen-unten-gimu'],
    caution:
      '多くの都道府県の規則が傘差し運転を禁じており、その場合は公安委員会遵守事項違反（5,000円）。片手がふさがってハンドル・ブレーキの操作が不確実になっていれば、安全運転義務違反（6,000円）として扱われることもある。傘を固定する器具についても都道府県で扱いが分かれる。',
  },
  {
    id: 'smartphone',
    label: 'スマホを手に持って見ながら走る',
    keywords: ['スマホ', '携帯', 'ながら', '画面', '通話', 'ながらスマホ'],
    violationIds: ['keitai-hoji'],
    redTicketIds: ['keitai-kiken'],
    caution:
      '手に持って通話・画面注視をした時点で12,000円。これによって実際に交通の危険を生じさせた場合は青切符ではなく赤切符（刑事手続）になる。',
  },
  {
    id: 'sidewalk',
    label: '歩道を走る',
    keywords: ['歩道', 'ほどう', '歩道通行'],
    violationIds: ['hodo-jokou-gimu', 'tsuko-kubun'],
    caution:
      '自転車は原則として車道の左側端を通行する。ただし「自転車通行可」の標識がある歩道、運転者が13歳未満・70歳以上または身体の障害がある場合、車道の状況からやむを得ない場合は歩道を通行できる。通行できる場合でも車道寄りを徐行する義務があり（3,000円）、通行できないのに走れば通行区分違反（6,000円）になり得る。',
  },
  {
    id: 'wrong-side',
    label: '車道の右側を走る（逆走）',
    keywords: ['逆走', '右側', '右側通行', 'ぎゃくそう'],
    violationIds: ['tsuko-kubun'],
    caution: '自転車は車道の左側端を通行する。右側を走る「逆走」は正面衝突につながりやすい。',
  },
  {
    id: 'two-riders',
    label: '二人乗りをする',
    keywords: ['二人乗り', 'ふたりのり', '2人乗り', '同乗'],
    violationIds: ['josha-sekisai-seigen'],
    caution:
      '幼児用座席を備えた自転車で幼児を同乗させる場合など、都道府県の規則で認められた例外がある（16歳以上の運転者が幼児1人、幼児2人同乗用自転車なら2人までとする県が多い）。大人同士の二人乗りは例外にあたらない。',
  },
  {
    id: 'side-by-side',
    label: '友達と横に並んで走る',
    keywords: ['並進', '並走', '横に並ぶ', 'ならんで'],
    violationIds: ['heishin-kinshi'],
    caution: '「並進可」の標識がある場所を除いて禁じられている。',
  },
  {
    id: 'no-light',
    label: '夜にライトを点けずに走る',
    keywords: ['無灯火', 'ライト', '夜', '暗い', 'むとうか'],
    violationIds: ['mutoka'],
    caution: '前照灯と、尾灯または反射器材が必要。灯火の色・明るさの基準は都道府県の規則で定められている。',
  },
  {
    id: 'red-light',
    label: '信号を無視する',
    keywords: ['信号', '赤信号', '信号無視', '点滅'],
    violationIds: ['shingo-mushi'],
    caution: '赤信号などは6,000円だが、点滅信号を無視した場合だけは5,000円と別の額になっている。',
  },
  {
    id: 'no-stop',
    label: '「止まれ」で停まらない',
    keywords: ['一時停止', '止まれ', '一時不停止', 'とまれ'],
    violationIds: ['ichiji-futeishi'],
    caution: '停止線の直前で停止し、交差する道路の安全を確認する必要がある。',
  },
  {
    id: 'crossing',
    label: '横断歩道の歩行者を待たずに進む',
    keywords: ['横断歩道', '歩行者', '妨害', 'おうだんほどう'],
    violationIds: ['odan-hokosha-bogai'],
    caution: '横断しようとしている歩行者がいるときは、横断歩道の直前で一時停止して道を譲る。',
  },
  {
    id: 'railway-crossing',
    label: '遮断機が下りた踏切に入る',
    keywords: ['踏切', '遮断機', '警報機', 'ふみきり'],
    violationIds: ['shadan-fumikiri', 'fumikiri-futeishi'],
    caution:
      '遮断機が下り始めた・警報機が鳴っている踏切に入れば7,000円。遮断機が動いていなくても、踏切の直前で停止・安全確認をしなければ踏切不停止等（6,000円）になる。',
  },
  {
    id: 'no-brake',
    label: 'ブレーキのない自転車に乗る',
    keywords: ['ブレーキ', 'ピスト', '制動装置', '整備不良'],
    violationIds: ['seido-sochi-furyo'],
    caution: '前後輪ともに、基準を満たすブレーキが必要。利かない状態も含まれる。',
  },
  {
    id: 'bell',
    label: '歩行者をどかすためにベルを鳴らす',
    keywords: ['ベル', '警音器', 'ベルを鳴らす', 'けいおんき'],
    violationIds: ['keionki-shiyo-seigen'],
    caution:
      '警音器は、標識で指定された場所と、危険を避けるためやむを得ない場合にだけ鳴らすもの。歩行者に道を空けさせる目的で鳴らすのは該当し得る。',
  },
  {
    id: 'no-entry',
    label: '「自転車通行止め」の道に入る',
    keywords: ['通行止め', '進入禁止', '一方通行', '通行禁止'],
    violationIds: ['tsuko-kinshi'],
    caution:
      '自転車を除く一方通行など、標識の補助標識まで見る必要がある。「自転車を除く」と書かれていれば通行できる。',
  },
  {
    id: 'no-signal',
    label: '曲がるときに手で合図をしない',
    keywords: ['合図', '手信号', 'ウインカー', 'あいず'],
    violationIds: ['aizu-furiko'],
    caution: '右左折・進路変更・停止のときは、手による合図が必要。',
  },
  {
    id: 'bicycle-lane',
    label: '自転車道があるのに車道を走る',
    keywords: ['自転車道', 'レーン', '自転車レーン'],
    violationIds: ['jitensha-do-tsuko-gimu'],
    caution:
      '自転車道が設けられている道路では原則として自転車道を通行する。道路工事などやむを得ない場合は除かれる。',
  },
  {
    id: 'drinking',
    label: 'お酒を飲んで乗る',
    keywords: ['飲酒', '酒', 'アルコール', '酒気帯び', '酔い'],
    violationIds: [],
    redTicketIds: ['shusui'],
    caution:
      '飲酒運転は青切符の対象外で、これまでどおり刑事手続に進む（赤切符）。罰則の強化自体は2024年11月1日に先行して施行されている。',
  },
  {
    id: 'road-rage',
    label: '幅寄せなど、あおり運転をする',
    keywords: ['あおり', '妨害運転', '幅寄せ', 'あおり運転'],
    violationIds: [],
    redTicketIds: ['bogai-unten'],
    caution: '妨害運転も青切符の対象外で、刑事手続に進む。',
  },
  {
    id: 'speeding',
    label: '標識の制限速度を超えて走る',
    keywords: ['速度', 'スピード', '速度超過', '制限速度'],
    violationIds: ['sokudo-choka'],
    caution:
      '自転車にも標識の最高速度は適用される。超過が15km/h未満なら6,000円で、そこから超過幅に応じて上がる。',
  },
  {
    id: 'parking',
    label: '駐輪禁止の場所に停める',
    keywords: ['駐輪', '駐車', '放置', '駐停車'],
    violationIds: ['chuteisha', 'hochi-chusha'],
    caution:
      '道路交通法の駐停車違反・放置駐車違反は軽車両にも適用される。なお駅前の放置自転車の撤去は、これとは別に市区町村の条例で行われている。',
  },
  {
    id: 'child-under-16',
    label: '中学生など16歳未満が違反した',
    keywords: ['子ども', '中学生', '小学生', '16歳', '未成年'],
    violationIds: [],
    caution:
      '青切符（交通反則通告制度）の対象は16歳以上。16歳未満はこれまでどおり指導警告や自転車運転者講習の対象で、反則金は科されない。',
  },
];

/** 反則金を「12,000円」の形に整える */
export function formatYen(yen: number): string {
  return `${yen.toLocaleString('ja-JP')}円`;
}

/** IDから反則行為を引く。未登録なら undefined */
export function violationById(id: string): Violation | undefined {
  return VIOLATIONS.find((v) => v.id === id);
}

/** IDから赤切符の違反を引く。未登録なら undefined */
export function redTicketById(id: string): RedTicketViolation | undefined {
  return RED_TICKET_VIOLATIONS.find((v) => v.id === id);
}

/** IDから行為を引く。未登録なら undefined */
export function behaviorById(id: string): Behavior | undefined {
  return BEHAVIORS.find((b) => b.id === id);
}

/** 行為を選んだときに画面へ出す内容 */
export interface BehaviorResult {
  behavior: Behavior;
  /** 該当し得る青切符の違反（BEHAVIORS の順のまま。先頭が主たる該当先） */
  violations: Violation[];
  /** 該当し得る赤切符の違反 */
  redTickets: RedTicketViolation[];
  /**
   * 反則金の代表額（円）。主たる該当先の額。
   * 青切符の対象が無い行為（飲酒・16歳未満）では null。
   */
  yen: number | null;
}

/**
 * 行為から該当し得る違反を引く。
 *
 * 未登録の行為IDは投げる。選択式のUIなので不正なIDは来ない想定だが、
 * データの取り違えを黙って「該当なし」にすると気づけないため。
 */
export function checkBehavior(behaviorId: string): BehaviorResult {
  const behavior = behaviorById(behaviorId);
  if (!behavior) {
    throw new Error(`行為のIDが見つかりません: ${behaviorId}`);
  }

  const violations = behavior.violationIds.map((id) => {
    const violation = violationById(id);
    if (!violation) {
      throw new Error(`${behavior.id} が参照する違反が見つかりません: ${id}`);
    }
    return violation;
  });

  const redTickets = (behavior.redTicketIds ?? []).map((id) => {
    const red = redTicketById(id);
    if (!red) {
      throw new Error(`${behavior.id} が参照する赤切符の違反が見つかりません: ${id}`);
    }
    return red;
  });

  return {
    behavior,
    violations,
    redTickets,
    yen: violations.length > 0 ? violations[0].yen : null,
  };
}

/**
 * 行為をキーワードで絞り込む。
 * 空文字なら全件。ラベルとキーワードの部分一致で見る（前方一致にすると
 * 「イヤホン」で「イヤホン・ヘッドホンをして乗る」が引けなくなる）。
 */
export function searchBehaviors(query: string): Behavior[] {
  const q = query.trim();
  if (q === '') return BEHAVIORS;
  return BEHAVIORS.filter(
    (b) => b.label.includes(q) || b.keywords.some((k) => k.includes(q) || q.includes(k))
  );
}

/** 早見表の1つの金額帯 */
export interface FineGroup {
  yen: number;
  violations: Violation[];
}

/**
 * 反則金の額でまとめた早見表。額の高い順。
 *
 * 金額が状況で変わる項目（放置駐車・駐停車・速度超過）は、基準となる額の
 * グループに1度だけ入る。内訳は Violation.variants 側に持たせてある。
 *
 * @param onlyCommon true なら日常の自転車利用で問題になりやすい項目だけに絞る
 */
export function fineGroups(onlyCommon = false): FineGroup[] {
  const target = onlyCommon ? VIOLATIONS.filter((v) => v.common) : VIOLATIONS;
  const amounts = [...new Set(target.map((v) => v.yen))].sort((a, b) => b - a);
  return amounts.map((yen) => ({
    yen,
    violations: target.filter((v) => v.yen === yen),
  }));
}
