FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/game-server/package.json apps/game-server/package.json
COPY apps/game-client/package.json apps/game-client/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages packages
RUN pnpm install --frozen-lockfile
COPY apps/game-server apps/game-server
USER node
EXPOSE 3001
CMD ["./node_modules/.bin/tsx", "apps/game-server/src/main.ts"]
