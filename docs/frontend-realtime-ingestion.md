# FE integration: upload → ingestion → realtime status

Đối chiếu implementation ngày 2026-10-08. REST là nguồn trạng thái chính;
Socket.IO giúp UI cập nhật sớm khi ingestion hoàn tất.

## 1. Luồng hiện tại

```text
FE lấy presigned URL
  → FE PUT file lên R2
  → FE POST đăng ký document
  → BE lưu document Processing, enqueue BullMQ
  → worker lấy text → chunk → embedding → lưu chunks + Ready
  → Socket.IO phát document.status.updated
```

**PUT file thành công chưa khởi động ingestion.** FE phải gọi API tạo document
sau PUT. Response tạo document là `201`: thường `Processing`, hoặc `Failed` nếu enqueue
lỗi và BE đã persist trạng thái thất bại.
Ingestion chạy nền; FE không giữ modal chờ worker hoàn tất.

Worker có tối đa **3 lần chạy tổng cộng**, không phải 1 lần đầu + 3 retry.
Lỗi tạm thời giữ `Processing`; hết lượt mới chuyển `Failed`. `Ready` chỉ được
phát sau khi transaction lưu chunks và trạng thái đã commit. Job cũ của document
đã sửa/xóa bị bỏ qua nếu không còn khớp snapshot, không phát trạng thái cũ.

BE hiện **chỉ phát `Ready` và `Failed`**, không phát `Processing`, bước parse,
chunk, embedding hay phần trăm tiến độ.

## 2. REST contract cho upload

Các API BE dưới đây dùng `Authorization: Bearer <accessToken>`.
`spaceId` và `documentId` bên FE là UUID public ID.

### Bước A — lấy URL

`POST /api/knowledge-spaces/{spaceId}/documents/upload-url`

```json
{
  "fileName": "handbook.pdf",
  "contentType": "application/pdf",
  "fileSize": 248310
}
```

Response `201`:

```json
{
  "uploadUrl": "https://<storage>/<key>?<signature>",
  "storageKey": "documents/<spaceId>/<random-uuid>.pdf",
  "expiresAt": "2026-10-08T13:05:00.000Z"
}
```

Hỗ trợ PDF, DOCX, TXT, MD. URL mặc định hết hạn sau 5 phút.

### Bước B — upload bytes

`PUT {uploadUrl}` với body là chính `File`/binary, có thể gửi `Content-Type`
đúng loại file. Không dùng multipart/form-data và không gửi JWT của BE sang R2.
Chỉ chuyển sang bước C khi PUT thành công. Nếu cần progress upload, FE dùng
upload progress từ XHR/thư viện HTTP; WebSocket không cung cấp progress này.

### Bước C — đăng ký document và khởi động ingestion

`POST /api/knowledge-spaces/{spaceId}/documents`

```json
{
  "name": "handbook.pdf",
  "description": "Tài liệu onboarding",
  "categoryPublicId": "<category-uuid>",
  "storageKey": "<storageKey trả về ở bước A>",
  "visibility": "Public"
}
```

`name` cần giữ extension hợp lệ vì BE suy ra file type từ trường này.
`visibility` mặc định `Public`, cũng nhận `Restricted`. Upload/create yêu cầu
vai trò Editor hoặc Owner trong space. Với luồng ingest file, bỏ `content`;
nếu gửi `content` khác null, worker ưu tiên text này thay vì parse file.

Response là một `DocumentListResponseDto`, các field FE cần dùng ngay:

```json
{
  "publicId": "<document-uuid>",
  "title": "handbook.pdf",
  "fileType": "PDF",
  "status": "Processing",
  "visibility": "Public",
  "lastUpdated": "2026-10-08T13:00:10.000Z",
  "category": { "publicId": "<category-uuid>", "name": "Onboarding" },
  "updatedBy": { "publicId": "<user-uuid>", "name": "user", "avatarUrl": null },
  "cited": 0
}
```

Create giữ HTTP `201`, update giữ `200`. Nếu enqueue thất bại nhưng BE đã lưu
trạng thái lỗi, response trả `status: "Failed"` với `publicId` và `lastUpdated`
đã persist. FE vẫn thêm/cập nhật row, đóng upload modal, hiện “Xử lý thất bại”
và nút “Thử lại” cho Editor/Owner; không upload lại file. Với `Processing`, báo
“Đã tải lên, đang xử lý tài liệu”. Chưa báo “Tài liệu đã sẵn sàng”.

Nếu snapshot đã bị edit/worker thay đổi trong lúc enqueue lỗi, BE trả document
hiện tại; nếu đã bị xóa thì `404`. Lỗi DB khi chuyển `Failed` trả `500`, FE refetch
để kiểm tra tài liệu đã lưu trước khi quyết định thao tác tiếp theo.

## 3. Socket.IO contract

| Thuộc tính     | Giá trị hiện tại                                                |
| -------------- | --------------------------------------------------------------- |
| Client         | `socket.io-client` tương thích server Socket.IO 4.x             |
| Namespace      | `/realtime` trên cùng origin BE                                 |
| Transport path | `/socket.io/` mặc định; namespace không phải path               |
| Auth           | `auth: { token: accessToken }`, token không có prefix `Bearer ` |
| Event nhận     | `document.status.updated`                                       |
| Subscribe      | BE tự join room user; FE không emit subscribe/join              |
| Phạm vi        | Socket của thành viên hiện tại có quyền đọc document            |
| Delivery       | Không có ACK nghiệp vụ, replay hoặc bảo đảm nhận khi offline    |

Ví dụ khởi tạo tại tầng session/app; các callback là hàm FE tự triển khai:

```ts
import { io } from 'socket.io-client';

type DocumentStatusUpdated = {
  documentPublicId: string;
  knowledgeSpacePublicId: string;
  fileName: string;
  status: 'Ready' | 'Failed';
  updatedAt: string; // ISO datetime, version trạng thái đã persist
};

const socket = io(`${BACKEND_ORIGIN}/realtime`, {
  auth: { token: accessToken },
  autoConnect: false,
});

socket.on('document.status.updated', (event: DocumentStatusUpdated) => {
  handleDocumentStatus(event);
});
socket.on('connect', () => {
  refetchVisibleDocuments();
});
socket.on('connect_error', () => {
  showRealtimeConnectionState('disconnected');
});
socket.on('disconnect', () => {
  showRealtimeConnectionState('disconnected');
});
socket.connect();

// Cleanup tại tầng sở hữu socket khi logout/unmount:
// socket.disconnect();
// socket.removeAllListeners();
```

`BACKEND_ORIGIN` ví dụ `http://localhost:3000`, không chứa `/api`.
Các origin FE được phép hiện tại: localhost cổng 5173, 3000, 5174, 5175.
Thiếu/sai token hoặc không resolve được user thì BE disconnect;
chưa có payload lỗi auth riêng. Xử lý cả `disconnect`, không chỉ `connect_error`.
Sau refresh token, cập nhật `socket.auth = { token: newAccessToken }` và reconnect.
User bị BE chủ động disconnect cần gọi `connect()` sau khi xử lý nguyên nhân.

Payload ví dụ:

```json
{
  "documentPublicId": "<document-uuid>",
  "knowledgeSpacePublicId": "<space-uuid>",
  "fileName": "handbook.pdf",
  "status": "Ready",
  "updatedAt": "2026-10-08T13:00:15.000Z"
}
```

Khi thất bại, cùng shape với `status: "Failed"`; không có `errorMessage`,
`errorCode`, `progress`, `jobId`. `fileName` hiện lấy từ **document.title**;
không dùng nó làm key hay ghi đè title mới hơn trong cache.

## 4. Wire vào UI

| Trạng thái        | UI đề xuất                                                    | Nguồn                                                 |
| ----------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| Uploading         | Progress bar upload, “Đang tải lên…”                          | FE local, PUT progress                                |
| Registering       | Spinner, “Đang lưu tài liệu…”                                 | FE local, chờ POST create                             |
| Processing        | Badge/spinner “Đang xử lý”; progress vô định                  | REST create/update/retry/list/detail                  |
| Ready             | Badge “Sẵn sàng”; bỏ spinner; toast hoàn tất cho người upload | WS hoặc REST                                          |
| Failed            | Badge “Xử lý thất bại”; nút “Thử lại” nếu Editor/Owner        | WS hoặc REST                                          |
| Upload/create lỗi | Giữ modal và báo lỗi bước upload/lưu                          | HTTP error, chưa có trạng thái ingestion đáng tin cậy |
| Mất realtime      | Chỉ báo mất kết nối, tiếp tục đồng bộ REST                    | Socket lifecycle                                      |

- Document list: patch row đã biết theo `(knowledgeSpacePublicId, documentPublicId)`.
- Document detail: cập nhật badge nếu đang mở đúng document.
- Upload modal: hoàn tất ngay sau POST create; ingestion tiếp tục trong list.
- Toast: chỉ toast document user đang theo dõi/upload; dedupe theo document +
  `updatedAt` + status. Event của người khác cập nhật row, tránh toast hàng loạt.
- `Ready` nghĩa là đã ingest xong để dùng cho truy xuất RAG. Preview/download file
  là luồng riêng qua API `download-url`, không phụ thuộc phần trăm ingestion.
- Không dựng progress 30/60/90% cho ingestion: BE chưa có dữ liệu cho các mốc này.

## 5. Đồng bộ cache, race và mất kết nối

1. Gắn listener ở tầng app/session trước khi upload, dùng một socket chung.
   Không tạo socket riêng cho từng row/modal.
2. Map event `documentPublicId → publicId`, `updatedAt → lastUpdated`. Chỉ áp dụng
   nếu version mới hơn trạng thái đang lưu. Áp dụng cùng quy tắc merge cho
   response REST để response `Processing` cũ không ghi đè event `Ready` mới.
3. Worker có thể hoàn tất trước khi FE nhận response POST create/retry.
   Giữ event mới nhất tạm thời cho upload đang chờ trong space đó, rồi merge
   sau khi có `publicId`; đồng thời refetch sau create/retry để xác nhận trạng thái.
4. Với document chưa biết/không có trong danh sách được REST cấp quyền: invalidate
   query space và lấy lại dữ liệu được phép đọc; không tự tạo row/toast từ payload.
5. Refetch list/detail khi mount, reconnect, quay lại tab và sau mutation.
   BE join room bất đồng bộ, chưa có event `subscribed`/ACK; `connect` không phải
   bằng chứng room user đã sẵn sàng. Refetch + polling bù khoảng trống này.
6. Khi UI còn document `Processing`, đề xuất poll list/detail mỗi 5–10 giây
   trong lúc tab hoạt động; dừng khi terminal hoặc rời màn hình. Đây là lựa chọn
   FE, không phải interval/SLA do BE quy định. Poll bù được event mất ngay cả khi
   socket vẫn connected. Không tự chuyển `Failed` vì chờ lâu.
7. BE không phát `Processing` khi user khác upload/edit/retry. Refetch/poll giúp
   UI các tab khác thấy phiên ingestion mới, kể cả filter chỉ hiển thị `Ready`.
8. BE kiểm tra membership và quyền đọc từ DB trước mỗi event. `Public` gửi cho
   thành viên hiện tại; `Restricted` cần `DocumentPermission`, kể cả Owner/Editor.
   Người bị gỡ membership/thu hồi permission trước truy vấn không nhận event dù
   socket vẫn connected. Tham gia space mới không cần reconnect để đổi room.
   Khi logout, đóng socket và xóa buffer/cache của session.

## 6. Retry ingestion

`POST /api/knowledge-spaces/{spaceId}/documents/{documentId}/retry`, không body.

- Editor/Owner, chỉ áp dụng document `Failed`.
- `202`: trả `DocumentListResponseDto` với `Processing` và `lastUpdated` mới.
  Merge theo version, hiện spinner, disable retry và chờ WS/REST terminal.
- `409`: document không còn `Failed` hoặc đã thay đổi; refetch.
- `403`: thiếu quyền; `404`: document không tồn tại/đã xóa.
- `500`: không khởi động retry thành công; refetch và báo lỗi. Nếu enqueue lỗi
  và rollback đúng snapshot thành công, BE phát `Failed` với version đã persist.
- Không upload lại file khi retry ingestion. BE dùng file/content đã lưu.
- Retry không phát event `Processing`; caller cập nhật từ response `202`.

## 7. Giới hạn và deploy

- Query quyền và emit là best effort: lỗi query/emit được log, bỏ notification;
  ingestion không retry vì lỗi gửi event. FE tiếp tục đồng bộ REST/polling.
- Query bỏ event nếu document đã xóa hoặc space/status/version không còn khớp.
- Không có outbox/replay. Process chết giữa lưu DB và enqueue vẫn cần cơ chế
  recovery riêng; sửa này xử lý lỗi enqueue bắt được tại runtime.
- Khi deploy phiên bản chuyển từ room space sang room user, reconnect socket
  để các kết nối cũ join room mới.

## 8. Phạm vi kiểm chứng và nguồn

Regression test bao phủ enqueue lỗi create/update/retry, snapshot concurrent,
auth/room user, query/emit lỗi và worker không retry vì notification. Test audience
PostgreSQL chạy riêng bằng `DOCUMENT_REALTIME_TEST_DATABASE_URL` trên database
test đã migrate; không fallback sang database ứng dụng. Chưa kiểm chứng toàn
luồng browser + R2 + Redis hoặc delivery đa instance.

- [Upload/create/retry controller](../src/modules/document/api/document.controller.ts)
- [DTO request](../src/modules/document/application/dtos/document.request.dto.ts)
- [DTO response](../src/modules/document/application/dtos/document.response.dto.ts)
- [Document service](../src/modules/document/application/services/document.service.ts)
- [Worker ingestion](../src/modules/rag/application/services/content-ingestion.service.ts)
- [Transaction lưu chunks + Ready](../src/modules/rag/infrastructure/document-chunk.repo.ts)
- [Socket gateway](../src/shared/infrastructure/notification/socket-notification.gateway.ts)
- [Event payload](../src/shared/infrastructure/notification/realtime-notifier.interface.ts)
- [Redis Socket.IO adapter](../src/shared/infrastructure/notification/redis-io.adapter.ts)
