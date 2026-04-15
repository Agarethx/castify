FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS builder
WORKDIR /app

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY turbo.json ./
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

RUN pnpm install --frozen-lockfile

# Compilar packages compartidos (genera dist/ actualizado)
RUN pnpm --filter @castify/types build || true
RUN pnpm --filter @castify/validators build
RUN pnpm --filter @castify/config build || true

# Variables públicas que Next.js hornea en el bundle en tiempo de build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_TRACKER_URL
ARG NEXT_PUBLIC_MEDIAMTX_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_TRACKER_URL=$NEXT_PUBLIC_TRACKER_URL
ENV NEXT_PUBLIC_MEDIAMTX_URL=$NEXT_PUBLIC_MEDIAMTX_URL

WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
RUN mkdir -p apps/web/.next/static apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
