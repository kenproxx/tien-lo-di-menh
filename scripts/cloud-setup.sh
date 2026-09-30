#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export XDG_DATA_HOME=/workspace/.local/share XDG_CACHE_HOME=/workspace/.cache
export PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright DOCKER_CONFIG=/workspace/.docker
pnpm install --frozen-lockfile
if [[ ! -f .env ]]; then cp .env.example .env; fi
if node --env-file-if-exists=.env -e 'const u=new URL(process.env.DATABASE_URL);process.exit(["localhost","127.0.0.1"].includes(u.hostname)&&u.pathname==="/tienlo"?0:1)'; then
  if docker inspect tien-lo-postgres >/dev/null 2>&1; then
    docker start tien-lo-postgres >/dev/null
  else
    docker run -d --name tien-lo-postgres -e POSTGRES_USER=tienlo -e POSTGRES_PASSWORD=local-development-only -e POSTGRES_DB=tienlo -p 127.0.0.1:5432:5432 public.ecr.aws/docker/library/postgres:17-alpine >/dev/null
  fi
  for attempt in {1..30}; do
    if docker exec tien-lo-postgres pg_isready -U tienlo -d tienlo >/dev/null; then break; fi
    if [[ "$attempt" == 30 ]]; then echo 'Local PostgreSQL did not become ready.' >&2; exit 1; fi
    sleep 1
  done
fi
pnpm run db:migrate
if node --env-file-if-exists=.env -e 'const u=new URL(process.env.DATABASE_URL);process.exit(["localhost","127.0.0.1"].includes(u.hostname)&&u.pathname==="/tienlo"?0:1)'; then pnpm run db:seed; fi
pnpm run content:validate
pnpm run typecheck
