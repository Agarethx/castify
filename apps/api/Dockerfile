FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS builder
WORKDIR /app

# Copiar estructura del monorepo completa
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY turbo.json ./
COPY tsconfig.base.json ./

# Copiar packages compartidos
COPY packages/ ./packages/

# Copiar la app
COPY apps/api/ ./apps/api/

# Instalar todas las dependencias del monorepo
RUN pnpm install --frozen-lockfile

# Compilar packages compartidos (genera dist/ actualizado)
RUN pnpm --filter @castify/types build || true
RUN pnpm --filter @castify/validators build
RUN pnpm --filter @castify/config build || true

# Generar Prisma Client antes del build
RUN pnpm --filter api exec prisma generate

# Build de la api
WORKDIR /app/apps/api
RUN pnpm build

FROM base AS runner
WORKDIR /app/apps/api

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/pnpm-workspace.yaml /app/
COPY --from=builder /app/package.json /app/

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/main"]
