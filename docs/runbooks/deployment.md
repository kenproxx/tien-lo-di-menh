# Triển khai web và world server

## Cấu trúc
Vercel project root `apps/web`, build Next.js và static Phaser client trong `/game`. `GAME_SERVER_URL` chỉ server-side, trỏ world HTTPS. `VITE_WS_URL` build-time trỏ WSS world; `VITE_API_URL` bỏ trống để REST cùng origin qua Next proxy. Không đưa auth/DB/write secret vào VITE variables. Không dùng Vercel Functions cho world WebSocket/tick loop.

## Staging
Tạo PostgreSQL staging qua Vercel Marketplace hoặc PostgreSQL VPS. Dùng DB riêng, auth secret riêng, exact WEB_ORIGIN; preview không được truy cập production database. Neon Free đã được tạo qua Marketplace và nối với Vercel production; game server bên ngoài chưa deploy. VPS cần quyền deploy thực tế. Compose có Caddy TLS và nonroot world image, kiểm health/readiness và graceful shutdown. Docker image đã build và chạy nonroot/ready local.

1. Cấu hình `DATABASE_URL`, `BETTER_AUTH_SECRET` ngẫu nhiên tối thiểu 32 ký tự, `BETTER_AUTH_URL` public endpoint, `WEB_ORIGIN` chính xác trên world. Không dùng secret mẫu local ở production.
2. `docker compose -f infra/compose.yml up -d --build`. World apply migrations có advisory lock và checksum; không sửa migration đã apply. Kiểm backward compatibility/rollback ở staging trước production acceptance.
3. Cấu hình Vercel root `apps/web`, variables `GAME_SERVER_URL`, `VITE_WS_URL` và `WORLD_PROXY_TOKEN` (bí mật server-side, cùng giá trị với world), rồi deploy staging. Kiểm `/readyz`, signup, ticket, hai client và offline/retry như local.
4. Caddy phải chạy DNS đã trỏ VPS để cấp TLS. Không tắt TLS verification.

## Backup/restore
`pg_dump --format=custom --file=/secure/path/tienlo.dump "$DATABASE_URL"` (không echo credentials). Restore vào DB cô lập bằng `pg_restore --no-owner --dbname="$RESTORE_DATABASE_URL" /secure/path/tienlo.dump`. Kiểm counts và ledger sau restore. Local restore evidence ở docs/evidence; remote backup/storage schedules chưa cấu hình. Không restore trực tiếp production.

## Render Blueprint + Vercel hiện tại

Web đã deploy tại `https://tien-lo-di-menh.vercel.app`; Neon Free Singapore đã tạo và nối vào Vercel production. Game server chưa deploy vì Render API bị Cloudflare 403 từ môi trường agent. Không gọi đây là game đã vận hành end-to-end.

Trong Render dashboard, tạo Blueprint từ repo `kenproxx/tien-lo-di-menh`, chọn branch `work` và file root `render.yaml`. Điền `DATABASE_URL` của Neon từ trang quản lý database bảo mật. Blueprint dùng một Docker Web Service, auth/proxy secrets tự sinh, exact web origin đã điền, cổng 10000. Gói Free có thể ngủ; chọn gói luôn chạy khi có ngân sách được chấp thuận.

Sau khi `/readyz` Render thành công, cấu hình Vercel production `GAME_SERVER_URL=https://<service>.onrender.com`, `VITE_WS_URL=wss://<service>.onrender.com`, cùng `WORLD_PROXY_TOKEN` lấy bảo mật từ Render; giữ `VITE_API_URL` trống. Redeploy từ `work` với target production. Git link Vercel mặc định hiện là `main`, nên nếu dùng auto deploy cần đổi Production Branch sang `work` trong dashboard trước.

Kiểm signup/login, nhân vật, WebSocket ticket, hai client cùng thấy combat và reconnect trên URL production. Bằng chứng build `READY` không thay cho các smoke checks này.

## Release gates chưa đạt

Đọc docs/evidence/progress.md; catalog counts không chứng minh mọi feature đã hoàn thiện. Không tự hứa 500 CCU, không gọi mobile browser là APK/iOS verified. Người dùng đã giao quyền tự triển khai; quyền truy cập thực tế vẫn cần được cung cấp qua môi trường. Web Vercel và database Neon đã tạo, world Render và nghiệm thu end-to-end còn blocked.
