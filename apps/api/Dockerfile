# Content Factory API — tsx 运行时镜像（不预编译，直跑 TS）
# 单体 monorepo：根 + packages/shared + apps/api 一并安装，保留 workspace 链接
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.33.1 --activate
WORKDIR /app

# 仅复制 manifests，最大化利用层缓存
COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# 过滤安装 api 及其 workspace 依赖（含 shared）
RUN pnpm install --frozen-lockfile --filter @cf/api...

# 迁移专用 stage：node-pg-migrate 是根级 devDependency，需全量安装才能取得
FROM node:22-alpine AS migrate
RUN corepack enable && corepack prepare pnpm@10.33.1 --activate
WORKDIR /app
ENV NODE_ENV=production
COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY db ./db
# -d 指定存放连接串的环境变量名（非连接串本身）；DATABASE_ADMIN_URL 由 compose 注入
CMD ["pnpm", "exec", "node-pg-migrate", "up", "-m", "db/migrations", "-j", "js", "-d", "DATABASE_ADMIN_URL"]

FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@10.33.1 --activate
WORKDIR /app
ENV NODE_ENV=production

# 复用已安装依赖
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

# 源码（shared 以 src 形式被直接 import；api 用 tsx 直跑）
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY db ./db

EXPOSE 3001
# start 脚本 = tsx src/server.ts；server.ts 的 dotenv 缺 .env 不报错，直接吃容器环境变量
CMD ["pnpm", "--filter", "@cf/api", "start"]
