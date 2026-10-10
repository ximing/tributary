# 支流

非线性脑图对话。左侧是对话列表，右侧是可展开、收起的脑图画板。

## 开发

```bash
pnpm install
cp .env.example .env
pnpm --filter @tributary/server exec tsx scripts/bootstrap-db.ts
pnpm dev
pnpm dev:web
```

API 在 `http://127.0.0.1:8787`。页面开发服务器在 `http://127.0.0.1:5173`，并把 `/api` 代理到 API。

生产形态由服务端同时提供 API 和构建后的页面：

```bash
pnpm build
pnpm start
```

本地和测试使用数据库 `tributary_test`。`APP_ENV=production` 时使用 `tributary_prod` 和单独的 Meilisearch 索引。搜索只走 Meilisearch 关键词检索（中文 `cmn`）。

## 检查

```bash
pnpm typecheck
pnpm lint
pnpm test
```
