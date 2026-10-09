# Test RAG — Q31–Q50

**CORPUS GIẢ LẬP:** 100 tài liệu, 10 chủ đề; mọi số liệu và chính sách đều mô phỏng.

Space: `37c6da52-99f1-5465-a49c-6ec0cc721737`. Bằng chứng đọc từ chunks DB sau khi đủ 100 tài liệu Ready.

8 câu tra cứu, 8 câu tình huống, 4 câu tổng hợp nhiều đoạn trong cùng tài liệu. 20 tài liệu nguồn khác nhau; 80 tài liệu gây nhiễu. Chưa thu thập câu trả lời RAG hoặc chấm correctness.

## Q31

**Câu hỏi:** Theo tài liệu “Mây Trắng — Giới hạn thời gian API.md” của dự án Mây Trắng, timeout và số lần thử lại tối đa là bao nhiêu?

**Đáp án:** Timeout API của Mây Trắng là 740 ms; mỗi yêu cầu chỉ được thử lại tối đa 1 lần.

**Ý bắt buộc:**

- Timeout API của Mây Trắng là 740 ms; mỗi yêu cầu chỉ được thử lại tối đa 1 lần.

**Bằng chứng nguyên văn:**

- Mây Trắng — Giới hạn thời gian API.md — `ef95c775-4659-5e5f-969c-e17f8fd5cd4f`, chunk 0:

  > Timeout API của Mây Trắng là 740 ms; mỗi yêu cầu chỉ được thử lại tối đa 1 lần.

## Q32

**Câu hỏi:** Theo tài liệu “Sao Bắc — Khôi phục yêu cầu chậm.md” của dự án Sao Bắc, một thao tác ghi chưa có khóa idempotency vượt timeout. Phải xử lý thế nào?

**Đáp án:** Khi độ trễ vượt 780 ms, trả mã RAG-BE-504 và không tự gửi lại thao tác ghi chưa có khóa idempotency.

**Ý bắt buộc:**

- Khi độ trễ vượt 780 ms, trả mã RAG-BE-504 và không tự gửi lại thao tác ghi chưa có khóa idempotency.

**Bằng chứng nguyên văn:**

- Sao Bắc — Khôi phục yêu cầu chậm.md — `1498a900-0144-57df-8eb9-7c4ad6767f55`, chunk 0:

  > Khi độ trễ vượt 780 ms, trả mã RAG-BE-504 và không tự gửi lại thao tác ghi chưa có khóa idempotency.

## Q33

**Câu hỏi:** Theo tài liệu “Mây Trắng — Lưu bản nháp biểu mẫu.md” của dự án Mây Trắng, chu kỳ lưu và hạn dùng của bản nháp là bao nhiêu?

**Đáp án:** Bản nháp của Mây Trắng được lưu mỗi 6 giây và hết hạn sau 22 giờ.

**Ý bắt buộc:**

- Bản nháp của Mây Trắng được lưu mỗi 6 giây và hết hạn sau 22 giờ.

**Bằng chứng nguyên văn:**

- Mây Trắng — Lưu bản nháp biểu mẫu.md — `637843bf-43fc-5839-95f0-7b865d54f26c`, chunk 0:

  > Bản nháp của Mây Trắng được lưu mỗi 6 giây và hết hạn sau 22 giờ.

## Q34

**Câu hỏi:** Theo tài liệu “Sao Bắc — Xử lý mất kết nối.md” của dự án Sao Bắc, người dùng mất mạng khi đang nhập biểu mẫu. Cần xử lý nút gửi và bản nháp thế nào, và khi nào được gửi?

**Đáp án:** Khi mất mạng, giữ bản nháp tại máy và khóa nút gửi; chỉ gửi sau khi kết nối phục hồi và người dùng xác nhận.

**Ý bắt buộc:**

- Khi mất mạng, giữ bản nháp tại máy và khóa nút gửi; chỉ gửi sau khi kết nối phục hồi và người dùng xác nhận.

**Bằng chứng nguyên văn:**

- Sao Bắc — Xử lý mất kết nối.md — `e2685f1d-a2f2-5df5-970a-8d1bf24b7345`, chunk 0:

  > Khi mất mạng, giữ bản nháp tại máy và khóa nút gửi; chỉ gửi sau khi kết nối phục hồi và người dùng xác nhận.

## Q35

**Câu hỏi:** Theo tài liệu “Mây Trắng — Pool và timeout truy vấn.md” của dự án Mây Trắng, pool tối đa và statement_timeout là bao nhiêu?

**Đáp án:** Pool PostgreSQL của Mây Trắng có tối đa 12 kết nối; statement_timeout là 1600 ms.

**Ý bắt buộc:**

- Pool PostgreSQL của Mây Trắng có tối đa 12 kết nối; statement_timeout là 1600 ms.

**Bằng chứng nguyên văn:**

- Mây Trắng — Pool và timeout truy vấn.md — `2a6ebb10-9233-5e25-9629-192b700c2199`, chunk 0:

  > Pool PostgreSQL của Mây Trắng có tối đa 12 kết nối; statement_timeout là 1600 ms.

## Q36

**Câu hỏi:** Theo tài liệu “Sao Bắc — Migration gặp khóa dài.md” của dự án Sao Bắc, migration chờ khóa hơn 5 giây. Phải tiếp tục bằng cách tăng timeout hay xử lý theo quy trình nào?

**Đáp án:** Nếu migration chờ khóa quá 5 giây, hủy migration và chuyển sang cửa sổ bảo trì; không tăng timeout ngay trên production.

**Ý bắt buộc:**

- Nếu migration chờ khóa quá 5 giây, hủy migration và chuyển sang cửa sổ bảo trì; không tăng timeout ngay trên production.

**Bằng chứng nguyên văn:**

- Sao Bắc — Migration gặp khóa dài.md — `ea43818a-6726-5b55-b911-1097d8d82a89`, chunk 0:

  > Nếu migration chờ khóa quá 5 giây, hủy migration và chuyển sang cửa sổ bảo trì; không tăng timeout ngay trên production.

## Q37

**Câu hỏi:** Theo tài liệu “Mây Trắng — TTL và jitter.md” của dự án Mây Trắng, TTL danh sách và jitter tối đa là bao nhiêu?

**Đáp án:** Cache danh sách của Mây Trắng có TTL 105 giây và jitter tối đa 6 giây.

**Ý bắt buộc:**

- Cache danh sách của Mây Trắng có TTL 105 giây và jitter tối đa 6 giây.

**Bằng chứng nguyên văn:**

- Mây Trắng — TTL và jitter.md — `a30ca822-23e3-5f14-9a2e-8de2d9142de7`, chunk 0:

  > Cache danh sách của Mây Trắng có TTL 105 giây và jitter tối đa 6 giây.

## Q38

**Câu hỏi:** Theo tài liệu “Sao Bắc — Đọc dữ liệu cũ có điều kiện.md” của dự án Sao Bắc, nguồn tạm lỗi nhưng quyền truy cập vừa thay đổi. Có thể đọc cache cũ không? Điều kiện đọc cache cũ bình thường là gì?

**Đáp án:** Chỉ đọc cache cũ trong 14 giây khi nguồn tạm lỗi và quyền không đổi; nếu quyền thay đổi phải bỏ cache và kiểm tra lại ở DB.

**Ý bắt buộc:**

- Chỉ đọc cache cũ trong 14 giây khi nguồn tạm lỗi và quyền không đổi; nếu quyền thay đổi phải bỏ cache và kiểm tra lại ở DB.

**Bằng chứng nguyên văn:**

- Sao Bắc — Đọc dữ liệu cũ có điều kiện.md — `bc0f8e46-4511-59c1-afb1-cf4440f3546d`, chunk 0:

  > Chỉ đọc cache cũ trong 14 giây khi nguồn tạm lỗi và quyền không đổi; nếu quyền thay đổi phải bỏ cache và kiểm tra lại ở DB.

## Q39

**Câu hỏi:** Theo tài liệu “Mây Trắng — Concurrency và attempts.md” của dự án Mây Trắng, concurrency và số attempts tối đa là bao nhiêu?

**Đáp án:** Worker của Mây Trắng chạy concurrency 3 và tối đa 3 attempts cho mỗi job.

**Ý bắt buộc:**

- Worker của Mây Trắng chạy concurrency 3 và tối đa 3 attempts cho mỗi job.

**Bằng chứng nguyên văn:**

- Mây Trắng — Concurrency và attempts.md — `f7168db5-1118-5139-ab08-72ddb2ea7f2a`, chunk 0:

  > Worker của Mây Trắng chạy concurrency 3 và tối đa 3 attempts cho mỗi job.

## Q40

**Câu hỏi:** Theo tài liệu “Sao Bắc — Chuyển job lỗi sang DLQ.md” của dự án Sao Bắc, job đã thất bại hết 4 attempts. Job phải đi đâu và điều kiện replay là gì?

**Đáp án:** Sau 4 attempts thất bại, chuyển job sang DLQ và chỉ replay sau khi người trực đối soát tác dụng phụ.

**Ý bắt buộc:**

- Sau 4 attempts thất bại, chuyển job sang DLQ và chỉ replay sau khi người trực đối soát tác dụng phụ.

**Bằng chứng nguyên văn:**

- Sao Bắc — Chuyển job lỗi sang DLQ.md — `84736b7e-fd79-5e80-b754-9e081628d5f2`, chunk 0:

  > Sau 4 attempts thất bại, chuyển job sang DLQ và chỉ replay sau khi người trực đối soát tác dụng phụ.

## Q41

**Câu hỏi:** Theo tài liệu “Mây Trắng — Cổng kiểm tra phát hành.md” của dự án Mây Trắng, các kiểm tra bắt buộc trước phát hành là gì, và image ở staging có quan hệ thế nào với production?

**Đáp án:** Phát hành Mây Trắng cần unit test, kiểm tra migration và smoke test staging đều đạt; cùng một image digest được dùng ở staging và production.

**Ý bắt buộc:**

- Phát hành Mây Trắng cần unit test, kiểm tra migration và smoke test staging đều đạt; cùng một image digest được dùng ở staging và production.

**Bằng chứng nguyên văn:**

- Mây Trắng — Cổng kiểm tra phát hành.md — `650ca9bf-f04a-5c28-af92-dab560654b98`, chunk 0:

  > Phát hành Mây Trắng cần unit test, kiểm tra migration và smoke test staging đều đạt; cùng một image digest được dùng ở staging và production.

## Q42

**Câu hỏi:** Theo tài liệu “Sao Bắc — Rollback khi smoke test lỗi.md” của dự án Sao Bắc, smoke test production lỗi trong 7 phút đầu. Cần xử lý artifact và lưu lượng thế nào?

**Đáp án:** Nếu smoke test production lỗi trong 7 phút đầu, quay về digest đã xác minh trước đó và tạm dừng tăng lưu lượng.

**Ý bắt buộc:**

- Nếu smoke test production lỗi trong 7 phút đầu, quay về digest đã xác minh trước đó và tạm dừng tăng lưu lượng.

**Bằng chứng nguyên văn:**

- Sao Bắc — Rollback khi smoke test lỗi.md — `6bea77a9-bdfa-5a0a-837a-e4e96ae16156`, chunk 0:

  > Nếu smoke test production lỗi trong 7 phút đầu, quay về digest đã xác minh trước đó và tạm dừng tăng lưu lượng.

## Q43

**Câu hỏi:** Theo tài liệu “Mây Trắng — Thời hạn token và khóa đăng nhập.md” của dự án Mây Trắng, access token sống bao lâu và điều kiện khóa đăng nhập là gì?

**Đáp án:** Access token của Mây Trắng sống 9 phút; khóa đăng nhập 12 phút sau 5 lần sai liên tiếp.

**Ý bắt buộc:**

- Access token của Mây Trắng sống 9 phút; khóa đăng nhập 12 phút sau 5 lần sai liên tiếp.

**Bằng chứng nguyên văn:**

- Mây Trắng — Thời hạn token và khóa đăng nhập.md — `8b9f886d-b240-574f-91e2-ea10e868c324`, chunk 0:

  > Access token của Mây Trắng sống 9 phút; khóa đăng nhập 12 phút sau 5 lần sai liên tiếp.

## Q44

**Câu hỏi:** Theo tài liệu “Sao Bắc — Ứng phó khóa dịch vụ bị lộ.md” của dự án Sao Bắc, nghi khóa dịch vụ đã bị lộ. Những bước xử lý và khoảng thời gian log cần kiểm tra là gì?

**Đáp án:** Khi nghi khóa dịch vụ bị lộ, thu hồi khóa, cấp khóa mới và kiểm tra log đã che dữ liệu trong 14 giờ gần nhất.

**Ý bắt buộc:**

- Khi nghi khóa dịch vụ bị lộ, thu hồi khóa, cấp khóa mới và kiểm tra log đã che dữ liệu trong 14 giờ gần nhất.

**Bằng chứng nguyên văn:**

- Sao Bắc — Ứng phó khóa dịch vụ bị lộ.md — `9e839116-ab58-547e-9eed-44a4edd8f831`, chunk 0:

  > Khi nghi khóa dịch vụ bị lộ, thu hồi khóa, cấp khóa mới và kiểm tra log đã che dữ liệu trong 14 giờ gần nhất.

## Q45

**Câu hỏi:** Theo tài liệu “Mây Trắng — SLO và điều kiện cảnh báo.md” của dự án Mây Trắng, SLO, cửa sổ đo và điều kiện cảnh báo lỗi là gì?

**Đáp án:** SLO của Mây Trắng là 99.01% yêu cầu thành công trong 28 ngày; cảnh báo khi lỗi vượt 1.1% liên tục 4 phút.

**Ý bắt buộc:**

- SLO của Mây Trắng là 99.01% yêu cầu thành công trong 28 ngày; cảnh báo khi lỗi vượt 1.1% liên tục 4 phút.

**Bằng chứng nguyên văn:**

- Mây Trắng — SLO và điều kiện cảnh báo.md — `8da0a966-9eef-528a-a4b4-264e6b307c7b`, chunk 0:

  > SLO của Mây Trắng là 99.01% yêu cầu thành công trong 28 ngày; cảnh báo khi lỗi vượt 1.1% liên tục 4 phút.

## Q46

**Câu hỏi:** Theo tài liệu “Sao Bắc — Ngân sách lỗi và phát hành.md” của dự án Sao Bắc, đã dùng hơn 46% ngân sách lỗi tuần. Những loại phát hành nào còn được phép và ai duyệt?

**Đáp án:** Khi đã dùng hơn 46% ngân sách lỗi tuần, tạm dừng phát hành tính năng và chỉ cho phép bản sửa tăng độ ổn định được người trực duyệt.

**Ý bắt buộc:**

- Khi đã dùng hơn 46% ngân sách lỗi tuần, tạm dừng phát hành tính năng và chỉ cho phép bản sửa tăng độ ổn định được người trực duyệt.

**Bằng chứng nguyên văn:**

- Sao Bắc — Ngân sách lỗi và phát hành.md — `1cc3427f-85a9-516b-869c-f42afe516b74`, chunk 0:

  > Khi đã dùng hơn 46% ngân sách lỗi tuần, tạm dừng phát hành tính năng và chỉ cho phép bản sửa tăng độ ổn định được người trực duyệt.

## Q47

**Câu hỏi:** Theo tài liệu “Mây Trắng — Tách luồng báo cáo.md”, hãy tổng hợp cách phân chia luồng, điều kiện tách dịch vụ và điều kiện quay về đường xử lý cũ.

**Đáp án:** Mây Trắng giữ thao tác ghi phiếu trong API đồng bộ và chuyển tác vụ phụ sang worker qua outbox trong cùng transaction. Chỉ tách dịch vụ khi tác vụ phụ chiếm hơn 23% thời gian API trong 4 ngày liên tiếp và có nhóm vận hành nhận trách nhiệm. Nếu độ trễ sự kiện vượt 25 giây trong 3 phút, tắt cờ tách luồng và dùng đường xử lý cũ đã kiểm tra.

**Ý bắt buộc:**

- Mây Trắng giữ thao tác ghi phiếu trong API đồng bộ và chuyển tác vụ phụ sang worker qua outbox trong cùng transaction.
- Chỉ tách dịch vụ khi tác vụ phụ chiếm hơn 23% thời gian API trong 4 ngày liên tiếp và có nhóm vận hành nhận trách nhiệm.
- Nếu độ trễ sự kiện vượt 25 giây trong 3 phút, tắt cờ tách luồng và dùng đường xử lý cũ đã kiểm tra.

**Bằng chứng nguyên văn:**

- Mây Trắng — Tách luồng báo cáo.md — `59429234-dfd3-5fe1-927c-89308fdb10c6`, chunk 0:

  > Mây Trắng giữ thao tác ghi phiếu trong API đồng bộ và chuyển tác vụ phụ sang worker qua outbox trong cùng transaction.

- Mây Trắng — Tách luồng báo cáo.md — `59429234-dfd3-5fe1-927c-89308fdb10c6`, chunk 0:

  > Chỉ tách dịch vụ khi tác vụ phụ chiếm hơn 23% thời gian API trong 4 ngày liên tiếp và có nhóm vận hành nhận trách nhiệm.

- Mây Trắng — Tách luồng báo cáo.md — `59429234-dfd3-5fe1-927c-89308fdb10c6`, chunk 1:

  > Nếu độ trễ sự kiện vượt 25 giây trong 3 phút, tắt cờ tách luồng và dùng đường xử lý cũ đã kiểm tra.

## Q48

**Câu hỏi:** Theo tài liệu “Sao Bắc — Tách luồng thông báo.md”, hãy tổng hợp cách phân chia luồng, điều kiện tách dịch vụ và điều kiện quay về đường xử lý cũ.

**Đáp án:** Sao Bắc giữ thao tác ghi phiếu trong API đồng bộ và chuyển tác vụ phụ sang worker qua outbox trong cùng transaction. Chỉ tách dịch vụ khi tác vụ phụ chiếm hơn 26% thời gian API trong 5 ngày liên tiếp và có nhóm vận hành nhận trách nhiệm. Nếu độ trễ sự kiện vượt 30 giây trong 4 phút, tắt cờ tách luồng và dùng đường xử lý cũ đã kiểm tra.

**Ý bắt buộc:**

- Sao Bắc giữ thao tác ghi phiếu trong API đồng bộ và chuyển tác vụ phụ sang worker qua outbox trong cùng transaction.
- Chỉ tách dịch vụ khi tác vụ phụ chiếm hơn 26% thời gian API trong 5 ngày liên tiếp và có nhóm vận hành nhận trách nhiệm.
- Nếu độ trễ sự kiện vượt 30 giây trong 4 phút, tắt cờ tách luồng và dùng đường xử lý cũ đã kiểm tra.

**Bằng chứng nguyên văn:**

- Sao Bắc — Tách luồng thông báo.md — `2f3498ca-735b-561a-b1df-32aca5054dca`, chunk 0:

  > Sao Bắc giữ thao tác ghi phiếu trong API đồng bộ và chuyển tác vụ phụ sang worker qua outbox trong cùng transaction.

- Sao Bắc — Tách luồng thông báo.md — `2f3498ca-735b-561a-b1df-32aca5054dca`, chunk 0:

  > Chỉ tách dịch vụ khi tác vụ phụ chiếm hơn 26% thời gian API trong 5 ngày liên tiếp và có nhóm vận hành nhận trách nhiệm.

- Sao Bắc — Tách luồng thông báo.md — `2f3498ca-735b-561a-b1df-32aca5054dca`, chunk 1:

  > Nếu độ trễ sự kiện vượt 30 giây trong 4 phút, tắt cờ tách luồng và dùng đường xử lý cũ đã kiểm tra.

## Q49

**Câu hỏi:** Theo tài liệu “Mây Trắng — Điều kiện hoàn tất ticket.md”, hãy tổng hợp điều kiện hoàn tất ticket, phê duyệt và review hotfix, cùng cách xử lý khi lỗi tái hiện.

**Đáp án:** Ticket của Mây Trắng chỉ hoàn tất khi đủ tiêu chí chấp nhận, bằng chứng test và review của người khác người viết. Hotfix cần người trực Incident duyệt trước khi triển khai; bổ sung review độc lập trong 14 giờ sau triển khai. Nếu lỗi tái hiện sau hotfix, mở lại ticket, quay về bản ổn định và tổ chức đối soát trong 3 ngày làm việc.

**Ý bắt buộc:**

- Ticket của Mây Trắng chỉ hoàn tất khi đủ tiêu chí chấp nhận, bằng chứng test và review của người khác người viết.
- Hotfix cần người trực Incident duyệt trước khi triển khai; bổ sung review độc lập trong 14 giờ sau triển khai.
- Nếu lỗi tái hiện sau hotfix, mở lại ticket, quay về bản ổn định và tổ chức đối soát trong 3 ngày làm việc.

**Bằng chứng nguyên văn:**

- Mây Trắng — Điều kiện hoàn tất ticket.md — `1ac905ab-4154-5b5a-84af-d5a2ac89cbe3`, chunk 0:

  > Ticket của Mây Trắng chỉ hoàn tất khi đủ tiêu chí chấp nhận, bằng chứng test và review của người khác người viết.

- Mây Trắng — Điều kiện hoàn tất ticket.md — `1ac905ab-4154-5b5a-84af-d5a2ac89cbe3`, chunk 0:

  > Hotfix cần người trực Incident duyệt trước khi triển khai; bổ sung review độc lập trong 14 giờ sau triển khai.

- Mây Trắng — Điều kiện hoàn tất ticket.md — `1ac905ab-4154-5b5a-84af-d5a2ac89cbe3`, chunk 1:

  > Nếu lỗi tái hiện sau hotfix, mở lại ticket, quay về bản ổn định và tổ chức đối soát trong 3 ngày làm việc.

## Q50

**Câu hỏi:** Theo tài liệu “Sao Bắc — Luồng hotfix khẩn cấp.md”, hãy tổng hợp điều kiện hoàn tất ticket, phê duyệt và review hotfix, cùng cách xử lý khi lỗi tái hiện.

**Đáp án:** Ticket của Sao Bắc chỉ hoàn tất khi đủ tiêu chí chấp nhận, bằng chứng test và review của người khác người viết. Hotfix cần người trực Incident duyệt trước khi triển khai; bổ sung review độc lập trong 16 giờ sau triển khai. Nếu lỗi tái hiện sau hotfix, mở lại ticket, quay về bản ổn định và tổ chức đối soát trong 4 ngày làm việc.

**Ý bắt buộc:**

- Ticket của Sao Bắc chỉ hoàn tất khi đủ tiêu chí chấp nhận, bằng chứng test và review của người khác người viết.
- Hotfix cần người trực Incident duyệt trước khi triển khai; bổ sung review độc lập trong 16 giờ sau triển khai.
- Nếu lỗi tái hiện sau hotfix, mở lại ticket, quay về bản ổn định và tổ chức đối soát trong 4 ngày làm việc.

**Bằng chứng nguyên văn:**

- Sao Bắc — Luồng hotfix khẩn cấp.md — `c5495fbc-ca5a-5d8a-a74c-cce5463fe6aa`, chunk 0:

  > Ticket của Sao Bắc chỉ hoàn tất khi đủ tiêu chí chấp nhận, bằng chứng test và review của người khác người viết.

- Sao Bắc — Luồng hotfix khẩn cấp.md — `c5495fbc-ca5a-5d8a-a74c-cce5463fe6aa`, chunk 0:

  > Hotfix cần người trực Incident duyệt trước khi triển khai; bổ sung review độc lập trong 16 giờ sau triển khai.

- Sao Bắc — Luồng hotfix khẩn cấp.md — `c5495fbc-ca5a-5d8a-a74c-cce5463fe6aa`, chunk 1:

  > Nếu lỗi tái hiện sau hotfix, mở lại ticket, quay về bản ổn định và tổ chức đối soát trong 4 ngày làm việc.
