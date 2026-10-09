"""Generate the explicitly fictional Vietnamese corpus without calling an AI API.

Stable IDs and bytes make the Markdown reviewable before paid indexing. Existing
files with different bytes are refused; this generator never repairs edited data.
Word counts use whitespace-separated Vietnamese syllables, as in common editors.
"""
import hashlib
import json
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parent / 'corpus/test-rag'
NAMESPACE = uuid.UUID('b74b0824-a120-48e5-a077-bb90e8f11eca')
PROJECTS = ['Mây Trắng', 'Sao Bắc', 'Sông Xanh', 'Tre Vàng', 'Cánh Buồm', 'Đồi Thông', 'Hải Đăng', 'Sen Hồng', 'Bình Minh', 'Gió Nam']
DOMAINS = ['đặt lịch phòng họp', 'quản lý phiếu mua hàng', 'tiếp nhận yêu cầu hỗ trợ', 'đăng ký khóa học', 'điều phối giao hàng', 'quản lý thiết bị', 'duyệt báo cáo vận hành', 'đặt chỗ sự kiện', 'quản lý hợp đồng', 'theo dõi hồ sơ kỹ thuật']
# Each topic has distinct subprocedures, a technical context and topic-specific
# examples. Similar projects deliberately use different operational thresholds.
TOPICS = [
 ('backend', 'Backend', 'API NestJS',
  'Controller nhận DTO đã kiểm tra, service quyết định nghiệp vụ, repository truy cập dữ liệu. Mã giao dịch phải được truyền xuyên suốt để hỗ trợ tra cứu khi khách hàng gửi lại yêu cầu.',
  ['Giới hạn thời gian API', 'Khôi phục yêu cầu chậm', 'Chống ghi trùng giao dịch', 'Phân trang hồ sơ', 'Kiểm tra DTO đầu vào', 'Phiên bản hợp đồng API', 'Lưu vết thay đổi', 'Xử lý lỗi nghiệp vụ', 'Tắt tiến trình an toàn', 'Kiểm soát tải đồng thời'],
  'một yêu cầu POST tạo phiếu đi qua guard, validation và transaction; mã phiếu chỉ được trả khi dữ liệu đã commit',
  'kiểm tra trace của controller, thời gian trong service và truy vấn của repository; phân biệt lỗi validation với lỗi kết nối'),
 ('frontend', 'Frontend', 'giao diện React',
  'Biểu mẫu dùng trạng thái có kiểu rõ ràng, thông báo lỗi đặt cạnh trường nhập, và bàn phím truy cập được mọi hành động. Bản nháp nằm trong phạm vi tài khoản và dự án đang mở.',
  ['Lưu bản nháp biểu mẫu', 'Xử lý mất kết nối', 'Danh sách ảo hóa', 'Phân quyền nút thao tác', 'Điều hướng bàn phím', 'Đồng bộ bộ lọc URL', 'Kiểm tra biểu mẫu dài', 'Tải lại dữ liệu nền', 'Xử lý phiên hết hạn', 'Hiển thị tiến độ tác vụ'],
  'người dùng nhập phiếu trên trình duyệt rồi chuyển sang danh sách; bản nháp và bộ lọc phải khôi phục theo đúng dự án',
  'kiểm tra trạng thái mạng, phiên tài khoản và phiên bản biểu mẫu; phân biệt lỗi máy chủ với dữ liệu nhập chưa hợp lệ'),
 ('database', 'Database', 'PostgreSQL',
  'Dữ liệu ghi qua transaction ngắn, khóa ngoại bảo vệ quan hệ, và chỉ mục được chọn từ truy vấn thực tế. Mọi migration đều có phép đo khóa và bản sao phục hồi trước khi áp dụng.',
  ['Pool và timeout truy vấn', 'Migration gặp khóa dài', 'Chỉ mục danh sách', 'Ghi nhận idempotency', 'Phục hồi bản sao lưu', 'Dọn dữ liệu lịch sử', 'Kiểm tra toàn vẹn', 'Đọc dữ liệu báo cáo', 'Chuyển đổi cột lớn', 'Theo dõi replication lag'],
  'một transaction tạo phiếu và các dòng chi tiết; truy vấn danh sách chỉ đọc trường cần thiết và dùng chỉ mục theo dự án',
  'kiểm tra pg_stat_activity, khóa đang chờ và kế hoạch truy vấn; tách vấn đề pool cạn khỏi vấn đề chỉ mục thiếu'),
 ('caching', 'Caching', 'Redis cache',
  'Cache chỉ tăng tốc dữ liệu đã được kiểm tra quyền ở nguồn. Khóa chứa mã dự án, phiên bản dữ liệu và loại truy vấn; giá trị rỗng có thời gian sống riêng để tránh truy cập lặp.',
  ['TTL và jitter', 'Đọc dữ liệu cũ có điều kiện', 'Khóa chống cache stampede', 'Cache kết quả rỗng', 'Xóa cache khi đổi quyền', 'Phiên bản khóa cache', 'Giới hạn bộ nhớ', 'Warmup danh sách', 'Theo dõi hit ratio', 'Đối chiếu cache với DB'],
  'truy vấn danh sách phiếu đã duyệt thử đọc khóa Redis trước; sau cache miss hệ thống lấy dữ liệu nguồn rồi ghi kèm phiên bản',
  'kiểm tra TTL còn lại, sự kiện invalidation và quyền hiện tại; không suy ra quyền người dùng chỉ từ việc khóa tồn tại'),
 ('queue', 'Queue', 'BullMQ worker',
  'Job mang mã nghiệp vụ và khóa idempotency. Worker xác nhận kết quả sau commit, ghi attempt và lưu lỗi ngắn gọn. Queue lỗi được tách khỏi luồng đang xử lý để người vận hành kiểm tra.',
  ['Concurrency và attempts', 'Chuyển job lỗi sang DLQ', 'Khử job trùng', 'Gia hạn khóa worker', 'Ưu tiên tác vụ khẩn', 'Dừng worker an toàn', 'Xử lý callback ngoài', 'Chia batch nhập liệu', 'Theo dõi tuổi job', 'Replay job đã đối soát'],
  'job xuất báo cáo tải danh sách phiếu, ghi file vào storage rồi cập nhật trạng thái; job lặp lại phải nhận biết file đã hoàn tất',
  'kiểm tra attemptsMade, khóa idempotency và thời điểm heartbeat; không replay khi tác dụng phụ của lần trước chưa được đối soát'),
 ('ci-cd', 'CI/CD', 'pipeline phát hành',
  'Artifact được build một lần rồi chuyển qua staging và production bằng cùng digest. Pipeline giữ bằng chứng kiểm tra, người phê duyệt và thời điểm phát hành để truy nguyên sự cố.',
  ['Cổng kiểm tra phát hành', 'Rollback khi smoke test lỗi', 'Kiểm tra migration CI', 'Quản lý artifact', 'Triển khai canary', 'Phê duyệt production', 'Đóng băng phát hành', 'Quét dependency', 'Đồng bộ cấu hình', 'Đối soát sau deploy'],
  'pipeline kiểm tra pull request, build image bất biến, triển khai staging rồi yêu cầu phê duyệt trước khi tăng lưu lượng production',
  'kiểm tra digest đang chạy, lịch sử deployment và kết quả smoke; không tạo image mới khi chỉ cần quay về bản đã xác minh'),
 ('security', 'Bảo mật', 'kiểm soát danh tính',
  'Máy chủ kiểm tra phiên và quyền trên từng thao tác, không dựa vào nút giao diện. Token, mật khẩu và dữ liệu riêng tư phải bị che trong log, ticket và tài liệu xử lý sự cố.',
  ['Thời hạn token và khóa đăng nhập', 'Ứng phó khóa dịch vụ bị lộ', 'Kiểm tra quyền tài liệu', 'Phân tách tenant', 'Luân chuyển secret', 'Xác minh webhook', 'Giới hạn tải file', 'Kiểm soát phiên quản trị', 'Bảo vệ dữ liệu nhạy cảm', 'Rà soát quyền định kỳ'],
  'người dùng mở tài liệu qua liên kết chia sẻ; hệ thống kiểm tra membership hiện tại trước khi trả nội dung hoặc ký URL tải',
  'kiểm tra quyền ở máy chủ, thời điểm thu hồi và phạm vi khóa; lưu bằng chứng đã che thông tin thay vì sao chép secret vào ticket'),
 ('observability', 'Observability', 'metrics và tracing',
  'Metric dùng nhãn có tập giá trị hữu hạn, trace nối các bước của một yêu cầu, log chứa mã tương quan. Dashboard mô tả khoảng thời gian và mẫu số trước khi so sánh hai đợt triển khai.',
  ['SLO và điều kiện cảnh báo', 'Ngân sách lỗi và phát hành', 'Tương quan log trace', 'Giới hạn nhãn metric', 'Lấy mẫu trace', 'Giám sát phụ thuộc', 'Theo dõi độ trễ đuôi', 'Kiểm tra cảnh báo giả', 'Runbook trực vận hành', 'Lưu giữ dữ liệu đo'],
  'một yêu cầu tạo phiếu có span API, DB và queue; dashboard chỉ đếm lỗi trong nhóm endpoint nghiệp vụ đã định nghĩa',
  'kiểm tra khoảng đo, số request và nhãn endpoint; phân biệt thiếu telemetry với việc dịch vụ thực sự đạt mục tiêu'),
 ('architecture', 'Kiến trúc hệ thống', 'ranh giới dịch vụ',
  'Mỗi quyết định kiến trúc ghi nhu cầu, lựa chọn, chi phí và điểm quay lại. Luồng đồng bộ bảo vệ nhất quán nghiệp vụ, luồng bất đồng bộ xử lý công việc có thể hoàn tất sau.',
  ['Tách luồng báo cáo', 'Tách luồng thông báo', 'Ranh giới module nghiệp vụ', 'Chọn outbox sự kiện', 'Đồng bộ dữ liệu đọc', 'Giảm phụ thuộc chéo', 'Phân chia tenant', 'Thiết kế đường phục hồi', 'Chuyển đổi từng phần', 'Đối chiếu quyết định ADR'],
  'API lưu phiếu và bản ghi outbox trong cùng transaction; bộ phát sự kiện chuyển công việc phụ sang worker khi transaction thành công',
  'kiểm tra chủ sở hữu dữ liệu, ranh giới transaction và độ trễ chấp nhận; quyết định dựa trên nhu cầu đo được của dự án'),
 ('development', 'Quy trình phát triển', 'quy trình thay đổi',
  'Ticket có mục tiêu kiểm chứng, pull request liên kết ticket, và người review khác người viết. Khi sự cố xảy ra, bản sửa tạm có hạn xử lý rõ ràng và phải được đối soát sau đó.',
  ['Điều kiện hoàn tất ticket', 'Luồng hotfix khẩn cấp', 'Chuẩn bị refinement', 'Phân chia task', 'Review thay đổi dữ liệu', 'Quản lý nợ kỹ thuật', 'Bàn giao ca trực', 'Viết biên bản sự cố', 'Kiểm tra hồi quy', 'Đánh giá cuối sprint'],
  'một ticket thay đổi trạng thái phiếu mô tả đầu vào, kết quả mong đợi và ví dụ lỗi; reviewer dùng các ví dụ để kiểm tra trước khi duyệt',
  'kiểm tra tiêu chí chấp nhận, bằng chứng test và người chịu trách nhiệm; không đánh dấu hoàn tất chỉ vì pull request đã được merge'),
]


def facts_for(topic, project, n):
    if topic == 'backend':
        return [f'Timeout API của {project} là {700+n*40} ms; mỗi yêu cầu chỉ được thử lại tối đa {n%3} lần.', f'Khi độ trễ vượt {700+n*40} ms, trả mã RAG-BE-504 và không tự gửi lại thao tác ghi chưa có khóa idempotency.', f'Mỗi khóa idempotency được giữ {18+n} giờ và gắn với mã dự án.', f'Giới hạn danh sách là {40+n*5} bản ghi trên một trang.', f'Trưởng nhóm Backend phê duyệt thay đổi timeout trước khi phát hành.', f'Kiểm tra lại trace sau {10+n} phút trước khi đóng sự cố.']
    if topic == 'frontend':
        return [f'Bản nháp của {project} được lưu mỗi {5+n} giây và hết hạn sau {20+n*2} giờ.', f'Khi mất mạng, giữ bản nháp tại máy và khóa nút gửi; chỉ gửi sau khi kết nối phục hồi và người dùng xác nhận.', f'Biểu mẫu phải kiểm tra mã phiếu, ngày hiệu lực và người phụ trách trước khi gửi.', f'Mỗi danh sách chỉ render đồng thời {25+n*5} dòng.', f'Nhóm Frontend kiểm tra thao tác bàn phím trước khi duyệt màn hình.', f'Sau khi phiên hết hạn, yêu cầu đăng nhập lại rồi kiểm tra bản nháp thuộc đúng tài khoản.']
    if topic == 'database':
        return [f'Pool PostgreSQL của {project} có tối đa {10+n*2} kết nối; statement_timeout là {1500+n*100} ms.', f'Nếu migration chờ khóa quá {3+n} giây, hủy migration và chuyển sang cửa sổ bảo trì; không tăng timeout ngay trên production.', f'Bản sao phục hồi phải được kiểm tra trong vòng {12+n} giờ trước migration.', f'Transaction ghi không chứa lời gọi HTTP ra ngoài.', f'Nhóm Database phê duyệt kế hoạch thực thi và phương án quay lại.', f'Sau migration, đối chiếu số phiếu và số dòng chi tiết theo từng dự án.']
    if topic == 'caching':
        return [f'Cache danh sách của {project} có TTL {90+n*15} giây và jitter tối đa {5+n} giây.', f'Chỉ đọc cache cũ trong {10+n*2} giây khi nguồn tạm lỗi và quyền không đổi; nếu quyền thay đổi phải bỏ cache và kiểm tra lại ở DB.', f'Cache kết quả rỗng chỉ sống {4+n} giây.', f'Khóa chống stampede được giữ {2+n} giây và chỉ một tiến trình tải lại nguồn.', f'Nhóm Platform duyệt mọi thay đổi cấu trúc khóa Redis.', f'Xóa khóa theo mã dự án sau khi transaction cập nhật hoàn tất.']
    if topic == 'queue':
        return [f'Worker của {project} chạy concurrency {2+n} và tối đa {2+n%3} attempts cho mỗi job.', f'Sau {2+n%3} attempts thất bại, chuyển job sang DLQ và chỉ replay sau khi người trực đối soát tác dụng phụ.', f'Khóa idempotency của job được lưu {24+n*2} giờ.', f'Batch nhập liệu có tối đa {50+n*10} dòng.', f'Nhóm Queue chịu trách nhiệm duyệt replay bằng ticket sự cố.', f'Worker dừng nhận job mới rồi chờ tối đa {30+n*5} giây cho job đang chạy.']
    if topic == 'ci-cd':
        return [f'Phát hành {project} cần unit test, kiểm tra migration và smoke test staging đều đạt; cùng một image digest được dùng ở staging và production.', f'Nếu smoke test production lỗi trong {5+n} phút đầu, quay về digest đã xác minh trước đó và tạm dừng tăng lưu lượng.', f'Canary khởi đầu với {5+n} phần trăm lưu lượng.', f'Phải quan sát canary liên tục {10+n*2} phút trước khi mở rộng.', f'Người trực Release phê duyệt production và ghi digest vào ticket.', f'Sau rollback, giữ artifact lỗi để phân tích và chạy lại smoke trên bản phục hồi.']
    if topic == 'security':
        return [f'Access token của {project} sống {8+n} phút; khóa đăng nhập {10+n*2} phút sau {4+n%3} lần sai liên tiếp.', f'Khi nghi khóa dịch vụ bị lộ, thu hồi khóa, cấp khóa mới và kiểm tra log đã che dữ liệu trong {12+n} giờ gần nhất.', f'Liên kết tải tài liệu chỉ có hiệu lực {60+n*15} giây.', f'Quyền truy cập phải được kiểm tra lại trên máy chủ ở từng thao tác.', f'Nhóm Security duyệt việc khôi phục khóa và quyền sau sự cố.', f'Ticket chỉ lưu fingerprint của khóa; không ghi secret hoặc token nguyên văn.']
    if topic == 'observability':
        return [f'SLO của {project} là {99+n/100:.2f}% yêu cầu thành công trong 28 ngày; cảnh báo khi lỗi vượt {1+n/10:.1f}% liên tục {3+n} phút.', f'Khi đã dùng hơn {40+n*3}% ngân sách lỗi tuần, tạm dừng phát hành tính năng và chỉ cho phép bản sửa tăng độ ổn định được người trực duyệt.', f'Trace được lấy mẫu {5+n} phần trăm cho luồng thành công và toàn bộ luồng lỗi.', f'Log ứng dụng được giữ {10+n} ngày; không dùng mã người dùng làm nhãn metric.', f'Nhóm SRE xác nhận khoảng đo và mẫu số trước khi đóng cảnh báo.', f'Mỗi sự cố phải lưu mã trace và ảnh dashboard của cùng khoảng thời gian.']
    if topic == 'architecture':
        return [f'{project} giữ thao tác ghi phiếu trong API đồng bộ và chuyển tác vụ phụ sang worker qua outbox trong cùng transaction.', f'Chỉ tách dịch vụ khi tác vụ phụ chiếm hơn {20+n*3}% thời gian API trong {3+n} ngày liên tiếp và có nhóm vận hành nhận trách nhiệm.', f'Nếu độ trễ sự kiện vượt {20+n*5} giây trong {2+n} phút, tắt cờ tách luồng và dùng đường xử lý cũ đã kiểm tra.', f'Chấp nhận nhất quán sau tối đa {15+n*3} giây đối với màn hình báo cáo.', f'ADR phải có sơ đồ luồng, chủ sở hữu dữ liệu và chi phí vận hành.', f'Giữ đường xử lý cũ trong {7+n} ngày sau chuyển đổi để có thể quay lại.']
    return [f'Ticket của {project} chỉ hoàn tất khi đủ tiêu chí chấp nhận, bằng chứng test và review của người khác người viết.', f'Hotfix cần người trực Incident duyệt trước khi triển khai; bổ sung review độc lập trong {12+n*2} giờ sau triển khai.', f'Nếu lỗi tái hiện sau hotfix, mở lại ticket, quay về bản ổn định và tổ chức đối soát trong {2+n} ngày làm việc.', f'Mỗi pull request chỉ được gắn tối đa {1+n%3} ticket cùng mục tiêu.', f'Biên bản phải ghi tác động, nguyên nhân đã xác minh và người phụ trách hành động.', f'Nợ kỹ thuật từ bản sửa tạm phải có hạn xử lý trong {5+n} ngày làm việc.']


def document_text(project, domain, topic, label, system, principle, focus, example, diagnose, facts, n):
    return f'''# {project} — {focus}

> DỮ LIỆU GIẢ LẬP: tài liệu nội bộ mô phỏng phục vụ benchmark Test RAG. Mọi tên dự án, số liệu, quy định và sự cố dưới đây đều giả lập, không phải chính sách của tổ chức thật.

## Bối cảnh và phạm vi

Dự án {project} xây dựng sản phẩm {domain}, dùng {system} trong môi trường thử nghiệm có dữ liệu tổng hợp. Tài liệu này thuộc chủ đề {label}, tập trung vào {focus.lower()} và được áp dụng cho nhóm vận hành dự án này. Nhóm có {4+n} thành viên, phục vụ {120+n*30} tài khoản thử nghiệm, chia dữ liệu theo mã dự án. Các quyết định dưới đây chỉ có hiệu lực ở phạm vi đó; tài liệu của dự án khác có thể dùng công nghệ tương tự nhưng ngưỡng và trách nhiệm khác. Người đọc cần xác nhận tên dự án trước khi dùng cấu hình để xử lý một yêu cầu.

## Quy định cấu hình

{facts[0]}

{principle} Nhóm lưu cấu hình trong kho phiên bản cùng tài liệu thay đổi. Trước mỗi lần áp dụng, người thực hiện đối chiếu giá trị đang chạy với giá trị đã duyệt, ghi thời điểm và mã phiên bản vào ticket. Không chép nguyên cấu hình của dự án bên cạnh chỉ vì cùng stack. Trong môi trường thử nghiệm, các giới hạn này được dùng làm tiêu chí chấp nhận; thay đổi giới hạn phải cập nhật cả ví dụ kiểm tra và bản hướng dẫn vận hành để người trực sau không dùng số liệu cũ.

## Điều kiện và tình huống xử lý

{facts[1]}

Khi gặp tình huống liên quan đến {focus.lower()}, người trực bắt đầu từ một yêu cầu cụ thể, xác nhận trạng thái hiện tại và lập dòng thời gian. Cần phân biệt thao tác chưa thực hiện, thao tác đã hoàn tất và thao tác có kết quả chưa rõ. Nếu kết quả chưa rõ, phải đọc dữ liệu nguồn trước khi quyết định tiếp tục. Không suy đoán thành công từ một thông báo giao diện hoặc một dòng log riêng lẻ. Mọi bước xử lý cần gắn với mã yêu cầu để nhóm khác kiểm tra lại được mà không phải hỏi người đã trực ca trước.

## Ví dụ trong dự án

Ví dụ: {example}. Trong ca thử nghiệm thứ {n}, nhóm dùng phiếu DEMO-{n:02d} thuộc {project}; người phụ trách kiểm tra trạng thái trước và sau thao tác. Một tài khoản tạo yêu cầu hợp lệ, tài khoản thứ hai thử tình huống thiếu dữ liệu, còn tài khoản thứ ba kiểm tra cách phục hồi khi phụ thuộc tạm thời không sẵn sàng. Mỗi kết quả phải đối chiếu với nguồn thay vì chỉ nhìn thông báo thành công. Ví dụ này giúp phát hiện lỗi ranh giới trách nhiệm, đặc biệt khi các bước liên quan đến {system} hoàn tất vào thời điểm khác nhau.

{facts[3]}

## Kiểm tra trước khi áp dụng

{facts[2]}

Người thực hiện chuẩn bị danh sách yêu cầu mẫu có trường hợp hợp lệ, trường hợp vi phạm điều kiện và trường hợp thực hiện lặp. Dữ liệu mẫu phải dùng mã riêng để không trộn với phép thử của chủ đề khác. Khi kiểm tra, ghi lại kết quả mong đợi, kết quả quan sát và nguồn dùng để đối chiếu. Nếu có khác biệt, dừng bước áp dụng và yêu cầu người phụ trách đánh giá. Không sửa số liệu trong biên bản để làm phép thử trông đạt yêu cầu; khác biệt là bằng chứng giúp tìm đúng nguyên nhân và chọn biện pháp phục hồi có thể kiểm chứng.

## Chẩn đoán và giới hạn

Trong một sự cố giả lập, nhóm cần {diagnose}. Sau đó chọn một thay đổi nhỏ có thể quay lại, quan sát cùng tập yêu cầu mẫu rồi mới mở rộng phạm vi. Không thay nhiều cấu hình cùng lúc vì sẽ khó xác định yếu tố tạo ra kết quả. Thông tin từ dashboard phải dùng cùng khoảng thời gian với ticket. Nếu nguồn đo thiếu dữ liệu, đánh dấu chưa xác nhận và bổ sung phép đo; không coi sự vắng mặt của lỗi là bằng chứng hệ thống đã ổn định. Việc xử lý phải giữ ranh giới dữ liệu của {project} trong toàn bộ quá trình.

{facts[4]}

## Quay lại và hoàn tất

{facts[5]}

Trước khi đóng ticket, người trực đối chiếu dữ liệu nguồn, xác nhận tác dụng phụ và yêu cầu một thành viên khác đọc lại bằng chứng. Phương án quay lại phải nêu phiên bản đã kiểm tra, dữ liệu nào cần đối soát và ai quyết định mở lại luồng. Nếu kiểm tra cuối chưa đạt, giữ ticket mở cùng trạng thái thực tế, không đánh dấu hoàn tất để kịp lịch báo cáo. Sau mỗi sự cố, nhóm bổ sung một ví dụ tái hiện vào bộ kiểm tra của dự án; ví dụ phải phản ánh điều kiện xảy ra lỗi, không chỉ lặp lại cấu hình đang được triển khai.

## Bàn giao và phân biệt nguồn

Khi bàn giao, ghi tên {project}, nội dung {focus.lower()} và mã phiên bản. Tài liệu cùng chủ đề ở dự án khác có thể dùng giới hạn khác. Câu trả lời phải dẫn đúng nguồn; mọi quyết định ngoài tài liệu cần hỏi người phụ trách trong bối cảnh giả lập.
'''


def write_frozen(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() != content.encode():
        raise ValueError(f'Refusing to overwrite changed file: {path}')
    path.write_text(content, encoding='utf-8')


def main():
    docs = []
    for topic_index, (slug, label, system, principle, focuses, example, diagnose) in enumerate(TOPICS):
        for index, (project, domain) in enumerate(zip(PROJECTS, DOMAINS)):
            n = index + 1
            facts = facts_for(slug, project, n)
            title = f'{project} — {focuses[index]}.md'
            text = document_text(project, domain, slug, label, system, principle, focuses[index], example, diagnose, facts, n)
            word_count = len(text.split())
            if not 800 <= word_count <= 1200:
                raise ValueError(f'{slug}/{n}: {word_count} words')
            path = f'{slug}/{n:02d}.md'
            entry = {'id': f'TR-{topic_index+1:02d}-{n:02d}', 'publicId': str(uuid.uuid5(NAMESPACE, path)), 'topic': slug, 'topicName': label, 'path': path, 'title': title, 'sha256': hashlib.sha256(text.encode()).hexdigest(), 'wordCount': word_count, 'fileSize': len(text.encode())}
            if index < 2:
                if topic_index < 8:
                    kind = 'lookup' if index == 0 else 'scenario'
                    quotes = [facts[index]]
                    prompts = {
                        'backend': ['timeout và số lần thử lại tối đa là bao nhiêu?', 'một thao tác ghi chưa có khóa idempotency vượt timeout. Phải xử lý thế nào?'],
                        'frontend': ['chu kỳ lưu và hạn dùng của bản nháp là bao nhiêu?', 'người dùng mất mạng khi đang nhập biểu mẫu. Cần xử lý nút gửi và bản nháp thế nào, và khi nào được gửi?'],
                        'database': ['pool tối đa và statement_timeout là bao nhiêu?', f'migration chờ khóa hơn {3+n} giây. Phải tiếp tục bằng cách tăng timeout hay xử lý theo quy trình nào?'],
                        'caching': ['TTL danh sách và jitter tối đa là bao nhiêu?', 'nguồn tạm lỗi nhưng quyền truy cập vừa thay đổi. Có thể đọc cache cũ không? Điều kiện đọc cache cũ bình thường là gì?'],
                        'queue': ['concurrency và số attempts tối đa là bao nhiêu?', f'job đã thất bại hết {2+n%3} attempts. Job phải đi đâu và điều kiện replay là gì?'],
                        'ci-cd': ['các kiểm tra bắt buộc trước phát hành là gì, và image ở staging có quan hệ thế nào với production?', f'smoke test production lỗi trong {5+n} phút đầu. Cần xử lý artifact và lưu lượng thế nào?'],
                        'security': ['access token sống bao lâu và điều kiện khóa đăng nhập là gì?', 'nghi khóa dịch vụ đã bị lộ. Những bước xử lý và khoảng thời gian log cần kiểm tra là gì?'],
                        'observability': ['SLO, cửa sổ đo và điều kiện cảnh báo lỗi là gì?', f'đã dùng hơn {40+n*3}% ngân sách lỗi tuần. Những loại phát hành nào còn được phép và ai duyệt?'],
                    }
                    question = f'Theo tài liệu “{title}” của dự án {project}, {prompts[slug][index]}'
                else:
                    kind = 'synthesis'
                    quotes = facts[:3]
                    question = f'Theo tài liệu “{title}”, hãy tổng hợp ' + ('cách phân chia luồng, điều kiện tách dịch vụ và điều kiện quay về đường xử lý cũ.' if slug == 'architecture' else 'điều kiện hoàn tất ticket, phê duyệt và review hotfix, cùng cách xử lý khi lỗi tái hiện.')
                entry['benchmark'] = {'id': f'Q{31+topic_index*2+index}', 'type': kind, 'question': question, 'requiredFacts': quotes}
            write_frozen(ROOT / path, text)
            docs.append(entry)
    manifest = {'version': 1, 'synthetic': True, 'knowledgeSpacePublicId': str(uuid.uuid5(NAMESPACE, 'space')), 'spaceName': 'Test RAG', 'description': '100 tài liệu Markdown nội bộ GIẢ LẬP bằng tiếng Việt để benchmark RAG; tên dự án, số liệu và quy định đều mô phỏng, không phải dữ liệu hay chính sách tổ chức thật.', 'wordCountMethod': 'whitespace-separated Vietnamese syllables', 'documents': docs}
    write_frozen(ROOT / 'manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(f'100 documents, 10 topics, {min(d["wordCount"] for d in docs)}–{max(d["wordCount"] for d in docs)} words; space {manifest["knowledgeSpacePublicId"]}')


if __name__ == '__main__':
    main()
