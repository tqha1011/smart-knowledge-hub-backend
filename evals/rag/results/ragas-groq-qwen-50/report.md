# Ragas — Groq evaluation

Manual correctness and automated metric scores measure different properties; scores below 1 require review, not an automatic INCORRECT verdict.

Synthetic corpus questions: Q31, Q32, Q33, Q34, Q35, Q36, Q37, Q38, Q39, Q40, Q41, Q42, Q43, Q44, Q45, Q46, Q47, Q48, Q49, Q50. Datasets are reported separately.

Completed: 50/50. Requests: 201. Tokens accounted: 844431 (actual usage where returned, estimates otherwise).

Provenance, settings and structured judge statements/reasons: `state.json`.

Explicit output-cap repairs: 3; only truncated steps use recorded overrides.

| Dataset               | Metric         | Mean   | Scored / total |
| --------------------- | -------------- | ------ | -------------- |
| ALL                   | faithfulness   | 0.9462 | 50/50          |
| ALL                   | context_recall | 0.9800 | 50/50          |
| pilot-10              | faithfulness   | 0.9667 | 10/10          |
| pilot-10              | context_recall | 1.0000 | 10/10          |
| project-management-20 | faithfulness   | 0.9514 | 20/20          |
| project-management-20 | context_recall | 0.9500 | 20/20          |
| test-rag-20           | faithfulness   | 0.9308 | 20/20          |
| test-rag-20           | context_recall | 1.0000 | 20/20          |

## Questions needing inspection

- Q02: COMPLETE; faithfulness=0.6666666666666666; context_recall=1.0;
- Q13: COMPLETE; faithfulness=0.75; context_recall=1.0;
- Q15: COMPLETE; faithfulness=0.7272727272727273; context_recall=0.0;
- Q17: COMPLETE; faithfulness=0.75; context_recall=1.0;
- Q30: COMPLETE; faithfulness=0.8; context_recall=1.0;
- Q40: COMPLETE; faithfulness=0.6666666666666666; context_recall=1.0;
- Q42: COMPLETE; faithfulness=0.875; context_recall=1.0;
- Q44: COMPLETE; faithfulness=0.875; context_recall=1.0;
- Q46: COMPLETE; faithfulness=0.75; context_recall=1.0;
- Q48: COMPLETE; faithfulness=0.8181818181818182; context_recall=1.0;
- Q49: COMPLETE; faithfulness=0.9; context_recall=1.0;
- Q50: COMPLETE; faithfulness=0.7307692307692307; context_recall=1.0;

## Judge findings versus manual grades

### Q02 — manual CORRECT

Question: Team theo dõi task bằng công cụ nào và mỗi task được liên kết với branch như thế nào?

Reference: Team theo dõi task bằng Jira/Trello. Mỗi task gắn với 1 branch.

Saved answer:

> The team tracks its work with **Jira or Trello**, and for every task they create a corresponding Git branch (one branch is attached to each task)【1†L4-L6】.

**faithfulness:** The team creates a corresponding Git branch for every task.

The context states 'mỗi task gắn với 1 branch' (each task is attached to 1 branch). While it implies a relationship, it does not explicitly state that a branch is _created_ for every task (a branch could be shared or pre-existing), but in the context of Git workflows described, 'attached to' usually implies a dedicated branch per task. However, strictly speaking, 'attached to' is the specific wording. Let's look at the next statement which is a direct translation. The statement 'creates a corresponding Git branch' is a reasonable inference of the workflow 'each task attached to 1 branch' in a Git context where branches are named per feature/fix. But is it _directly_ inferred? The text says 'attached to'. It doesn't explicitly say 'create'. However, in standard DevOps guides, this implies creation. Let's look at the third statement which is a more literal translation. If statement 3 is true, statement 2 is likely true as well. Let's re-read carefully: 'mỗi task gắn với 1 branch'. This means each task is linked to one branch. It does not explicitly mandate the _creation_ of a new branch for _every_ single task (e.g., multiple tasks could share a branch, though the naming convention suggests feature/fix branches). However, usually, this rule implies 1:1 mapping. Let's compare with statement 3. Statement 3 is 'One Git branch is attached to each task'. This is a direct translation of 'mỗi task gắn với 1 branch'. Statement 2 adds the action 'creates'. The context does not explicitly mention the _creation_ action, only the association. Therefore, statement 2 is slightly less faithful than statement 3. But wait, if I have to choose 0 or 1. Is 'creates' inferable? If a task is attached to a branch, and branches are named `feature/<ten>`, it is highly likely a branch is created. But strict NLI requires direct inference. The text says 'attached to'. It does not say 'created for'. I will mark statement 2 as 0 because the specific action of 'creating' is not in the text, only the state of being 'attached'. Actually, looking at standard interpretations, 'each task attached to 1 branch' is the rule. Whether it's created or existing is not specified. So 0 is safer for strict faithfulness. Let's re-evaluate. If I say 'My car is parked in the garage', can I infer 'I parked my car in the garage'? Yes. Can I infer 'I bought a garage'? No. Here, 'Task attached to branch' -> 'Branch created for task'? Not necessarily. The branch might exist. So 0.

### Q13 — manual CORRECT

Question: Theo Đề cương DA1.pdf, nhóm định đánh giá lộ trình AI bằng cách nào, trên bao nhiêu hồ sơ mẫu và theo dõi người dùng sau bao lâu?

Reference: So sánh lộ trình AI với lộ trình mentor/giảng viên đề xuất trên 5–10 hồ sơ mẫu, đồng thời đo tỷ lệ người dùng thử nghiệm theo được lộ trình sau 2 tuần.

Saved answer:

> Nhóm sẽ **đánh giá lộ trình AI** bằng cách **so sánh lộ trình AI sinh ra với lộ trình do mentor/giảng viên đề xuất** trên **từ 5 đến 10 hồ sơ mẫu**. Sau khi người dùng thử nghiệm nhận được lộ trình, nhóm sẽ **đo tỷ lệ người dùng thực tế tuân theo lộ trình trong vòng 2 tuần** để kiểm tra mức độ theo dõi và thực hiện [1].

**faithfulness:** The measurement of user adherence within 2 weeks is intended to check the level of tracking and execution.

While the context mentions measuring the percentage of users who follow the roadmap after 2 weeks, it does not explicitly state the specific intent or purpose of this measurement as 'checking the level of tracking and execution'. This is an inference about the rationale, not a direct statement of fact found in the text.

### Q15 — manual CORRECT

Question: Theo Đặc tả dự án DA1.pdf, deadline, hoursPerWeek và targetSkillIds phải thỏa các điều kiện gì khi khai báo mục tiêu học?

Reference: Deadline phải cách hiện tại ít nhất 2 tuần; hoursPerWeek từ 1 đến 60; targetSkillIds phải thuộc cùng directionId đã chọn.

Saved answer:

> Theo **Đặc tả dự án DA1.pdf** các trường **deadline**, **hoursPerWeek** và **targetSkillIds** được khai báo trong “LearningProfile” (hồ sơ mục tiêu) và phải đáp ứng các điều kiện sau:
>
> | Trường             | Điều kiện bắt buộc                                                                                                                                                                                                                                       | Nguồn                     |
> | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
> | **deadline**       | – Là một giá trị kiểu **date**.<br>– Phải là ngày trong tương lai (được dùng để tính **availableWeeks = (deadline – today) / 7**).                                                                                                                       | 【3†L31-L34】             |
> | **hoursPerWeek**   | – Là một số nguyên dương, biểu thị số giờ rảnh mỗi tuần.<br>– Nếu tổng số giờ cần học cho các kỹ năng mục tiêu vượt quá **hoursPerWeek × availableWeeks** thì hệ thống sẽ trả lỗi **INSUFFICIENT_TIME** và đề xuất “giảm mục tiêu” hoặc “tăng giờ/tuần”. | 【1†L14-L20】             |
> | **targetSkillIds** | – Là một mảng **uuid[]** chứa các **skillId** là kỹ năng mục tiêu.<br>– Các skillId phải tồn tại trong **skill graph** của hệ thống (không được tạo ra ngoài hệ thống) và sẽ được lọc bỏ các kỹ năng đã **MASTERED** trước khi sắp xếp thứ tự học.       | 【3†L31-L34】【1†L8-L11】 |
>
> Tóm lại, khi khai báo mục tiêu học:
>
> 1. **deadline** phải là một ngày tới, dùng để tính số tuần khả dụng.
> 2. **hoursPerWeek** phải là số nguyên dương, đủ lớn để chứa tổng thời gian học cần thiết trong số tuần tính được; nếu không đủ sẽ gây ra lỗi **INSUFFICIENT_TIME**.
> 3. **targetSkillIds** phải là danh sách các skillId hợp lệ, có trong hệ thống và chưa được người dùng “mastered”.
>
> Nếu bất kỳ một trong các điều kiện trên không được thỏa, việc tạo lộ trình sẽ bị từ chối hoặc trả về lỗi tương ứng.

**faithfulness:** Trường deadline phải là một ngày trong tương lai.

While the formula `(deadline - today) / 7` implies a future date for positive weeks, the context does not explicitly state a validation rule that the deadline _must_ be in the future (e.g., it doesn't mention rejecting past dates). It is an inference, not a direct statement of constraint in the provided text.

**faithfulness:** Khi khai báo mục tiêu học, deadline phải là một ngày tới để tính số tuần khả dụng.

Similar to statement 4, while the formula uses 'today', the text does not explicitly state a validation rule that the deadline _must_ be a future date. It is an operational requirement for the formula to yield positive weeks, but not explicitly stated as a constraint on the input field itself in the provided text.

**faithfulness:** Khi khai báo mục tiêu học, hoursPerWeek phải là số nguyên dương và đủ lớn để chứa tổng thời gian học cần thiết trong số tuần tính được.

The context does not state that 'hoursPerWeek' must be 'large enough' to contain the total time. Instead, if the total time exceeds the budget (hoursPerWeek \* weeks), the system returns 'INSUFFICIENT_TIME'. It does not require the input to be sufficient; it handles insufficiency with an error/suggestion.

**faithfulness:** Các skillId trong targetSkillIds phải chưa được người dùng mastered.

The context states that MASTERED nodes are _removed_ from the list of necessary nodes during the roadmap generation process ('loại bỏ node đã MASTERED'). It does not state that the _input_ 'targetSkillIds' cannot contain mastered skills; rather, the system filters them out. The user _can_ select them, but the system ignores them for the new roadmap. Therefore, the statement that they _must_ not be mastered (as a precondition for the input) is not supported; the system handles it by filtering.

**faithfulness:** Nếu bất kỳ điều kiện nào về deadline, hoursPerWeek hoặc targetSkillIds không được thỏa, việc tạo lộ trình sẽ bị từ chối.

The context describes specific handling for time insufficiency (returning INSUFFICIENT_TIME with suggestions) and filtering mastered skills. It does not state a general rule that _any_ unmet condition leads to a rejection of the roadmap creation. For example, if time is insufficient, it returns a specific error/suggestion, not necessarily a hard 'rejection' of the entire process in the sense of failing to create anything, but rather a specific response. More importantly, the text doesn't list a comprehensive set of 'conditions' that if unmet, cause rejection. It's too broad and not directly stated.

**faithfulness:** Nếu bất kỳ điều kiện nào về deadline, hoursPerWeek hoặc targetSkillIds không được thỏa, hệ thống sẽ trả về lỗi tương ứng.

The context only explicitly mentions returning 'INSUFFICIENT_TIME' for time issues. It does not mention specific errors for invalid deadlines or invalid skill IDs. It is an overgeneralization not supported by the text.

**context_recall:** Deadline phải cách hiện tại ít nhất 2 tuần

The context mentions calculating availableWeeks based on the deadline and handling insufficient time, but it does not explicitly state a minimum constraint that the deadline must be at least 2 weeks away.

**context_recall:** hoursPerWeek từ 1 đến 60

The context defines hoursPerWeek as an integer representing free time per week, but it does not specify the valid range of 1 to 60.

**context_recall:** targetSkillIds phải thuộc cùng directionId đã chọn

The context lists targetSkillIds and directionId as fields in the LearningProfile, but it does not explicitly state the validation rule that targetSkillIds must belong to the selected directionId.

### Q17 — manual CORRECT

Question: Theo Đặc tả dự án DA1.pdf, nếu tổng giờ học cần thiết vượt quỹ thời gian của người dùng, bước chia lịch phải trả kết quả gì và đưa ra hai gợi ý nào?

Reference: Trả INSUFFICIENT_TIME và gợi ý giảm mục tiêu hoặc tăng số giờ học mỗi tuần.

Saved answer:

> Nếu tổng số giờ học cần thiết vượt quá quỹ thời gian mà người dùng đặt ra, bước **chia lịch** phải trả kết quả **“INSUFFICIENT_TIME”** và đồng thời đưa ra **hai gợi ý**:
>
> 1. **Giảm mục tiêu** (giảm số kỹ năng / nội dung cần học).
> 2. **Tăng giờ / tuần** (tăng thời lượng học mỗi tuần).
>
> [Nguồn: Đặc tả dự án DA1.pdf, phần mô tả thuật toán chia lịch – “Nếu tổng giờ vượt quỹ thời gian → trả INSUFFICIENT_TIME kèm 2 gợi ý: giảm mục tiêu hoặc tăng giờ/tuần”]

**faithfulness:** Gợi ý thứ nhất theo Đặc tả dự án DA1.pdf là giảm mục tiêu, cụ thể là giảm số kỹ năng hoặc nội dung cần học.

The context lists the first suggestion as 'giảm mục tiêu' (reduce goal). While the specific detail 'giảm số kỹ năng hoặc nội dung cần học' (reduce number of skills or content) is a logical interpretation of reducing the goal, the text only explicitly says 'giảm mục tiêu'. However, in the context of NLI, 'giảm mục tiêu' is the direct statement. The statement adds specific details not explicitly in the text ('cụ thể là...'). Strictly speaking, the text does not define _how_ to reduce the goal, only that it is a suggestion. But usually, 'giảm mục tiêu' implies reducing the scope. Let's look closer. The text says: 'kèm 2 gợi ý: giảm mục tiêu hoặc tăng giờ/tuần'. It does not elaborate on what 'giảm mục tiêu' entails in that specific sentence. Therefore, the specific elaboration 'cụ thể là giảm số kỹ năng hoặc nội dung cần học' is not directly inferable from the provided snippet alone, although it is a reasonable assumption. However, looking at the strictness of NLI, if the text doesn't say it, it's 0. But wait, is it a direct inference? 'Giảm mục tiêu' is the suggestion. The statement says the suggestion is 'giảm mục tiêu, cụ thể là...'. The 'cụ thể là' part is an interpretation. Let's re-read carefully. The text says: 'gợi ý: giảm mục tiêu hoặc tăng giờ/tuần'. It does not define 'giảm mục tiêu'. Thus, the specific definition in the statement is not in the text. Verdict 0.

### Q30 — manual CORRECT

Question: Theo Quy trình tìm skill & resource.docx, graph của hướng người phụ trách không rành cần được ai kiểm duyệt, cần xác nhận điều gì và lưu tên người review ở đâu?

Reference: Ít nhất một người ngoài nhóm (khóa trên, mentor CLB hoặc giảng viên hướng dẫn) phải review và xác nhận thứ tự tiên quyết hợp lý; ghi tên người review vào Direction.ownerNote.

Saved answer:

> Theo Quy trình **“skill & resource”**:
>
> - **Ai kiểm duyệt:** Đối với hướng mà người chịu trách nhiệm **không rành**, graph phải được **ít nhất một người ngoài nhóm** xem lại – có thể là anh/chị khóa trên, mentor CLB hoặc giảng viên hướng dẫn【1†L31-L33】【2†L13-L15】.
> - **Cần xác nhận:** Người review phải **kiểm chứng thứ tự các quan hệ tiên quyết** (prerequisite) của các node có hợp lý, không có lỗi chu trình hay sắp xếp sai 【1†L31-L33】【2†L13-L15】.
> - **Nơi lưu tên người review:** Tên người thực hiện review được ghi **vào trường `Direction.ownerNote`** của hướng (direction) tương ứng【1†L33-L34】【2†L15-L16】.

**faithfulness:** Người review phải xác nhận không có lỗi chu trình hay sắp xếp sai trong graph.

The context mentions that the team performs a manual cycle check ('Tự kiểm tra cycle bằng tay') before import and uses React Flow to check for orphan nodes or depth issues. However, it does not state that the external reviewer is required to verify the absence of cycles or incorrect arrangements; their specific duty is defined as confirming the prerequisite order is reasonable.

### Q40 — manual CORRECT

Question: Theo tài liệu “Sao Bắc — Chuyển job lỗi sang DLQ.md” của dự án Sao Bắc, job đã thất bại hết 4 attempts. Job phải đi đâu và điều kiện replay là gì?

Reference: Sau 4 attempts thất bại, chuyển job sang DLQ và chỉ replay sau khi người trực đối soát tác dụng phụ.

Saved answer:

> Theo tài liệu **Sao Bắc — Chuyển job lỗi sang DLQ.md**, Worker của dự án Sao Bắc cho phép tối đa 4 attempts cho mỗi job. Khi một job đã thất bại hết 4 attempts, nó phải được **đưa vào DLQ (dead‑letter queue)**. Việc **replay** (đưa job trở lại queue để xử lý lại) chỉ được thực hiện **sau khi người trực đã đối soát, xác nhận các tác dụng phụ của lần chạy trước** và xác nhận rằng việc replay là an toàn 【1†L58-L60】.

**faithfulness:** Replaying a job means moving the job back to the queue for reprocessing.

The context mentions 'replay' in the context of handling failed jobs in the DLQ ('chỉ replay sau khi...'), but it does not explicitly define the technical mechanism of replay as 'moving the job back to the queue for reprocessing'. While this is a common technical definition, it is not directly stated or inferred from the provided text which focuses on procedural rules rather than technical definitions.

**faithfulness:** Replaying a job is only allowed after the on-duty person has confirmed that the replay is safe.

The context specifies that replay is allowed after reconciling side effects ('đối soát tác dụng phụ'). It does not explicitly state that the on-duty person must confirm the replay is 'safe' as a general condition, but rather focuses on the reconciliation of side effects. While related, 'confirmed that the replay is safe' is a broader or different condition than 'reconciled side effects'. However, looking closely at the text 'chỉ replay sau khi người trực đối soát tác dụng phụ', the specific condition is reconciliation of side effects. The statement 'confirmed that the replay is safe' is an interpretation not explicitly supported by the text which is specific about 'side effects'.

### Q42 — manual CORRECT

Question: Theo tài liệu “Sao Bắc — Rollback khi smoke test lỗi.md” của dự án Sao Bắc, smoke test production lỗi trong 7 phút đầu. Cần xử lý artifact và lưu lượng thế nào?

Reference: Nếu smoke test production lỗi trong 7 phút đầu, quay về digest đã xác minh trước đó và tạm dừng tăng lưu lượng.

Saved answer:

> Theo tài liệu của dự án Sao Bắc, khi smoke test ở môi trường production gặp lỗi trong **7 phút đầu** thì phải:
>
> - **Quay lại (rollback) digest** – tức là sử dụng lại image digest đã được xác minh trước đó thay vì tạo image mới.
> - **Tạm dừng việc tăng lưu lượng** – không tiến hành mở rộng (ramp‑up) lượng traffic nữa cho đến khi kiểm tra lại.
>
> Sau khi rollback, **artifact gây lỗi** phải được giữ lại để phân tích và thực hiện lại smoke test trên phiên bản đã phục hồi.
>
> Các yêu cầu này được nêu trong tài liệu “Sao Bắc — Rollback khi smoke test lỗi.md” :
>
> - “Nếu smoke test production lỗi trong 7 phút đầu, quay về digest đã xác minh trước đó và tạm dừng tăng lưu lượng.”【1†L1-L3】
> - “Sau rollback, giữ artifact lỗi để phân tích và chạy lại smoke trên bản phục hồi.”【1†L13-L15】

**faithfulness:** Việc tạm dừng tăng lưu lượng có nghĩa là không tiến hành mở rộng (ramp-up) lượng traffic nữa cho đến khi kiểm tra lại.

While the context says 'tạm dừng tăng lưu lượng' (pause traffic increase), it does not explicitly define this as 'not proceeding with ramp-up until re-checking'. The phrase 'until re-checking' is an interpretation not strictly present in the text, although implied by the process. However, strictly speaking, the text only commands the pause, not the specific condition of 'until re-checking' as a definition of the pause itself. But looking closer, the context is a set of instructions. 'Tạm dừng' means stop/pause. The statement defines the meaning. Is this definition in the text? No. The text just says to do it. It doesn't define the term. Therefore, it cannot be directly inferred as a definition from the text alone, though it is a logical consequence. In strict NLI, if the text doesn't define the term, the statement explaining the definition is not entailed. However, often in these tasks, if the action is described, the semantic equivalent is accepted. Let's look at the other statements. Statement 7 and 8 are direct quotes. Statement 4 is an interpretation. Let's look at the context again. It says 'tạm dừng tăng lưu lượng'. It does not say 'until re-checking'. It just says pause. So the specific condition 'until re-checking' is an addition. Verdict 0 is safer for strict faithfulness.

### Q44 — manual CORRECT

Question: Theo tài liệu “Sao Bắc — Ứng phó khóa dịch vụ bị lộ.md” của dự án Sao Bắc, nghi khóa dịch vụ đã bị lộ. Những bước xử lý và khoảng thời gian log cần kiểm tra là gì?

Reference: Khi nghi khóa dịch vụ bị lộ, thu hồi khóa, cấp khóa mới và kiểm tra log đã che dữ liệu trong 14 giờ gần nhất.

Saved answer:

> Theo tài liệu “Sao Bắc — Ứng phó khóa dịch vụ bị lộ.md”, khi nghi dịch vụ đã bị rò rỉ, quy trình ứng phó gồm các bước sau :
>
> 1. **Thu hồi (revoke) khóa hiện tại**
> 2. **Cấp lại (issue) khóa mới**
> 3. **Kiểm tra log** – đảm bảo mọi token, mật khẩu và dữ liệu riêng tư đã được che trong log, và kiểm tra các log **trong 14 giờ gần nhất** để phát hiện mọi dấu hiệu rò rỉ hoặc hành vi bất thường.
>
> (Trích từ tài liệu: “Khi nghi khóa dịch vụ bị lộ, thu hồi khóa, cấp khóa mới và kiểm tra log đã che dữ liệu trong 14 giờ gần nhất.” [1])

**faithfulness:** The purpose of examining logs from the last 14 hours is to detect any signs of leakage or abnormal behavior.

While the context instructs to check the logs, it does not explicitly state the _purpose_ is to 'detect any signs of leakage or abnormal behavior'. It only specifies the action (checking masked data in the last 14 hours). Inferring the specific purpose of detecting leakage/abnormality is an assumption not directly supported by the text, which focuses on the procedural step of verifying masking.

### Q46 — manual CORRECT

Question: Theo tài liệu “Sao Bắc — Ngân sách lỗi và phát hành.md” của dự án Sao Bắc, đã dùng hơn 46% ngân sách lỗi tuần. Những loại phát hành nào còn được phép và ai duyệt?

Reference: Khi đã dùng hơn 46% ngân sách lỗi tuần, tạm dừng phát hành tính năng và chỉ cho phép bản sửa tăng độ ổn định được người trực duyệt.

Saved answer:

> Khi đã tiêu thụ hơn 46 % ngân sách lỗi trong tuần, dự án **đình chỉ việc phát hành các tính năng mới** và chỉ cho phép **các bản sửa (patch) nhằm tăng độ ổn định** được triển khai. Các bản sửa này phải **được người trực (người on‑call) duyệt** trước khi thực hiện【1†L1-L2】.

**faithfulness:** Dự án Sao Bắc đã tiêu thụ hơn 46% ngân sách lỗi trong tuần.

The context defines a rule: 'Khi đã dùng hơn 46% ngân sách lỗi tuần...' (When more than 46% of the weekly error budget is used...). It describes a conditional policy for action, but it does not state that the project has actually consumed more than 46% of its budget at any specific time. Therefore, this factual claim cannot be inferred from the text.

### Q48 — manual CORRECT

Question: Theo tài liệu “Sao Bắc — Tách luồng thông báo.md”, hãy tổng hợp cách phân chia luồng, điều kiện tách dịch vụ và điều kiện quay về đường xử lý cũ.

Reference: Sao Bắc giữ thao tác ghi phiếu trong API đồng bộ và chuyển tác vụ phụ sang worker qua outbox trong cùng transaction. Chỉ tách dịch vụ khi tác vụ phụ chiếm hơn 26% thời gian API trong 5 ngày liên tiếp và có nhóm vận hành nhận trách nhiệm. Nếu độ trễ sự kiện vượt 30 giây trong 4 phút, tắt cờ tách luồng và dùng đường xử lý cũ đã kiểm tra.

Saved answer:

> **Cách phân chia luồng (theo “Sao Bắc — Tách luồng thông báo”)**
>
> - Giao dịch ghi phiếu được thực hiện **trong API đồng bộ**; các tác vụ phụ (ví dụ gửi sự kiện, xử lý hậu‑giao) được **đẩy sang worker thông qua outbox** trong cùng một transaction.
> - Như vậy, **luồng đồng bộ** bảo vệ tính nhất quán nghiệp vụ, còn **luồng bất đồng bộ** chịu trách nhiệm thực hiện các công việc có thể hoàn tất sau khi transaction đã commit【1†L9-L12】.
>
> **Điều kiện để tách dịch vụ**
>
> - Chỉ thực hiện tách luồng khi **tác vụ phụ chiếm hơn 26 % thời gian API** trong **5 ngày liên tiếp** và **có nhóm vận hành nhận trách nhiệm**【1†L31-L33】.
>
> **Điều kiện quay trở lại đường xử lý cũ**
>
> - **Giữ đường xử lý cũ trong 9 ngày** sau khi chuyển đổi, để có thể quay lại nếu cần【4†L57-L59】.
> - Nếu **độ trễ sự kiện vượt 30 giây trong 4 phút**, phải **tắt cờ tách luồng và quay lại đường xử lý cũ đã kiểm tra**【1†L46-L48】.
>
> Tóm lại, dự án Sao Bắc tách luồng bằng cách giữ phần ghi phiếu đồng bộ và chuyển các công việc phụ sang worker bất đồng bộ; tách dịch vụ chỉ được kích hoạt khi tác vụ phụ chiếm > 26 % thời gian API trong 5 ngày liên tục và có nhóm vận hành chịu trách nhiệm; và nếu xảy ra độ trễ lớn hoặc trong vòng 9 ngày sau chuyển đổi, hệ thống phải quay lại sử dụng đường xử lý cũ.

**faithfulness:** Theo tài liệu “Sao Bắc — Tách luồng thông báo”, đường xử lý cũ được giữ trong 9 ngày sau khi chuyển đổi để có thể quay lại nếu cần.

The context for 'Sao Bắc' does not mention a 9-day retention period. The 9-day retention ('Giữ đường xử lý cũ trong 9 ngày sau chuyển đổi') is found in the section for 'Mây Trắng — Tách luồng báo cáo'. Therefore, this statement is not supported by the 'Sao Bắc' document.

**faithfulness:** Dự án Sao Bắc yêu cầu hệ thống quay lại sử dụng đường xử lý cũ nếu xảy ra độ trễ lớn hoặc trong vòng 9 ngày sau chuyển đổi.

The 'Sao Bắc' document specifies rolling back if latency exceeds 30s in 4 minutes. However, the '9 days after conversion' retention period is specified in the 'Mây Trắng' document, not 'Sao Bắc'. Therefore, the part about '9 days' is not faithful to the 'Sao Bắc' context.

### Q49 — manual CORRECT

Question: Theo tài liệu “Mây Trắng — Điều kiện hoàn tất ticket.md”, hãy tổng hợp điều kiện hoàn tất ticket, phê duyệt và review hotfix, cùng cách xử lý khi lỗi tái hiện.

Reference: Ticket của Mây Trắng chỉ hoàn tất khi đủ tiêu chí chấp nhận, bằng chứng test và review của người khác người viết. Hotfix cần người trực Incident duyệt trước khi triển khai; bổ sung review độc lập trong 14 giờ sau triển khai. Nếu lỗi tái hiện sau hotfix, mở lại ticket, quay về bản ổn định và tổ chức đối soát trong 3 ngày làm việc.

Saved answer:

> **Điều kiện hoàn tất ticket (theo “Mây Trắng — Điều kiện hoàn tất ticket”)**
>
> 1. **Tiêu chí chấp nhận phải được đáp ứng** – các yêu cầu nghiệp vụ, ràng buộc và giới hạn đã được xác nhận là đúng.
> 2. **Có bằng chứng test** – kết quả thực tế (log, dashboard, dữ liệu nguồn) phải được ghi lại và so sánh với kết quả mong đợi; không được dựa chỉ vào thông báo “thành công” trên giao diện.
> 3. **Review bởi người khác** – pull‑request phải **liên kết** với ticket và phải được **người review không phải người viết** xác nhận.
> 4. **Không đánh dấu hoàn tất chỉ vì PR đã merge** – trước khi đóng, người trực phải đối chiếu dữ liệu nguồn, ghi lại thời điểm và mã phiên bản vào ticket.
> 5. **Mỗi pull request chỉ gắn tối đa 2 ticket có cùng mục tiêu**.
>
> _(Nguồn: [2] “Ticket của Mây Trắng chỉ hoàn tất khi đủ tiêu chí chấp nhận, bằng chứng test và review của người khác người viết.”; [2] “Ticket có mục tiêu kiểm chứng, pull request liên kết ticket, và người review khác người viết.”)_
>
> ---
>
> **Phê duyệt và review hotfix**
>
> 1. **Duyệt trước khi triển khai** – hotfix phải được **người trực Incident (on‑call)** phê duyệt trước khi đưa lên môi trường.
> 2. **Review độc lập** – sau khi hotfix được triển khai, phải có **review độc lập** (người khác) trong vòng **14 giờ**.
>
> _(Nguồn: [2] “Hotfix cần người trực Incident duyệt trước khi triển khai; bổ sung review độc lập trong 14 giờ sau triển khai.”)_
>
> ---
>
> **Xử lý khi lỗi tái hiện sau hotfix**
>
> 1. **Mở lại ticket** – nếu lỗi xuất hiện lại, tạo lại (hoặc mở lại) ticket liên quan.
> 2. **Quay về bản ổn định** – trở lại phiên bản/điểm kiểm tra đã được xác nhận ổn định trước khi áp dụng hotfix.
> 3. **Tổ chức đối soát** – thực hiện đối soát, thu thập bằng chứng và ghi lại kết quả trong **3 ngày làm việc**.
> 4. **Chuẩn bị dữ liệu mẫu** – liệt kê các trường hợp hợp lệ, vi phạm và lặp; ghi lại kết quả mong đợi, quan sát và nguồn dữ liệu. Nếu có bất kỳ khác biệt nào, **ngừng triển khai** và yêu cầu người phụ trách đánh giá.
> 5. **Không sửa số liệu trong biên bản** – mọi khác biệt phải được giữ lại làm bằng chứng để xác định nguyên nhân.
> 6. **Sau khi kiểm tra** – nếu lỗi vẫn chưa khắc phục, giữ ticket mở; nếu đã khắc phục, bổ sung một ví dụ tái hiện vào bộ kiểm tra của dự án.
>
> _(Nguồn: [1] “Nếu lỗi tái hiện sau hotfix, mở lại ticket, quay về bản ổn định và tổ chức đối soát trong 3 ngày làm việc.”; [1] các hướng dẫn về chuẩn bị danh sách yêu cầu mẫu và không sửa số liệu trong biên bản.)_

**faithfulness:** Theo tài liệu “Mây Trắng — Điều kiện hoàn tất ticket”, trước khi đóng ticket, người trực phải ghi lại thời điểm và mã phiên bản vào ticket.

Tài liệu yêu cầu ghi thời điểm và mã phiên bản vào ticket trong phần 'Quy định cấu hình' ('Trước mỗi lần áp dụng... ghi thời điểm và mã phiên bản vào ticket'), nhưng không nêu rõ yêu cầu này là điều kiện bắt buộc _trước khi đóng ticket_ trong phần 'Quay lại và hoàn tất'. Phần 'Quay lại và hoàn tất' yêu cầu đối chiếu dữ liệu nguồn, xác nhận tác dụng phụ và yêu cầu thành viên khác đọc lại bằng chứng. Việc ghi thời điểm/mã phiên bản được nêu trong ngữ cảnh 'trước mỗi lần áp dụng', không nhất thiết là bước cuối cùng trước khi đóng ticket theo văn bản cụ thể của phần đóng ticket. Tuy nhiên, nhìn chung quy trình yêu cầu gắn mã phiên bản. Nhưng nếu xét kỹ, câu phát biểu nói 'trước khi đóng ticket... phải ghi lại', trong khi văn bản chỉ nói 'Trước mỗi lần áp dụng... ghi...'. Có sự khác biệt về thời điểm. Do đó, không thể suy luận trực tiếp rằng đây là bước bắt buộc _ngay trước khi đóng_ theo đúng văn bản phần 'Quay lại và hoàn tất'.

**faithfulness:** Theo tài liệu “Mây Trắng — Điều kiện hoàn tất ticket”, khi lỗi tái hiện, hệ thống phải quay về phiên bản hoặc điểm kiểm tra đã được xác nhận ổn định trước khi áp dụng hotfix.

Tài liệu nêu: 'Nếu lỗi tái hiện sau hotfix, mở lại ticket, quay về bản ổn định...'. Tuy nhiên, câu phát biểu nói 'trước khi áp dụng hotfix', trong khi văn bản nói 'sau hotfix' thì mới quay về bản ổn định. Đây là hành động khắc phục sau khi lỗi tái hiện, không phải điều kiện trước khi áp dụng hotfix ban đầu. Do đó, phát biểu này sai về mặt thời gian/tình huống.

### Q50 — manual CORRECT

Question: Theo tài liệu “Sao Bắc — Luồng hotfix khẩn cấp.md”, hãy tổng hợp điều kiện hoàn tất ticket, phê duyệt và review hotfix, cùng cách xử lý khi lỗi tái hiện.

Reference: Ticket của Sao Bắc chỉ hoàn tất khi đủ tiêu chí chấp nhận, bằng chứng test và review của người khác người viết. Hotfix cần người trực Incident duyệt trước khi triển khai; bổ sung review độc lập trong 16 giờ sau triển khai. Nếu lỗi tái hiện sau hotfix, mở lại ticket, quay về bản ổn định và tổ chức đối soát trong 4 ngày làm việc.

Saved answer:

> **Điều kiện hoàn tất ticket (theo “Sao Bắc — Luồng hotfix khẩn cấp.md”)**
>
> - Ticket chỉ được đánh dấu _hoàn tất_ khi **đủ ba yếu tố**:
>   1. **Tiêu chí chấp nhận** (acceptance criteria) được đáp ứng;
>   2. **Bằng chứng test** (kết quả thử nghiệm, dữ liệu đo) được ghi lại;
>   3. **Review** của **người khác** với người viết ticket.  [3]
> - Mỗi ticket phải có **mục tiêu kiểm chứng**, **pull request** được liên kết với ticket và **người review** phải là người khác với người tạo ticket. [3]
> - Trước khi đóng, người trực phải **đối chiếu dữ liệu nguồn**, **xác nhận không có tác dụng phụ** và **yêu cầu một thành viên khác đọc lại bằng chứng**; biên bản phải ghi lại tác động, nguyên nhân đã xác minh và người phụ trách hành động. [1]
>
> **Phê duyệt và review hotfix**
>
> - **Hotfix** phải được **người trực Incident duyệt** trước khi triển khai. [3]
> - Sau khi hotfix được đưa vào, cần **review độc lập** được thực hiện **trong vòng 16 giờ** để kiểm chứng lại kết quả và không để lại lỗi tiềm ẩn. [3]
>
> **Xử lý khi lỗi tái hiện**
>
> - Nếu lỗi **tái hiện lại** sau khi hotfix đã được áp dụng:
>   1. **Mở lại ticket** (không đóng);
>   2. **Quay lại phiên bản ổn định** trước khi hotfix;
>   3. **Tổ chức đối soát** (review, đo lường lại) **trong vòng 4 ngày làm việc** để xác định nguyên nhân và đưa phương án khắc phục. [2]
> - Nếu kiểm tra cuối cùng vẫn **không đạt tiêu chuẩn**, ticket phải **giữ mở** và không đánh dấu hoàn tất cho tới khi thực tế được khắc phục, đồng thời cập nhật lịch báo cáo. [1]
>
> Tóm lại, ticket chỉ khép lại khi đáp ứng tiêu chí, bằng chứng và review độc lập; hotfix cần duyệt trước triển khai và được kiểm tra lại trong 16 giờ; khi lỗi xuất hiện lại, ticket được mở lại, quay về phiên bản ổn định và thực hiện đối soát trong 4 ngày làm việc.

**faithfulness:** Trước khi đóng ticket, người trực phải xác nhận không có tác dụng phụ.

The context states: 'xác nhận tác dụng phụ' (confirm side effects). While it doesn't explicitly say 'no side effects', confirming side effects implies verifying their status (usually absence or acceptability) before closing. In the context of closing a ticket, this is a standard interpretation of 'confirming side effects' in a QA context, but strictly speaking, the text says 'confirm side effects'. However, looking at the next sentence 'yêu cầu một thành viên khác đọc lại bằng chứng', the action is part of the pre-close checklist. The statement 'confirm no side effects' is a reasonable inference of 'confirm side effects' in a completion context, but let's look closer. Actually, 'xác nhận tác dụng phụ' means 'confirm side effects'. It doesn't explicitly say 'no side effects'. However, usually, you confirm that side effects are handled or absent. Let's look at the exact wording: 'xác nhận tác dụng phụ'. It is a direct action. The statement says 'confirm no side effects'. This is a slight semantic shift. But in NLI, if the text says 'check for side effects', does it imply 'confirm no side effects'? Not necessarily. It could mean 'confirm the nature of side effects'. However, given the context of 'closing a ticket', it is highly likely referring to ensuring stability. Let's look at the other statements. Statement 9 is 'confirm no side effects'. The text says 'xác nhận tác dụng phụ'. This is ambiguous. Let's look at the next part. 'yêu cầu một thành viên khác đọc lại bằng chứng'. The text does not explicitly say 'no side effects'. It says 'confirm side effects'. I will mark this as 0 because 'confirm side effects' is not identical to 'confirm no side effects'. Wait, looking at standard NLI tasks, if the text says 'check for errors', and the statement is 'check for no errors', it's often considered not strictly entailed. However, let's re-read carefully. 'xác nhận tác dụng phụ' -> 'confirm side effects'. The statement is 'confirm no side effects'. This is a specific negative claim not explicitly in the text. The text just says to confirm them. So, verdict 0.

**faithfulness:** Mục đích của review độc lập sau khi đưa hotfix vào là kiểm chứng lại kết quả và đảm bảo không để lại lỗi tiềm ẩn.

The context mentions the requirement for an independent review but does not explicitly state its _purpose_ as 'verifying results and ensuring no latent errors'. It only states the timing and the requirement. The purpose is an inference, not a direct statement.

**faithfulness:** Nếu lỗi tái hiện lại sau khi hotfix đã được áp dụng, hệ thống phải quay lại phiên bản ổn định trước khi áp dụng hotfix.

The context states: 'quay về bản ổn định' (return to stable version). It does not explicitly specify 'before applying the hotfix' (i.e., the version prior to the hotfix). It just says 'stable version'. While likely the same, the text doesn't define 'stable version' as 'the version before the hotfix'. It could be any stable version. However, in the context of a hotfix failure, 'stable version' usually implies the last known good state. But strictly, the text says 'quay về bản ổn định'. The statement adds 'trước khi áp dụng hotfix'. This is a specific detail not in the text. Verdict 0.

**faithfulness:** Nếu lỗi tái hiện lại sau khi hotfix đã được áp dụng, cần tổ chức đối soát (review, đo lường lại) trong vòng 4 ngày làm việc.

The context states: 'tổ chức đối soát trong 4 ngày làm việc' (organize reconciliation within 4 working days) in the section 'Kiểm tra trước khi áp dụng' which follows the condition 'Nếu lỗi tái hiện sau hotfix'. Note: There are multiple sections with different numbers (3, 4, 10 days). The section starting with '## Chẩn đoán và giới hạn' mentions '4 ngày làm việc' in the context of 'Nếu lỗi tái hiện sau hotfix'. Wait, let's check the text carefully.
Section 1 (Chẩn đoán...): 'Nếu lỗi tái hiện sau hotfix, mở lại ticket, quay về bản ổn định và tổ chức đối soát trong 4 ngày làm việc.'
Section 2 (Sao Bắc...): 'Nếu lỗi tái hiện sau hotfix, mở lại ticket, quay về bản ổn định và tổ chức đối soát trong 3 ngày làm việc.'
Section 3 (Sen Hồng...): 'Nếu lỗi tái hiện sau hotfix, mở lại ticket, quay về bản ổn định và tổ chức đối soát trong 10 ngày làm việc.'
The prompt asks to judge based on the _given context_. The context contains conflicting information (3, 4, and 10 days). However, the first instance in the provided text block (under '## Chẩn đoán và giới hạn') says 4 days. The second instance (under '## Sao Bắc — Luồng hotfix khẩn cấp') says 3 days. The third says 10 days.
Usually, in these RAG benchmarks, if there is a specific section titled 'Sao Bắc — Luồng hotfix khẩn cấp', that might be the primary source. In that section, it says '3 ngày làm việc'.
Let's re-read the input context structure.
The context starts with a fragment, then '## Chẩn đoán và giới hạn' (4 days), then '## Sao Bắc — Luồng hotfix khẩn cấp' (3 days), then '## Ví dụ trong dự án' (Sen Hồng, 10 days).
The statement says '4 days'. The section 'Sao Bắc' says '3 days'. The section 'Chẩn đoán' says '4 days'.
If the question implies the general rule for 'Sao Bắc', the section titled 'Sao Bắc' says 3 days. The section 'Chẩn đoán' might be a general diagnostic section or a different scenario.
However, looking at the first part of the context, it seems to be a continuation or a different part.
Let's look at the statement again: 'cần tổ chức đối soát ... trong vòng 4 ngày làm việc'.
In the section '## Chẩn đoán và giới hạn', it says 4 days.
In the section '## Sao Bắc — Luồng hotfix khẩn cấp', it says 3 days.
Since the document title is 'Sao Bắc — Luồng hotfix khẩn cấp', and there is a specific section with that title stating 3 days, the statement claiming 4 days is likely false for the main project rules, or at least contradicted by the specific project section.
However, the context is a single blob. If the context contains both 3 and 4, is the statement '4 days' faithful? It is faithful to _part_ of the context. But usually, if there is a contradiction, the specific project section overrides general ones, or the statement is considered not fully supported if it picks one conflicting value without qualification.
Let's look at the other statements. Statement 18 says '4 days'.
Let's check the section '## Chẩn đoán và giới hạn'. It says 'Trong một sự cố giả lập...'.
The section '## Sao Bắc — Luồng hotfix khẩn cấp' says 'Dự án Sao Bắc...'.
The statement does not specify which scenario.
However, typically, the main title section is the authority. The main title section says 3 days. Therefore, a statement saying 4 days is not faithful to the main rule.
Verdict 0.

**faithfulness:** Mục đích của việc đối soát khi lỗi tái hiện là xác định nguyên nhân và đưa ra phương án khắc phục.

The context states to 'organize reconciliation' (tổ chức đối soát) but does not explicitly state the _purpose_ as 'identifying cause and providing solution'. It is an inference.

**faithfulness:** Nếu kiểm tra cuối cùng vẫn không đạt tiêu chuẩn, lịch báo cáo phải được cập nhật.

The context states: 'không đánh dấu hoàn tất để kịp lịch báo cáo' (do not mark complete to meet reporting schedule). It does _not_ say the reporting schedule must be updated. It says don't fake the completion to meet the schedule. It doesn't mandate updating the schedule.

**faithfulness:** Khi lỗi xuất hiện lại, ticket được mở lại, hệ thống quay về phiên bản ổn định và thực hiện đối soát trong 4 ngày làm việc.

As analyzed in statement 18, the main 'Sao Bắc' section specifies 3 days, while another section specifies 4 days. Given the specific project section says 3 days, stating 4 days is not faithful to the primary rule for Sao Bắc. Additionally, 'hệ thống quay về phiên bản ổn định' is a simplification of 'quay về bản ổn định' (which might be a manual action or system rollback, but the text says 'quay về' which can be interpreted as the system or the state). The main issue is the 4 days vs 3 days conflict. The section titled 'Sao Bắc' is the most relevant. It says 3 days. Therefore, the statement is false.
