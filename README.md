# 支流

非线性脑图对话。左侧是对话列表，右侧是可展开、收起的脑图画板。

## 开发

```bash
pnpm install
cp .env.example .env
pnpm --filter @tributary/server exec tsx scripts/bootstrap-db.ts
pnpm dev
pnpm dev:worker
pnpm dev:web
```

API 在 `http://127.0.0.1:8788`。页面开发服务器在 `http://127.0.0.1:5173`，并把 `/api` 代理到 API。`pnpm dev:worker` 从 `jobs` 表领取回答任务；只开 API 时，新问题会停在待回答。

生产形态由服务端同时提供 API 和构建后的页面，回答仍由独立 worker 执行：

```bash
pnpm build
pnpm start
pnpm start:worker
```

每个环境一份 env 文件，里面都写 `DATABASE_URL` 和 `MEILI_INDEX_UID`。开发读 `.env`，测试只读 `.env.test`，`NODE_ENV=production` 时先读 `.env.production`。搜索只走 Meilisearch 关键词检索（中文 `cmn`）。

## 部署

推到 `main` 后，GitHub Actions 把镜像推到 `ghcr.io/ximing/tributary-server`（标签 `stable`）。应用机 `/root/apps/tributary` 用 `docker-compose.prod.yml` 拉起 migrate、server、worker。入口 `https://fenzhi.aimo.plus` 反代到应用机 `13008`。变量样例见 `.env.production.example`，真实值只放应用机的 `.env`。

## 检查

```bash
pnpm typecheck
pnpm lint
pnpm test
```
