# SDD ledger — plan: docs/superpowers/plans/2026-10-01-tien-lo.md
User approved supplied plan and autonomous balance proposals in chat.
Ruling: use existing isolated cloud checkout, no worktree — cloud onboarding/user repo context — no extra checkout needed.
Preflight: protocol bigint decimal strings consumed by server/client; simulation has no DOM/DB; asset operations require database transactions and fencing; offline settlement uses same ledger as online.
Environment: Node 24.19.0, npm 11.9.0, pnpm 11.19.0, Docker 28.4.0.
Registry inspection initially failed because default npm cache is outside writable roots; use /workspace/.npm-cache, preserve TLS.
T01–T28: pending. Do not treat scaffold as full game.
