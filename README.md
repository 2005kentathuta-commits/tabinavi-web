# 足袋navi (旅行計画共有・しおり作成)

複数人で旅行計画を共有し、しおり作成・思い出投稿・PDF出力まで行える Web アプリです。

## 主な機能
- メール/パスワード認証（既存）
- Clerk セッショントークンの受け入れ（ハイブリッド運用）
- 招待コード + 合言葉付き共同編集
- 行程（日時・場所・リンク・アイコン）編集
- 行程の1クリック追加（テンプレ選択）
- DAY ジャンプ、並び替え、NOW/NEXT 表示
- しおり装飾（スタイル、絵文字、詳細項目、並び替え、複製）
- 思い出投稿（画像ファイルアップロード）
- PDF 出力
- 開発者専用メール確認ページ（`/developer.html`）
- Resend での再設定メール / 招待メール送信
- Redis レート制限（ログイン・再設定・登録）
- Pinecone + OpenAI Embeddings の類似思い出検索 API
- PostHog（開発者ページに組み込み）

## 技術構成
- Frontend: React + Vite
- API: Vercel Serverless Function (`/api/index.js`)
- データ保存: Vercel Blob (`internal/db-*.json` + 画像)
- 認証: 既存JWT + Clerk（任意）
- メール: Resend
- Rate Limit: Upstash Redis
- 類似検索: Pinecone + OpenAI
- 分析: PostHog

## ローカル起動
```bash
npm install
npm install --prefix web
npm run dev --prefix web
```

`npm run dev --prefix web` はフロント単体起動です。  
認証/旅行データを含むフル動作確認は、VercelデプロイURLか `vercel dev`（API同時起動）で行ってください。

## サンプル旅行（ワンクリ）
1. ログイン画面で `会員登録せずに始める（ゲスト）` を押す  
2. 左カラムの `サンプル旅行を読み込む` を押す  
3. 自動でサンプル旅行が作成（または既存サンプルを再利用）されます  
4. `しおりPDF` / `思い出PDF` ですぐ出力確認できます

## PDF出力（安定版）
- 画面上部の `しおりPDF` / `思い出PDF` ボタンを押すだけで印刷ダイアログを開きます。
- PDF生成は「印刷ジョブ直列化 + フォント/画像読み込み待ち + 印刷専用CSS」で安定化しています。
- 実装方式は `window.print + 印刷CSS` です（`html2canvas` 系は未使用）。
- しおりPDFは `目次 -> 旅程 -> 予約 -> 持ち物 -> メンバー -> メモ -> 思い出` の順で出力されます。
- しおりタブは `目次チップ` の現在位置ハイライトに対応しています。
- 思い出タブは `DAY目次` で日付セクションへジャンプできます（画面内アンカー）。

### 開発用: 10回連続テスト
`dev` 起動中はブラウザコンソールで以下を実行できます。
```js
await window.__tabinaviPdfDebug.runStress({ templateId: 'templateA', type: 'guide', count: 10 })
await window.__tabinaviPdfDebug.runStress({ templateId: 'templateB', type: 'guide', count: 10 })
```
`type` は `guide` / `memories` / `both` を選べます。

CLIで連続実行する場合（テンプレA/Bで `guide+memories` を連続実行）:
```bash
E2E_BASE_URL=http://127.0.0.1:4173 PDF_STRESS_COUNT=10 npm run test:e2e:pdf
```

## 手動テストチェックリスト（主要フロー）
- [ ] ゲスト開始できる
- [ ] `サンプル旅行を読み込む` で旅行が開く
- [ ] 計画タブで `選択中を追加` を押すと1クリックで予定が増える
- [ ] 旅程で予定を追加・複製・並べ替えできる
- [ ] しおりタブの目次チップでセクションジャンプできる
- [ ] 思い出タブで画像サムネとキャプション入力ができる
- [ ] `しおりPDF` が開き、目次と各セクションが表示される
- [ ] `思い出PDF` が開き、写真カードが崩れない
- [ ] ページ再読み込み後も入力中ドラフトが残る

## E2E（最低限）
Playwright を使って `ゲスト開始 -> サンプル読込 -> 行程1クリック追加 -> PDF導線` を通すスモークを用意しています。

```bash
# 推奨: Preview / Production URL に対して実行
E2E_BASE_URL=https://your-deployment-url.vercel.app npm run test:e2e
```

Safari差分を確認する場合（WebKit）:
```bash
E2E_BASE_URL=https://your-deployment-url.vercel.app E2E_BROWSER=webkit npm run test:e2e
```

まとめて確認する場合（Chromium + WebKit）:
```bash
E2E_BASE_URL=https://your-deployment-url.vercel.app npm run test:e2e
E2E_BASE_URL=https://your-deployment-url.vercel.app E2E_BROWSER=webkit npm run test:e2e
E2E_BASE_URL=https://your-deployment-url.vercel.app npm run test:e2e:editor
E2E_BASE_URL=https://your-deployment-url.vercel.app E2E_BROWSER=webkit npm run test:e2e:editor
E2E_BASE_URL=https://your-deployment-url.vercel.app npm run test:layout
E2E_BASE_URL=https://your-deployment-url.vercel.app E2E_BROWSER=webkit npm run test:layout
```

編集UX（並び替え/複製/折りたたみ/自動保存）をテンプレA/Bで確認するテスト:
```bash
E2E_BASE_URL=https://your-deployment-url.vercel.app npm run test:e2e:editor
```

WebKit（Safari相当）で編集UXを確認する場合:
```bash
E2E_BASE_URL=https://your-deployment-url.vercel.app E2E_BROWSER=webkit npm run test:e2e:editor
```

PDF連続検証（`dev` 上のデバッグフック利用）:
```bash
E2E_BASE_URL=http://127.0.0.1:4173 PDF_STRESS_COUNT=10 npm run test:e2e:pdf
```

ローカルURLで実行する場合は、`/api` が同一オリジンで動いている環境を使ってください。  
（フロント単体 `npm run dev --prefix web` だけでは認証フローが通りません）

## 5幅レイアウト監査（計画/しおり/デザイン）
5つの幅（390/430/768/1024/1440）で、横スクロール有無・タップ領域・画面スクリーンショットを自動計測します。

```bash
E2E_BASE_URL=https://your-deployment-url.vercel.app npm run test:layout
```

WebKit（Safari相当）:
```bash
E2E_BASE_URL=https://your-deployment-url.vercel.app E2E_BROWSER=webkit npm run test:layout
```

出力:
- `test-results/layout-audit/summary.json`
- `test-results/layout-audit/{width}-{tab}.png`

## 主要 API 追加分
- `GET /api/public-config`
- `POST /api/auth/clerk/sync`
- `POST /api/trips/:tripId/invite-email`
- `POST /api/trips/:tripId/memories/similar`

## 必須/任意の環境変数
### 必須（既存アプリ動作）
- `APP_JWT_SECRET`
- `BLOB_READ_WRITE_TOKEN`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Blob無料枠超過時のフォールバック（任意）
- `BLOB_FREE_MODE=true`
  - Blob保存を使わずメモリ保存にフォールバックします（再起動で消えるため検証用途向け）。

### Clerk（任意）
- `CLERK_SECRET_KEY`
- `CLERK_JWT_KEY`（推奨）
- `CLERK_PUBLISHABLE_KEY`（フロント用）
- `CLERK_AUTHORIZED_PARTIES`（カンマ区切り、任意）
- `VITE_CLERK_PUBLISHABLE_KEY`（`CLERK_PUBLISHABLE_KEY` と同値）

### Resend（任意）
- `RESEND_API_KEY`
- `EMAIL_FROM`（例: `Tabi no Shiori <noreply@tabinoshiori.com>`）
- `RESET_EMAIL_REPLY_TO`（任意）

### Redis / Upstash（任意）
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `RATE_LIMIT_WINDOW_SECONDS`（任意）
- `RATE_LIMIT_MAX_LOGIN`（任意）
- `RATE_LIMIT_MAX_PASSWORD_RESET`（任意）
- `RATE_LIMIT_MAX_SIGNUP`（任意）

### Pinecone + OpenAI（任意）
- `PINECONE_API_KEY`
- `PINECONE_INDEX`
- `PINECONE_NAMESPACE`（任意）
- `OPENAI_API_KEY`
- `OPENAI_EMBEDDING_MODEL`（任意。既定: `text-embedding-3-small`）

### PostHog（任意）
- `POSTHOG_PUBLIC_KEY`
- `POSTHOG_HOST`（既定: `https://us.i.posthog.com`）

## Vercel 反映
```bash
npx vercel env add APP_JWT_SECRET production
npx vercel env add BLOB_READ_WRITE_TOKEN production
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_ANON_KEY production
# 必要な任意変数も同様に追加
npx vercel --prod --yes
```

## Vercel 最終確認
- `Deployments` が `Ready` になっている
- `/api/public-config` が想定どおり（必要サービスが `true`）
- 実サイトで `サンプル旅行を読み込む -> しおりPDF` が通る

## Cloudflare DNS 設定（Apex + www）
Cloudflare API トークンを使って Vercel 向け A レコードを自動設定できます。

```bash
CLOUDFLARE_API_TOKEN=xxx npm run dns:cloudflare -- --domain tabinoshiori.com
```

内部的には以下を作成/更新します。
- `A tabinoshiori.com -> 76.76.21.21`
- `A www.tabinoshiori.com -> 76.76.21.21`

### Cloudflare トークンの推奨権限
- Zone:DNS:Edit
- Zone:Zone:Read
- 対象 Zone は `tabinoshiori.com` のみに限定

## 補足
- Clerk を設定しなくても既存ログインはそのまま動作します。
- Clerk セッションがある場合、`/api/auth/clerk/sync` でローカルユーザーに同期できます。
- Resend 未設定時はパスワード再設定でメール送信は行わず、既存の手動コード運用になります。
- Pinecone/OpenAI 未設定時は類似検索 API はキーワードベースのフォールバックで動作します。
