"""Prepare a readable review and import manual grades without calling AI."""

import argparse
import csv
import hashlib
import json
from html import escape
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("answers", type=Path, help="Path to TIMESTAMP.answers.jsonl")
    parser.add_argument("--apply-grades", action="store_true")
    args = parser.parse_args()
    if not args.answers.name.endswith(".answers.jsonl"):
        parser.error("Expected a .answers.jsonl file")
    base = str(args.answers)[: -len(".answers.jsonl")]
    results_path = Path(base + ".csv")
    grades_path = Path(base + ".grades.csv")
    review_path = Path(base + ".review.md")
    with results_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        columns = reader.fieldnames
        results = list(reader)
    ids = [row["id"] for row in results]
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate result IDs")

    if args.apply_grades:
        with grades_path.open(newline="", encoding="utf-8") as handle:
            grades = list(csv.DictReader(handle))
        if len(grades) != len(ids) or {row["id"] for row in grades} != set(ids):
            raise ValueError("Grade IDs must match the result IDs exactly")
        by_id = {row["id"]: row for row in grades}
        for row in results:
            grade = by_id[row["id"]]
            verdict = grade["verdict"].strip().upper()
            if verdict not in ("", "CORRECT", "INCORRECT", "ERROR"):
                raise ValueError(f"{row['id']}: invalid verdict")
            if row["verdict"] == "ERROR" and verdict != "ERROR":
                raise ValueError(f"{row['id']}: pipeline error must remain ERROR")
            row.update(verdict=verdict, reason=grade["reason"])
        with results_path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=columns)
            writer.writeheader()
            writer.writerows(results)
        correct = sum(row["verdict"] == "CORRECT" for row in results)
        evaluated = sum(row["verdict"] in ("CORRECT", "INCORRECT") for row in results)
        errors = sum(row["verdict"] == "ERROR" for row in results)
        ungraded = len(results) - evaluated - errors
        print(f"Saved grades to {results_path}")
        print(f"Correct: {correct}/{evaluated}; errors: {errors}; ungraded: {ungraded}")
        return

    dataset_path = Path(__file__).with_name("pilot-10.jsonl")
    dataset_bytes = dataset_path.read_bytes()
    metadata = json.loads(Path(base + ".meta.json").read_text(encoding="utf-8"))
    if metadata["datasetSha256"] != hashlib.sha256(dataset_bytes).hexdigest():
        raise ValueError("Dataset changed since this run; use the original dataset")
    dataset = {
        row["id"]: row
        for row in map(json.loads, dataset_bytes.decode("utf-8").splitlines())
    }
    answers = [
        json.loads(line)
        for line in args.answers.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if [row["id"] for row in answers] != ids:
        raise ValueError("Answer IDs/order do not match the CSV")
    sections = [
        "# Chấm correctness — " + args.answers.name.removesuffix(".answers.jsonl"),
        f"Đọc từng câu dưới đây; điền nhãn và lý do trong `{grades_path.name}`.",
        "Dùng CORRECT nếu đủ mọi ý bắt buộc và không có khẳng định sai; "
        "INCORRECT nếu thiếu ý, sai thông tin hoặc từ chối dù có đáp án. "
        "ERROR dành cho lỗi pipeline. Chấp nhận cách diễn đạt tương đương, kể cả khác ngôn ngữ.",
    ]
    for answer, result in zip(answers, results):
        question = dataset[answer["id"]]
        actual = result["actualAnswer"] or answer.get("error", "")
        sections.extend([
            f"## {answer['id']}",
            "**Câu hỏi:** " + escape(question["question"]),
            "**Đáp án tham khảo:** " + escape(question["expectedAnswer"]),
            "**Các ý bắt buộc:**\n\n" + "\n".join("- " + escape(fact) for fact in question["requiredFacts"]),
            "**Câu trả lời RAG:**\n\n" + "\n".join("> " + line for line in actual.splitlines()),
            "**Bằng chứng chuẩn:**\n\n" + "\n".join(
                f"- {item['documentTitle']}: {item['quote']}" for item in question["evidence"]
            ),
        ])
    review_path.write_text("\n\n".join(sections) + "\n", encoding="utf-8")
    if not grades_path.exists():
        with grades_path.open("x", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=["id", "verdict", "reason"])
            writer.writeheader()
            writer.writerows({key: row[key] for key in writer.fieldnames} for row in results)
    print(f"Read answers: {review_path}")
    print(f"Enter grades: {grades_path}")


if __name__ == "__main__":
    main()
