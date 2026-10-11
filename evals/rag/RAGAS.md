# Ragas — chấm bổ sung bằng Groq

Chấm lại **câu trả lời đã lưu**, không chạy retrieval, không index lại và không gọi Google. Điểm tự động giữ riêng với nhãn correctness chấm tay. Bộ mặc định gồm pilot Q01–Q10, Project Management Q11–Q30 và Test RAG Q31–Q50; 20 câu cuối dùng corpus 100 tài liệu **giả lập**.

## Model và metric

- Giám khảo: `qwen/qwen3.8-27b` qua Groq. Đây là model preview, ghi lại model và ngày chấm khi báo cáo.
- Faithfulness: tách các khẳng định trong câu trả lời rồi kiểm tra chúng có được context truy xuất hỗ trợ không.
- Context Recall: kiểm tra các khẳng định trong `expectedAnswer` có được context truy xuất hỗ trợ không. Đây là độ bao phủ thông tin của đáp án chuẩn, không phải Recall@K theo document ID.
- Dùng metric collections của Ragas 0.4.3, prompt gốc tiếng Anh, dữ liệu tiếng Việt giữ nguyên; không dịch hoặc thay prompt. Không cần embedding để chấm hai metric này.
- Ragas 0.4.3 có lỗi factory Groq gọi `client.messages.create`; script dùng adapter Groq chính thức của Instructor và `InstructorLLM` của Ragas. `langchain-community` được khóa ở 0.3.31 vì bản 0.4.2 bỏ module VertexAI mà Ragas vẫn import.

Giám khảo khác model sinh câu trả lời trong code hiện tại (`openai/gpt-oss-120b`), nhưng các metadata benchmark cũ chỉ ghi tên client, không ghi model sinh cụ thể. Không suy diễn rằng mọi lần chạy cũ đều dùng model hiện tại.

## Cài đặt

Đã kiểm tra với Python 3.12. Đặt `GROQ_API_KEY` trong `.env` hoặc môi trường shell; script tự đọc `.env`, không xuất key ra log.

```bash
uv venv .tmp/ragas/venv --python 3.12
uv pip install --python .tmp/ragas/venv/bin/python -r evals/rag/requirements-ragas.txt
```

Kiểm tra input, không gọi API hoặc tạo kết quả:

```bash
.tmp/ragas/venv/bin/python evals/rag/ragas_groq.py --dry-run
.tmp/ragas/venv/bin/python -m unittest discover -s evals/rag -p test_ragas_groq.py
```

## Thử 5 câu rồi chạy tiếp

```bash
.tmp/ragas/venv/bin/python evals/rag/ragas_groq.py --limit 5 --max-requests 30
```

Mặc định lưu vào `evals/rag/results/ragas-groq-qwen-50/`. Kiểm tra điểm và lý do chấm trong `state.json` trước khi tiếp tục:

```bash
.tmp/ragas/venv/bin/python evals/rag/ragas_groq.py --limit 50 --max-requests 150
```

`--limit` chọn N câu đầu của bộ input, **bao gồm câu đã chấm**. Chạy tiếp `--limit 50` bỏ qua metric đã hoàn tất của 5 câu đầu. `--max-requests` chỉ giới hạn request mới trong lần gọi script. Mặc định `--limit 5`, `--max-requests 30` để tránh vô tình gọi cả bộ.

Chạy lại cùng lệnh sẽ tiếp tục metric còn thiếu. Những bước HTTP thành công được cache theo payload để không gọi lại phần đã xong của một metric bị gián đoạn. Không dùng cache này cho pipeline RAG của ứng dụng. Nếu provider trả JSON/schema/verdict sai, script dừng và giữ lỗi, loại riêng response lỗi khỏi cache để lần chạy tiếp có thể hỏi lại bước đó; không tự chuyển lỗi thành điểm 0 hay tự đổi model. Khi thay model/prompt/thư viện/đáp án hoặc cần chấm độc lập, dùng một `--out` mới; không chỉnh `state.json` để né kiểm tra provenance.

Nếu lỗi `IncompleteOutputException` kèm `finish_reason=length`, có thể tăng output cap **riêng bước đã bị cắt** bằng một lần chạy có chủ đích:

```bash
.tmp/ragas/venv/bin/python evals/rag/ragas_groq.py --limit 50 --max-requests 150 --repair-truncated-max-tokens 4096
```

Flag này không đổi model, prompt, baseline cap hoặc điểm đã xong. Checkpoint lưu `outputCapRepairs`, map payload gốc sang cap mới và cấu hình request trong metric mới; báo cáo phải công bố các ngoại lệ cap này. Bước khác vẫn dùng 2.048 token. Không tự tăng cap khi gặp lỗi tiếp theo; script lại dừng để kiểm tra. Giá trị sửa phải lớn hơn cap đã bị cắt, vẫn chịu mọi ngân sách. Các lần chạy sau dùng lại map đã ghi, không cần lặp flag sửa.

Xuất lại báo cáo, không gọi AI:

```bash
.tmp/ragas/venv/bin/python evals/rag/ragas_groq.py --report-only
```

Có thể chọn các run khác bằng `--answers <run1.answers.jsonl> <run2.answers.jsonl>` và thư mục riêng bằng `--out <directory>`. Script kiểm tra hash dataset, ID, câu hỏi, context, nhãn chấm và `aiMock=false` trước khi gọi AI. Hash toàn bộ input, model, phiên bản dependency và cấu hình metric được khóa vào checkpoint. Hai tiến trình không được ghi cùng output.

## Rate limit và chi phí

Groq Free hiện công bố cho model này: 30 RPM, 1.000 RPD, 8.000 TPM, 200.000 TPD. Xem [quota thực tế của tài khoản](https://console.groq.com/settings/limits); quota áp dụng ở cấp organization và có thể khác bảng công bố. Không bảo đảm đủ 50 câu trong một ngày vì context được gửi lại ở mỗi bước chấm.

Script mặc định:

- Cách nhau tối thiểu 4 giây ở **mọi request HTTP**, kể cả bước nội bộ của Ragas.
- Tối đa 900 request/ngày và 180.000 token/ngày trong ledger của output này (UTC).
- Dùng cửa sổ 61 giây, giới hạn 7.500 token/phút. Ước lượng bằng tokenizer `cl100k_base` nhân 1,15 cộng output cap 2.048; tokenizer này không phải tokenizer Qwen nên vẫn có thể gặp 429. Cập nhật usage thật sau mỗi response và lưu rate-limit headers.
- Nếu một request ước lượng vượt TPM, chỉ thử khi cửa sổ token đã trống rồi dùng usage/429 thật để quyết định; không cắt context để làm đẹp điểm.
- SDK không tự retry; Instructor chỉ có một attempt xử lý schema. Tầng HTTP retry 429 tối đa hai lần, tuân theo `retry-after`. Nếu reset quá 5 phút thì dừng để chạy tiếp sau.
- Dùng `--max-retries 0` để dừng ngay ở 429 đầu tiên; giá trị cho phép là 0, 1 hoặc 2, mặc định 2. Chính sách retry được lưu trong `invocations`, không thay đổi model hoặc điểm đã xong.
- Request được ghi trước khi gửi; nếu bị ngắt chưa nhận usage thì giữ ước lượng để không âm thầm bỏ qua chi phí.

Các flag `--requests-per-day`, `--tokens-per-day`, `--tokens-per-minute`, `--min-interval` cho phép đặt thấp hơn quota tài khoản; `--max-tokens` thay đổi output cap và provenance. Ledger không thấy usage của app hay output khác cùng organization; tránh chạy chấm song song với tác vụ AI khác. Ngày UTC của ledger là quy ước cục bộ, API headers/429 vẫn quyết định quota thật.

Ngân sách, pacing và lựa chọn sửa output cap được lưu trong `invocations` cho mỗi lần chấm; có thể điều chỉnh ngân sách khi resume mà không thay model/prompt. Những lần chạy trước khi có lịch sử invocation chỉ có ledger request và cấu hình baseline.

## File kết quả và cách báo cáo

- `state.json`: provenance, điểm từng metric, các statement/verdict/reason của giám khảo, checkpoint request/usage và response cache. Nội dung context có trong cache; chỉ dùng dữ liệu benchmark được phép gửi Groq.
- `scores.csv`: 50 dòng, điểm trống nếu chưa chấm/lỗi; giữ `manual_verdict` riêng.
- `summary.json`: mean từng metric, số đã chấm/tổng số; báo riêng ba dataset.
- `report.md`: tổng hợp và danh sách câu cần xem lại, gồm câu chưa hoàn tất hoặc có điểm dưới 1.

Điểm Faithfulness/Context Recall không thay thế correctness. Một câu đúng có thể đạt Faithfulness thấp nếu thêm khẳng định không có trong tài liệu; một câu sai vẫn có thể chỉ dùng các ý có trong context. Không biến điểm thành CORRECT/INCORRECT tự động; đối chiếu các lý do với tài liệu và nhãn chấm tay. Khi còn câu chưa chấm, công bố rõ mẫu số, không gọi đó là kết quả toàn bộ 50 câu.

## Snapshot ngày 11/10/2026

Run mặc định đã hoàn tất **50/50 câu**, đủ **100/100 điểm metric**, khoảng **22:21 ngày 11/10/2026, giờ Việt Nam**. Q50 đạt Faithfulness **0,7308** và Context Recall **1,0000**. Sau các lần 429, session chờ theo `retry-after` rồi tiếp tục metric còn thiếu; dừng gọi API khi Q50 hoàn tất. Người dùng yêu cầu tiếp tục dựa trên quota thật của provider nên ledger cục bộ được nới lên **500.000 token/ngày**; việc này không nâng quota Groq hoặc đổi model.

Faithfulness mean **0,9462** và Context Recall mean **0,9800**, cả hai trên **50/50 câu**. Pilot hoàn tất 10/10 câu (Faithfulness **0,9667**, Context Recall **1,0000**); Project Management hoàn tất 20/20 câu (**0,9514**, **0,9500**); Test RAG giả lập hoàn tất 20/20 câu (**0,9308**, **1,0000**). Đây là điểm của các câu benchmark, không phải đánh giá toàn bộ 100 tài liệu giả lập.

Toàn bộ run qua hai ngày đã gửi 201 request: 153 HTTP 200, 43 HTTP 429, 5 HTTP 503. Usage từ các response HTTP thành công là 466.629 token; ledger tính bảo thủ cộng dồn 844.431 token, gồm reservation của request không trả usage. HTTP 200 có thể chứa output bị cắt và chưa tạo điểm hợp lệ. Tổng cộng dồn không phải usage của riêng ngày 11/10. Q15, Q49 và Q50 mỗi câu có một bước bị cắt ở 2.048 token, được sửa có ghi lịch sử lên 4.096 và hoàn tất; mọi bước khác giữ cap gốc, gồm Context Recall của Q50.

Kiểm tra sau lần chạy cuối: CSV có đúng 50 dòng `COMPLETE`, đủ 100 điểm hữu hạn trong [0, 1], không còn lỗi hoặc metric trống. Các điểm đã có trước lần resume giữ nguyên cả giá trị, lý do và thời điểm chấm; 135 file benchmark gốc giữ nguyên hash. Có 12 câu có ít nhất một metric dưới 1, cần đối chiếu lý do của giám khảo; nhãn chấm tay không bị sửa.

Q15 Context Recall bằng 0: ba điều kiện trong đáp án chuẩn không có trong context đã lưu. Nhãn chấm tay vẫn là `CORRECT`; cần xem lại câu này trước khi dùng kết quả chấm tay làm bằng chứng chất lượng. Các câu dưới 1 và lý do của giám khảo nằm trong [report.md](results/ragas-groq-qwen-50/report.md).

Q30 có một khẳng định bị giám khảo đánh dấu không được context hỗ trợ: người review phải xác nhận không có lỗi chu trình hoặc sắp xếp sai trong graph. Context phân công người review xác nhận thứ tự prerequisite hợp lý, còn nhóm tự kiểm tra cycle trước import; cần đối chiếu khi xem lại điểm Faithfulness 0,8.

Q40 đạt Faithfulness 0,6667: giám khảo không chấp nhận hai ý diễn giải cơ chế replay và xác nhận replay an toàn. Q42 đạt Faithfulness 0,875: giám khảo không chấp nhận phần thêm điều kiện “cho đến khi kiểm tra lại” khi dừng tăng traffic. Context Recall của cả hai câu bằng 1. Cần xem lý do và context trước khi kết luận đáp án sai; không tự thay nhãn chấm tay.

Q44 đạt Faithfulness 0,875: giám khảo không chấp nhận phần diễn giải kiểm tra log 14 giờ nhằm phát hiện rò rỉ hoặc hành vi bất thường. Context nêu thao tác kiểm tra dữ liệu đã masking, không nêu trực tiếp mục đích diễn giải đó; cần đối chiếu khi xem lại điểm.

Q46 đạt Faithfulness 0,75: giám khảo không chấp nhận khẳng định dự án Sao Bắc đã tiêu thụ hơn 46% ngân sách lỗi tuần, vì context nêu quy định có điều kiện khi vượt ngưỡng này. Cần đối chiếu cả câu hỏi, câu trả lời và statement do giám khảo tách trước khi kết luận lỗi ở câu trả lời.

Q48 đạt Faithfulness 0,8182: giám khảo đánh dấu hai ý gán quy định giữ đường xử lý cũ 9 ngày của Mây Trắng sang Sao Bắc. Cần đối chiếu tài liệu và nguồn trong câu trả lời để xem có nhầm nguồn giữa các bối cảnh giả lập hay không.

Q49 đạt Faithfulness 0,9: giám khảo đánh dấu hai ý về thời điểm ghi thông tin ticket và quay về bản ổn định là chưa được context hỗ trợ. Lý do và các statement được lưu trong báo cáo để đối chiếu với câu trả lời và tài liệu.

Q50 đạt Faithfulness 0,7308: giám khảo đánh dấu 7/26 khẳng định chưa được context hỗ trợ, gồm diễn giải mục đích review/đối soát, cập nhật lịch báo cáo và thời hạn đối soát giữa các đoạn. Context Recall bằng 1. Cần đối chiếu câu trả lời với các đoạn nguồn và lý do chấm trước khi kết luận lỗi.

Không còn câu cần resume. Header reset requests chỉ phản ánh RPD, reset tokens chỉ phản ánh TPM; không dùng chúng để hẹn thời điểm hồi đầy TPD. Tài liệu Groq không nêu mốc hồi đầy TPD; 07:00 giờ Việt Nam chỉ là ranh giới ngày UTC của ledger cục bộ. Có thể xuất lại báo cáo mà không gọi API:

```bash
.tmp/ragas/venv/bin/python evals/rag/ragas_groq.py --report-only
```

Tham khảo: [metric Ragas](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/), [adapter Groq](https://docs.ragas.io/en/stable/howtos/llm-adapters/), [model Groq](https://console.groq.com/docs/models), [rate limits Groq](https://console.groq.com/docs/rate-limits).
