# Content Factory Web — 多阶段：vite build 出静态产物，nginx 托管 + 反代 /api
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.33.1 --activate
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @cf/web...

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN pnpm --filter @cf/web build

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
