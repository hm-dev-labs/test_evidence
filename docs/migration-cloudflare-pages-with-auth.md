# GitHub Pages → Cloudflare Pages 移行 & ログイン認証導入

## 概要

現状、Evidence で生成したレポートサイトは GitHub Pages で公開されており、URL を知っていれば誰でもアクセスできる状態にある。  
本ドキュメントでは以下 2 点の改修内容と手順をまとめる。

1. **ホスティングを GitHub Pages から Cloudflare Pages へ移行する**
2. **ID / パスワードによるログイン認証を導入してアクセスを制限する**

---

## 全体方針

| 項目 | 現状 | 変更後 |
|------|------|--------|
| ホスティング | GitHub Pages | Cloudflare Pages |
| 認証 | なし（公開） | Cloudflare Access（Zero Trust）|
| デプロイトリガー | GitHub Actions（`actions/deploy-pages`） | GitHub Actions → Cloudflare Pages 直接デプロイ |
| ビルド成果物 | `build/` ディレクトリを GitHub Pages にアップロード | `build/` ディレクトリを Cloudflare Pages にアップロード |

### 認証方式の選択理由

Evidence は **静的サイト（Static Site）** を生成するため、アプリ内にサーバーサイドのセッション管理を持たせることができない。  
そのため、CDN レイヤーで認証を行う **Cloudflare Access（Zero Trust）** を採用する。

- ログイン画面は Cloudflare が提供するため、アプリ側に認証コードを追加する必要がない
- ワンタイムパスコード（メール）、ID/パスワード（Cloudflare One-time PIN または GitHub/Google IdP）、固定 ID/PW（Service Token）など複数の認証方式に対応
- 無料プランで利用可能（月 50 ユーザーまで）

---

## 作業全体フロー

```
1. Cloudflare アカウント準備
   └─ Pages プロジェクト作成
   └─ カスタムドメイン設定（任意）

2. GitHub リポジトリ設定
   └─ Cloudflare API Token を GitHub Secrets に登録

3. GitHub Actions ワークフロー変更
   └─ deploy.yml を Cloudflare Pages デプロイ用に書き換え

4. Cloudflare Access 設定
   └─ Zero Trust ダッシュボードでアプリケーションを作成
   └─ ポリシー（許可ユーザー）を設定

5. 動作確認
```

---

## 詳細手順

### Step 1: Cloudflare アカウント・Pages プロジェクト準備

1. [Cloudflare ダッシュボード](https://dash.cloudflare.com/) にログイン（アカウントがなければ作成）
2. 左メニューの **Workers & Pages** → **Pages** を開く
3. **プロジェクトを作成** → **直接アップロード** を選択し、プロジェクト名を入力（例: `test-evidence`）
4. 初回は仮のファイルをアップロードして作成を完了させる（後で GitHub Actions から上書きする）
5. 作成後、プロジェクトの **設定 → ビルドとデプロイ** で以下を確認:
   - デプロイ先 URL（例: `https://test-evidence.pages.dev`）

### Step 2: Cloudflare API Token の取得

1. Cloudflare ダッシュボード右上のプロフィール → **マイプロフィール** → **API トークン**
2. **トークンを作成** → **カスタムトークン** を選択
3. 以下の権限を付与:
   - `Account / Cloudflare Pages / Edit`
4. **アカウントリソース**: 対象のアカウントを選択
5. トークンを生成し、値をコピーして保管（一度しか表示されない）

### Step 3: GitHub Secrets への登録

GitHub リポジトリの **Settings → Secrets and variables → Actions** で以下を登録:

| Secret 名 | 値 |
|-----------|---|
| `CLOUDFLARE_API_TOKEN` | Step 2 で取得した API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare ダッシュボードの URL に含まれるアカウント ID |

**アカウント ID の確認方法:**  
Cloudflare ダッシュボードの URL が `https://dash.cloudflare.com/<account_id>/...` の形式になっているので、その部分をコピーする。

### Step 4: GitHub Actions ワークフローの変更

`.github/workflows/deploy.yml` を以下のように書き換える。

```yaml
name: Deploy Evidence to Cloudflare Pages

on:
  push:
    branches:
      - main

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup mise
        uses: jdx/mise-action@v2

      - name: Install dependencies
        run: npm install

      - name: Generate sources
        run: npm run sources

      - name: Build Evidence
        run: npm run build
        env:
          # Cloudflare Pages ではサブパスなしでルートにデプロイするため BASE_PATH は不要
          # もし接続情報などをシークレットで登録している場合はここに記述
          # EVIDENCE_SOURCE__...: ${{ secrets.YOUR_SECRET }}

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy build --project-name=<YOUR_PROJECT_NAME>
```

> **注意:** `<YOUR_PROJECT_NAME>` は Step 1 で作成した Cloudflare Pages プロジェクト名に置き換えること。

#### GitHub Pages との主な差分

| 変更点 | 旧（GitHub Pages） | 新（Cloudflare Pages） |
|--------|-------------------|----------------------|
| デプロイ Action | `actions/deploy-pages@v4` | `cloudflare/wrangler-action@v3` |
| 必要な permissions | `pages: write`, `id-token: write` | 不要（API Token で認証） |
| `BASE_PATH` 環境変数 | `/${{ github.event.repository.name }}` | 不要（ルートパスでデプロイ） |
| アーティファクトアップロード | `actions/upload-pages-artifact@v3` | 不要（wrangler が直接デプロイ） |

### Step 5: GitHub Pages の無効化

1. GitHub リポジトリの **Settings → Pages**
2. **Source** を `None` に変更して保存
3. GitHub Pages 用の `environment` 設定も不要になるため、リポジトリの **Settings → Environments** から `github-pages` を削除してよい

### Step 6: Cloudflare Access（ログイン認証）の設定

#### 6-1. Zero Trust ダッシュボードを開く

Cloudflare ダッシュボード → 左メニューの **Zero Trust** を開く。  
（初回はチーム名の設定が必要）

#### 6-2. アプリケーションの作成

1. **Access → Applications → アプリケーションを追加**
2. **Self-hosted** を選択
3. 以下を設定:
   - **アプリケーション名**: 任意（例: `test-evidence`）
   - **Application domain**: Cloudflare Pages のドメイン（例: `test-evidence.pages.dev`）
   - **Path**: `*`（全パスを保護する場合）

#### 6-3. ポリシーの設定

アクセスを許可するユーザーを指定する。方式は複数ある:

**方式 A: メールアドレス + ワンタイムパスコード（最もシンプル）**
- **ポリシー名**: 任意
- **Action**: Allow
- **Include ルール**: `Emails` → 許可するメールアドレスをリスト登録
- ユーザーはアクセス時にメールアドレスを入力し、届いたコードでログイン

**方式 B: ID / パスワード（固定認証情報）**
- **Access → Service Auth → Service Tokens** でトークンを作成
- ポリシーの **Include ルール** に `Service Token` を追加
- ただし Service Token は API 向けのため、ブラウザ UI での固定 ID/PW 認証には向かない

**方式 C: 固定 ID/PW（最もシンプルな共有アカウント）**
- **Access → Access Groups** でグループを作成
- **Settings → Authentication → Login methods** で **One-time PIN** を有効化
- 特定メールドメインを許可する場合は `Email domain` ルールを使用

> **推奨**: チームメンバーのメールアドレスを登録する **方式 A** が最もセキュアで管理しやすい。

#### 6-4. ログイン画面の確認

設定完了後、Cloudflare Pages の URL にアクセスすると Cloudflare が提供するログイン画面が表示される。  
認証を通過したユーザーのみがレポートページを閲覧できるようになる。

---

## 変更対象ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `.github/workflows/deploy.yml` | GitHub Pages デプロイから Cloudflare Pages デプロイに全面書き換え |
| （新規不要） | Cloudflare 側の設定は全てダッシュボードで行うため、アプリコードの変更なし |

---

## ロールバック手順

問題が発生した場合は以下の順で元に戻せる:

1. `.github/workflows/deploy.yml` を旧バージョンに戻す（git revert）
2. GitHub リポジトリの **Settings → Pages** で Source を `GitHub Actions` に戻す
3. Actions を再実行して GitHub Pages に再デプロイ

---

## 注意事項

- Evidence のビルド成果物は `build/` ディレクトリに出力される。Cloudflare Pages へのデプロイコマンドでもこのパスを指定すること。
- `BASE_PATH` 環境変数を設定していた場合、Cloudflare Pages ではルートパスで配信されるため **削除が必要**。削除しないとナビゲーションリンクが壊れる。
- Cloudflare Access の無料プランは月間 50 ユーザーまで。超える場合は有料プランが必要。
- Cloudflare Pages のプレビューデプロイ（PR ごとのプレビュー URL）も Access で保護したい場合は、Application domain に `*.test-evidence.pages.dev` を追加する。
