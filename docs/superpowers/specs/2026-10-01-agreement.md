# Thiết kế được chấp thuận — Tiên Lộ: Dị Mệnh
Nguồn: ../plans/2026-10-01-tien-lo.md, phần A–F. Người dùng chấp thuận trong chat: thực hiện thiết kế/kế hoạch cùng các điểm bổ sung.
- Toàn bộ A–E là luật; F được tác giả triển khai tự thiết kế và version như balance v1, không giả nhận đã playtest.
- Thực hiện tuần tự T01–T28 trong checkout cloud hiện tại, không tạo worktree.
- Web trước, Android/iOS sau. Không dừng hỏi lại để chuyển task.
- Vercel host web/API; world process dùng VPS; không tự hứa Vercel chạy WebSocket liên tục.
- Không có công cụ Vercel trong phiên: chuẩn bị infra, phân biệt local/staging/production evidence.
- Không tự giả lập quyền truy cập, thiết bị, thanh toán. Thiếu quyền tiếp tục việc độc lập, ghi blocked.
- Phương thức: inline executing-plans, TDD; review độc lập cuối thay vì delegation cho từng task.
