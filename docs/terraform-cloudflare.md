# Terraform で Cloudflare リソースをコード管理

## 概要

Cloudflare Pages プロジェクトや Access ポリシーなどのインフラ設定を、ダッシュボードのポチポチ操作ではなくコード（Terraform）で管理する。  
`terraform apply` 一発で環境を再現できる状態にすることが目標。

**学べること:**
- IaC（Infrastructure as Code）の基礎思想
- Terraform の state 管理と冪等性
- Secrets を Terraform 変数として安全に扱う方法
- CI から `terraform plan` を自動実行するパターン

---

## ゴールイメージ

```
infra/
├── main.tf           # プロバイダー設定
├── variables.tf      # 変数定義
├── terraform.tfvars  # 変数の値（.gitignore 対象）
├── pages.tf          # Cloudflare Pages プロジェクト
├── access.tf         # Cloudflare Access アプリ・ポリシー
└── outputs.tf        # デプロイ URL などの出力
```

---

## 前提条件

- Terraform CLI がインストール済み（`brew install terraform`）
- Cloudflare アカウントがあり、API Token を取得済み
- Cloudflare Pages プロジェクトが作成済み（または Terraform で新規作成する）

---

## タスク一覧

- [ ] Task 1: Terraform のインストールと初期設定
- [ ] Task 2: Cloudflare Provider の設定
- [ ] Task 3: Cloudflare Pages リソースの定義
- [ ] Task 4: Cloudflare Access リソースの定義
- [ ] Task 5: Remote State の設定（Terraform Cloud または S3）
- [ ] Task 6: CI（GitHub Actions）から `terraform plan` を自動実行

---

## 詳細手順

### Task 1: Terraform のインストールと初期設定

```bash
# インストール（macOS）
brew tap hashicorp/tap
brew install hashicorp/tap/terraform

# バージョン確認
terraform -v
```

プロジェクトルートに `infra/` ディレクトリを作成する。

```bash
mkdir infra && cd infra
```

### Task 2: Cloudflare Provider の設定

**`infra/main.tf`**

```hcl
terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
```

**`infra/variables.tf`**

```hcl
variable "cloudflare_api_token" {
  description = "Cloudflare API Token"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "project_name" {
  description = "Cloudflare Pages プロジェクト名"
  type        = string
  default     = "test-evidence"
}

variable "allowed_emails" {
  description = "Access を許可するメールアドレスのリスト"
  type        = list(string)
}
```

**`infra/terraform.tfvars`**（`.gitignore` に追加すること）

```hcl
cloudflare_api_token  = "your_api_token_here"
cloudflare_account_id = "your_account_id_here"
allowed_emails        = ["user@example.com", "admin@example.com"]
```

**`.gitignore` への追記**

```
infra/terraform.tfvars
infra/.terraform/
infra/*.tfstate
infra/*.tfstate.backup
```

初期化を実行する。

```bash
cd infra
terraform init
```

### Task 3: Cloudflare Pages リソースの定義

**`infra/pages.tf`**

```hcl
resource "cloudflare_pages_project" "evidence" {
  account_id        = var.cloudflare_account_id
  name              = var.project_name
  production_branch = "main"

  deployment_configs {
    production {
      environment_variables = {}
    }
  }
}
```

> **注意:** Cloudflare Pages の実際のファイルデプロイは wrangler-action が行うため、Terraform はプロジェクトの「箱」だけを管理する。

変更を確認してから適用する。

```bash
terraform plan
terraform apply
```

### Task 4: Cloudflare Access リソースの定義

**`infra/access.tf`**

```hcl
# Access アプリケーション
resource "cloudflare_access_application" "evidence" {
  account_id       = var.cloudflare_account_id
  name             = "Evidence Dashboard"
  domain           = "${var.project_name}.pages.dev"
  type             = "self_hosted"
  session_duration = "24h"
}

# Access ポリシー（許可メールリスト）
resource "cloudflare_access_policy" "allow_team" {
  account_id     = var.cloudflare_account_id
  application_id = cloudflare_access_application.evidence.id
  name           = "Allow Team Members"
  precedence     = 1
  decision       = "allow"

  include {
    email = var.allowed_emails
  }
}
```

**`infra/outputs.tf`**

```hcl
output "pages_url" {
  value = "https://${var.project_name}.pages.dev"
}

output "access_application_id" {
  value = cloudflare_access_application.evidence.id
}
```

```bash
terraform plan
terraform apply
```

### Task 5: Remote State の設定

ローカルに `.tfstate` を置くと git に混入するリスクがある。Terraform Cloud（無料）に state を保存する。

1. [app.terraform.io](https://app.terraform.io/) でアカウント作成
2. Organization と Workspace を作成（`test-evidence-infra` など）
3. `main.tf` の `terraform` ブロックを更新:

```hcl
terraform {
  cloud {
    organization = "your-org-name"
    workspaces {
      name = "test-evidence-infra"
    }
  }
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}
```

4. Terraform Cloud の Workspace に環境変数を登録（`TF_VAR_cloudflare_api_token` など）
5. `terraform login` → `terraform init` で再初期化

### Task 6: CI から `terraform plan` を自動実行

PR 作成時に `terraform plan` の結果をコメントとして自動投稿する。

**`.github/workflows/terraform.yml`**

```yaml
name: Terraform Plan

on:
  pull_request:
    paths:
      - 'infra/**'

jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          cli_config_credentials_token: ${{ secrets.TF_API_TOKEN }}

      - name: Terraform Init
        run: terraform init
        working-directory: infra

      - name: Terraform Plan
        id: plan
        run: terraform plan -no-color
        working-directory: infra
        env:
          TF_VAR_cloudflare_api_token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          TF_VAR_cloudflare_account_id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          TF_VAR_allowed_emails: '["user@example.com"]'

      - name: PR にコメントを投稿
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '```\n${{ steps.plan.outputs.stdout }}\n```'
            })
```

---

## ハマりやすいポイント

| 問題 | 原因 | 対処 |
|------|------|------|
| `terraform apply` が 409 エラー | 手動で作ったリソースが既に存在する | `terraform import` で既存リソースを state に取り込む |
| `tfvars` が git に混入 | `.gitignore` の設定漏れ | `git rm --cached infra/terraform.tfvars` で追跡を外す |
| API Token の権限不足 | Token の scope が足りない | `Account / Cloudflare Pages / Edit` と `Account / Access: Apps and Policies / Edit` を付与 |

---

## 参考リンク

- [Terraform Cloudflare Provider 公式ドキュメント](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs)
- [cloudflare_pages_project リソース](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/pages_project)
- [cloudflare_access_application リソース](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/access_application)
