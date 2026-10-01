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

Web đã deploy tại `https://tien-lo-di-menh.vercel.app`; Neon Free Singapore đã tạo và nối vào Vercel production. Docker Web Service `tien-lo-world` tại `https://tien-lo-world.onrender.com` đã có DATABASE_URL và deployment mới live; Vercel production READY. API `/v1/owners` bị Cloudflare 403, nhưng `/v1/services` hoạt động. Chưa kiểm chứng gameplay production end-to-end vì môi trường chặn public hosts.

Service hiện có: `https://dashboard.render.com/web/srv-dav94cs9v7es73fl4360`. Người dùng đã thêm DATABASE_URL và redeploy thành công. Khi xoay credential, cập nhật Render Environment và redeploy; Vercel API đọc storage secrets yêu cầu xác minh bảo mật. Service dùng một instance Docker, Singapore, cổng 10000, health `/readyz`, branch `work`, auth/proxy secrets đã sinh bảo mật. Gói Free có thể ngủ; chọn gói luôn chạy khi có ngân sách được chấp thuận. `render.yaml` chỉ là cấu hình để tái tạo, không cần import thêm service trùng.

Vercel production đã có `GAME_SERVER_URL=https://tien-lo-world.onrender.com`, `VITE_WS_URL=wss://tien-lo-world.onrender.com`, cùng `WORLD_PROXY_TOKEN` với Render; `VITE_API_URL` trống. Sau khi Render ready, kiểm các endpoint và signup. Redeploy Vercel từ `work` với target production nếu thay đổi biến build-time. Git link Vercel mặc định hiện là `main`, nên nếu dùng auto deploy cần đổi Production Branch sang `work` trong dashboard trước.

Kiểm signup/login, nhân vật, WebSocket ticket, hai client cùng thấy combat và reconnect trên URL production. Bằng chứng build `READY` không thay cho các smoke checks này.

## Release gates chưa đạt

Đọc docs/evidence/progress.md; catalog counts không chứng minh mọi feature đã hoàn thiện. Không tự hứa 500 CCU, không gọi mobile browser là APK/iOS verified. Web Vercel, database Neon và service Render đã tạo; deployment Vercel READY, Render live. Nghiệm thu end-to-end còn blocked bởi public-host network policy của môi trường kiểm thử.
