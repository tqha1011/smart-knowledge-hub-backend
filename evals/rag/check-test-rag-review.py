"""Check review.py with temporary fixture answers, without calling AI or grading RAG."""
import csv
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
DATASET = ROOT / 'evals/rag/test-rag-20.jsonl'


def main():
    data = DATASET.read_bytes()
    questions = [json.loads(line) for line in data.decode().splitlines()]
    ids = [q['id'] for q in questions]
    assert ids == [f'Q{i}' for i in range(31, 51)]
    with tempfile.TemporaryDirectory(prefix='test-rag-review-') as folder:
        base = Path(folder) / 'fixture'
        answers_path = base.with_suffix('.answers.jsonl')
        answers_path.write_text(''.join(json.dumps({'id': q['id'], 'question': q['question'], 'content': 'FIXTURE ONLY — not a RAG answer.'}, ensure_ascii=False) + '\n' for q in questions), encoding='utf-8')
        with base.with_suffix('.csv').open('w', newline='', encoding='utf-8') as handle:
            writer = csv.DictWriter(handle, fieldnames=['id', 'actualAnswer', 'verdict', 'reason'])
            writer.writeheader()
            writer.writerows({'id': q['id'], 'actualAnswer': 'FIXTURE ONLY — not a RAG answer.', 'verdict': '', 'reason': ''} for q in questions)
        base.with_suffix('.meta.json').write_text(json.dumps({'datasetPath': 'evals/rag/test-rag-20.jsonl', 'datasetSha256': hashlib.sha256(data).hexdigest()}), encoding='utf-8')
        command = [sys.executable, str(ROOT / 'evals/rag/review.py'), str(answers_path)]
        subprocess.run(command, check=True, capture_output=True, text=True, cwd=ROOT)
        grades_path = base.with_suffix('.grades.csv')
        with grades_path.open(newline='', encoding='utf-8') as handle:
            reader = csv.DictReader(handle)
            assert reader.fieldnames == ['id', 'verdict', 'reason']
            grades = list(reader)
        assert [g['id'] for g in grades] == ids
        assert all(g['verdict'] == '' and g['reason'] == '' for g in grades)
        review = base.with_suffix('.review.md').read_text(encoding='utf-8')
        assert review.count('\n## Q') == 20
        assert all(f'## {question_id}\n' in review for question_id in ids)
        frozen_grades = grades_path.read_bytes()
        subprocess.run(command, check=True, capture_output=True, text=True, cwd=ROOT)
        assert grades_path.read_bytes() == frozen_grades
    assert DATASET.read_bytes() == data
    print('review.py: 20 review sections and 20 blank grading rows verified; existing datasets/results untouched. No AI calls or RAG grading.')


if __name__ == '__main__':
    main()
