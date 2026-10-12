# syntax=docker/dockerfile:1
FROM node:24.19.0-bookworm-slim AS base
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then sparko_apt_ca='-o Acquire::https::CaInfo=/run/secrets/proxy_ca'; fi; \
    apt-get ${sparko_apt_ca:-} update && \
    apt-get ${sparko_apt_ca:-} install --no-install-recommends -y ca-certificates openssl && \
    rm -rf /var/lib/apt/lists/*
FROM base AS build
WORKDIR /app
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/bot/package.json apps/bot/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/assets/package.json packages/assets/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/messages/package.json packages/messages/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/policy/package.json packages/policy/package.json
COPY packages/rendering/package.json packages/rendering/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    pnpm install --frozen-lockfile
COPY . .
# Node sizes its heap from physical memory, which on a 2 GB server is below
# the ~800 MB the website's type check needs; this lets it use swap instead.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    NODE_OPTIONS=--max-old-space-size=2048 pnpm build
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/.data/private && chown node:node /app/.data/private
USER node
ARG SERVICE=api
ENV SERVICE=${SERVICE}
CMD ["node", "--import", "tsx", "tools/start.ts"]
FROM nginx:1.28.0-bookworm AS web
COPY --chown=nginx:nginx infra/nginx-main.conf /etc/nginx/nginx.conf
COPY --chown=nginx:nginx infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /app/apps/web/dist/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build --chown=nginx:nginx /app/apps/web/dist /usr/share/nginx/html
RUN rm /usr/share/nginx/html/security-headers.conf
USER nginx
EXPOSE 8080
ENTRYPOINT []
CMD ["nginx", "-g", "daemon off;"]
