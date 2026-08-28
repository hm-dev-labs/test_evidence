# URL パラメータでフィルター状態を保持・共有できるようにする

## 概要

現状のドロップダウンフィルターはページをリロードすると選択状態がリセットされ、他のメンバーに「このフィルター状態を見てほしい」と URL を共有することができない。  
URL クエリパラメータ（`?category=Toys&year=2021`）にフィルター状態を反映させ、リロードや共有後も同じ表示を再現できるようにする。

**学べること:**
- ブラウザの History API（`pushState` / `replaceState`）の仕組み
- SvelteKit の `$page.url.searchParams` を使ったクエリパラメータの読み書き
- Evidence のカスタムコンポーネントとフレームワークの橋渡し
- Svelte の store（`writable`）を使ったグローバル状態管理

---

## ゴールイメージ

1. ドロップダウンで `Sinister Toys` を選択すると URL が `?category=Sinister+Toys` に変わる
2. その URL を別のブラウザタブで開くと同じカテゴリが選択された状態で表示される
3. ブラウザの「戻る」ボタンで前のフィルター状態に戻れる

---

## タスク一覧

- [ ] Task 1: 現状の Evidence フィルターの仕組みを理解する
- [ ] Task 2: URL パラメータを読み書きする Svelte コンポーネントを実装する
- [ ] Task 3: ページ初期化時に URL から値を読み込む処理を追加する
- [ ] Task 4: フィルター変更時に URL を更新する処理を追加する
- [ ] Task 5: 複数フィルターに対応する
- [ ] Task 6: 「現在のフィルターをコピー」ボタンを追加する

---

## 詳細手順

### Task 1: 現状の Evidence フィルターの仕組みを確認

Evidence の `<Dropdown>` コンポーネントは `inputs` オブジェクトに値を格納する。  
`${inputs.category.value}` のように SQL クエリ内で参照できる仕組み。

問題点:
- `inputs` はページのメモリ内にのみ存在する → リロードで消える
- URL には何も反映されない → 共有不可

### Task 2: URL パラメータを読み書きする Svelte コンポーネント

Evidence のページは SvelteKit のルーティング上で動いているため、`$app/navigation` の `goto` と `$app/stores` の `page` ストアが使える。

**`components/UrlFilter.svelte`** を作成する。

```svelte
<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  // props
  export let name = '';           // URL パラメータのキー名（例: "category"）
  export let options = [];        // { value: string, label: string }[] の配列
  export let defaultValue = '%';  // 未選択時のデフォルト値

  let selected = defaultValue;

  // ページロード時に URL から値を読み込む
  onMount(() => {
    const params = $page.url.searchParams;
    const fromUrl = params.get(name);
    if (fromUrl !== null) {
      selected = fromUrl;
    }
  });

  // ドロップダウンが変更されたとき URL を更新する
  function handleChange(event) {
    selected = event.target.value;
    const url = new URL($page.url);
    if (selected === defaultValue) {
      url.searchParams.delete(name);
    } else {
      url.searchParams.set(name, selected);
    }
    // pushState: 戻るボタンで前のフィルターに戻れるようにする
    goto(url.toString(), { replaceState: false, keepFocus: true });
  }

  // 外部から値を参照できるように export
  export function getValue() {
    return selected;
  }
</script>

<div class="url-filter">
  <label for={name}>{name}</label>
  <select id={name} bind:value={selected} on:change={handleChange}>
    <option value={defaultValue}>すべて</option>
    {#each options as opt}
      <option value={opt.value}>{opt.label ?? opt.value}</option>
    {/each}
  </select>
</div>

<style>
  .url-filter {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-right: 16px;
  }
  label {
    font-size: 0.85rem;
    color: #6b7280;
    text-transform: capitalize;
  }
  select {
    padding: 4px 8px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.9rem;
    background: #fff;
    cursor: pointer;
  }
</style>
```

### Task 3: ページから URL パラメータを読んでクエリに渡す

**`pages/index.md`** を以下のように書き換える。

`<Dropdown>` を `<UrlFilter>` に置き換えると Evidence の `inputs` 仕組みとは切り離されるため、クエリへの値の渡し方を変える必要がある。  
シンプルな方法は Svelte の `bind:` と `{#key}` ブロックを使う方法。

````markdown
---
title: 売上ダッシュボード
---

<script>
  import { page } from '$app/stores';

  // URL パラメータから初期値を取得
  $: categoryParam = $page.url.searchParams.get('category') ?? '%';
  $: yearParam = $page.url.searchParams.get('year') ?? '%';
</script>

```sql categories
SELECT DISTINCT category FROM test_data.test_data ORDER BY category
```

```sql orders_by_category
SELECT
    date_trunc('month', order_datetime) AS month,
    SUM(sales) AS sales_usd,
    category
FROM test_data.test_data
WHERE category LIKE '${categoryParam}'
  AND CAST(date_part('year', order_datetime) AS VARCHAR) LIKE '${yearParam}'
GROUP BY ALL
ORDER BY sales_usd DESC
```

<UrlFilter
  name="category"
  options={categories.map(r => ({ value: r.category }))}
/>

<UrlFilter
  name="year"
  options={[
    { value: '2019', label: '2019年' },
    { value: '2020', label: '2020年' },
    { value: '2021', label: '2021年' },
  ]}
/>

<BarChart
  data={orders_by_category}
  x=month
  y=sales_usd
  series=category
  title="月次売上（カテゴリ別）"
/>
````

> **Note:** Evidence の Markdown ページ内での `<script>` タグと `$app/stores` の利用は Evidence のバージョンによってサポート状況が変わる。動かない場合は Task 4 の代替方法を参照。

### Task 4: `$app/stores` が使えない場合の代替方法

Evidence が `$app/stores` を直接 Markdown から使えない場合、コンポーネント内でブラウザの `window.location` と `history.pushState` を使う。

**`components/UrlFilterSimple.svelte`**

```svelte
<script>
  import { onMount } from 'svelte';

  export let name = '';
  export let options = [];
  export let defaultValue = '%';
  export let onChange = (val) => {};  // 親から受け取るコールバック

  let selected = defaultValue;

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get(name);
    if (fromUrl !== null) {
      selected = fromUrl;
      onChange(selected);  // 初期値を親に伝える
    }
  });

  function handleChange() {
    const url = new URL(window.location.href);
    if (selected === defaultValue) {
      url.searchParams.delete(name);
    } else {
      url.searchParams.set(name, selected);
    }
    window.history.pushState({}, '', url.toString());
    onChange(selected);
  }
</script>

<select bind:value={selected} on:change={handleChange}>
  <option value={defaultValue}>すべて</option>
  {#each options as opt}
    <option value={opt.value}>{opt.label ?? opt.value}</option>
  {/each}
</select>
```

### Task 5: 複数フィルターを統合管理する

フィルターが増えたとき各コンポーネントが独立して URL を更新すると競合が起きることがある。  
Svelte の `writable` store を使ってフィルター状態を一元管理する。

**`components/filterStore.js`**

```javascript
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

function createFilterStore() {
  const { subscribe, set, update } = writable({});

  return {
    subscribe,
    // URL から全フィルターを読み込む
    loadFromUrl() {
      if (!browser) return;
      const params = new URLSearchParams(window.location.search);
      const values = {};
      for (const [key, value] of params.entries()) {
        values[key] = value;
      }
      set(values);
    },
    // 特定のフィルターを更新して URL に反映する
    setFilter(key, value, defaultValue = '%') {
      update(filters => {
        const next = { ...filters };
        if (value === defaultValue) {
          delete next[key];
        } else {
          next[key] = value;
        }

        if (browser) {
          const url = new URL(window.location.href);
          Object.entries(next).forEach(([k, v]) => url.searchParams.set(k, v));
          // 削除されたキーをクリア
          for (const k of url.searchParams.keys()) {
            if (!(k in next)) url.searchParams.delete(k);
          }
          window.history.pushState({}, '', url.toString());
        }

        return next;
      });
    },
  };
}

export const filterStore = createFilterStore();
```

### Task 6: 「フィルターをコピー」ボタンを追加する

**`components/CopyFilterUrl.svelte`**

```svelte
<script>
  let copied = false;

  async function handleCopy() {
    await navigator.clipboard.writeText(window.location.href);
    copied = true;
    setTimeout(() => { copied = false; }, 2000);
  }
</script>

<button on:click={handleCopy} class="copy-btn">
  {copied ? 'コピーしました！' : '現在のフィルターURLをコピー'}
</button>

<style>
  .copy-btn {
    padding: 6px 14px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #f9fafb;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.15s;
  }
  .copy-btn:hover { background: #f3f4f6; }
</style>
```

ページから呼び出す:

```markdown
<CopyFilterUrl />
```

---

## 動作確認チェックリスト

- [ ] ドロップダウン変更 → URL のクエリパラメータが変わる
- [ ] URL をそのままコピーして別タブで開く → 同じフィルター状態が再現される
- [ ] ブラウザの「戻る」ボタン → 前のフィルター状態に戻る
- [ ] URL のクエリパラメータを手動で削除してリロード → デフォルト（全件）に戻る

---

## ハマりやすいポイント

| 問題 | 原因 | 対処 |
|------|------|------|
| `$app/stores` が import できない | Markdown ページ内での制約 | コンポーネントファイル（`.svelte`）内で import する |
| フィルター変更後にグラフが更新されない | Evidence のリアクティビティと Svelte の再描画タイミングの不一致 | `{#key categoryParam}` でクエリブロックを再マウントする |
| ブラウザバック後にフィルターが戻らない | `replaceState` を使っていた | `pushState`（`replaceState: false`）に変更する |

---

## 参考リンク

- [SvelteKit $app/navigation - goto](https://kit.svelte.dev/docs/modules#$app-navigation-goto)
- [SvelteKit $app/stores - page](https://kit.svelte.dev/docs/modules#$app-stores)
- [History API - MDN](https://developer.mozilla.org/ja/docs/Web/API/History_API)
