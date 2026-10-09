# Test RAG — corpus giả lập và Q31–Q50

Space riêng `Test RAG`, public ID `37c6da52-99f1-5465-a49c-6ec0cc721737`, dành cho benchmark với 100 tài liệu nội bộ **giả lập**. Tên dự án, quy định, số liệu và sự cố đều mô phỏng; không phải tài liệu hay chính sách của tổ chức thật.

## Corpus

`corpus/test-rag/manifest.json` lưu ID corpus, public ID tài liệu, chủ đề, đường dẫn Markdown, SHA256, kích thước UTF-8 và độ dài. Corpus có 10 chủ đề, mỗi chủ đề 10 bài: backend, frontend, database, caching, queue, CI/CD, bảo mật, observability, kiến trúc hệ thống, quy trình phát triển.

Mỗi bài dài 1.089–1.151 đơn vị cách trắng tiếng Việt, theo cách đếm từ thông dụng trong trình soạn thảo; đây là các âm tiết/từ phân cách bởi khoảng trắng, không phải kết quả phân đoạn từ ngôn ngữ học. Các bài dùng mẫu chung theo chủ đề, với tên dự án và ngưỡng vận hành khác nhau. Một số tiêu đề biểu thị trọng tâm nhưng chưa có quy trình chuyên sâu riêng cho từng tiêu đề. Corpus này tạo nguồn gần nhau để gây nhiễu truy xuất; chưa đại diện cho 100 tài liệu thực tế độc lập.

Các nguồn Markdown có thể tái tạo cục bộ mà không gọi AI:

```bash
python3 evals/rag/generate-test-rag.py
node --import tsx evals/rag/test-rag.test.ts
```

Generator từ chối ghi đè byte khác với corpus đã tạo. Không chạy formatter lên Markdown/manifest sau khi seed: hash phải giữ nguyên.

## Seed, index và resume

Cần Prisma client đã generate, DB có pgvector, `.env` chứa `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_EMBEDDING_MODEL` và cấu hình S3 hiện có. Tài khoản admin benchmark mặc định là `10000000-0000-4000-8000-000000000001`.

```bash
npx tsx evals/rag/seed-test-rag.ts
```

Script tạo space, membership Owner và 10 category. Nó lưu file Markdown thật vào storage theo khóa chứa public ID và hash; document là `MD`, `Public`, có nội dung/kích thước đúng file. `DocumentStorageKey` được đặt trước upload để tiếp tục được sau gián đoạn. Không dùng API, queue ingestion hoặc seed chung.

Index dùng trực tiếp `ChunkingService`, **GeminiEmbeddingClient thật** và `DocumentChunkRepository`; `LOAD_TEST_MOCK_AI` không quyết định client. Repository lưu chunks/vectors và chuyển `Ready` trong cùng transaction. Script đối chiếu SHA256 nội dung, chunks/token count, dimensions 1536 và fingerprint float32 của vector sau khi ghi DB.

Các lần gọi embedding tuần tự, mặc định nghỉ 30 giây sau lần embedding trước; `--delay-ms` cho phép cấu hình nhịp khi dùng môi trường khác. Mỗi tài liệu chỉ có một batch dưới 100 chunks. Script không tự retry AI. Khi lỗi, lưu stage đã dừng vào `corpus/test-rag/indexing-progress.json`, giữ tài liệu chưa hoàn tất và thoát; chi tiết kết nối và khóa không xuất ra log.

Có thể thử một tài liệu hoặc dừng bằng SIGINT/SIGTERM. Script hoàn tất thao tác hiện tại rồi dừng ở ranh giới an toàn:

```bash
npx tsx evals/rag/seed-test-rag.ts --limit 1
npx tsx evals/rag/seed-test-rag.ts
```

`--limit` giới hạn số tài liệu mới index trong lần chạy, không đếm tài liệu Ready đã bỏ qua. Chạy lại kiểm tra và bỏ qua Ready khớp corpus/provenance. Tài liệu bị sửa, bị xóa, đổi quyền, đổi storage/chunks/vectors hoặc thiếu bằng chứng index thật sẽ khiến script dừng; không ghi đè để “sửa” chúng. Giữ journal cùng corpus khi chuyển sang môi trường khác; journal và DB phải thuộc cùng lần seed. Model embedding không được đổi giữa các lần tiếp tục.

Một PostgreSQL advisory lock ngăn chạy hai seed đồng thời. Tiến trình không lấy được lock không được ghi journal. Cuối đợt, script đọc lại metadata và toàn bộ chunks/vectors bằng transaction `RepeatableRead`; dataset lấy bằng chứng từ snapshot này.

Kiểm tra lại toàn bộ sau khi seed, không gọi AI hoặc sửa DB/storage/journal:

```bash
npx tsx evals/rag/seed-test-rag.ts --verify-only
```

Lệnh này vẫn cần cấu hình client; dataset phải khớp khi đã tồn tại. Nếu chưa có dataset và mọi nguồn đều Ready/khớp, bước cuối có thể tạo file dataset cục bộ.

## 20 câu mới và chấm

Chỉ khi đủ 100 tài liệu Ready, script tạo `test-rag-20.jsonl` và `test-rag-20.md`. Có 2 câu mỗi chủ đề từ 2 tài liệu khác nhau: tổng 20 tài liệu nguồn và 80 tài liệu còn lại gây nhiễu. Phân bổ gồm 8 câu tra cứu, 8 câu điều kiện/tình huống và 4 câu tổng hợp nhiều chunks của cùng tài liệu.

Mỗi câu có `expectedAnswer`, `requiredFacts` và bằng chứng nguyên văn với `documentPublicId`, `documentTitle`, `chunkIndex`. Blueprint trong manifest xác định câu hỏi/ý bắt buộc; bằng chứng cuối cùng chỉ được tạo sau khi đối chiếu chunks DB. Không so khớp đáp án nguyên văn để chấm correctness.

Chạy riêng bộ mới bằng runner hiện có khi muốn thu thập câu trả lời:

```bash
npx tsx evals/rag/run.ts --user 10000000-0000-4000-8000-000000000001 --dataset evals/rag/test-rag-20.jsonl --limit 20
python3 evals/rag/review.py evals/rag/results/TIMESTAMP.answers.jsonl
```

Runner không được gọi trong bước seed. Kiểm tra compatibility với `review.py` dùng fixture ở thư mục tạm, không tạo kết quả benchmark giả trong `results/`.

Giữ nguyên pilot Q01–Q10, Project Management Q11–Q30 và kết quả cũ. Chỉ tổng hợp thành 50 câu sau khi người dùng chấm bộ mới; công bố rõ phần 20 câu dựa trên corpus giả lập và báo riêng kết quả từng bộ.

Sau khi dataset được tạo, kiểm tra quy trình xuất file chấm bằng fixture tạm:

```bash
python3 evals/rag/check-test-rag-review.py
```

Lệnh chỉ kiểm tra cấu trúc file review và 20 dòng chấm trống, không gọi RAG, không tạo nhãn correctness thực tế và không ghi vào `results/`.
