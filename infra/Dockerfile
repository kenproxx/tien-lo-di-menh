FROM public.ecr.aws/docker/library/node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --chown=node:node package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --chown=node:node apps/game-server/package.json apps/game-server/package.json
COPY --chown=node:node apps/game-client/package.json apps/game-client/package.json
COPY --chown=node:node apps/web/package.json apps/web/package.json
COPY --chown=node:node packages packages
ARG NODE_USE_ENV_PROXY=0
RUN --mount=type=secret,id=proxy_ca if test -f /run/secrets/proxy_ca; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; pnpm install --frozen-lockfile
COPY --chown=node:node apps/game-server apps/game-server
COPY --chown=node:node scripts/production-init.ts scripts/production-init.ts
USER node
EXPOSE 3001
CMD ["./node_modules/.bin/tsx", "apps/game-server/src/main.ts"]
