# 2026-10-01 に施行済みの改正を「これから」と書いたままの 5 ページを一括で過去形にする — 106 万円の壁（賃金要件）の撤廃・保険料調整制度・国民年金の育児免除・インボイス経過措置 80%→70%。あわせて「データ確認日」が 8 月のままのたばこ・酒税を直し、施行日を持つツール全体に「期日を過ぎた description の未来形」を CI で止める仕組みを広げる

**状態**：提案（2026-10-04 起票。セッション `session_015V1XyfbfGXHaP2CyZnxcdi`。**同日の企画レビュー（#336）の必須 3 点・任意 1 点を反映**：
`nenshu-kabe` 本文の「10月1日に始まる保険料調整制度」を表と B の patterns に追加／`saitei-chingin` の「答申前の県は目安ベースの見込み」の文面
（description・FAQ 2 本・本文・注記の 5 か所）を表に追加（表示の条件分岐は残し文面だけ）／出典リンクの題名（引用）は書き換えず検査対象からも外す／
FAQ の例示「時給が55円上がると」を実際の +56 円に）。
**緊急度**：**高（法的な事実と食い違う文面が、すでに 3 日間公開されている）**。施行済みの制度を「撤廃されます」「始まります」と書いており、
YMYL のページとして「確認していないサイト」に見える。title・description（検索結果に出る文）にも未来形が残っている。
**着手条件**：なし。文面の書き換えとテストの追加だけで、計算ロジック・税率・判定は触らない（計算機はすでに施行日で自動で切り替わっている。下記「現状」）。
**公開条件**：実装 PR を main にマージ → テスト環境で下記「確認ポイント」を運営者が見る → 次のリリース（`v*` タグ）に載せる。
**対象**：`tools/`（`saitei-chingin`・`hatarakizon`・`nenshu-kabe`・`kokunen-ikuji-menjo`・`invoice-nozeigaku` の `page.tsx`、
`tools/lib/registry.ts` の該当 5 本の `description` と `updatedAt`、`tools/lib/nenshu-kabe.ts` の `note`、
`tools/lib/tabako-zei.ts`・`tools/lib/shuzei-kaisei.ts` の `DATA_CHECKED_AT`、`tools/tests/` に 1 本）
**起票**：2026-10-04
**関連**：[shuzei-kaisei-post-revision-copy.md](./shuzei-kaisei-post-revision-copy.md)・[tabako-zei-post-alignment-copy.md](./tabako-zei-post-alignment-copy.md)
（同じ 10-01 をまたぐページの文面切り替えの先例。**この 2 本は直っている**。本提案は残りを一度に片付け、先例が 1 ページずつ足していた
「期日を過ぎたら description の『これから』で落ちるテスト」を、施行日を持つツール全体に共通化する）・
[nenshu-kabe-2026-10-wall-removal.md](./nenshu-kabe-2026-10-wall-removal.md)・[shakai-hoken-hatarakizon.md](./shakai-hoken-hatarakizon.md)・
[hokenryo-chosei-seido.md](./hokenryo-chosei-seido.md)・[kokunen-ikuji-menjo.md](./kokunen-ikuji-menjo.md)・
[invoice-2wari-tokurei-shuryo.md](./invoice-2wari-tokurei-shuryo.md)・[saitei-chingin-r8-hakko-mae-mente.md](./saitei-chingin-r8-hakko-mae-mente.md)・
[sitemap-lastmod-guardrail.md](./sitemap-lastmod-guardrail.md)（`updatedAt` を上げないと IndexNow が空振りする）

---

## 背景と根拠

### 計測値（GA4 プロパティ 548154955、2026-09-27〜10-03 の 7 日、API で取得）

| 着地ページ | セッション | 本提案で直す未来形 |
|---|---:|---|
| `/tools/tabako-zei-neage/` | 254 | 文面は直っている。**「データ最終更新日：2026年8月15日」だけが古い** |
| `/tools/shuzei-kaisei/` | 91 | 同上（2026-08-19） |
| `/tools/saitei-chingin/` | 28 | **FAQ（JSON-LD にも入る）と本文の「106万円の壁が撤廃されます」**、発効「（予定）」の説明段落 |
| `/tools/nenshu-kabe/` | 6 | **description の「撤廃され『週20時間の壁』に変わります」** |
| `/tools/hatarakizon/` | 4 | **description・FAQ・本文 3 か所** |

日別のセッションは 09-30 の 138 をピークに 10-03 は 30 まで落ちている（たばこ・酒税の施行日の山が過ぎた）。
次の流入の柱は最低賃金（12-02 まで順次発効）と年収の壁（年末調整の季節）で、**ここに未来形が残っているのが一番まずい**。
流入元は Yahoo! JAPAN の AI アシスタント経由（`openai / organic` 230）と Bing（222）がほぼ半々で、どちらも description・FAQ を要約に使う。

### 一次情報：すべて 2026-10-01 に施行済み

- **社会保険の賃金要件（月 8.8 万円＝106 万円の壁）の撤廃**：日本年金機構「2026年10月に…賃金要件が撤廃されました」
  （https://www.nenkin.go.jp/oshirase/taisetu/jigyosho/2026/202610/100104.html ）。`tools/lib/nenshu-kabe.ts` の
  `WAGE_REQUIREMENT_ABOLISHED_ON = '2026-10-01'` と一致
- **保険料調整制度**：同日開始の通算 3 年の時限措置（`HOKENRYO_CHOSEI_NOTE`。FAQ の一部はすでに「始まった」と過去形）
- **国民年金第 1 号被保険者の育児期間の保険料免除**：2026-10 分から（[kokunen-ikuji-menjo.md](./kokunen-ikuji-menjo.md) の法的根拠）
- **インボイス：適格請求書発行事業者以外からの仕入れの控除割合 80%→70%**：2026-10-01 から
  （[invoice-2wari-tokurei-shuryo.md](./invoice-2wari-tokurei-shuryo.md) の法的根拠。**段階の割合と時期は本提案では変えない。時制だけ**）

### 現状（2026-10-04 の main、`8af0983`）

計算機は正しく切り替わっている（`nenshu-kabe` は施行日で 106 万円の壁を出さなくなる、`hatarakizon` は「判定は端末の日付にもとづきます」）。
**静的な文面だけが施行前のまま**:

| ファイル:行 | いまの文 | 直し方 |
|---|---|---|
| `tools/app/saitei-chingin/page.tsx:63`（FAQ・JSON-LD） | 「なお2026年10月1日には106万円の壁（賃金要件）が撤廃されます。」 | 「なお2026年10月1日に106万円の壁（賃金要件）は撤廃されました。」 |
| `tools/app/saitei-chingin/page.tsx:282` | 「2026年10月1日には…賃金要件…が撤廃されます」 | 「2026年10月1日に…撤廃されました」。続く「撤廃後は〜無くなります」→「〜無くなりました」 |
| `tools/app/saitei-chingin/page.tsx:156-159` | 「発効日に（予定）が付く県は〜」の段落 | **段落ごと削除**（`tools/lib/saitei-chingin.ts` の冒頭コメントのとおり 47 都道府県すべてに `effectiveOn` があり、（予定）は画面に出ない） |
| `tools/app/saitei-chingin/page.tsx:171` | 表の見出し「発効（予定）日」 | 「発効日」 |
| `tools/app/saitei-chingin/page.tsx:112-116`（リード） | 「〜円（+56円）になります」 | 「10月1日から12月2日にかけて都道府県ごとに順次発効し、全国加重平均は〜円（+56円）になります」（**順次発効であることを先に書く**。12-02 以降は「なりました」に替えてよいが、本提案ではしない） |
| `tools/app/saitei-chingin/page.tsx:27`（description） | 「答申済みの県は答申額、まだの県は目安ベースの見込みとして区別して表示。」 | 「47都道府県の答申額と発効日を表示。」（**全県が答申済みで、見込みの県は無い**。`tools/lib/saitei-chingin.ts` の全県に `answered`・`effectiveOn` がある） |
| `tools/app/saitei-chingin/page.tsx:39`（FAQ・JSON-LD） | 末尾「このページでは、答申が出た県は答申額を、まだの県は目安ベースの見込みとして区別して表示しています。」 | 「このページでは47都道府県の答申額と発効日を表示しています。」。目安（54円・56円）の説明は経緯として残す |
| `tools/app/saitei-chingin/page.tsx:67`（FAQ・JSON-LD） | 「特に答申前の県について表示している額は目安にもとづく見込み〜」 | 該当の一文を削除（前段の「正式な金額・発効日は厚生労働省および都道府県労働局の発表で」は残す） |
| `tools/app/saitei-chingin/page.tsx:154-157`（本文） | 「答申が出た県は答申額、まだの県は目安ベースの見込みとして区別しています。見込みの額は確定額ではありません。」 | 「{REVISED_FY_LABEL}の欄は各都道府県の答申額です。」（下の 158-159 の（予定）の文と合わせて段落を短くする） |
| `tools/app/saitei-chingin/page.tsx:338-342`（`ToolMeta` の注記） | 「答申前の県について表示している額は、令和8年度の目安にもとづく見込みであり確定額ではありません。」 | 一文を削除。出典の目安のリンク（`SOURCE_MHLW_MEYASU`）は出典欄に残す |
| `tools/app/saitei-chingin/page.tsx:63`（FAQ の例示。任意） | 「時給が55円上がると年収はおよそ5万7,000円増えます」 | 実際の全国加重平均の引上げ +56 円に合わせて「時給が56円上がると年収はおよそ5万8,000円」（56×20×52＝58,240円）。時制ではないが同じ行を触るので一緒に直す |
| `tools/app/nenshu-kabe/page.tsx:174`（注記） | 「2026年10月1日に始まる保険料調整制度については〜」 | 「2026年10月1日に始まった保険料調整制度については〜」 |
| `tools/app/hatarakizon/page.tsx:15`（description） | 「2026年10月1日に社会保険の賃金要件（106万円）が撤廃されます。」 | 「2026年10月1日に社会保険の賃金要件（106万円）が撤廃されました。」。「同日開始の保険料調整制度」は過去形でもそのまま通る |
| `tools/app/hatarakizon/page.tsx:30-31`（FAQ） | Q「2026年10月に何が変わりますか？」A「〜撤廃されます」 | Q「2026年10月に何が変わりましたか？」A「〜撤廃されました」。以降の「年収がいくらであっても加入します」（制度の説明）は現在形のまま |
| `tools/app/hatarakizon/page.tsx:160` | 「保険料調整制度も始まります」 | 「保険料調整制度も始まりました」。h2「同じ日に始まる〜」→「同じ日に始まった〜」 |
| `tools/app/hatarakizon/page.tsx:202` | 「賃金要件が撤廃されます」 | 「賃金要件が2026年10月1日に撤廃されました」 |
| `tools/app/nenshu-kabe/page.tsx:13`（description） | 「2026年10月1日、106万円の壁（賃金要件）が撤廃され『週20時間の壁』に変わります。」 | 「2026年10月1日、106万円の壁（賃金要件）は撤廃され『週20時間の壁』に変わりました。」 |
| `tools/lib/nenshu-kabe.ts:144`（`note`） | 「2026年10月1日に撤廃され、以降は〜加入対象になります（この壁は施行日に自動で表示されなくなります）」 | 施行後は表示されない壁の注記なので**画面には出ない**。ただし施行前の日付を `asOf` に入れたテスト・比較表示で出るため、「2026年9月30日までの扱い。10月1日に撤廃されました」に直して矛盾を無くす |
| `tools/app/kokunen-ikuji-menjo/page.tsx:25`（description）・`:132`（h2）・`tools/lib/registry.ts:368` | 「2026年10月に始まる」「始まる『育児免除』」「免除されます」 | 「2026年10月に始まった」「2026年10月から始まった『育児免除』」。registry の「2026年10月から、〜免除されます」は**制度の説明として現在形で正しい**ので「2026年10月から」を残し語尾はそのまま（下記テストの対象外にする根拠） |
| `tools/app/invoice-nozeigaku/page.tsx:90`（FAQ） | 「2026年10月1日から〜80%から70%に下がります」 | 「2026年10月1日から〜70%に下がりました（それまでは80%）」。「2028年10月から50%〜」の未来の段階は未来形のまま |
| `tools/lib/tabako-zei.ts:45` | `DATA_CHECKED_AT = '2026-08-15'` | 実装日に国税庁の加熱式の換算（https://www.nta.go.jp/information/other/data/r08/tabacco/03.htm ）と財務省の税率を見直したうえで実装日に上げる |
| `tools/lib/shuzei-kaisei.ts:43` | `DATA_CHECKED_AT = '2026-08-19'` | 同上（国税庁の酒税率の一覧） |

`updatedAt`：`saitei-chingin`・`hatarakizon`・`nenshu-kabe`・`kokunen-ikuji-menjo`・`invoice-nozeigaku` の 5 本を実装日に上げる
（中身が変わるので IndexNow の差分送信に乗せる）。たばこ・酒税は文面を変えないので `updatedAt` は上げない
（`DATA_CHECKED_AT` だけ。sitemap の `lastmod` を意味なく動かさない）。

---

## 仕様

### A. 文面（上の表のとおり）

- **時制だけを変える。** 金額・割合・期日・計算の説明は変えない。制度の「いまのルール」を説明する文（「週20時間以上働けば加入します」）は現在形のまま
- 施行日の前の人向けの文（「2026年9月30日までは従来どおり106万円が壁として機能します」）は**残してよい**（過去の扱いの説明として正しい）
- **出典リンクの題名（引用）は書き換えない。** 例：`tools/app/kokunen-ikuji-menjo/page.tsx:287` の日本年金機構の題名
  「令和8年（2026年）10月から国民年金保険料の育児免除制度が始まります!」は原文どおりに残す（引用を改変すると出典と一致しなくなる）
- `saitei-chingin` の「見込み」の表示の**条件分岐（答申前なら見込みを出すコード）は消さない**。来年度の改定（目安の答申 → 各県の答申）で再び使うため。消すのは「いまは当てはまらない説明の文面」だけ
- title は変えない（`nenshu-kabe`・`hatarakizon` の title に未来形は無い）。`saitei-chingin` の title への「いつから」の追加は検索語の提案として別に扱う（下記「やらないこと」）

### B. 期日を過ぎた description の未来形を落とすテスト（共通化）

先例は `tools/tests/shuzei-kaisei.test.ts:537`（「施行日を過ぎたら、description に『これから』の文面が残っていない」）と
たばこのテストが**ページごとに**持っている。これを 1 本にまとめる。

- 新規 `tools/tests/post-effective-copy.test.ts`
- 表で持つ：`{ slug, effectiveOn, patterns }`。本提案の 5 本＋既存 2 本（`shuzei-kaisei`・`tabako-zei-neage`）
  - `nenshu-kabe` / `hatarakizon` / `saitei-chingin`：`effectiveOn = WAGE_REQUIREMENT_ABOLISHED_ON`（`tools/lib/nenshu-kabe.ts` から import。日付を二重に書かない）、`patterns = [/撤廃されます/, /撤廃され[^。]*変わります/, /10月1日に始まる/]`
  - `hatarakizon`：加えて `/始まります/`
  - `kokunen-ikuji-menjo`：`/始まる/`（registry の「免除されます」は制度の説明なので入れない）
  - `invoice-nozeigaku`：`/80%から70%に下がります/`
- 検査対象：`page.tsx` の `description`・FAQ（`q`・`a`）・**本文の文字列**（`page.tsx` のソースを読む）と registry の `description`
- **出典リンクの題名は検査対象から外す**：`<a href=...>` の中の文字列と、`SOURCE_*` 定数の `title`（出典の題名の引用）は検査しない。
  ソースを読む実装なら、`<a ...>〜</a>` の区間を取り除いてから patterns を当てる（patterns を `/始まります/` に広げたときに引用に当たらないように）
- `saitei-chingin` の「見込み」の文面は施行日ではなく**全県が答申済みかどうか**で決まるので、このテストには入れない。
  代わりに既存の `tools/tests/saitei-chingin.test.ts` に「全県が `answered` を持つとき、description に『見込み』が無い」を 1 本足す
- 条件：**テストを走らせた日（`new Date()`）が `effectiveOn` 以降のときだけ**検査する（施行前に書いた仕様書・PR が CI で落ちないように。先例と同じ作法）
- 既存 2 本のページ別のテストは消さずに残す（本提案でテストを減らさない）。重複が気になる場合は後で寄せる

### C. 確認ポイント（テスト環境）

- `/tools/saitei-chingin/`：本文に「撤廃されます」「（予定）」「目安ベースの見込み」が無い／表の見出しが「発効日」／FAQ の JSON-LD（ページのソース）が過去形で「見込み」の一文が無い／description に「見込み」が無い
- `/tools/hatarakizon/`・`/tools/nenshu-kabe/`：ページのソースの `<meta name="description">` が「撤廃されました」「変わりました」
- `/tools/kokunen-ikuji-menjo/`：h2 と description が「始まった」
- `/tools/tabako-zei-neage/`・`/tools/shuzei-kaisei/`：「データ最終更新日」が実装日

---

## やらないこと

- 計算ロジック・税率・発効日のデータの変更（監査で誤りは見つかっていない。下記「監査の範囲」）
- `saitei-chingin` の title の書き換え（「いつから」「発効日一覧」を足すと競合の title に寄るが、title の変更は検索の評価を一度揺らすので、
  Bing の検索語データ（[bing-search-performance-audit.md](./bing-search-performance-audit.md)）で「いつから」の表示回数を確かめてから別の提案にする）
- ふるさと納税の特例控除の上限（令和8年度改正で 2027 年の寄附から）の FAQ 追加：年末の駆け込みの前（11 月中）に別の提案にする

## 監査の範囲（2026-10-04、本提案の起票時）

上位 6 ページの数字と期日を一次情報と突き合わせた。**誤りは無かった**：
最低賃金 令和8年度（東京 1,280 円・10-01、熊本 1,092 円・12-01、加重平均 1,177 円・+56 円、10-01 発効は 15 都道府県、
開いた日で「発効済み」に切り替わる）／たばこ（2027〜2029 年の 4 月に 1 本 0.5 円ずつ・加熱式 0.35g＝1 本換算）／
酒税（ビール系 155,000 円/kl に一本化・チューハイ等 80,000→100,000 円）／養育費（標準算定方式の指数 62・85）／
年齢計算（2 月 29 日・4 月 1 日生まれの学年）／ふるさと納税（令和 8 年分の基礎控除 104 万円・給与所得控除の最低 74 万円）。
`tools/node_modules` が無い環境だったので**テストは走らせていない**（コードを読んだ確認）。

## 工数の見積もり

- 実装：文面 22 か所＋テスト 1 本（＋`saitei-chingin.test.ts` に 1 ケース）。**約 5〜7 万トークン**（page.tsx 5 枚の読み込みが大半）
- レビュー対応込みで **約 8 万トークン**

## 期待される効果

- 施行済みの制度を「これから」と書いている状態（法的な事実との食い違い）を解消する。AI アシスタント経由の要約が誤った時制で引用されるのを止める
- 「データ最終更新日」が施行後になり、上位 2 ページの信頼の印象が戻る
- 次に来る期日（2027-04 のたばこ増税、2027-10 の企業規模要件の縮小、2028-10 のインボイス 50%）で同じ取りこぼしを CI が拾う
