# URLの正規化（末尾スラッシュ・index.html の301統一）

**状態**：提案。未実装
**対象**：CloudFront（**実装は [hasokon-infra](https://github.com/ke-iwata/hasokon-infra) 側**）。
このリポジトリのコード変更は無い
**起票**：2026-08-10

---

## 背景と根拠

2026-08-10 に本番URLへ直接リクエストして確認したところ、
**1ページが最大3つのURLで同じ内容を200で返していた**。

### 計測値（2026-08-10 取得 / 本番へのHTTPリクエスト）

```
$ curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" <URL>
```

| URL | 応答 | 本来あるべき応答 |
|---|---|---|
| `https://hasokon.com/games/solitaire/` | **200** | 200（正規） |
| `https://hasokon.com/games/solitaire` | **200** | 301 → `/games/solitaire/` |
| `https://hasokon.com/games/solitaire/index.html` | **200** | 301 → `/games/solitaire/` |
| `https://hasokon.com/tools/warikan` | **200** | 301 → `/tools/warikan/` |
| `https://hasokon.com/tools/warikan/index.html` | **200** | 301 → `/tools/warikan/` |
| `https://hasokon.com/games` | **200** | 301 → `/games/` |
| `https://hasokon.com/tools` | **200** | 301 → `/tools/` |
| `https://hasokon.com/index.html` | **200** | 301 → `/` |

スラッシュ有無の2つは**バイト単位で同一**だった。

```
$ curl -s https://hasokon.com/games/solitaire  | md5sum
ef3e4f0415077a9501f110079400da0f  -
$ curl -s https://hasokon.com/games/solitaire/ | md5sum
ef3e4f0415077a9501f110079400da0f  -
```

なお、存在しないパスは正しく404を返しており（`/nonexistent-page`・`/tools/nonexistent`・
`/games/nonexistent` いずれも404）、大文字違い（`/Games/Solitaire/`）も404。
**壊れているのは「正規URLへ寄せる301が無い」ことだけ**で、他のURL処理は正常。

### 実害はすでに計測データに出ている

GA4 Data API（`properties/548154955`、2026-07-13〜2026-08-09、2026-08-10 取得）の
`pagePath` レポートに、スラッシュ有無が別行で並んでいる。

| pagePath | 表示回数 | 平均セッション時間 |
|---|---|---|
| `/solitaire/` | 9 | 13秒 |
| `/solitaire` | 5 | 934秒 |

**同じソリティアのページなのに2行に割れ、平均滞在時間が13秒と934秒に分かれている。**
このままではどちらの数字も実態を表さない。

また、`fullPageUrl` にも `game.hasokon.com/solitaire`・`hasokon.com/games/solitaire` が
スラッシュ付きと別に立っており、**実際のユーザーがスラッシュ無しURLで到達している**ことが分かる
（サイト内リンクはすべてスラッシュ付きなので、外部リンクか直接入力によるもの）。

## 現状

### 仕組み

`tools/next.config.ts`・`games/next.config.ts` はどちらも `trailingSlash: true` で、
`out/games/solitaire/index.html` の形で書き出される。これがS3に同期され、
CloudFront が `/games/solitaire` へのリクエストに対しても
`/games/solitaire/index.html` を返している（内部での補完であって、リダイレクトではない）。

`home/` は素の静的HTMLで、`index.html` と `privacy.html` を直下に置いている。
`/privacy`（拡張子なし）は404になるので、home側で増えるのは `/index.html` の1件だけ。

### いま何が起きているか

1. **クロール対象のURLが最大3倍になっている。**
   ツール13本 + ゲーム6本 + 一覧2本 + 各種固定ページで、
   スラッシュ有無と `index.html` を数えると本来の3倍近いURLが200を返す状態

2. **GA4のページ行が割れる**（上の計測値のとおり）

3. **canonical タグはどのURLでも正規形を指している**（実測で確認）。

   ```
   $ curl -s https://hasokon.com/games/solitaire | grep canonical
   rel="canonical" href="https://hasokon.com/games/solitaire/"
   $ curl -s https://hasokon.com/games/solitaire/index.html | grep canonical
   rel="canonical" href="https://hasokon.com/games/solitaire/"
   ```

   **つまり検索結果に重複が並ぶ危険は canonical で塞がれている。**
   この提案は「壊れているものを直す」ではなく「無駄を削る」もので、緊急性は高くない。

### それでも直したい理由

canonical は「Googleが重複と気づいたあとに、どちらを正とするか」の指定であって、
**重複URLをクロールしないで済ませる指定ではない**。Googleは3つのURLを別々に取得し、
中身を比べてから1つに寄せる。

hasokon.com は 2026-08-08 にドメイン統合したばかりで、
[search-index-consolidation.md](./search-index-consolidation.md) に書いたとおり
**再クロールの遅さが統合完了のボトルネックになっている**。
Search Analytics API で見た直近90日の表示回数は 10 回、
表示があったページは `/`・`/privacy.html`・`/tools/sleep-cycle/` の3つだけ（2026-08-10 取得）。

この状況でクロール対象を3倍に膨らませておく理由が無い。

## 提案する仕様

CloudFront の viewer-request 関数で、正規形でないURLを **301** で正規形に寄せる。

### 変換ルール

| 入力 | 出力 |
|---|---|
| `/path/index.html` | 301 → `/path/` |
| `/index.html` | 301 → `/` |
| `/path`（拡張子なし・末尾スラッシュ無し） | 301 → `/path/` |
| `/path/` | そのまま（正規形） |
| `/path/file.css`・`/favicon.ico` など拡張子つき | そのまま |
| `/privacy.html`（home の実ファイル） | そのまま |

クエリ文字列とフラグメントは保持する。

### 判定条件

「拡張子を持たないパス」を、最後のセグメントに `.` を含まないことで判定する。
`home/` 直下には `privacy.html`・`ads.txt`・`robots.txt`・`sitemap*.xml`・
ファビコン類といった拡張子つきの実ファイルがあるので、この条件で正しく素通りする。

### 実装場所

**このリポジトリではなく [hasokon-infra](https://github.com/ke-iwata/hasokon-infra) の
Terraform に CloudFront Function を追加する。**
CLAUDE.md のとおり、CloudFront はコンソールで直接いじらず hasokon-infra にPRを出す。

既存のディストリビューションには、`/games/solitaire` に
`/games/solitaire/index.html` を返す仕組みがすでに入っているはずなので、
**新規追加ではなく既存関数の差し替えになる可能性が高い**。着手時にまず現状の関数を確認すること。

### 確認方法

本番反映後、次がすべて 301 と正規URLを返すこと。

```
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://hasokon.com/games/solitaire
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://hasokon.com/games/solitaire/index.html
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://hasokon.com/tools/warikan
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://hasokon.com/index.html
```

あわせて、次が引き続き 200 を返すこと（回帰確認）。

```
https://hasokon.com/  /tools/  /games/  /tools/warikan/  /games/solitaire/
https://hasokon.com/privacy.html  /robots.txt  /sitemap.xml  /ads.txt  /favicon.ico
```

存在しないパスが引き続き404であること（`/nonexistent-page`）。

## 期待される効果

**順位が上がる類の施策ではない。効果は「クロールと計測の無駄を削る」こと。**

- クロール対象URLが約1/3になり、新規ドメインの限られたクロール予算が
  実在ページの再取得に回る。統合完了（旧サブドメインが正規URLでなくなること）が早まる方向に働く
- GA4のページ行の分裂が止まり、スラッシュ無しで到達したセッションも同じ行に積まれる
- 外部からスラッシュ無しで貼られたリンクの評価が、301で正規URLに集約される

**測り方**

1. 上の `curl` で301が返ることを確認（即日）
2. 4週間後に `scripts/gsc-canonical-audit.mjs` を回し、
   `googleCanonical` が旧サブドメインを指すURL数の減りを見る
3. GA4で `pagePath` にスラッシュ無しの行が新規に立たなくなることを確認

## 工数の見積り

| 作業 | 目安 |
|---|---|
| 現状の CloudFront Function の確認 | 30分 |
| 関数の実装（変換ルール + 単体テスト） | 1時間 |
| hasokon-infra へのPR作成・レビュー | 30分 |
| テスト環境（test.hasokon.com）での確認 | 30分 |
| 本番反映と回帰確認 | 30分 |
| 合計 | **3時間程度**（AIエージェントに任せる場合の消費トークンは 30k〜50k 程度） |

このリポジトリ側の作業は、この仕様書の追加のみで**0**。

## やらないこと

- **`trailingSlash: false` に切り替えて拡張子なしURLを正規にする**のはやらない。
  現在インデックスされているURLと sitemap がすべてスラッシュ付きで、
  切り替えると全ページのURLが変わる。ドメイン統合の直後にもう一度URLを動かすのは割に合わない
- **S3 の静的ウェブサイトホスティングのリダイレクトルールで対応する**のはやらない。
  現構成は CloudFront + OAC（S3をウェブサイトエンドポイントとして公開していない）ため、
  S3側のリダイレクトルールは効かない
- **`/privacy` → `/privacy.html` の補完**は入れない。
  home の1ページのためにルールを増やすと、拡張子なし判定の例外が増えて壊れやすくなる。
  必要なら `home/privacy/index.html` を置くほうが素直（別提案として扱う）
- **canonical タグを消す**のはやらない。301と canonical は役割が違い、両方あってよい
