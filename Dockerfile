# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY lib-db ./lib-db
RUN cd lib-db && npm install --no-audit --no-fund
RUN npm install --no-audit --no-fund

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Os instaladores do agente (Windows, ~257MB) NÃO entram no build: são gitignored e
# fornecidos em runtime pelo volume ./public/downloads/agent montado no docker-compose.
# Por isso não validamos aqui a presença/versão do .exe — só compilamos o app web.
RUN npm run build && npm prune --production \
  && mkdir -p /db-deps \
  && cp -r lib-db /db-deps/nexus-desk-db \
  && cp -r node_modules/bcryptjs /db-deps/bcryptjs \
  && cp -r node_modules/pg /db-deps/pg \
  && cp -r node_modules/deasync /db-deps/deasync \
  && cp -r node_modules/better-sqlite3 /db-deps/better-sqlite3

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /db-deps /db-deps
COPY scripts/docker-merge-db-deps.sh /tmp/docker-merge-db-deps.sh
RUN chmod +x /tmp/docker-merge-db-deps.sh \
  && /tmp/docker-merge-db-deps.sh \
  && rm -rf /db-deps /tmp/docker-merge-db-deps.sh \
  && chown -R nextjs:nodejs /app/node_modules/nexus-desk-db
COPY --from=builder --chown=nextjs:nodejs /app/scripts/docker-entrypoint.cjs ./scripts/docker-entrypoint.cjs
RUN mkdir -p /app/public/uploads /app/data \
  && chown -R nextjs:nodejs /app/public/uploads /app/data
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/ || exit 1
CMD ["node", "scripts/docker-entrypoint.cjs"]
