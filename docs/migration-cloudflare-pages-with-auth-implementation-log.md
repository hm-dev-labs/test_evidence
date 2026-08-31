# 実装ログ: GitHub Pages → Cloudflare Pages 移行

`migration-cloudflare-pages-with-auth.md` の実装を別PC(GitHub連携あり)で反映するための作業メモ。
ここに記載した2ファイルの変更を、GitHub連携が可能なPC側で同様に適用してコミット・pushしてください。

## 変更したファイル

### 1. `.github/workflows/deploy.yml`

GitHub Pagesデプロイ用のワークフローを、Cloudflare Pagesデプロイ用に全面書き換え。

**変更点:**

| 項目 | 変更前 | 変更後 |
|------|--------|--------|
| ワークフロー名 | `Deploy Evidence to GitHub Pages` | `Deploy Evidence to Cloudflare Pages` |
| `permissions`(`pages: write` 等) | あり | 削除(不要。Cloudflareへの認証はAPI Tokenで行うため) |
| `environment: github-pages` | あり | 削除 |
| ビルド時の `BASE_PATH` 環境変数 | `/${{ github.event.repository.name }}` | 削除(Cloudflare Pagesはルートパス配信のため不要。代わりに `evidence.config.yaml` 側で対応、下記参照) |
| GA4関連の環境変数(`VITE_GTM_CONTAINER_ID` 等) | あり | そのまま維持 |
| デプロイ手段 | `actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4` | `cloudflare/wrangler-action@v3`(`command: pages deploy build/test_evidence --project-name=test-evidence`) |
| `concurrency` 設定 | なし | 追加(`group: pages`, `cancel-in-progress: false`) |

**注意(ドキュメントとの差分):**
`migration-cloudflare-pages-with-auth.md` のStep 4のサンプルYAMLは `pages deploy build --project-name=...` と記載されているが、実際の `package.json` のbuildスクリプトは
```
"build": "cross-env EVIDENCE_BUILD_DIR=./build/test_evidence evidence build"
```
となっており、ビルド成果物は `build/test_evidence` に出力される。ドキュメント通り `build` を指定するとデプロイ対象ディレクトリが存在せず失敗するため、`build/test_evidence` に修正して実装した。

**GitHub Actions で利用している設定（登録済み/設定済み）:**
- Secrets:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
- Repository Variables / 環境変数:
  - `VITE_GTM_CONTAINER_ID`
  - `VITE_GA4_ENV`
  - `VITE_GA4_PROMOTION_ID`
  - `VITE_GA4_REPORT_DEF_ID`

> 補足: 実際のワークフローでは GA4 系の値は `secrets` ではなく `vars` を参照しており、設計書側で「Secrets のみ」と書き分けると誤解しやすい。今の実装に合わせて、Cloudflare 用のシークレットと GA4 系の変数を分けて管理している。

### 2. `evidence.config.yaml`

```diff
 deployment:
-  basePath: /test_evidence
+  basePath: ""
```

**修正理由(ドキュメントに記載のない追加対応):**
`migration-cloudflare-pages-with-auth.md` の「変更対象ファイル一覧」ではこのファイルへの言及はないが、`deployment.basePath` に `/test_evidence` がハードコードされていた。これを残したままCloudflare Pagesへルートパス配信すると、サイト内のナビゲーションリンクが `/test_evidence/...` を前提にしたまま生成され続け、実際の配信パス(ルート)と食い違って壊れる。
ドキュメントの「注意事項」セクションにある

> `BASE_PATH` 環境変数を設定していた場合、Cloudflare Pages ではルートパスで配信されるため削除が必要。削除しないとナビゲーションリンクが壊れる。

を実効あるものにするため、環境変数側だけでなく設定ファイル側の `basePath` も空にする対応を追加した。

## この2ファイル以外でドキュメントに記載があるが未実施の作業

コード変更ではなく、Cloudflare/GitHubの管理画面・CLI操作が必要なため、コード修正専用のこのPCでは実施していない。

- [x] Cloudflare Pagesプロジェクト作成(`test-evidence`、Direct Upload方式で作成済み)
- [x] Cloudflare API Token発行 → GitHub Secrets(`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`)登録済み
- [ ] 上記2ファイルの変更をコミット・main へpush(→ Actions実行確認)
- [x] GitHub Pagesの無効化(Settings → Pages → Source を `None`)— 現在ログイン中のGitHubアカウントはこのリポジトリに対して読み取り専用(pull権限のみ)のため未実施。admin権限のあるアカウントで実施が必要
- [ ] Cloudflare Access(Zero Trust)でアプリケーション作成・アクセス許可ポリシー設定(ドキュメントStep 6、方式Aのメール+ワンタイムパスコード推奨)
- [ ] 最終動作確認(Pages URLでログイン画面表示 → 認証後にルートパスで正しく表示されること)

## 本番反映前チェックリスト

本番反映前に最低限確認しておきたい項目を整理する。

- [ ] `main` ブランチへ push されて GitHub Actions が実行されること
- [ ] Cloudflare Pages のデプロイログで `build/test_evidence` の配信が成功していること
- [ ] Cloudflare Pages のプロジェクト名が `test-evidence` と一致していること
- [ ] GitHub の Secrets に `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` が登録済みであること
- [ ] GitHub の Variables または Actions env に `VITE_GTM_CONTAINER_ID` / `VITE_GA4_*` が設定済みであること
- [ ] `evidence.config.yaml` の `deployment.basePath` が `""` であること
- [ ] ルートパス配信前提で内部リンクが `/...` になること（`/test_evidence/...` になっていないこと）
- [ ] GitHub Pages の `Settings → Pages` が `None` になっていること
- [ ] Cloudflare Access のアプリケーションが作成済みで、対象ドメインが Pages の実URLに一致していること
- [ ] 許可ユーザーのポリシーが正しく設定されていること
- [ ] ブラウザで URL を開いた際に Cloudflare のログイン画面が表示されること
- [ ] 認証後にサイトがルートパスで表示され、ナビゲーションや画像が壊れていないこと
- [ ] GA4 / GTM の計測タグが有効化されていること（必要に応じて GTM の公開と確認）
- [ ] 反映後に `Rebuild / Redeploy` が必要な環境変数変更がないかを再確認していること

> 重要: Cloudflare Pages は「プロジェクトの設定」と「GitHub Actions の設定」が別物であり、両方が揃って初めてデプロイが成立する。コードの修正だけではなく、管理画面側の設定確認を必ず行う。
