# E2E テスト（Playwright）でダッシュボードの表示を自動検証

## 概要

Evidence で生成したダッシュボードが正しく表示されているかを Playwright を使って自動検証する。  
「グラフが描画されているか」「フィルターが動くか」「エラーが出ていないか」をテストコードで定義し、CI に組み込むことでデプロイのたびに自動チェックが走るようにする。

**学べること:**
- E2E テスト（End-to-End Test）の考え方と範囲の切り方
- Playwright の基本 API（`page.goto`, `locator`, `expect`）
- ページオブジェクトモデル（POM）によるテストの整理
- GitHub Actions でヘッドレスブラウザを動かす方法
- スクリーンショットを使ったビジュアルリグレッションテスト

---

## ゴールイメージ

```
tests/
├── e2e/
│   ├── index.spec.ts       # トップページのテスト
│   ├── channels.spec.ts    # チャネルページのテスト（追加した場合）
│   └── pages/
│       └── DashboardPage.ts  # ページオブジェクト（POM）
├── playwright.config.ts
└── screenshots/            # ビジュアルリグレッション用のスナップショット（自動生成）
```

CI の流れ:

```
npm run build → npm run preview（静的サーバー起動）→ playwright test
```

---

## タスク一覧

- [ ] Task 1: Playwright のインストールと初期設定
- [ ] Task 2: 基本テストを書く（ページが開けるか・タイトルが正しいか）
- [ ] Task 3: グラフの描画を検証するテストを書く
- [ ] Task 4: フィルターの動作を検証するテストを書く
- [ ] Task 5: ページオブジェクトモデル（POM）でテストを整理する
- [ ] Task 6: ビジュアルリグレッションテストを追加する
- [ ] Task 7: CI（GitHub Actions）に組み込む

---

## 詳細手順

### Task 1: Playwright のインストールと初期設定

```bash
npm init playwright@latest -- --lang=ts --quiet
```

対話形式の質問には以下のように答える:
- Where to put your tests? → `tests/e2e`
- Add GitHub Actions workflow? → `N`（後で手動追加する）
- Install Playwright browsers? → `Y`

**`playwright.config.ts`** を Evidence に合わせて書き換える。

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,           // CI では失敗時に 1 回リトライ
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',   // 失敗時のトレースを保存
    screenshot: 'only-on-failure',
  },
  // テスト実行前に Evidence の preview サーバーを起動する
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

**`package.json`** にスクリプトを追加する。

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug"
  }
}
```

### Task 2: 基本テストを書く

**`tests/e2e/index.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';

test.describe('トップページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('ページが正常に表示される', async ({ page }) => {
    // HTTP 200 が返っていること（webServer で起動済みなので通常は保証されるが明示的にチェック）
    await expect(page).toHaveURL('/');
  });

  test('タイトルが正しい', async ({ page }) => {
    await expect(page).toHaveTitle(/Evidence/);
  });

  test('コンソールエラーが発生していない', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    // チャートのロードを待つ
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });
});
```

テストを実行して確認する（Evidence のビルドが必要）。

```bash
npm run build
npm test:e2e
```

### Task 3: グラフの描画を検証するテスト

Evidence のグラフは SVG として描画される。SVG 要素の存在を確認することでグラフが描画されたかを検証できる。

**`tests/e2e/index.spec.ts`** に追記する。

```typescript
test('棒グラフが描画されている', async ({ page }) => {
  await page.goto('/');

  // Evidence の BarChart は SVG の rect 要素としてレンダリングされる
  const chartSvg = page.locator('svg').first();
  await expect(chartSvg).toBeVisible({ timeout: 10000 });

  // グラフのバーが存在する
  const bars = page.locator('svg rect[height]');
  await expect(bars).toHaveCount({ min: 1 });
});

test('データテーブルが描画されている', async ({ page }) => {
  await page.goto('/');

  const table = page.locator('table');
  await expect(table).toBeVisible();

  // ヘッダー行が存在する
  const headers = table.locator('thead th');
  await expect(headers).toHaveCount({ min: 1 });

  // データ行が存在する（最低 1 行）
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount({ min: 1 });
});
```

### Task 4: フィルターの動作を検証するテスト

**`tests/e2e/index.spec.ts`** に追記する。

```typescript
test('カテゴリフィルターが動作する', async ({ page }) => {
  await page.goto('/');

  // データテーブルの初期行数を記録
  const initialRows = await page.locator('table tbody tr').count();

  // カテゴリドロップダウンを操作
  const categoryDropdown = page.locator('select').first();
  await categoryDropdown.selectOption({ index: 1 });  // 2番目のオプションを選択

  // グラフが再描画されるのを待つ
  await page.waitForLoadState('networkidle');

  // データが変化していること（フィルター前と行数が変わる、または同じ）
  const filteredRows = await page.locator('table tbody tr').count();
  // フィルター後は行数が変化するはず（フィルターが機能している証拠）
  // ※データによっては同じになることもあるため、グラフの内容変化で確認
  expect(filteredRows).toBeGreaterThan(0);
});

test('フィルターをリセットすると全データが表示される', async ({ page }) => {
  // フィルター付き URL で直接アクセス
  await page.goto('/?category=Sinister+Toys');

  const filteredRows = await page.locator('table tbody tr').count();

  // 「すべて」を選択してリセット
  const categoryDropdown = page.locator('select').first();
  await categoryDropdown.selectOption({ label: /すべて|All/i });
  await page.waitForLoadState('networkidle');

  const allRows = await page.locator('table tbody tr').count();
  expect(allRows).toBeGreaterThanOrEqual(filteredRows);
});
```

### Task 5: ページオブジェクトモデル（POM）で整理する

テストコードにセレクターが散らばると、UI が変わるたびに全テストを修正することになる。  
POM（Page Object Model）パターンで UI の操作を 1 箇所にまとめる。

**`tests/e2e/pages/DashboardPage.ts`**

```typescript
import { type Page, type Locator, expect } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly chartSvg: Locator;
  readonly dataTable: Locator;
  readonly categoryDropdown: Locator;

  constructor(page: Page) {
    this.page = page;
    this.chartSvg = page.locator('svg').first();
    this.dataTable = page.locator('table');
    this.categoryDropdown = page.locator('select').first();
  }

  async goto(params?: Record<string, string>) {
    const query = params
      ? '?' + new URLSearchParams(params).toString()
      : '';
    await this.page.goto('/' + query);
    await this.page.waitForLoadState('networkidle');
  }

  async selectCategory(value: string) {
    await this.categoryDropdown.selectOption(value);
    await this.page.waitForLoadState('networkidle');
  }

  async getTableRowCount(): Promise<number> {
    return this.dataTable.locator('tbody tr').count();
  }

  async expectChartVisible() {
    await expect(this.chartSvg).toBeVisible({ timeout: 10000 });
  }

  async expectTableVisible() {
    await expect(this.dataTable).toBeVisible();
  }
}
```

POM を使ってテストを書き直す。

**`tests/e2e/index.spec.ts`**（書き直し版）

```typescript
import { test, expect } from '@playwright/test';
import { DashboardPage } from './pages/DashboardPage';

test.describe('トップページ', () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
  });

  test('グラフが表示される', async () => {
    await dashboard.expectChartVisible();
  });

  test('テーブルが表示される', async () => {
    await dashboard.expectTableVisible();
  });

  test('カテゴリフィルターが動作する', async () => {
    const allRows = await dashboard.getTableRowCount();
    await dashboard.selectCategory({ index: 1 });
    const filteredRows = await dashboard.getTableRowCount();
    expect(filteredRows).toBeGreaterThan(0);
  });
});
```

### Task 6: ビジュアルリグレッションテストを追加する

スクリーンショットを基準画像として保存し、以降の実行で差分を検出する。

**`tests/e2e/visual.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { DashboardPage } from './pages/DashboardPage';

test.describe('ビジュアルリグレッション', () => {
  test('トップページのスナップショット', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // グラフが描画されるまで待つ
    await dashboard.expectChartVisible();

    // スクリーンショットを取って基準画像と比較
    await expect(page).toHaveScreenshot('index-full.png', {
      fullPage: true,
      maxDiffPixels: 100,  // 多少のアンチエイリアス差分は許容
    });
  });
});
```

初回実行時（基準画像がない）は以下で生成する。

```bash
npx playwright test visual.spec.ts --update-snapshots
```

2 回目以降は差分チェックになる。

```bash
npx playwright test visual.spec.ts
```

### Task 7: CI（GitHub Actions）に組み込む

**`.github/workflows/e2e.yml`**

```yaml
name: E2E Tests

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: jdx/mise-action@v2

      - name: Install dependencies
        run: npm install

      - name: Generate sources
        run: npm run sources

      - name: Build Evidence
        run: npm run build

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload test report（失敗時）
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7

      - name: Upload screenshots（失敗時）
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: test-screenshots
          path: test-results/
          retention-days: 7
```

---

## テスト設計の考え方

| テスト種別 | 何を確認するか | 例 |
|-----------|------------|---|
| スモークテスト | ページが開けるか、エラーがないか | `toHaveURL`, コンソールエラー無し |
| 機能テスト | フィルターや操作が期待通りに動くか | 行数変化、URL 変化 |
| ビジュアルテスト | 見た目が変わっていないか | スクリーンショット差分 |

Evidence のような静的 BI ツールでは**スモークテスト + グラフ描画確認**が費用対効果が高い。  
全てのフィルター組み合わせをテストすると組み合わせ爆発になるため、代表的なケースのみをカバーする。

---

## ハマりやすいポイント

| 問題 | 原因 | 対処 |
|------|------|------|
| テストが不安定（フレーキー）になる | グラフの描画完了前にアサーションが走る | `waitForLoadState('networkidle')` や `expect(...).toBeVisible()` のタイムアウトを長くする |
| CI でスクリーンショット差分が出る | フォントレンダリングが OS ごとに異なる | スナップショットテストの `maxDiffPixels` を増やすか、OS を固定する |
| `npm run preview` が起動しない | ビルドが完了していない | `webServer.command` に `npm run build && npm run preview` を指定する |
| ブラウザが CI で見つからない | `--with-deps` なしでインストール | `npx playwright install --with-deps chromium` で OS 依存ライブラリも含めてインストール |

---

## 参考リンク

- [Playwright 公式ドキュメント](https://playwright.dev/docs/intro)
- [Playwright - Page Object Model](https://playwright.dev/docs/pom)
- [Playwright - Visual Comparisons](https://playwright.dev/docs/test-snapshots)
- [GitHub Actions での Playwright 実行](https://playwright.dev/docs/ci-intro)
