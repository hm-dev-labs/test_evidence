# GTM 経由での GA4 タグ埋め込み手順

## 概要

Evidence で生成したダッシュボードに Google タグマネージャー（GTM）を経由して  
Google Analytics 4（GA4）の計測タグを埋め込み、ページビューやユーザー行動を GA4 で分析できるようにする。

GA4 の測定 ID や計測タグの設定はコードに直書きせず、すべて GTM コンテナ側で管理する。  
コード側が持つのは **GTM コンテナ ID のみ** であり、タグの追加・変更・停止は GTM の公開（Submit）だけで完結し、アプリの再デプロイを必要としない。

---

## なぜ GTM を挟むか

| 観点 | GA4 タグ直書きの課題 | GTM を挟むことで解決される点 |
|------|-------------------|-------------------------|
| 変更の柔軟性 | 計測タグを増減・修正するたびにコード変更とデプロイが必要 | GTM 管理画面でタグ・トリガー・変数を編集し「公開」するだけで反映できる |
| 非エンジニアの運用 | GA4 の設定変更に開発者の対応が毎回必要 | マーケティング担当者が GTM 管理画面から自走できる |
| 計測の一元管理 | GA4 以外の計測タグ（広告タグ等）を追加する際にコード修正箇所が増える | GTM コンテナ内にタグを追加するだけで済み、コード側の変更は不要 |

## なぜ通常の方法では埋め込めないか

Evidence は SvelteKit ベースの SPA（Single Page Application）として動作するため、  
一般的な「`<head>` に GTM の `<script>` タグを貼る」方法がそのまま使えない。

| 課題 | 理由 | 本実装での対処 |
|------|------|-------------|
| `<head>` に直接書けない | Evidence は Markdown ファイルがページ定義のため `<head>` を直接編集する場所がない | `+layout.svelte` の `onMount()` で GTM のコンテナスニペットを DOM に動的に追加する |
| ページ遷移で PV が飛ばない | SPA はページ遷移時に HTML の再読み込みが起きないため、GTM/GA4 の自動 PV 計測が機能しない | `page` ストアを `subscribe` して URL 変化を検知し、`dataLayer.push({ event: 'spa_page_view', ... })` でカスタムイベントを手動送信する |
| データ更新でも PV が発火する | Evidence の `page` ストアはデータ更新時にも変化するため、同じ URL で重複送信が起きる | `lastSentPagePath` 変数で直前に送信した URL を保持し、同一 URL への再送信を防ぐ |
| GA4 の測定 ID がコードに漏れる | GA4 の測定 ID をコード/環境変数に直書きすると、GTM 側で ID を変更した際にコードとの二重管理になる | 測定 ID は **GTM 内の GA4 設定タグにのみ保持** し、コード側は GTM コンテナ ID だけを扱う |

---

## 全体の実装フロー

```
1. GTM でコンテナを作成し、コンテナ ID を取得
2. GTM 内に変数・トリガー・GA4 タグ（設定タグ + イベントタグ）を作成する
3. pages/+layout.svelte を作成（GTM スニペットの動的ロード + カスタムイベント手動送信）
4. 環境変数を設定（ローカル / Cloudflare Pages / GitHub Actions）
5. GTM のプレビューモードで動作確認し、公開する
```

---

## タスク一覧

- [ ] Task 1: GTM でコンテナを作成し、コンテナ ID を確認する
- [ ] Task 2: GTM 内に GA4 設定タグ・イベントタグ・変数・トリガーを作成する
- [ ] Task 3: `pages/+layout.svelte` を作成する
- [ ] Task 4: ローカル環境で動作確認する（GTM プレビューモード）
- [ ] Task 5: Cloudflare Pages に環境変数を設定する
- [ ] Task 6: GitHub Actions に環境変数を設定する
- [ ] Task 7: GTM コンテナを公開（Submit）する

---

## 使用する環境変数

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `VITE_GTM_CONTAINER_ID` | ◎ | GTM のコンテナ ID（`GTM-XXXXXXX` 形式）。**未設定の場合は計測無効**になる |
| `VITE_GA4_ENV` | 任意 | 環境区別用カスタムディメンション（例: `prod`, `staging`, `demo`）。`dataLayer` 経由で GTM に渡す |
| `VITE_GA4_PROMOTION_ID` | 任意 | 顧客・案件区別用カスタムディメンション。`dataLayer` 経由で GTM に渡す |
| `VITE_GA4_REPORT_DEF_ID` | 任意 | レポート定義 ID 区別用カスタムディメンション。`dataLayer` 経由で GTM に渡す |

> `VITE_` プレフィックスは Vite（SvelteKit のビルドツール）の仕様で、  
> このプレフィックスがないとブラウザ側のコードから環境変数を参照できない。

> **GA4 の測定 ID（`G-XXXXXXXX`）はコード側の環境変数として保持しない。**  
> GTM 内の GA4 設定タグにのみ設定する（Task 2 参照）。

---

## 詳細手順

### Task 1: GTM でコンテナを作成し、コンテナ ID を確認する

1. [Google タグマネージャー](https://tagmanager.google.com/) にログイン
2. 「アカウントを作成」→ ウェブ向けのコンテナを作成（対象サイトのドメインを設定）
3. コンテナ作成後に表示される「コンテナ ID」（`GTM-XXXXXXX` 形式）をコピーしておく
4. あわせて GA4 側で **管理 → データストリーム → 対象のウェブストリーム** から測定 ID（`G-XXXXXXXX` 形式）を確認しておく（Task 2 で GTM に設定する）

### Task 2: GTM 内に GA4 設定タグ・イベントタグ・変数・トリガーを作成する

GA4 への計測は GTM 管理画面上で完結させる。コード側からは `spa_page_view` というカスタムイベントを `dataLayer` に流すだけで、実際に GA4 へ何を送るかは GTM 側のタグ設定がすべて決める。

#### 2-1. 変数を作成する（データレイヤーの変数）

**変数 → ユーザー定義変数 → 新規** で、以下のデータレイヤー変数を作成する。

| 変数名 | 変数タイプ | データレイヤーの変数名 |
|--------|-----------|----------------------|
| DLV - page_location | データレイヤーの変数 | `page_location` |
| DLV - page_path | データレイヤーの変数 | `page_path` |
| DLV - env | データレイヤーの変数 | `env` |
| DLV - promotion_id | データレイヤーの変数 | `promotion_id` |
| DLV - report_def_id | データレイヤーの変数 | `report_def_id` |

#### 2-2. トリガーを作成する

**トリガー → 新規 → カスタムイベント** を選択し、以下を設定する。

| トリガー名 | イベント名 | 発生対象 |
|-----------|-----------|---------|
| CE - SPA Page View | `spa_page_view` | すべてのカスタムイベント |

#### 2-3. GA4 設定タグを作成する

**タグ → 新規 → タグの種類: Google アナリティクス: GA4 設定** を選択する。

- 測定 ID: Task 1 で確認した `G-XXXXXXXX`
- 「このコンフィグの読み込み時にページビュー イベントを送信する」チェックを **オフ**（SPA のため自動 PV を無効化し、手動送信に統一する）
- トリガー: **Initialization - すべてのページ**

#### 2-4. GA4 イベントタグ（page_view）を作成する

**タグ → 新規 → タグの種類: Google アナリティクス: GA4 イベント** を選択する。

- 設定タグ: 2-3 で作成した GA4 設定タグを選択
- イベント名: `page_view`
- イベントパラメータ:

| パラメータ名 | 値 |
|-------------|---|
| `page_location` | `{{DLV - page_location}}` |
| `page_path` | `{{DLV - page_path}}` |
| `env` | `{{DLV - env}}` |
| `promotion_id` | `{{DLV - promotion_id}}` |
| `report_def_id` | `{{DLV - report_def_id}}` |

- トリガー: 2-2 で作成した **CE - SPA Page View**

#### 2-5. GA4 にカスタムディメンションを登録する

環境・顧客・レポート単位で分析できるようにカスタムディメンションを事前登録する（GTM 側の設定とは別に GA4 側でも必要）。

1. **管理 → カスタム定義 → カスタムディメンション → 作成**
2. 以下を登録する（`VITE_GA4_ENV` 等を使う場合のみ必要）:

| ディメンション名 | スコープ | イベントパラメータ名 |
|----------------|---------|-------------------|
| env | イベント | `env` |
| promotion_id | イベント | `promotion_id` |
| report_def_id | イベント | `report_def_id` |

> カスタムディメンションは GA4 のレポートに反映されるまで **最大 24 時間** かかる。

### Task 3: `pages/+layout.svelte` を作成する

Evidence の全ページに共通して適用されるレイアウトファイルを作成する。  
このファイルに GTM の初期化コードを書くことで、すべてのページで計測が有効になる。GA4 への送信内容自体はコードには一切含まれず、GTM 側のタグ設定（Task 2）に委ねる。

**`pages/+layout.svelte`**

```svelte
<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  // VITE_ プレフィックスつき環境変数はビルド時にインライン展開される
  const GTM_CONTAINER_ID = import.meta.env.VITE_GTM_CONTAINER_ID;
  const GA4_ENV = import.meta.env.VITE_GA4_ENV ?? '';
  const PROMOTION_ID = import.meta.env.VITE_GA4_PROMOTION_ID ?? '';
  const REPORT_DEF_ID = import.meta.env.VITE_GA4_REPORT_DEF_ID ?? '';

  // 直前に送信した URL を保持し、データ更新などによる重複送信を防ぐ
  let lastSentPagePath = '';

  onMount(() => {
    // GTM_CONTAINER_ID が未設定の場合は何もしない（ローカル開発時など）
    if (!GTM_CONTAINER_ID) return;

    // dataLayer は GTM スニペットの読み込み前に初期化しておく必要がある
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });

    // GTM のコンテナスニペットを動的に <head> に追加する
    // Evidence は静的 Markdown ベースのため <head> に直接書けないため onMount で動的追加する
    const script = document.createElement('script');
    script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_CONTAINER_ID}`;
    script.async = true;
    document.head.appendChild(script);

    // SvelteKit の page ストアを監視してページ遷移を検知する
    // Evidence は SPA なのでブラウザのページ再読み込みが起きず、GTM/GA4 の自動PV計測が機能しない
    const unsubscribe = page.subscribe(($page) => {
      const currentPath = $page.url.pathname + $page.url.search;

      // データ更新などで page ストアが発火しても同一 URL には再送信しない
      if (currentPath === lastSentPagePath) return;
      lastSentPagePath = currentPath;

      // GA4 に何を送るかは関知せず、GTM 側のトリガー・タグ設定に委ねる
      window.dataLayer.push({
        event: 'spa_page_view',
        page_location: $page.url.href,
        page_path: currentPath,
        // カスタムディメンション（未設定の場合は空文字列が入るが GA4 側でフィルタ可能）
        env: GA4_ENV,
        promotion_id: PROMOTION_ID,
        report_def_id: REPORT_DEF_ID,
      });
    });

    // コンポーネント破棄時にストア購読を解除する（メモリリーク防止）
    return () => unsubscribe();
  });
</script>

<!-- 全ページ共通のレイアウト。slot に各ページの内容が入る -->
<slot />
```

> GTM の `<noscript>` 用 iframe（JavaScript 無効時のフォールバック）は Evidence が SPA で `<body>` 直下を直接編集できないため本実装では省略している。JavaScript 無効環境の計測が必要な場合は別途検討する。

### Task 4: ローカル環境で動作確認する（GTM プレビューモード）

**`.env.local`** をプロジェクトルートに作成する（`.gitignore` に `.env` が含まれているため git に追加されない）。

```bash
VITE_GTM_CONTAINER_ID=GTM-XXXXXXX
VITE_GA4_ENV=local
VITE_GA4_PROMOTION_ID=test
VITE_GA4_REPORT_DEF_ID=test
```

開発サーバーを起動して確認する。

```bash
npm run dev
```

GTM 管理画面右上の **「プレビュー」** ボタンから対象 URL（`http://localhost:xxxx`）に接続し、Tag Assistant で以下を確認する。

```
確認ポイント:
  ✓ ページ読み込み時に GA4 設定タグ（Initialization）が発火する
  ✓ 初回アクセスで spa_page_view イベントが dataLayer に積まれ、GA4 イベントタグが発火する
  ✓ ページ遷移（別のページに移動）で spa_page_view が再送信される
  ✓ 同じページでのデータ更新では重複送信されない
  ✓ GA4 イベントタグのパラメータ（page_location, page_path, env, promotion_id, report_def_id）が正しく渡っている
```

GTM のプレビューモードに加えて、ブラウザの DevTools → ネットワークタブで `google-analytics.com`（GA4 への実送信）へのリクエストが飛んでいるかも確認する。

### Task 5: Cloudflare Pages に環境変数を設定する

1. Cloudflare ダッシュボード → **Workers & Pages → 対象プロジェクト**
2. **設定 → 環境変数 → 変数を追加**
3. 以下を登録する:

| 変数名 | 値 | 環境 |
|--------|---|------|
| `VITE_GTM_CONTAINER_ID` | `GTM-XXXXXXX` | Production / Preview |
| `VITE_GA4_ENV` | `prod` | Production |
| `VITE_GA4_ENV` | `staging` | Preview |
| `VITE_GA4_PROMOTION_ID` | 案件を識別する任意の文字列 | Production / Preview |
| `VITE_GA4_REPORT_DEF_ID` | レポートを識別する任意の文字列 | Production / Preview |

> **注意:** Cloudflare Pages の環境変数はビルド時に展開される。  
> 変数を変更した場合は**再デプロイが必要**（設定を保存しただけでは反映されない）。  
> 一方、GTM コンテナ内のタグ設定変更は GTM の公開だけで反映され、再デプロイは不要。

### Task 6: GitHub Actions に環境変数を設定する

`.github/workflows/deploy.yml` の `Build Evidence` ステップに環境変数を追加する。

```yaml
- name: Build Evidence
  run: npm run build
  env:
    VITE_GTM_CONTAINER_ID: ${{ secrets.VITE_GTM_CONTAINER_ID }}
    VITE_GA4_ENV: prod
    VITE_GA4_PROMOTION_ID: ${{ secrets.VITE_GA4_PROMOTION_ID }}
    VITE_GA4_REPORT_DEF_ID: ${{ secrets.VITE_GA4_REPORT_DEF_ID }}
```

GitHub リポジトリの **Settings → Secrets and variables → Actions** に以下を登録する。

| Secret 名 | 値 |
|-----------|---|
| `VITE_GTM_CONTAINER_ID` | GTM のコンテナ ID |
| `VITE_GA4_PROMOTION_ID` | 案件識別文字列 |
| `VITE_GA4_REPORT_DEF_ID` | レポート識別文字列 |

> `VITE_GA4_ENV` は環境ごとに固定値（`prod` / `staging`）のため Secret ではなく  
> ワークフローファイルに直接書いてよい。

### Task 7: GTM コンテナを公開（Submit）する

Task 2 で作成したタグ・トリガー・変数はワークスペース上の下書きのままでは動作しない。  
GTM 管理画面右上の **「公開」（Submit）** ボタンからバージョンを公開して初めて本番環境で有効になる。

---

## 実装の全体像（まとめ）

```
ビルド時
  環境変数（VITE_GTM_CONTAINER_ID, VITE_GA4_*）
       │ Vite がインライン展開
       ▼
  pages/+layout.svelte（コンパイル後の JS）

ブラウザ実行時
  onMount() 発火
       │ dataLayer 初期化 + <script> タグを動的に <head> に追加
       ▼
  gtm.js がロードされる（GTM コンテナが読み込まれる）
       │
       ▼
  GTM: GA4 設定タグが Initialization トリガーで発火（自動PVは無効）
       │
       ▼
  page ストアを subscribe
       │ URL 変化を検知
       ▼
  dataLayer.push({ event: 'spa_page_view', ...カスタムディメンション }) を送信
       │
       ▼
  GTM: CE - SPA Page View トリガーが発火
       │
       ▼
  GTM: GA4 イベントタグ（page_view）が発火し、GA4 へ送信
       │
       ▼
  GA4 でページビュー・カスタムディメンションが記録される
```

---

## ハマりやすいポイント

| 問題 | 原因 | 対処 |
|------|------|------|
| ローカルで PV が飛ばない | `.env.local` が未作成か `VITE_GTM_CONTAINER_ID` が未設定 | ファイルを作成して `npm run dev` を再起動する |
| GTM プレビューでタグが発火しない | GTM 側のタグ・トリガーが下書きのままプレビュー対象になっていない、またはトリガーのイベント名が `spa_page_view` と一致していない | GTM 管理画面でトリガーのイベント名と `dataLayer.push` の `event` の値が完全一致しているか確認する |
| デプロイ後に PV が飛ばない | Cloudflare Pages の環境変数設定後に再デプロイしていない、または GTM コンテナが未公開 | 環境変数設定後にデプロイを再実行し、GTM 側も「公開」を実行する |
| GA4 に page_view が二重に送信される | GA4 設定タグの「読み込み時にページビューイベントを送信する」がオンのまま | GA4 設定タグでこのチェックを **オフ** にし、`page_view` は GA4 イベントタグ経由の手動送信のみにする |
| GA4 のレポートに反映されない | カスタムディメンションが GA4 側に未登録、または GTM のイベントパラメータ名と GA4 側の登録名が不一致 | **管理 → カスタム定義** でディメンションを事前登録し、GTM イベントタグのパラメータ名と一致させる（最大 24 時間後に反映） |
| 同一ページで PV が二重に送信される | `lastSentPagePath` のチェックが機能していない | `$page.url.pathname + $page.url.search` で比較しているかを確認する |
| `import.meta.env` が undefined | `VITE_` プレフィックスなしで環境変数を定義している | 変数名が `VITE_` で始まっているかを確認する |
| GTM は公開したのに反映されない | ブラウザ/CDN キャッシュにより古い `gtm.js` が読み込まれている | ハード リロードするか、時間をおいて再確認する |

---

## 参考リンク

- [Google タグマネージャー ヘルプ](https://support.google.com/tagmanager)
- [GTM で GA4 イベントを設定する](https://support.google.com/tagmanager/answer/9442095)
- [GA4 カスタムディメンション設定ガイド](https://support.google.com/analytics/answer/10075209)
- [SvelteKit 環境変数（Vite）](https://kit.svelte.dev/docs/modules#$env-static-public)
- [SvelteKit $app/stores - page](https://kit.svelte.dev/docs/modules#$app-stores)
