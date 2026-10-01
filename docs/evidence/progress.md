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

## Hoạt họa combat — 2026-10-01

### Kiểm chứng sau khi cài dependencies

- `XDG_DATA_HOME=/workspace/.local/share XDG_CACHE_HOME=/workspace/.cache pnpm install --frozen-lockfile`: pass, lockfile giữ nguyên. Registry Docker PostgreSQL trả Forbidden; dùng binary PostgreSQL 18.4 từ gói npm `embedded-postgres` trong `/tmp`, DB local riêng tại `127.0.0.1:5432/tienlo`, migrate pass. Đây là kiểm chứng PostgreSQL 18.4 local, không phải staging/production hoặc PostgreSQL 17.
- `pnpm test`: 70/70, 25 files pass. Lần đầu thiếu `.env` khiến 7 suites lỗi `DATABASE_URL_REQUIRED`; sau khi cấu hình DB local bằng `.env.example`, toàn bộ suite pass.
- `node --test tests/scripts/*.test.mjs`: 8/8 pass. `pnpm typecheck`, `pnpm format:check`, `pnpm content:validate`, `pnpm --filter @tien-lo/client build`, `git diff --check`: pass.
- `pnpm dev`: server port 3001 và Vite port 5173 khởi động thành công. `pnpm exec playwright test --config playwright.local.config.ts`: 6/6 pass với Chromium hệ thống `/usr/bin/chromium`; config tạm chỉ chọn executable, đã xóa sau test. CDN Playwright tải browser trả 403; không thay đổi cấu hình browser của repository.
- Smoke bổ sung bằng Playwright + Phaser thật: hero vung sang phải, quái chồm sang trái; vệt chém/cào xuất hiện rồi được destroy; sprite trả về offset/angle ban đầu, boss scale/tint khôi phục, container world position giữ nguyên; không có pageerror. Script smoke lần đầu bị treo do import Phaser với URL khác cache query của Vite, đã sửa harness để dùng đúng URL import của scene và chạy pass. Không có thay đổi sản phẩm từ vấn đề harness này.
- Screenshots sinh lại bởi suite E2E được khôi phục về bản đã lưu; không đẩy các thay đổi ảnh ngoài phạm vi. Chưa chạy trên Windows thật; chưa có nghiệm thu native mobile.

- Người dùng chấp thuận thiết kế trong chat. Nhân vật nghiêng/vung kiếm với vệt chém, quái chồm với vệt cào; nạn nhân chớp màu và co giãn phản lực. Dựa vào `hit`/`hurt` từ server, dùng cùng đường xử lý cho tự chiến và người chơi khác. Giữ nguyên vị trí container; giữ scale/tint boss; gộp hoạt họa nhiều hit trong 240ms. Scene vẫn lọc event ID trùng như trước.
- `node --test tests/scripts/*.test.mjs`: 8/8 pass, gồm 6 kiểm thử combat và 2 launcher. Combat kiểm tra hướng, semantics actor/target (hurt đảo vai), loại event không liên quan, gộp multi-target, giữ vị trí và khôi phục scale/tint với Phaser stub. Chưa nghiệm thu hình ảnh trong trình duyệt.
- `pnpm --config.verify-deps-before-run=false test`: blocked `vitest: not found`; `pnpm --config.verify-deps-before-run=false typecheck`: blocked `tsc: not found`. Checkout chưa có node_modules. `git diff --check`: pass.

## Sửa launcher dev trên Windows — 2026-10-01

- `scripts/dev.ts` gọi `process.execPath` với CLI JavaScript được resolve từ package `tsx` ở root và `vite` ở workspace client, thay cho spawn trực tiếp `.bin` shims. Bắt child-process `error`, đặt exit code 1 và dừng các tiến trình còn lại.
- `node --test tests/scripts/dev.test.mjs`: trước sửa 2 fail (launcher `.bin`, lỗi spawn không được xử lý); sau sửa 2 pass. Test dùng spawn giả để kiểm tra lời gọi launcher và xử lý lỗi, không thay thế smoke test trên Windows.
- `git diff --check`: pass. `pnpm test`: blocked trước khi chạy Vitest; checkout không có `node_modules`, pnpm tự cài dependencies và lỗi ENOENT khi tạo `/home/agent/.local/share/pnpm`. Chưa kiểm chứng typecheck, full suite hoặc khởi động server/client thực tế trên Windows.

Kết nối Vercel và VPS/DNS/PostgreSQL staging, triển khai theo runbook, kiểm cookie/WSS/proxy trust và restore ở staging. Hoàn thiện parity offline, policy full-claim loot, chaos tests và nội dung bằng playtest. Chạy tải theo đúng T26 trước khi thay giới hạn admission mặc định 100. Build/cài native với HTTPS/WSS và xác minh auth/lifecycle trên thiết bị trước khi phát hành.

## Vercel + Neon đã tạo; Render bị chặn — 2026-10-01

- Sau khi môi trường khởi động lại, Vercel `/v2/user` xác thực HTTP 200; Render `/v1/owners` trả HTTP 403 với trang Cloudflare “Sorry, you have been blocked”. Không kết luận Render API key sai và không tạo được Render service.
- Đã tạo Vercel project `tien-lo-di-menh` (`prj_HIDQy9sgxyFni3Ih98zb23SUPWKH`), team `kenproxxs-projects`, Next.js root `apps/web`, Node 24.x, source outside root enabled. Git link mặc định vẫn dùng production branch `main`; lần deploy này chỉ định rõ `work` và target `production` qua REST.
- `apps/web/vercel.json` đổi pnpm store/cache sang đường dẫn tương đối thay vì cloud-only `/workspace`. `pnpm install --frozen-lockfile --store-dir .pnpm-store --config.cache=.pnpm-cache --config.confirmModulesPurge=false`, `pnpm build`, Prettier và `git diff --check`: pass. Fix đã push commit `908306f`.
- Vercel deployment `dpl_Aoz8UcsNUApbT4oMuMF2oYun9Xdh`: API xác nhận `READY`; production alias `https://tien-lo-di-menh.vercel.app`. Chưa smoke HTTP/browser trực tiếp trên URL công khai: môi trường chặn host này với proxy 403. Yêu cầu lưu thêm hostname vào draft bị tool từ chối vì draft conflict; đã đọc lại draft, không coi thay đổi mạng là đã lưu hoặc áp dụng.
- Đã tạo `tien-lo-postgres` qua Neon/Vercel Marketplace, store `store_r4PTt9aty7slUcOd`, vùng Singapore (`sin1`), billing plan `free_v3` (Free), auth tích hợp Neon tắt vì app dùng Better Auth. Đã nối vào Vercel project HTTP 201; API env xác nhận `DATABASE_URL` và các biến PG/Postgres là sensitive, chỉ production. Không ghi giá trị secret vào repo/log.
- DB chưa chạy migrations hoặc kiểm kết nối từ game server; migrations tự chạy khi world khởi động. Vercel web hiện chưa có `GAME_SERVER_URL`, WSS endpoint hoặc shared proxy token, nên chưa đăng nhập/chơi realtime được.
- `render.yaml` chuẩn bị Docker Web Service một instance, Singapore, cổng 10000, health `/readyz`, nhánh `work`; auth/proxy secret generate, DATABASE_URL nhập bảo mật. Gói Free chỉ để bắt đầu thử, có thể ngủ; chưa có cam kết chi phí cho gói luôn chạy và chưa tạo dịch vụ Render.
