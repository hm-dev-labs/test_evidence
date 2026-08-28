# CSV を DuckDB ファイルに置き換えて複数テーブルを扱う

## 概要

現状は単一の CSV ファイルをデータソースとしているが、これを DuckDB ファイル（`.duckdb`）に置き換え、複数テーブルを用いた JOIN クエリや集計を行えるようにする。

**学べること:**
- DuckDB の基礎操作（テーブル作成・インポート・クエリ）
- データの正規化（1つの CSV を複数テーブルに分割する設計）
- Evidence の `sources/` 構成と接続設定の仕組み
- SQL の JOIN・ウィンドウ関数・集計関数の実践

---

## ゴールイメージ

現状の `test_data.csv`（注文データが全カラム 1 テーブルに入っている）を以下の正規化されたテーブル構成に分割する。

```
orders          注文ヘッダー（id, order_datetime, customer_id, channel_id, sales）
customers       顧客マスタ（id, first_name, last_name, email, state, zipcode）
products        商品マスタ（id, item, category）
channels        チャネルマスタ（id, channel, channel_group）
order_items     注文明細（order_id, product_id, sales）
```

---

## タスク一覧

- [ ] Task 1: DuckDB CLI のインストール
- [ ] Task 2: 既存 CSV の構造を分析して正規化設計
- [ ] Task 3: DuckDB ファイルを作成してテーブルを投入するスクリプトを書く
- [ ] Task 4: Evidence の接続設定を DuckDB に切り替える
- [ ] Task 5: JOIN クエリを使ったページを追加する
- [ ] Task 6: データ投入スクリプトを CI に組み込む

---

## 詳細手順

### Task 1: DuckDB CLI のインストール

```bash
brew install duckdb

# バージョン確認
duckdb --version
```

### Task 2: 既存 CSV の構造分析

現在の `sources/test_data/test_data.csv` のカラム:

| カラム名 | 正規化後のテーブル |
|---------|-----------------|
| id | orders |
| order_datetime | orders |
| first_name, last_name, email, address, state, zipcode | customers |
| item, category | products |
| channel, channel_group | channels |
| sales | order_items |

DuckDB CLI で CSV を直接クエリして構造を確認する。

```sql
-- DuckDB CLI を起動（ファイルなし = in-memory）
duckdb

-- CSV を直接読み込んで確認
SELECT * FROM read_csv_auto('sources/test_data/test_data.csv') LIMIT 5;

-- カテゴリの種類を確認
SELECT DISTINCT category FROM read_csv_auto('sources/test_data/test_data.csv');

-- チャネルの種類を確認
SELECT DISTINCT channel, channel_group FROM read_csv_auto('sources/test_data/test_data.csv');
```

### Task 3: DuckDB ファイル作成スクリプト

**`scripts/build_duckdb.sql`** を作成する。

```sql
-- 既存テーブルをクリア（冪等に実行できるようにする）
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS channels;

-- チャネルマスタ
CREATE TABLE channels AS
SELECT
    ROW_NUMBER() OVER (ORDER BY channel) AS id,
    channel,
    channel_group
FROM (
    SELECT DISTINCT channel, channel_group
    FROM read_csv_auto('sources/test_data/test_data.csv')
);

-- 商品マスタ
CREATE TABLE products AS
SELECT
    ROW_NUMBER() OVER (ORDER BY item) AS id,
    item,
    category
FROM (
    SELECT DISTINCT item, category
    FROM read_csv_auto('sources/test_data/test_data.csv')
);

-- 顧客マスタ
CREATE TABLE customers AS
SELECT
    ROW_NUMBER() OVER (ORDER BY email) AS id,
    first_name,
    last_name,
    email,
    address,
    state,
    zipcode
FROM (
    SELECT DISTINCT first_name, last_name, email, address, state, zipcode
    FROM read_csv_auto('sources/test_data/test_data.csv')
);

-- 注文ヘッダー
CREATE TABLE orders AS
SELECT
    src.id,
    src.order_datetime::TIMESTAMP AS order_datetime,
    c.id AS customer_id,
    ch.id AS channel_id
FROM read_csv_auto('sources/test_data/test_data.csv') AS src
JOIN customers c ON src.email = c.email
JOIN channels ch ON src.channel = ch.channel;

-- 注文明細
CREATE TABLE order_items AS
SELECT
    src.id AS order_id,
    p.id AS product_id,
    src.sales
FROM read_csv_auto('sources/test_data/test_data.csv') AS src
JOIN products p ON src.item = p.item;

-- 確認
SELECT COUNT(*) AS orders_count FROM orders;
SELECT COUNT(*) AS customers_count FROM customers;
SELECT COUNT(*) AS products_count FROM products;
SELECT COUNT(*) AS channels_count FROM channels;
```

スクリプトを実行して `sources/main.duckdb` を生成する。

```bash
duckdb sources/main.duckdb < scripts/build_duckdb.sql
```

### Task 4: Evidence の接続設定を変更

**`sources/main/connection.yaml`** を作成する（ディレクトリ名がソース名になる）。

```bash
mkdir sources/main
```

**`sources/main/connection.yaml`**

```yaml
type: duckdb
name: main
options:
  filename: ../main.duckdb
```

旧 CSV ソースは削除してよい（または `sources/test_data/` を残して両方使う構成でも可）。

Evidence を起動して接続を確認する。

```bash
npm run dev
```

ブラウザで `localhost:3000/settings` を開き、`main` データソースが表示されていれば成功。

### Task 5: JOIN クエリを使ったページを追加

**`pages/channels.md`** を作成する。

````markdown
---
title: チャネル別売上分析
---

```sql channel_sales
SELECT
    ch.channel_group,
    ch.channel,
    DATE_TRUNC('month', o.order_datetime) AS month,
    SUM(oi.sales) AS sales,
    COUNT(DISTINCT o.id) AS order_count
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
JOIN channels ch ON o.channel_id = ch.id
GROUP BY ALL
ORDER BY month, sales DESC
```

<BarChart
    data={channel_sales}
    x=month
    y=sales
    series=channel_group
    title="チャネルグループ別月次売上"
/>

<DataTable data={channel_sales}/>
````

**`pages/customers.md`** を作成する。

````markdown
---
title: 顧客・州別分析
---

```sql state_summary
SELECT
    c.state,
    COUNT(DISTINCT c.id) AS customer_count,
    SUM(oi.sales) AS total_sales,
    AVG(oi.sales) AS avg_order_value
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN order_items oi ON o.id = oi.order_id
GROUP BY c.state
ORDER BY total_sales DESC
```

<DataTable data={state_summary} rows=15/>
````

### Task 6: CI でデータ投入スクリプトを実行

#### 6-1. `.gitignore` に生成ファイルを追加する

CI で生成する `.duckdb` ファイルをリポジトリに含めないよう `.gitignore` に追記する。

```
# DuckDB（CI で生成するためリポジトリ管理不要）
sources/main.duckdb
```

#### 6-2. SQL スクリプトのパスを絶対パスに修正する

`scripts/build_duckdb.sql` の CSV 参照パスを、スクリプト実行時のカレントディレクトリに依存しない形に変更する。  
DuckDB CLI は実行時に `--variable` でパスを渡せないため、CI ステップで環境変数を展開したスクリプトを動的生成するか、プロジェクトルートから実行することを明示する。

`scripts/build_duckdb.sql` の `read_csv_auto(...)` のパスを以下のように修正する。

```sql
-- ※ プロジェクトルートから実行する前提（CI では working-directory で保証する）
FROM read_csv_auto('sources/test_data/test_data.csv')
```

#### 6-3. ワークフローを完全な形で書く

**`.github/workflows/deploy.yml`** を以下に全面書き換えする。  
ポイントは以下の 3 点:

- `on.schedule` で毎日定時にデータ更新 + デプロイを自動実行する
- `workflow_dispatch` で手動実行もできるようにする
- `working-directory` を明示してパス解決の曖昧さをなくす

```yaml
name: Deploy Evidence to Cloudflare Pages

on:
  push:
    branches:
      - main
  # 毎日 JST 9:00（= UTC 0:00）に自動実行してデータを更新する
  schedule:
    - cron: '0 0 * * *'
  # GitHub Actions の画面から手動でも実行できるようにする
  workflow_dispatch:

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

      # バージョンを固定して再現性を確保する（最新版は https://github.com/duckdb/duckdb/releases で確認）
      - name: Install DuckDB CLI
        run: |
          DUCKDB_VERSION="v1.1.3"
          curl -L "https://github.com/duckdb/duckdb/releases/download/${DUCKDB_VERSION}/duckdb_cli-linux-amd64.zip" -o duckdb.zip
          unzip duckdb.zip
          # sudo 不要：PATH が通るローカルディレクトリに配置する
          mkdir -p "$HOME/.local/bin"
          mv duckdb "$HOME/.local/bin/"
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"

      # プロジェクトルートを明示して実行（SQL 内の相対パスが正しく解決される）
      - name: Build DuckDB from CSV
        run: duckdb sources/main.duckdb < scripts/build_duckdb.sql
        working-directory: ${{ github.workspace }}

      # Evidence が DuckDB ファイルを読んで .parquet キャッシュを生成する
      - name: Generate Evidence sources
        run: npm run sources

      - name: Build Evidence
        run: npm run build

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy build --project-name=<YOUR_PROJECT_NAME>
```

#### 6-4. ステップの実行順序と意味

```
Checkout
  └─ コードを取得（CSV ファイルも含む）

Install DuckDB CLI
  └─ バージョン固定でインストール・PATH に追加

Build DuckDB from CSV          ← ★ここでデータを再構築
  └─ CSV → DuckDB ファイル（正規化済みテーブル）を生成

Generate Evidence sources      ← ★ここで DuckDB を読んで parquet を生成
  └─ Evidence が DuckDB ファイルをクエリして内部キャッシュを作成

Build Evidence
  └─ parquet キャッシュをもとに静的 HTML を生成

Deploy to Cloudflare Pages
  └─ 生成した build/ を公開
```

> **重要:** `Build DuckDB` → `Generate sources` の順番を守ること。逆にすると Evidence が古い（または存在しない）DuckDB ファイルを読んでエラーになる。

---

## 発展課題

- 複数 CSV を追加して JOIN する（例: 商品の仕入れ原価テーブルを追加して粗利を計算する）
- ウィンドウ関数を使って「顧客の初回購入から N 日後のリピート率」を集計する
- DuckDB の `PIVOT` 構文を使ってクロス集計を作る

---

## ハマりやすいポイント

| 問題 | 原因 | 対処 |
|------|------|------|
| Evidence がソースを認識しない | `connection.yaml` のパスが間違い | `filename` は `connection.yaml` からの相対パスで指定 |
| JOIN 結果が想定と違う | 重複キーによるデータ増加 | JOIN 前に `SELECT COUNT(DISTINCT ...)` でキーの一意性を確認 |
| CI で duckdb コマンドが見つからない | `GITHUB_PATH` への追記後にステップをまたいでいる | `echo "..." >> "$GITHUB_PATH"` の後は次のステップ以降で反映される（同一 run ブロック内では未反映） |
| CSV のパスが解決できずエラー | `duckdb` をプロジェクトルート以外から実行している | `working-directory: ${{ github.workspace }}` を明示する |
| スケジュール実行が動かない | cron の UTC/JST 変換ミス、またはデフォルトブランチ以外で設定している | `schedule` トリガーはデフォルトブランチ（`main`）のワークフローにのみ適用される |
| `sources/main.duckdb` が git に追加されてしまう | `.gitignore` への追記漏れ | `git rm --cached sources/main.duckdb` で追跡を外し `.gitignore` に追記 |

---

## 参考リンク

- [DuckDB 公式ドキュメント](https://duckdb.org/docs/)
- [Evidence DuckDB コネクタ](https://docs.evidence.dev/core-concepts/data-sources/)
