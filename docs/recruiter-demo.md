# Recruiter demo: FE và Render Native Node

Trang login hiển thị **Vào bản demo** khi BE bật demo và tìm thấy space đã cấu hình. Mỗi khách được cấp một Employee tạm, membership Viewer trong `Test RAG`, JWT một giờ và 20 lượt hỏi. Không cần email/mật khẩu và không có refresh token. Tài khoản do admin cấp vẫn đăng nhập như trước.

Corpus `Test RAG` gồm 100 tài liệu **giả lập**, không phải dữ liệu doanh nghiệp thật. Demo cho phép đọc, tìm và tải tài liệu, hỏi AI và quản lý chat của chính khách. Không cho upload/sửa/xóa tài liệu, quản lý thành viên, xem knowledge gaps, đổi mật khẩu hoặc kết nối realtime. Mở nguồn trích dẫn hiển thị tài liệu Markdown để đối chiếu đáp án.

## 1. Chuẩn bị dữ liệu đích

BE cần PostgreSQL có pgvector, Redis hỗ trợ BullMQ, object storage S3 hiện có và khóa Gemini/Groq thật. Đặt bí mật trong môi trường hosting, không trong FE hoặc git. DB deploy phải có space cùng public ID và đủ documents/chunks/embeddings; deploy code không sao chép DB local.

Để dùng corpus đã index, chuyển dữ liệu DB cùng liên kết object storage bằng quy trình backup/restore hiện có. Nếu seed vào DB mới, đọc [TEST-RAG.md](../evals/rag/TEST-RAG.md): journal/provenance phải thuộc đúng lần seed, không dùng journal local đã hoàn tất cho DB trống. Không chạy seed chung hoặc script index trong build/start. AI cần dùng cùng embedding model với corpus.

Chạy migration từ máy có quyền kết nối **DB đích**, trước khi bật demo:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
```

Prisma CLI dùng `DIRECT_URL` nếu có, runtime dùng `DATABASE_URL`. Bỏ hẳn `DIRECT_URL` nếu không dùng; đừng để chuỗi rỗng. Migration mới chỉ thêm `demo_sessions` và `demo_daily_usage`, không sửa corpus. Không dùng `prisma migrate dev` hoặc `db push` trên DB deploy.

## 2. BE trên Render

Tạo Web Service với runtime **Node**, Node 24 (`NODE_VERSION=24`). Build:

```bash
npm ci --include=dev && npx prisma generate && npm run build
```

Start:

```bash
node dist/src/main.js
```

App đọc `PORT` do Render cung cấp. Cấu hình các biến DB, Redis, S3, JWT, Gemini/Groq trong `.env.example`, cùng:

```dotenv
NODE_ENV=production
DEMO_ENABLED=true
DEMO_KNOWLEDGE_SPACE_PUBLIC_ID=37c6da52-99f1-5465-a49c-6ec0cc721737
DEMO_SESSION_TTL_SECONDS=3600
DEMO_SESSION_QUESTION_LIMIT=20
DEMO_DAILY_QUESTION_LIMIT=200
AUTH_SELF_REGISTRATION_ENABLED=false
EMAIL_ENABLED=false
CORS_ALLOWED_ORIGINS=https://your-frontend.example
FRONTEND_URL=https://your-frontend.example
TRUST_PROXY_HOPS=1
LOAD_TEST_MOCK_AI=false
LOAD_TEST_AUTH_THROTTLE_BYPASS=false
```

`CORS_ALLOWED_ORIGINS` là danh sách origin chính xác, phân cách bằng dấu phẩy, không có path hoặc dấu `/` cuối; HTTP và WebSocket dùng cùng danh sách. `TRUST_PROXY_HOPS=1` dành cho một reverse proxy trước app; khi thay topology phải cấu hình lại để IP giới hạn phiên phản ánh khách thật. Chạy trực tiếp local dùng 0. Demo IP được lưu dưới dạng HMAC với `JWT_SECRET`.

Render Free chặn SMTP 25/465/587 nên cần `EMAIL_ENABLED=false`. OTP, recovery và admin tạo user qua email trả 503 trước thay đổi dữ liệu; email worker ghi nhận skip. Login tài khoản có sẵn và demo vẫn chạy. Khi dùng dịch vụ có SMTP, bật true và cung cấp đủ SMTP config. [Giới hạn Render Free](https://render.com/docs/free).

Render Free ngủ sau 15 phút không có truy cập, lần mở tiếp theo có thể mất khoảng một phút. FE hiện giải thích sau 8 giây, chờ tối đa 120 giây và cho thử lại thủ công. Free Postgres hết hạn sau 30 ngày; dùng DB bền vững để giữ portfolio lâu dài. Redis Free có thể mất trạng thái khi restart; app đăng ký lại cleanup scheduler khi khởi động. Lượt hỏi/IP admission được lưu trong PostgreSQL. [Render Free](https://render.com/docs/free), [pgvector trên Render](https://render.com/docs/postgresql-extensions), [Native Node deploy](https://render.com/docs/deploy-node-express-app).

## 3. FE

Deploy repo `smart-knowledge-hub-frontend` với Node 24:

```dotenv
VITE_API_BASE_URL=https://your-backend.onrender.com/api
```

```bash
npm ci
npm test
npm run build
```

Publish thư mục `dist`; cấu hình SPA rewrite mọi đường dẫn về `/index.html` để `/login` và `/spaces/:id` hoạt động khi refresh. Origin FE phải đúng biến CORS của BE. Biến `VITE_*` được đóng vào build: đổi URL phải build lại. Không đặt khóa AI, DB hoặc JWT vào FE.

Demo token nằm trong `sessionStorage`, phiên thường dùng `localStorage`; chuyển chế độ xóa token cũ. Banner luôn nhắc dữ liệu giả lập, thời gian còn lại và quota. Ba câu gợi ý chỉ điền input; người dùng bấm Send. Hết lượt vẫn đọc tài liệu và lịch sử chat; hết hạn đưa về login có giải thích. Thoát demo thu hồi phiên và xóa token local.

## 4. API và vận hành

| Endpoint                        | Hành vi                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /api/auth/demo-config`     | Public: enabled, durationSeconds, questionLimit, sampleQuestions                                |
| `POST /api/auth/demo-session`   | Public: accessToken, expiresAt, knowledgeSpacePublicId, remainingQuestions; không retry tự động |
| `GET /api/auth/demo-session`    | Bearer demo: thời hạn, quota còn lại, dailyQuestionBudgetExhausted, resetAt                     |
| `DELETE /api/auth/demo-session` | Bearer demo: revoke; 204                                                                        |

Giới hạn tạo phiên: 3 request/phút/IP và 5 phiên thành công/giờ/IP. Quota hỏi: 20/phiên, 200 toàn bộ demo/ngày UTC; request được chấp nhận tính lượt kể cả smalltalk/cache/AI lỗi. Validation và ownership bị từ chối không tính. Cập nhật quota trong transaction để nhiều request không vượt giới hạn. Không tự retry câu hỏi lỗi nếu chưa chủ động chấp nhận tốn lượt tiếp.

Cleanup BullMQ chạy hàng giờ, xóa user/chat tạm sau 24 giờ kể từ hết hạn hoặc revoke, giữ counter ngày 30 ngày. BE ngủ/offline thì cleanup chạy khi worker hoạt động lại. Không xóa documents/chunks/corpus. Tắt ngay demo bằng `DEMO_ENABLED=false` rồi restart/redeploy: guard từ chối token demo còn hạn, FE mới ẩn nút demo.

## 5. Kiểm tra trước khi chia sẻ URL

1. Kiểm tra public config enabled, vào demo, đúng `Test RAG` và banner.
2. Chọn câu timeout Mây Trắng, gửi một lần, xem đáp án và mở nguồn; lượt còn 19.
3. Thử reload và viewport mobile/desktop; xem tài liệu, tìm kiếm và lịch sử.
4. Kiểm tra guest bị từ chối space khác, thao tác ghi và chat người khác; logout rồi token cũ phải 401.
5. Kiểm tra tài khoản admin/employee có sẵn vẫn login bình thường. Với email tắt, OTP/recovery/admin-create phải 503 và không tạo user mới.
6. Chạy BE unit/build/lint và FE test/build/lint. Integration quota cần DB riêng đã migrate, tên chứa `demo_test_`:

```bash
DEMO_TEST_DATABASE_URL='postgresql://.../demo_test_example' npm run test:integration -- --runTestsByPath test/demo.integration-spec.ts
```

Integration tạo/xóa fixture của chính nó, không được trỏ vào DB corpus. FE live smoke chỉ chạy khi opt-in, cần BE local port 3179 và CORS `http://localhost:5179`, có real AI và corpus; dùng một phiên/lượt thực:

```bash
VITE_API_BASE_URL=http://localhost:3179/api VITE_DEMO_LIVE_TEST=true npm test -- src/test/demo-live.test.tsx
```

Deploy guide này không publish hoặc thay đổi hosting tự động. Không ghép hay chấm lại bộ benchmark 50 câu trong quá trình demo.

## Kiểm chứng triển khai local

Ngày 2026-10-09: BE 313 unit tests, 8 PostgreSQL integration tests; FE 19 unit tests và smoke React opt-in với API/AI thật đều pass. FE/BE build và lint toàn bộ pass. Smoke kiểm tra vào demo, một câu hỏi, quota còn 19, mở nội dung nguồn Markdown và thoát; kiểm tra riêng các route ghi/space khác, chat khác và thu hồi token. WebSocket transport thật chặn origin ngoài allowlist và chấp nhận origin được cấu hình.

DB corpus trước/sau giữ nguyên 100 Ready và 336 chunks, fingerprint SHA256 `c8704c0f6fadc0b2780b99cc0547c414ba183d023205975593d2aa0f6980e318`. 135 file RAG giữ nguyên; file grades mới được chỉnh bên ngoài trong lúc triển khai được bảo toàn. Không chạy thu thập benchmark mới. Phiên công cụ không có browser khả dụng, nên cần kiểm tra giao diện trực quan mobile/desktop ở checklist trên khi chia sẻ URL.
