# syntax=docker/dockerfile:1
# 服务端用 tsx 跑 TypeScript 源码（domain 也是源码入口），页面在镜像里预先构建。
FROM node:22-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages/domain packages/domain
COPY apps/server apps/server
COPY apps/web apps/web
RUN pnpm --filter @tributary/web build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/apps/server
EXPOSE 8788
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
