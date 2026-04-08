FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS development
WORKDIR /app
COPY package.json ./
RUN pnpm install
COPY . .
EXPOSE 3001
CMD ["pnpm", "dev"]
