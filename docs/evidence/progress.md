# Tiến độ và bằng chứng — Tiên Lộ: Dị Mệnh

Thiết kế/kế hoạch trong `docs/superpowers` đã được người dùng phê duyệt; các bảng cân bằng được tự quyết theo quyền đã giao. Đây là bản web chạy được cùng mã nguồn server và dự án native. Chưa nghiệm thu bản phát hành production hoặc toàn bộ T01–T28.

## Đã kiểm chứng trong cloud, 2026-09-30 UTC

- Node 24.19.0, pnpm 11.19.0, PostgreSQL 17, Docker 28.4.0.
- `pnpm test`: **70/70**, 25 files. Bao gồm uint64, chiến đấu, thời điểm thi triển, thiên phú, vật phẩm, lease fencing, retry, đồng thời mua chợ/trả offline, giao dịch và hồi phục vật phẩm hết hạn.
- `pnpm run typecheck`, `content:validate`, `format:check`, `build`: đạt. Next.js build và manifest SHA-256 của tài nguyên đã tạo.
- `pnpm run test:e2e`: **6/6**, Chromium: đăng ký/chọn nhân vật, di chuyển/đánh/reconnect, hai người cùng quái, màn hình cảm ứng 390px, kết luyện có cửa sổ thời gian server, chống hello chồng và retry.
- `pnpm audit --prod`: không có cảnh báo trong kết quả tại thời điểm kiểm tra.
- Docker image `tien-lo-world:local` build thành công; container chạy user `node`, `/readyz` HTTP 200 trên cổng kiểm tra 3002. Chưa triển khai DNS/TLS thực tế.
- `scripts/cloud-setup.sh` chạy lại thành công, giữ `.env`/dữ liệu. Cloud onboarding configuration draft đã lưu script setup và hướng dẫn khởi động; chưa khẳng định draft đã được áp dụng toàn hệ thống.
- [Load smoke](load-smoke.json): 20 người được xác thực, tự chiến 60 giây, 12.542 snapshots, 28 lượt hạ quái, 0 lỗi; tick p95 0,43ms/p99 1,73ms trong cửa sổ ghi nhận. Chạy cùng E2E trên máy local, không suy ra công suất production.
- [Offline profile](offline-profile.json): một job 8 giờ với fixture cấp 60, 14.400 sự kiện, khoảng 319ms. Đây không phải benchmark dân số offline hay độ chính xác cân bằng.
- [Restore](restore.json): pg_dump/pg_restore vào DB cô lập `tienlo_restore_check`, 73 nhân vật, 222 operations, 261 ledger rows, 0 vi phạm uint64 của số dư. Backup nằm ngoài repo; đây là dữ liệu local fixture, không phải production backup policy.
- [Desktop](game-desktop.png), [mobile](game-mobile.png), [inventory](inventory-desktop.png), [two players](two-players.png) được chụp từ trình duyệt đang chạy và kiểm tra trực quan.

## Phạm vi mã nguồn

| Kế hoạch | Phạm vi đã triển khai | Giới hạn nghiệm thu |
|---|---|---|
| T01–T09 | Workspace, uint64/protocol, pixel scene, auth/4 slots, 20Hz server, AOI, prediction, combat/CC/shields, shared monsters, auto | Chưa có chaos/network matrix đầy đủ; terrain hiện có ground và biên map |
| T10–T12 | Transaction/ledger/outbox, idempotency/fencing, túi/claims/potions, gear, levels/10 realms, 3 branches, 24 cơ bản + 6 bí kíp, 4 slots/passives | Cân bằng chưa qua người chơi thật; chưa walkthrough mọi cấp |
| T13–T14 | 120 talents đủ phân bố 20/20/20/18/16/12/8/4/2, 20 effect families, awakening một lần, 3% offers 3/8 hệ thống | Unit kiểm chứng effect math; chưa nghiệm thu mọi tổ hợp end-to-end |
| T15 | Offline worker tách khỏi tick, 8h/70%, inventory/death stops, transaction settlement một lần | Reducer offline hiện là mô hình chiến đấu giản lược; chưa tương đương mọi skill/pet/MP/cooldown online |
| T16–T19 | 12 main + 32 hidden quests/dialog/item/condition, alchemy/forge/manual timing/quality/enhance/element/physical recipes, 6 pets + 6 formation boards, 8 systems ×5 tiers | Nội dung/cân bằng v1 cần playtest; chưa walkthrough toàn bộ hidden/system lines |
| T20–T22 | Party/private trials, boss telegraph/ownership/contribution/loot, chat/block/report, marketplace escrow/expiry, direct trade snapshot confirmation | Chưa có matrix team/boss loot stress; full claim box khi nhận loot chiến đấu vẫn có thể khiến operation thất bại |
| T23 | Lease epochs/renew/checkpoint, reconnect retention, shutdown drain, retry/locking regressions | Chưa kiểm thử kill-process-at-commit/transfer đầy đủ |
| T24 | Docker/Caddy/compose/Vercel gateway configs, checksum migrations, local restore | **Blocked**: không có Vercel connector/token, VPS/DNS hay DB staging credential; chưa có URL staging/production |
| T25 | Catalog validator, admin opt-in grants qua ledger, procedural pixel assets + checksum manifest | Chưa có GUI content editor; policy lưu audit dài hạn cần chốt khi vận hành |
| T26 | Metrics, 20-client smoke + 1 offline-job profile | **Chưa đạt**: tiers 50→500, 30 phút/tier, 2h soak, CPU/cost/bandwidth production |
| T27 | Android Capacitor project, local asset bundle, endpoint guard, touch/safe area/blur input reset | **Blocked**: thiếu Android SDK/thiết bị/signing; chưa build/cài APK, native auth chưa xác minh |
| T28 | iOS Capacitor/Xcode project, mobile runbook | **Blocked**: Linux không có macOS/Xcode/thiết bị/signing; chưa build/cài iOS, chưa nghiệm thu cuối |

## Rà soát độc lập

Đã sửa các lỗi khóa/epoch, thay đổi offer trong lúc chờ transaction, healing khi retry, slot prototype, instance tăng không giới hạn, sequence sau reconnect, shield hết hạn, tombstone/4 slots, hello chồng, pet state merge, trial re-entry, boss ram immunity và safe-zone healing trong private trial. Claim box đầy hiện cho phép nhận trước rồi trả escrow, và maintenance tách lỗi theo actor/job. Có regression tests cho các lỗi này; rà soát không thay thế kiểm chứng hạ tầng production.

## Tiếp tục khi có môi trường triển khai

Kết nối Vercel và VPS/DNS/PostgreSQL staging, triển khai theo runbook, kiểm cookie/WSS/proxy trust và restore ở staging. Hoàn thiện parity offline, policy full-claim loot, chaos tests và nội dung bằng playtest. Chạy tải theo đúng T26 trước khi thay giới hạn admission mặc định 100. Build/cài native với HTTPS/WSS và xác minh auth/lifecycle trên thiết bị trước khi phát hành.
