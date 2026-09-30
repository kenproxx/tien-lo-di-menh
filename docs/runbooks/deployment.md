# Triển khai web và world server

## Cấu trúc
Vercel project root `apps/web`, build Next.js và static Phaser client trong `/game`. `GAME_SERVER_URL` chỉ server-side, trỏ world HTTPS. `VITE_WS_URL` build-time trỏ WSS world; `VITE_API_URL` bỏ trống để REST cùng origin qua Next proxy. Không đưa auth/DB/write secret vào VITE variables. Không dùng Vercel Functions cho world WebSocket/tick loop.

## Staging
Tạo PostgreSQL staging qua Vercel Marketplace hoặc PostgreSQL VPS. Dùng DB riêng, auth secret riêng, exact WEB_ORIGIN; preview không được truy cập production database. Marketplace không được tạo tự động trong phiên vì không có Vercel tools/tài khoản. VPS cần quyền deploy thực tế. Compose có Caddy TLS và nonroot world image, kiểm health/readiness và graceful shutdown. Chưa xác minh build Docker hoặc external deployment.

1. Cấu hình `DATABASE_URL`, `BETTER_AUTH_SECRET` ngẫu nhiên tối thiểu 32 ký tự, `BETTER_AUTH_URL` public endpoint, `WEB_ORIGIN` chính xác trên world. Không dùng secret mẫu local ở production.
2. `docker compose -f infra/compose.yml up -d --build`. World apply idempotent baseline migration; migration versioning/rollback cần thêm trước production acceptance.
3. Cấu hình Vercel root `apps/web`, variables `GAME_SERVER_URL` và `VITE_WS_URL`, rồi deploy staging. Kiểm `/readyz`, signup, ticket, hai client và offline/retry như local.
4. Caddy phải chạy DNS đã trỏ VPS để cấp TLS. Không tắt TLS verification.

## Backup/restore
`pg_dump --format=custom --file=/secure/path/tienlo.dump "$DATABASE_URL"` (không echo credentials). Restore vào DB cô lập bằng `pg_restore --no-owner --dbname="$RESTORE_DATABASE_URL" /secure/path/tienlo.dump`. Kiểm counts và ledger sau restore. Local restore evidence ở docs/evidence; remote backup/storage schedules chưa cấu hình. Không restore trực tiếp production.

## Release gates chưa đạt
Đọc docs/evidence/progress.md; catalog counts không chứng minh mọi feature đã hoàn thiện. Không tự hứa 500 CCU, không gọi mobile browser là APK/iOS verified. Không mua dịch vụ hoặc phát hành store trong task này.
