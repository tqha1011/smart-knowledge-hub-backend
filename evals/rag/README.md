# RAG correctness — chấm thủ công

Bộ câu hỏi nháp dùng để thử quy trình chấm correctness thủ công, trước khi mở rộng lên 50 câu. Câu hỏi và đáp án được soạn từ nội dung đã index trong DB. Câu trả lời thực tế được lưu riêng trong `results/`; nhãn correctness do người chấm điền.

## Nguồn dữ liệu

- Knowledge space: `HR Policies`.
- `knowledgeSpacePublicId`: `30000000-0000-4000-8000-000000000002`.
- Tài liệu: `Dev Team Guide.md`.
- `documentPublicId`: `b40f1139-57aa-4838-a6f3-bba138b4400e`.
- Nguồn đọc từ DB ngày 2026-10-07: tài liệu `Ready`, `Public`, có 1 chunk (`chunkIndex: 0`).
- Các đoạn `evidence.quote` đã được kiểm tra có trong nội dung chunk đọc được.

Đối chiếu lại câu hỏi, đáp án và bằng chứng trước khi chạy. Tài liệu có thể thay đổi sau thời điểm soạn bộ test. Không dùng tài liệu seed chưa có chunk hoặc AI mock để đo correctness.

## Dataset

Các dataset chứa một JSON object trên mỗi dòng:

| Trường                   | Ý nghĩa                                            |
| ------------------------ | -------------------------------------------------- |
| `id`                     | ID câu hỏi duy nhất trong bộ benchmark             |
| `knowledgeSpacePublicId` | Space phải dùng để gửi câu hỏi                     |
| `question`               | Câu hỏi gửi nguyên văn cho RAG                     |
| `expectedAnswer`         | Đáp án tham khảo để người chấm đối chiếu           |
| `requiredFacts`          | Các ý bắt buộc để tính đúng                        |
| `evidence`               | Tài liệu, vị trí chunk và trích đoạn hỗ trợ đáp án |

### Project Management — 20 câu mới

- Dataset: [project-management-20.jsonl](project-management-20.jsonl), ID Q11–Q30.
- Bản dễ đọc để duyệt câu hỏi, đáp án và bằng chứng trước khi chạy: [project-management-20.md](project-management-20.md).
- Space: `Project Management`, public ID `8bc470cb-b150-4916-8c56-9a74e4f7c15d`.
- Nguồn query từ DB ngày 2026-10-08: 5 tài liệu `Ready`, `Public`, tổng 90 chunk. Mỗi câu có trích đoạn khớp nguyên văn với chunk nguồn.

| Tài liệu                            | Câu hỏi | Nội dung chính                                   |
| ----------------------------------- | ------- | ------------------------------------------------ |
| Đề cương DA1.pdf                    | Q11–Q14 | Đối tượng, phạm vi, cách đánh giá, mục tiêu      |
| Đặc tả dự án DA1.pdf                | Q15–Q18 | Ràng buộc đầu vào, quiz, lịch học, validate LLM  |
| Báo cáo công nghệ Nexus.docx        | Q19–Q22 | Hạ tầng, AI provider, PR, triển khai             |
| Báo cáo mô hình hóa.pdf             | Q23–Q26 | Rủi ro cache, penetration, avalanche, expiration |
| Quy trình tìm skill & resource.docx | Q27–Q30 | Node, slot tài liệu, import, review graph        |

Câu hỏi nêu rõ tài liệu cần đối chiếu vì đề cương và đặc tả có một số thông tin khác nhau. Bộ này gồm câu tra cứu và câu tình huống có đáp án trong tài liệu; chưa đo khả năng từ chối khi thiếu thông tin. Giữ riêng kết quả pilot và bộ mới; có thể tổng hợp 30 câu đã chấm nhưng cần công bố cả kết quả từng bộ.

## Quy tắc chấm

- `CORRECT`: đủ mọi ý trong `requiredFacts`, đúng số liệu và điều kiện, không có khẳng định sai hoặc mâu thuẫn với tài liệu. Chấp nhận cách diễn đạt tương đương.
- `INCORRECT`: thiếu ý bắt buộc, sai số liệu/điều kiện, thêm thông tin sai hoặc từ chối dù tài liệu có đáp án.
- `ERROR`: lỗi API hoặc không nhận được kết quả để chấm; không tính như câu trả lời sai và không âm thầm bỏ khỏi báo cáo.

Không dùng so khớp nguyên văn hay `indexOf()` để chấm correctness. Việc đoạn bằng chứng tồn tại không chứng minh rằng câu trả lời đúng.

## Chạy và ghi kết quả

### Thu thập câu trả lời bằng script

Chạy từ thư mục gốc repo. Script đọc `.env` và cần `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_EMBEDDING_MODEL`, `GROQ_API_KEY`. DB phải đang chạy và Prisma client đã được generate.

Thử một câu, sử dụng public ID của user có quyền trong space:

```bash
npx tsx evals/rag/run.ts --user 10000000-0000-4000-8000-000000000001 --limit 1
```

ID trên là tài khoản admin seed đã dùng cho lần thử Q01. Thay bằng user thích hợp nếu dùng DB khác. Có thể cung cấp user qua `BENCHMARK_USER_PUBLIC_ID` thay cho `--user`.

Chạy toàn bộ 10 câu:

```bash
npx tsx evals/rag/run.ts --user 10000000-0000-4000-8000-000000000001 --limit 10
```

Mặc định script chỉ chạy câu đầu tiên. Mỗi lần chạy tạo một bộ file mới theo timestamp, không ghi đè kết quả cũ. `--limit 10` chạy lại từ Q01; không coi lần thử Q01 và lần chạy toàn bộ là hai câu độc lập khi tính correctness.

Chạy 20 câu mới trong Project Management, không chạy lại pilot:

```bash
npx tsx evals/rag/run.ts --user 10000000-0000-4000-8000-000000000001 --dataset evals/rag/project-management-20.jsonl --limit 20
```

User admin trên đã được kiểm tra là Owner của space Project Management khi query DB. Để thử riêng Q11, dùng cùng lệnh với `--limit 1`. Nếu không truyền `--dataset`, script vẫn dùng `pilot-10.jsonl`; giới hạn tối đa bằng số câu của dataset đã chọn.

Script gọi trực tiếp `ChatAnswerService` với Gemini embedding, pgvector và Groq thật, không đi qua HTTP API. Nó kiểm tra membership và bằng chứng nguồn trước khi gọi AI, chỉ gửi câu hỏi và context truy xuất cho Groq; không gửi đáp án chuẩn. Nó không tạo chat session hay job sinh tiêu đề. Cache bị tắt riêng trong runner để tránh dữ liệu mock; `.env` và backend đang chạy không bị đổi. `LOAD_TEST_MOCK_AI=true` trong `.env` không ảnh hưởng vì runner khởi tạo rõ các client AI thật.

Các câu chạy tuần tự, cách nhau 30 giây. Khi pipeline trả lỗi, script lưu `ERROR` và dừng, không tự retry. Lần chạy này vẫn tốn quota embedding và sinh câu trả lời; không gọi thêm LLM giám khảo.

File được tạo trong `results/`:

- `TIMESTAMP.csv`: câu trả lời nguyên văn; `verdict` và `reason` để trống cho người chấm.
- `TIMESTAMP.answers.jsonl`: kết quả đầy đủ, gồm câu hỏi, câu trả lời và context nguồn dùng để sinh câu trả lời.
- `TIMESTAMP.meta.json`: thời điểm chạy, user, ID câu hỏi, đường dẫn và hash dataset, Git commit, embedding model, client sinh câu trả lời và chế độ cache.

Có thể chỉ định đường dẫn CSV bằng `--out <path.csv>`; các file JSONL và metadata được lưu cạnh CSV. Script từ chối ghi đè file đã tồn tại.

### Đọc dễ hơn và chấm vào file ngắn

JSONL giữ mỗi record trên một dòng. Tạo bản Markdown dễ đọc và CSV chỉ chứa nhãn chấm, không cần gọi lại LLM:

```bash
python3 evals/rag/review.py evals/rag/results/TIMESTAMP.answers.jsonl
```

Thay `TIMESTAMP` bằng timestamp của lần chạy. Mở `TIMESTAMP.review.md` bằng Markdown Preview để xem từng câu hỏi, đáp án chuẩn, các ý bắt buộc, câu trả lời RAG và bằng chứng nguồn.

Script chấm tự chọn dataset theo `datasetPath` trong metadata; kết quả hôm qua chưa có trường này vẫn đối chiếu với pilot 10 câu. Không cần truyền lại đường dẫn dataset khi tạo bản đọc.

Điền `verdict` và `reason` trong `TIMESTAMP.grades.csv`; file này chỉ có các cột `id,verdict,reason`, không chứa câu trả lời nhiều dòng. Dùng `CORRECT` hoặc `INCORRECT` theo quy tắc trên; giữ `ERROR` nếu pipeline lỗi. Không sửa các ID. Khi tạo lại bản đọc, script giữ nguyên file chấm đã tồn tại.

Sau khi chấm, đồng bộ nhãn vào CSV kết quả gốc:

```bash
python3 evals/rag/review.py evals/rag/results/TIMESTAMP.answers.jsonl --apply-grades
```

Lệnh này cập nhật `verdict`, `reason` trong `TIMESTAMP.csv`, giữ nguyên câu trả lời và báo số câu đúng, đã chấm, lỗi, chưa chấm. JSONL gốc không thay đổi. Nếu dataset đã bị sửa từ lúc chạy benchmark, lệnh tạo bản đọc sẽ báo lỗi để tránh đối chiếu nhầm đáp án chuẩn.

### Chấm tay hoặc chạy qua ứng dụng

1. Duyệt và chốt dataset trước khi chạy; kiểm tra user có quyền truy cập space và tài liệu nguồn.
2. Nếu chạy qua ứng dụng, dùng RAG thật với `LOAD_TEST_MOCK_AI=false` và session dành cho benchmark trong space đã chỉ định. Nếu dùng script, các client AI thật đã được khởi tạo riêng.
3. Gửi mỗi câu một lần, lưu nguyên văn câu trả lời và chấm theo quy tắc trên. Với script, mở CSV đã tạo và chỉ điền `verdict`, `reason`.
4. Ghi kết quả vào `results/YYYY-MM-DD.csv`. Nếu chạy nhiều lần trong cùng ngày, thêm hậu tố để không ghi đè.
5. Ghi kèm model, cấu hình RAG, Git commit, người chấm và thời điểm chạy trong `results/YYYY-MM-DD.md`.
6. Giữ lại mọi câu sai. Script hiện chưa tự resume; nếu thiếu câu do lỗi/quota, có thể hỏi những câu còn thiếu qua ứng dụng và ghi lại nguồn thu thập. Không chọn lại câu đã trả lời sai.

CSV dùng các cột:

```csv
id,actualAnswer,verdict,reason
```

Bao chuỗi trong dấu nháy kép khi chứa dấu phẩy hoặc xuống dòng; escape dấu nháy kép bằng hai dấu nháy kép.

Correctness = số câu `CORRECT` / số câu đã chấm (`CORRECT` + `INCORRECT`). Báo thêm số câu đã chấm trên tổng số câu dự kiến và số `ERROR`; benchmark chưa hoàn tất nếu còn câu chưa chấm. Khi đủ kết quả, báo dạng “đúng X/10 câu pilot” hoặc “đúng X/20 câu Project Management”.

Không lưu JWT, API key hoặc thông tin đăng nhập trong dataset hay kết quả.

## Giới hạn

Pilot dùng một tài liệu và một chunk; bộ Project Management bổ sung 5 tài liệu, mỗi tài liệu 4 câu. Các câu được soạn có chủ đích, chưa đại diện cho toàn bộ câu hỏi thực tế. Correctness chỉ phản ánh bộ benchmark đã đo; không phải xác suất đúng của mọi câu trả lời và không chứng minh mức cải thiện khi chưa có baseline.
