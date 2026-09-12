FROM node:22-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@9

COPY package.json pnpm-workspace.yaml ./
COPY packages/api-types/package.json ./packages/api-types/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile=false

COPY packages/api-types ./packages/api-types
COPY apps/api ./apps/api

RUN pnpm --filter @openmsp/api-types run build
RUN pnpm --filter @openmsp/api run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api ./apps/api

WORKDIR /app/apps/api

EXPOSE 8080

CMD ["node", "dist/server.js"]
