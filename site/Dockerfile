# LP do CRM (site/). Contexto de build: a pasta site/ (na VPS: `docker build -f site/Dockerfile site`).
# Imagem separada da do CRM: mudar texto ou imagem da LP não reconstrói nem troca o CRM.

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3200 \
    HOSTNAME=0.0.0.0
RUN addgroup -S lp && adduser -S lp -G lp
# O `standalone` já traz só o que o servidor usa; `.next/static` e `public` ficam de fora dele
# e saem por /_lp/_next (rewrite) e /_lp (public/_lp).
COPY --from=build --chown=lp:lp /app/.next/standalone ./
COPY --from=build --chown=lp:lp /app/.next/static ./.next/static
COPY --from=build --chown=lp:lp /app/public ./public
USER lp
EXPOSE 3200
# O healthcheck mede a LP, não o roteamento: o domínio é conferido de fora, com curl.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3200/robots.txt || exit 1
CMD ["node", "server.js"]
