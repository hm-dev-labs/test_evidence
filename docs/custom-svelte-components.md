# カスタム Svelte コンポーネントを作る

## 概要

Evidence は SvelteKit ベースで動いており、`components/` ディレクトリにカスタムの Svelte コンポーネントを置くと Evidence の Markdown ページから直接使える。  
本タスクでは KPI カード・トレンドバッジ・ステータスバーの 3 つのコンポーネントを実装する。

**学べること:**
- Svelte の基本構文（リアクティブ宣言、`$:`, `{#if}`, `{#each}`）
- props の型定義と default 値の扱い
- CSS の scoped styling（`<style>` タグ）
- Evidence のコンポーネントプラグイン仕組み

---

## このタスクで何が変わるか

### 現状の問題

現在のダッシュボードは「棒グラフ + データテーブル」だけで構成されており、**閲覧者がデータを読み解く負荷が高い**状態にある。

```
現状の画面構成:

┌──────────────────────────────────────────┐
│  [ドロップダウン] カテゴリ ▼  年 ▼         │
│                                           │
│  ████████████████████  ← 棒グラフ         │
│  何が良くて何が悪いか、                    │
│  グラフを読まないとわからない              │
│                                           │
│  id | date | item | sales | channel ...  │
│  1  | 2021 | ...  | 12.35 | ...          │
│  2  | 2020 | ...  | 129.6 | ...          │
│  ← 生データをそのまま表示しているだけ       │
└──────────────────────────────────────────┘
```

この状態では閲覧者が以下を知るために自分で計算・判断しなければならない:

- 今の売上は「良い」のか「悪い」のか（絶対値だけでは判断できない）
- 前の期間と比べて改善しているのか悪化しているのか
- 目標に対して今どのくらいの位置にいるのか

### 変更後の画面とユーザーへの価値

カスタムコンポーネントを追加すると、画面の先頭に以下が加わる。

```
変更後の画面構成:

┌──────────────────────────────────────────┐
│  ┌─────────────┐ ┌─────────────┐         │
│  │ 年間売上     │ │ 注文件数     │         │
│  │ $48,320     │ │ 1,204 件    │         │
│  │ ▲12.4% 前期比│ │ ▼3.1% 前期比 │         │
│  └─────────────┘ └─────────────┘         │
│   ↑ 一目で「増えた/減った」がわかる        │
│                                           │
│  Sinister Toys  $12,400 / $15,000  82.7% │
│  ████████████████████░░░░░               │
│  Odd Equipment  $9,800 / $10,000   98.0% │
│  █████████████████████████░              │
│   ↑ 目標達成率が視覚的に把握できる         │
│                                           │
│  [棒グラフ・テーブルは引き続き表示]         │
└──────────────────────────────────────────┘
```

### コンポーネントごとのユーザーメリット

| コンポーネント | 解決する問題 | ユーザーが得られる情報 |
|--------------|------------|-------------------|
| **KpiCard** | 重要な数値が表の中に埋もれていて見つけにくい | ページを開いた瞬間に重要指標と前期比が目に入る |
| **TrendBadge** | グラフを比較しないと増減方向がわからない | 色（緑/赤）と矢印（▲/▼）で即座に良否を判断できる |
| **StatusBar** | 目標値との差をグラフから読み取るのが手間 | 目標に対して何%達成しているかが視覚的に伝わる |

### 情報設計の観点からの整理

ダッシュボードの閲覧者が求める情報には「認知の速さ」という軸がある。

```
速く把握したい（経営判断・日常確認）
  └─ KpiCard: 数値 + 前期比（5秒で状況を把握）
  └─ TrendBadge: 色と矢印（0.5秒で良否を判断）
  └─ StatusBar: バー長さ（目標達成感を直感で認識）

詳しく分析したい（原因調査・深掘り）
  └─ 棒グラフ: 時系列・カテゴリ別の推移
  └─ データテーブル: 明細レベルの確認
```

カスタムコンポーネントは「速く把握したい」層の需要を満たすレイヤーを追加する作業になる。

---

## ゴールイメージ（ファイル構成）

```
components/
├── KpiCard.svelte        # 数値 + ラベル + 前期比を表示するカード
├── TrendBadge.svelte     # ▲10% / ▼5% のようなバッジ
└── StatusBar.svelte      # 目標達成率をプログレスバーで表示
```

Evidence の Markdown から以下のように使えるようにする。

```markdown
<KpiCard
    title="月次売上"
    value={total_sales[0].sales}
    previous={prev_sales[0].sales}
    unit="円"
/>
```

---

## タスク一覧

- [ ] Task 1: Svelte の基本構文を理解する（ミニ演習）
- [ ] Task 2: `KpiCard.svelte` を実装する
- [ ] Task 3: `TrendBadge.svelte` を実装する
- [ ] Task 4: `StatusBar.svelte` を実装する
- [ ] Task 5: Evidence のページから呼び出して動作確認する
- [ ] Task 6: props のバリデーションを追加する

---

## 詳細手順

### Task 1: Svelte 基本構文の確認

Svelte コンポーネントは以下の 3 ブロック構成。

```svelte
<script>
  // JavaScript ロジック・props 定義
  export let name = 'World';  // export = props
  $: greeting = `Hello, ${name}!`;  // $: = リアクティブ
</script>

<!-- HTML テンプレート -->
<p>{greeting}</p>

<style>
  /* スコープ付き CSS（このコンポーネント内にのみ適用） */
  p { color: blue; }
</style>
```

`components/` ディレクトリを作成する。

```bash
mkdir components
```

### Task 2: KpiCard.svelte を実装する

**`components/KpiCard.svelte`**

```svelte
<script>
  export let title = '';
  export let value = 0;
  export let previous = null;  // 前期値（省略可）
  export let unit = '';
  export let decimals = 0;

  $: formatted = Number(value).toLocaleString('ja-JP', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  $: changeRate = previous != null && previous !== 0
    ? ((value - previous) / previous) * 100
    : null;

  $: isPositive = changeRate !== null && changeRate >= 0;
</script>

<div class="kpi-card">
  <p class="label">{title}</p>
  <p class="value">{formatted}<span class="unit">{unit}</span></p>
  {#if changeRate !== null}
    <p class="change" class:positive={isPositive} class:negative={!isPositive}>
      {isPositive ? '▲' : '▼'}{Math.abs(changeRate).toFixed(1)}%
      <span class="vs">前期比</span>
    </p>
  {/if}
</div>

<style>
  .kpi-card {
    background: var(--base-color, #fff);
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px 20px;
    min-width: 180px;
    display: inline-block;
  }
  .label {
    font-size: 0.75rem;
    color: #6b7280;
    margin: 0 0 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .value {
    font-size: 1.75rem;
    font-weight: 700;
    margin: 0 0 4px;
    color: #111827;
  }
  .unit {
    font-size: 0.9rem;
    font-weight: 400;
    margin-left: 2px;
    color: #6b7280;
  }
  .change {
    font-size: 0.8rem;
    margin: 0;
    font-weight: 600;
  }
  .positive { color: #16a34a; }
  .negative { color: #dc2626; }
  .vs {
    font-weight: 400;
    color: #9ca3af;
    margin-left: 4px;
  }
</style>
```

### Task 3: TrendBadge.svelte を実装する

**`components/TrendBadge.svelte`**

```svelte
<script>
  export let value = 0;       // 変化率（%）
  export let invert = false;  // マイナスが良い場合（コストなど）は true

  $: isGood = invert ? value <= 0 : value >= 0;
  $: arrow = value >= 0 ? '▲' : '▼';
  $: display = `${arrow}${Math.abs(value).toFixed(1)}%`;
</script>

<span class="badge" class:good={isGood} class:bad={!isGood}>
  {display}
</span>

<style>
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .good {
    background: #dcfce7;
    color: #16a34a;
  }
  .bad {
    background: #fee2e2;
    color: #dc2626;
  }
</style>
```

### Task 4: StatusBar.svelte を実装する

**`components/StatusBar.svelte`**

```svelte
<script>
  export let label = '';
  export let actual = 0;
  export let target = 100;
  export let unit = '';

  $: rate = Math.min((actual / target) * 100, 100);
  $: achieved = rate >= 100;

  function fmt(n) {
    return Number(n).toLocaleString('ja-JP');
  }
</script>

<div class="status-bar">
  <div class="header">
    <span class="label">{label}</span>
    <span class="values">
      {fmt(actual)}{unit} / {fmt(target)}{unit}
      <span class="rate" class:achieved>{rate.toFixed(1)}%</span>
    </span>
  </div>
  <div class="track">
    <div class="fill" class:achieved style="width: {rate}%"></div>
  </div>
</div>

<style>
  .status-bar { margin-bottom: 12px; }
  .header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
    font-size: 0.85rem;
  }
  .label { color: #374151; }
  .values { color: #6b7280; }
  .rate {
    margin-left: 8px;
    font-weight: 700;
    color: #2563eb;
  }
  .rate.achieved { color: #16a34a; }
  .track {
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: #2563eb;
    border-radius: 4px;
    transition: width 0.4s ease;
  }
  .fill.achieved { background: #16a34a; }
</style>
```

### Task 5: Evidence のページから呼び出す

**`pages/index.md`** に以下を追加する。

````markdown
```sql kpi_current
SELECT SUM(sales) AS sales FROM test_data.test_data
WHERE date_part('year', order_datetime) = 2021
```

```sql kpi_previous
SELECT SUM(sales) AS sales FROM test_data.test_data
WHERE date_part('year', order_datetime) = 2020
```

<div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px;">
  <KpiCard
    title="2021年 年間売上"
    value={kpi_current[0].sales}
    previous={kpi_previous[0].sales}
    unit="USD"
    decimals={0}
  />
  <KpiCard
    title="2020年 年間売上"
    value={kpi_previous[0].sales}
    unit="USD"
    decimals={0}
  />
</div>

```sql category_targets
SELECT
    category,
    SUM(sales) AS actual,
    5000 AS target
FROM test_data.test_data
WHERE date_part('year', order_datetime) = 2021
GROUP BY category
ORDER BY actual DESC
```

{#each category_targets as row}
  <StatusBar
    label={row.category}
    actual={row.actual}
    target={row.target}
    unit=" USD"
  />
{/each}
````

`npm run dev` で確認する。

### Task 6: props のバリデーション（発展）

Svelte 単体では TypeScript の型チェックに近いことを `onMount` や store で行えるが、シンプルには `$:` でガード節を書く。

```svelte
<script>
  export let value = 0;

  $: {
    if (typeof value !== 'number') {
      console.warn('[KpiCard] value は数値を渡してください:', value);
    }
  }
</script>
```

---

## 発展課題

- ダークモード対応: `var(--color-*)` CSS 変数を使って Evidence のテーマ色に追随させる
- アニメーション: Svelte の `transition:` ディレクティブを使って数値がカウントアップするアニメーションを追加する
- コンポーネントのユニットテスト: Vitest + `@testing-library/svelte` でコンポーネント単体テストを書く

---

## ハマりやすいポイント

| 問題 | 原因 | 対処 |
|------|------|------|
| コンポーネントが表示されない | ファイル名が大文字始まりではない | Svelte コンポーネントは PascalCase（`KpiCard.svelte`）で命名する |
| props に配列が渡るのに数値として扱っている | Evidence のクエリ結果は配列 | `data[0].column_name` のように先頭要素を取り出す |
| CSS が全体に適用されてしまう | `<style>` タグの外に書いている | `<style>` タグ内に書けば自動でスコープされる |

---

## 参考リンク

- [Svelte 公式チュートリアル](https://svelte.dev/tutorial)
- [Evidence カスタムコンポーネント](https://docs.evidence.dev/plugins/components/)
