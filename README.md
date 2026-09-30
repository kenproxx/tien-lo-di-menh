# Tiên Lộ: Dị Mệnh

Game web tu tiên 2D: client Phaser/TypeScript, Node WebSocket world, PostgreSQL assets, Next.js/Vercel web gateway. Source scope and verification limits: [progress](docs/evidence/progress.md), [approved design](docs/superpowers/specs/2026-10-01-agreement.md).

## Local development
Node 24, pnpm 11.19.0, PostgreSQL 17. Cloud task already isolated; use current checkout, no extra worktree.

```bash
pnpm install --frozen-lockfile
cp .env.example .env
# Run PostgreSQL locally; example is for local development only:
docker run -d --name tien-lo-postgres -e POSTGRES_USER=tienlo -e POSTGRES_PASSWORD=local-development-only -e POSTGRES_DB=tienlo -p 127.0.0.1:5432:5432 public.ecr.aws/docker/library/postgres:17-alpine
pnpm run db:migrate
pnpm run db:seed
pnpm run dev
```
Local client port 5173, game/API port 3001; health/readiness at `/healthz` and `/readyz`. Demo local account `demo@tienlo.local`, password `TienLo-local-demo-2026`. Seed is forbidden with `NODE_ENV=production`. Normal email/password signup also works. Change local example secrets before staging.

Cloud filesystem workaround: set `XDG_DATA_HOME=/workspace/.local/share`, `XDG_CACHE_HOME=/workspace/.cache`, `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright` before pnpm/browser commands. `.npmrc` uses cloud cache locations.

## Checks
```bash
pnpm run typecheck
pnpm run content:validate
pnpm run test
pnpm exec playwright install chromium
pnpm run test:e2e       # start dev servers first
pnpm run build
pnpm run load:smoke    # start world first
```

Cloud setup tự động, có thể chạy lại: `bash scripts/cloud-setup.sh`.

Controls: A/D or arrows move, W/up jump, Space attack, 1–4 skills, F pháp bảo, R/T potions. Touch buttons and tap monsters on mobile browser. NPCs are near map entrance; return to them for shop, quest rewards, branches, craft and travel.

## Deployment
[Deployment runbook](docs/runbooks/deployment.md). Vercel hosts web/API proxy, a VPS runs persistent game world. Docker world image đã build và kiểm readiness local. Vercel/VPS thực tế chưa tạo do thiếu kết nối tài khoản; dự án Android/iOS có source nhưng chưa có bản cài được nghiệm thu. Xem [mobile runbook](docs/runbooks/mobile.md) và [bảng cân bằng v1](docs/evidence/balance-v1.md).
