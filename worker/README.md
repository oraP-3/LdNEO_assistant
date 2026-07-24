# LdNEO Analysis API Worker

Cloudflare Workers で既存の `analyzePosition()` を HTTP API として公開します。既存 UI からはまだ呼び出しません。

## 必要条件

- Node.js と npm
- Cloudflare アカウント
- Wrangler CLI（このリポジトリでは devDependency として固定）

## セットアップ

```sh
npm install
```

初回セットアップ時には必ず `npm install` を実行してください。`npm install` により、Wrangler 本体と推移的依存関係を含む正しい `package-lock.json` が生成されます。

Wrangler へログインします。

```sh
npx wrangler login
```

ローカル開発用 Secret ファイルを作成します。実際の値は Git にコミットしないでください。

```sh
cp worker/.dev.vars.example worker/.dev.vars
```

`worker/.dev.vars` の `ANALYSIS_API_KEY` を長いランダム文字列へ変更してください。

## ローカル起動

```sh
npm run worker:dev
```

## dry-run

```sh
npm run worker:check
```

現在の Codex 環境では npm registry へのアクセスが `E403 Forbidden` で拒否されたため、Wrangler の dry-run は未実施です。dry-run 成功前に本番デプロイしないでください。

## 本番 Secret 登録

```sh
npx wrangler secret put ANALYSIS_API_KEY \
  --config worker/wrangler.jsonc
```

API キーや `.dev.vars` / `.env` は Git へコミットしないでください。

## 本番デプロイ前の必須確認

本番デプロイ前に必ず以下を実行し、どちらも成功することを確認してください。

```sh
npm test
npm run worker:check
```

`npm run worker:check` の dry-run が成功するまでは、本番デプロイを行わないでください。

## 本番デプロイ

```sh
npm run worker:deploy
```

## health 確認

```sh
curl -i https://<your-worker-url>/health
```

## analyze-position 確認

```sh
curl -i https://<your-worker-url>/analyze-position \
  -H 'Authorization: Bearer <ANALYSIS_API_KEY>' \
  -H 'Content-Type: application/json' \
  --data '{"schemaVersion":"1.0","handTileIds":["t20","t12","t16","t35","t28","t45","t38","t39"]}'
```

## CORS 設定

`env.ALLOWED_ORIGINS` をカンマ区切りの Origin 一覧として設定します。

```jsonc
{
  "vars": {
    "ALLOWED_ORIGINS": "https://example.github.io,http://localhost:8787"
  }
}
```

許可された Origin だけに `Access-Control-Allow-Origin` を返します。ワイルドカード Origin は使用しません。Origin ヘッダーがないサーバー間通信は許可されます。

## ChatGPT Actions 向けエンドポイント

この Worker は ChatGPT Actions から既存の局面解析 API を安全に呼び出すため、牌・役参照 API と OpenAPI 仕様を提供します。この段階では GPT Store へ公開せず、本番デプロイや Cloudflare Secret の変更も行いません。

### OpenAPI 仕様

- URL: https://ldneo-analysis-api.ldneo-tools.workers.dev/openapi.json
- エンドポイント: `GET /openapi.json`
- 認証: 不要
- 用途: ChatGPT Actions へインポート可能な OpenAPI 3.1.0 JSON を返します。

OpenAPI スキーマや Git リポジトリへ API キーを書かないでください。ChatGPT Actions 側では認証方式を `API Key` / `Bearer` として設定し、実際のキーは `Authorization: Bearer <API key>` ヘッダーでだけ送信します。

公開共有する場合は、別途プライバシーポリシー URL が必要です。

### 牌名解決

`POST /resolve-tiles` は Bearer API key 認証が必須です。ユーザーが入力した牌名、牌 ID、キャラクター ID、シリーズ名、ユニット名を既存牌データに照合し、解析 API へ渡す正しい牌 ID 候補を返します。

```sh
curl -i https://ldneo-analysis-api.ldneo-tools.workers.dev/resolve-tiles \
  -H 'Authorization: Bearer <ANALYSIS_API_KEY>' \
  -H 'Content-Type: application/json' \
  --data '{"schemaVersion":"1.0","queries":["上原歩夢","宮下 愛","t38"]}'
```

ChatGPT Actions では、牌名から ID を推測せず、先にこのエンドポイントで候補を解決してください。候補が複数ある場合は、解析前にユーザーへ確認してください。

### 役一覧

`GET /roles` は Bearer API key 認証が必須です。既定役だけを id 昇順で返し、カスタム役や localStorage にはアクセスしません。

```sh
curl -i https://ldneo-analysis-api.ldneo-tools.workers.dev/roles \
  -H 'Authorization: Bearer <ANALYSIS_API_KEY>'
```

ChatGPT Actions では、`disabledRoleIds` を指定する必要がある場合に参照します。通常の全役有効設定では呼び出し必須ではありません。

### 局面解析

`POST /analyze-position` は Bearer API key 認証が必須です。ChatGPT Actions から牌名入力を扱う場合は、先に `/resolve-tiles` で牌 ID へ変換してから呼び出してください。
