# 足袋navi (旅行計画共有・しおり作成)

複数人で旅行計画を共有し、しおり作成・思い出投稿・PDF出力まで行える Web アプリです。

## 主な機能
- メール/パスワード認証（既存）
- Clerk セッショントークンの受け入れ（ハイブリッド運用）
- 招待コード + 合言葉付き共同編集
- 行程（日時・場所・リンク・アイコン）編集
- DAY ジャンプ、並び替え、NOW/NEXT 表示
- しおり装飾（スタイル、絵文字、詳細項目）
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

## 主要 API 追加分
- `GET /api/public-config`
- `POST /api/auth/clerk/sync`
- `POST /api/trips/:tripId/invite-email`
- `POST /api/trips/:tripId/memories/similar`

## 必須/任意の環境変数
### 必須（既存アプリ動作）
- `APP_JWT_SECRET`
- `BLOB_READ_WRITE_TOKEN`

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
# 必要な任意変数も同様に追加
npx vercel --prod --yes
```

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
