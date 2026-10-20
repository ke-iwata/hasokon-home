# 公開中ツールの正確さ（2026-10-20 点検）— 計算・法対応・時制の誤りは見つからなかった。最低賃金の47都道府県（額・改定前の額・発効日）は厚労省の全国一覧と全件一致。10月末〜12月に発効する15県も一次情報と一致した。直すとよいのは、最低賃金ページの「2026年10月改定」という言い方（10県は11・12月発効）と「現在の1,121円」の2点だけ（どちらも低）

**状態**：提案（2026-10-20 起票。セッション `session_01JGttwHEKpcFKxY9hz117Jt`）
**優先度：A は高、B は中、C は低。**
- **A**：なし（計算・法対応の誤りは見つからなかった）
- **B**：なし（画面に出るリンクの 404 は 10-19 の点検で挙げた大分の 1 件だけで、#423 で直す）
- **C（最低賃金 `saitei-chingin`）**：title・description・registry が「2026年10月改定」と書いているが、**10 県は 11〜12 月に発効**する（京都 11-16・沖縄 12-02 など）。本文の「現在の1,121円」は、37 都道府県が発効した 10-20 の時点では「改定前（令和7年度）」と書くほうが正しい。**額と判定には影響しない**

**着手条件**：なし。C は #423（10-19 の点検の実装）のマージ後に、同じ `tools/app/saitei-chingin/page.tsx` を触る PR として出す（コンフリクトを避けるため）。
**公開条件**：実装 PR のマージで test.hasokon.com に出る。次の `v*` タグで本番。`stage` は動かさない。
**対象**：`tools/app/saitei-chingin/page.tsx`（25・27・136 行）・`tools/lib/registry.ts`（659 行の description と `updatedAt`）・`tools/tests/saitei-chingin.test.ts`
**関連**：[kokai-tool-seikaku-2026-10-19.md](./kokai-tool-seikaku-2026-10-19.md)（前日の点検。実装は #423）・
[kokai-tool-seikaku-2026-10-18.md](./kokai-tool-seikaku-2026-10-18.md)・[kokai-tool-seikaku-2026-10-17.md](./kokai-tool-seikaku-2026-10-17.md)・[kokai-tool-seikaku-2026-10-16.md](./kokai-tool-seikaku-2026-10-16.md)・
[r8-12gatsu-1gatsu-shikogo-copy.md](./r8-12gatsu-1gatsu-shikogo-copy.md)（iDeCo の 12-01 の文面切り替え。下の「これから期限が来る作業」）

---

## 背景と根拠

### 点検の範囲（2026-10-20）

`origin/main`（`bc7bd45`、#424 のマージ後）を読んだ。`tools/` で `npm ci` → `npx vitest run` を回し、**3,361 件が通り、4 件 skip・1 件 todo**（10-19 と同じ件数）。

GA4（2026-10-13〜19）の PV 上位を優先した：ふるさと納税 62・年齢計算 50・酒税 37・養育費 29・働き損 20・たばこ税 17・最低賃金 13・子育て支援金 9・高額療養費 8。
28 日の自然検索の着地はたばこ税 303・酒税 175・年齢計算 138・最低賃金 89・養育費 85・ふるさと納税 76（約 8 割が Bing）。

見たもの：

1. **10 月末〜12 月に日付が来るもの**：最低賃金の発効日（47 都道府県すべて）、年末調整（令和8年分）、iDeCo（12-01）、七五三・厄年の年の定数、祝日データ（2027 年）、医療費控除の還付申告の期限（2021 年分は 2026-12-31）
2. **10-01 を過ぎたものの時制**：`tools/app`・`tools/lib` を「（2026年|令和8年）4〜12月 …（予定｜なります｜始まります｜変わります｜されます｜見込み）」で grep し、当たりを 1 件ずつ読んだ
3. **出典リンクの生存**：`tools/app`・`tools/lib` にある外部 URL 271 本すべてを `curl -sIL -A "Mozilla/5.0"` で確認。最低賃金の 50 本は `node scripts/check-sources.mjs` でも確認
4. **脆弱性**：`dangerouslySetInnerHTML`・`eval`・`innerHTML`・`fetch`・`localStorage`・URL ハッシュの読み出し

10-13〜10-19 の点検で挙げたもの（消費税の法案提出の反映・リンク切れ 4 件・2.1% の言い方は #423 で実装中。ふるさと納税の期限の FAQ は 10-19 の D）は重ねて挙げていない。
消費税 1% の法案は、2026-10-20 時点でもまだ**成立していない**（報道で確認。閣議決定・国会提出の 10-09 から動いていない）ので、#423 の「成立前」の書き方のままでよい。

---

## C. 最低賃金：「2026年10月改定」と「現在の1,121円」【優先度：低。額・判定は変わらない】

### 一次情報（2026-10-20 取得）

厚生労働省「令和８年度地域別最低賃金の全国一覧」
https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/
（PDF https://www.mhlw.go.jp/content/11200000/001753404.pdf ）

- 47 都道府県の改定額・改定前の額・発効日を `tools/lib/saitei-chingin.ts` の `answered.yen`・`currentYen`・`answered.effectiveOn` と**機械で突き合わせ、全件一致**（差分 0 件）
- 発効日の分布：10 月 1〜18 日が 37 都道府県、10 月 24〜30 日が 5 県（宮崎 10-24・鹿児島 10-25・青森 10-29・高知 10-29・山形 10-30）、
  **11〜12 月が 10 県**（山梨・徳島・愛媛・大分 11-01、長崎 11-02、佐賀 11-15、京都 11-16、岩手・熊本 12-01、沖縄 12-02）
- 全国加重平均は改定前 1,121 円 → 答申ベース 1,177 円（`NATIONAL_AVERAGE` と一致）

これから発効する 5 県も、労働局の発表で日付を確かめた：宮崎（決定・官報公示の報道発表「10月24日から時間額1,085円」）・鹿児島（同「時間額1,090円」）・
山形（答申の発表「効力発生の日は、令和8年10月30日の予定」）・青森（答申 PDF の発効予定日）・福島 10-16・茨城 10-18（答申 PDF「発効予定日：10月18日」）。どれも全国一覧の発効日と同じ。

### 現状

| 場所 | 現状の文言 | 何がずれているか |
|---|---|---|
| `tools/app/saitei-chingin/page.tsx` 25 行（title） | 「最低賃金 早見表・チェッカー｜**2026年10月改定**の都道府県別一覧」 | 10 県は 11・12 月に発効する。京都・沖縄などの人が「10月改定」を見て、10 月から上がったと読む |
| 同 27 行（description） | 「いまの最低賃金と2026年（令和8年度）**10月改定後**の額・引上げ幅・発効日が分かります」 | 同上 |
| `tools/lib/registry.ts` 659 行（description。一覧・llms.txt に出る） | 「いまの最低賃金と**2026年10月改定後**の額・引上げ幅が分かります」 | 同上 |
| `tools/app/saitei-chingin/page.tsx` 136 行（本文「改定の要点」） | 「目安どおりなら全国加重平均は1,176円 — **現在の**1,121円から55円（+4.9%）の引き上げ。前年度の66円（+6.3%）より伸びは小さく**なります**」 | 10-20 時点で 37 都道府県が発効済み。「現在の」は改定前（令和7年度）の額。目安の段階の時制が残っている |

チェッカー（`Calculator.tsx`）は開いた日で「発効済み／発効前」を判定しており、表（同 152〜205 行）も「10月1日から順に発効しています（最後は沖縄の12月2日）」と書いているので、**判定の結果と表は正しい**。ずれているのは見出しと要約の言い方だけ。

### 直し方

1. title：「最低賃金 早見表・チェッカー｜2026年（令和8年度）改定の都道府県別一覧」。「10月」を外す（「2026年」は残す。検索語「最低賃金 2026」のため）
2. description（page.tsx・registry.ts の両方）：「いまの最低賃金と2026年（令和8年度）改定後の額・引上げ幅・発効日（10月1日〜12月2日）が分かります」
3. 136 行：「改定前（{CURRENT_FY_LABEL}）の{NATIONAL_AVERAGE.current}円から55円（+4.9%）の引き上げ。前年度の66円（+6.3%）より伸びは小さい額でした」。
   直後の「答申ベースの実績は1,177円」の段はそのまま
4. registry の `updatedAt` を実装日に上げる

**やらないこと**：表の「状態」列の「答申済み」を「発効済み」に変えること（静的 HTML に焼くので、開いた日で変わる状態は書かない設計。page.tsx 173〜174 行のコメントどおり）。
出典の 26 県が答申の発表のままなのも、答申の本文に発効日が書いてあり全国一覧と一致するので直さない。

### テスト（`tools/tests/saitei-chingin.test.ts`）

- `page.tsx` をファイルとして読み、`title`・`description` に「10月改定」を含まないこと
- `registry` の `saitei-chingin` の description に「10月改定」を含まないこと
- 「現在の」の直後に `NATIONAL_AVERAGE.current` を置いていないこと（`/現在の\s*\{NATIONAL_AVERAGE\.current\}/` が当たらない）
- 念のため：`PREFECTURES` の発効日のうち 11 月以降のものが 1 件以上あること（「10月改定」と書けない根拠を固定する。来年度の改定で答申を外したときは空になるので、`answered` があるときだけ見る）

### 期待される効果

- 京都・九州・沖縄など 11〜12 月発効の県の人が、検索結果のタイトルだけ見て「もう上がった」と誤解しない（自然検索の着地 89／28 日、約 8 割が Bing）
- 発効が進むにつれて古くなる「現在の」がなくなる

---

## 出典リンクの確認（2026-10-20）

271 本のうち、200 以外は次のとおり。**新しい 404 は無い。**

| 状態 | URL | 判断 |
|---|---|---|
| 404 | 大分労働局 `002798644.pdf`・京都市 `daijindoui_houdouhappyou.pdf`・協会けんぽ `sbb3037/`・年金機構 `hoshu/20120817.html` | 10-19 の B で挙げ済み（#423 で差し替え） |
| 403 | `www.kojinbango-card.go.jp`（マイナンバーの期限 3 本）・`www.mofa.go.jp`（ヘボン式 1 本） | **ドメインのトップページも 403**（ブラウザの UA・Accept-Language を付けても同じ）。この環境からのアクセスを WAF が弾いているとみられ、リンク切れとは判断しない。ブラウザで開けるか、次回の点検で運営者の手元から確認する |
| 403 | `info.monex.co.jp`・`chusho.meti.go.jp`・`github.com/whatwg/...` | 10-19 と同じ（ボット除け） |
| 000 | 大阪市・大阪府の 3 本 | タイムアウト。再試行で 200 |

`tools/scripts/check-sources.mjs`（最低賃金の 50 本）：200 以外は大分の 1 本だけ。

---

## これから期限が来る作業（今日の時点では正しい）

- **iDeCo（12-01）**：本文の「いますぐ月6.2万円を拠出できるわけではありません」などは 12-01 に誤りになる。
  `tests/post-effective-copy.test.ts` 110〜128 行に ideco のエントリがあり、**12-01 になると CI が落ちる**。
  文面の差し替えは [r8-12gatsu-1gatsu-shikogo-copy.md](./r8-12gatsu-1gatsu-shikogo-copy.md)（状態は「提案」のまま）の段取りどおり、**11 月下旬に PR を用意し、12-01 にマージして運営者が本番へリリース**する。本番には運営者のタグが必要なので、11 月下旬に PR が無ければその日の点検で催促する
- `tools/lib/toshi-iwai.ts` 36 行：`SHICHIGOSAN_YEAR = 2026` は **11-16 以降、年内に 2027 へ**（2026-11-15 は日曜。`tests/toshi-iwai.test.ts` が見張る）
- 最低賃金：10-24〜12-02 の 15 県の発効はチェッカーが開いた日で切り替わる。データの手当ては要らない
- `jutaku-shutoku-shikin`：「延長はまだ決まっていません」（page.tsx 113 行）は、12 月中旬の令和9年度税制改正大綱で動く可能性がある。大綱が出た日の点検で見る
- ふるさと納税の `DEFAULT_TAX_YEAR` と title は 1 月に 2027 へ（`tests/furusato-tax-year.test.ts`）

## 点検して問題が無かったもの（次回はここを重ねて見なくてよい）

| ツール | 照合した一次情報と結果 |
|---|---|
| 最低賃金 `saitei-chingin` | 上記のとおり 47 都道府県 × 3 項目が厚労省の全国一覧と全件一致。目安（A54・B56・C56 円）と全国加重平均（1,121→1,176／1,177 円）、前年度 66 円（+6.3%）も一致。チェッカーは `useEffect` で開いた日に評価し直す |
| 年末調整 `nenmatsu-chosei` | 国税庁「源泉所得税の改正のあらまし（令和8年4月）」を取得して照合：基礎控除 104 万（合計所得 489 万以下）・67 万（655 万以下）・62 万、令和 10 年分以後は 132 万以下 99 万。給与所得控除の最低保障 74 万（220 万以下）、74.1 万〜219.1 万は「収入 − 74 万円」、219.1 万〜220 万は 145.1／145.3／145.6 万円。「令和8年11月までの給与等の源泉徴収事務に変更は生じません」「12月に行う年末調整の際に…精算」。`lib/furusato-nozei.ts` の `salaryIncomeByTable()`・`basicDeductionIncomeTax()` が条文どおり |
| 働き損・年収の壁（`hatarakizon`・`nenshu-kabe`） | 厚労省「社会保険適用拡大特設サイト」の短時間労働者のページ：「賃金要件（所定内賃金が月額8.8万円以上）については、令和７年年金制度改正により、2026年10月に撤廃されました」。企業規模要件は 2027-10 から 36 人以上に。本文の時制は施行後 |
| 祝日（`nissu-keisan`・`renkyu-keisan`） | 内閣府 `syukujitsu.csv` の 2026・2027 年（各 18・17 日）と `lib/nissu-keisan.ts` が全件一致 |
| 酒税・たばこ税 | 時制の grep で施行後の書き方を確認（10-15・10-18 で照合済みの税率は変わっていない）。酒税 FAQ の店頭価格「確定していません」は 10-15 の決定どおり残す |
| 七五三・厄年 | `SHICHIGOSAN_YEAR = 2026`（11-15 は日曜）、`YAKUDOSHI_YEAR = 2027`（10 月に翌年へ上げる運用どおり） |
| 医療費控除 | 「2021年分なら2026年12月31日まで」（翌年 1-1 から 5 年）が正しい |
| 時制の一括 grep | 施行済みのことを「なります」「始まります」と書いているのは、出典名の引用（「令和8年8月1日から支給限度額が変更になります」）、改正前の診療月を選んだときだけ出る高額療養費の比較見出し、制度の一般的な説明（国民年金の育児免除「2026年10月から…免除されます」）だけ |
| 脆弱性 | `dangerouslySetInnerHTML` は静的な JSON-LD の `JSON.stringify` だけ。`eval`・`innerHTML`・`fetch` は無い。ルーレットの URL ハッシュ（`lib/roulette/share.ts`）は React のテキストとして描くのでエスケープされる。`target="_blank"` はすべて `rel="noopener noreferrer"` つき |
| テスト | `npx vitest run`：3,361 passed・4 skipped・1 todo |

## 工数の見積り（消費トークン数）

| 作業 | トークン |
|---|---|
| C（title・description 2 か所・本文 1 段・registry の `updatedAt`・テスト 4 件） | 約 12k |
| **合計** | **約 12k** |

## 出典（2026-10-20 に取得して確認）

- 厚生労働省「令和８年度地域別最低賃金の全国一覧」 https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/ （PDF https://www.mhlw.go.jp/content/11200000/001753404.pdf ）
- 宮崎労働局 https://jsite.mhlw.go.jp/miyazaki-roudoukyoku/news_topics/houdou/20260924_saichinkaisei.html ／ 鹿児島労働局 https://jsite.mhlw.go.jp/kagoshima-roudoukyoku/redirect/houdou-r08_2026-0925-6.html ／
  山形労働局 https://jsite.mhlw.go.jp/yamagata-roudoukyoku/toushinn-20260827.html ／ 青森労働局 https://jsite.mhlw.go.jp/aomori-roudoukyoku/content/contents/002788111.pdf ／
  福島労働局 https://jsite.mhlw.go.jp/fukushima-roudoukyoku/content/contents/002783612.pdf ／ 茨城労働局 https://jsite.mhlw.go.jp/ibaraki-roudoukyoku/content/contents/chingin_press_R080824_toushin1136yen.pdf
- 国税庁「源泉所得税の改正のあらまし（令和8年4月）」 https://www.nta.go.jp/publication/pamph/gensen/2026kaisei.pdf
- 厚生労働省「社会保険適用拡大特設サイト」短時間労働者 https://www.mhlw.go.jp/tekiyoukakudai/seido/tanjikan/ ・加入の要件 https://www.mhlw.go.jp/tekiyoukakudai/jugyouin/taisho/
- 内閣府「国民の祝日」CSV https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv
- 消費税 1% の法案の状況（成立前であることの確認。報道）：熊本日日新聞「食品消費税1%法案を閣議決定 政府、来年4月から2年間」 https://kumanichi.com/articles/2044798
