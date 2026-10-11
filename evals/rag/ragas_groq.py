"""Evaluate saved RAG answers with Ragas/Groq; never rerun retrieval or ingestion."""

import argparse
import asyncio
import base64
import csv
import fcntl
import hashlib
import importlib.metadata
import io
import json
import math
import os
import time
from datetime import datetime, timezone
from collections import Counter
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
MODEL = "qwen/qwen3.8-27b"
METRICS = ("faithfulness", "context_recall")
DEFAULT_RUNS = (
    "2026-10-07T13-21-37-901Z",
    "2026-10-08T14-10-09-056Z",
    "2026-10-09T11-09-45-574Z",
)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def atomic_json(path, value):
    temp = path.with_suffix(path.suffix + ".tmp")
    with temp.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.flush()
        os.fsync(handle.fileno())
    temp.replace(path)


def load_runs(paths, root=ROOT):
    samples, provenance, seen = [], [], set()
    for path in paths:
        path = Path(path).resolve()
        if not path.name.endswith(".answers.jsonl"):
            raise ValueError("Expected .answers.jsonl input")
        base = str(path)[:-len(".answers.jsonl")]
        meta_path, grades_path = Path(base + ".meta.json"), Path(base + ".grades.csv")
        meta_raw, answers_raw, grades_raw = meta_path.read_bytes(), path.read_bytes(), grades_path.read_bytes()
        meta = json.loads(meta_raw)
        dataset_path = root / meta.get("datasetPath", "evals/rag/pilot-10.jsonl")
        dataset_raw = dataset_path.read_bytes()
        if digest(dataset_raw) != meta["datasetSha256"]:
            raise ValueError(f"Dataset hash mismatch: {dataset_path.name}")
        dataset = [json.loads(line) for line in dataset_raw.decode().splitlines() if line.strip()]
        answers = [json.loads(line) for line in answers_raw.decode().splitlines() if line.strip()]
        grades = list(csv.DictReader(io.StringIO(grades_raw.decode(), newline="")))
        by_id = {q["id"]: q for q in dataset}
        grade_by_id = {g["id"]: g for g in grades}
        ids = [a["id"] for a in answers]
        if len(by_id) != len(dataset) or len(set(ids)) != len(ids):
            raise ValueError("Duplicate dataset or answer IDs")
        if ids != meta["questionIds"] or not set(ids) <= set(by_id):
            raise ValueError("Answer IDs differ from metadata/dataset")
        if len(grade_by_id) != len(grades) or set(grade_by_id) != set(ids):
            raise ValueError("Missing/duplicate grade IDs")
        if meta.get("aiMock") is not False:
            raise ValueError("Input must record real AI (aiMock=false)")
        for answer in answers:
            qid = answer["id"]
            if qid in seen:
                raise ValueError(f"Duplicate question across runs: {qid}")
            question, grade = by_id[qid], grade_by_id[qid]
            verdict = grade["verdict"].strip().upper()
            if verdict not in ("CORRECT", "INCORRECT"):
                raise ValueError(f"{qid}: incomplete/error/invalid grade")
            if answer["question"] != question["question"]:
                raise ValueError(f"{qid}: question mismatch")
            contexts = [s["content"] for s in answer.get("sources", [])]
            if not contexts or not all(isinstance(c, str) and c.strip() for c in contexts):
                raise ValueError(f"{qid}: missing retrieved context")
            if answer.get("answered") is not True or not answer.get("content", "").strip():
                raise ValueError(f"{qid}: missing answer")
            if not question["expectedAnswer"].strip():
                raise ValueError(f"{qid}: missing reference")
            samples.append({
                "id": qid, "dataset": dataset_path.stem,
                "synthetic": dataset_path.stem == "test-rag-20",
                "user_input": question["question"], "response": answer["content"],
                "reference": question["expectedAnswer"], "retrieved_contexts": contexts,
                "requiredFacts": question["requiredFacts"], "sources": answer["sources"],
                "manual_verdict": verdict, "manual_reason": grade.get("reason", ""),
            })
            seen.add(qid)
        for source, raw in ((path, answers_raw), (meta_path, meta_raw), (grades_path, grades_raw), (dataset_path, dataset_raw)):
            provenance.append({"path": str(source), "sha256": digest(raw)})
    if not samples:
        raise ValueError("No questions to evaluate")
    return samples, provenance


class RunStore:
    """Exclusive writer; atomic checkpoint binds cached responses to provenance."""

    def __init__(self, path, provenance):
        self.path, self.provenance = Path(path), provenance

    def __enter__(self):
        self.path.mkdir(parents=True, exist_ok=True)
        self.lock = (self.path / ".lock").open("a")
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.lock.close()
            raise RuntimeError("Evaluation output is locked by another process") from None
        try:
            state_path = self.path / "state.json"
            self.data = json.loads(state_path.read_text()) if state_path.exists() else {
                "provenance": self.provenance, "createdAt": datetime.now(timezone.utc).isoformat(),
                "scores": {}, "errors": {}, "requests": [], "cache": {},
            }
            if self.data["provenance"] != self.provenance:
                raise ValueError("Resume provenance changed; use a new --out directory")
            self.save()
            return self
        except BaseException:
            self.lock.close()
            raise

    def save(self):
        atomic_json(self.path / "state.json", self.data)

    def __exit__(self, *_):
        self.lock.close()


class BudgetStop(RuntimeError):
    pass


def repair_truncated_outputs(store, max_tokens):
    """Explicitly repair only known incomplete steps, retaining baseline settings."""
    truncated = store.data.setdefault("truncatedOutputs", {})
    # Older checkpoints kept truncated HTTP 200 responses without this marker.
    known_responses = {failure["response_hash"] for failure in truncated.values()}
    for key, cached in store.data["cache"].items():
        if key in known_responses:
            continue
        response = json.loads(base64.b64decode(cached["body"]))
        if any(c.get("finish_reason") == "length" for c in response.get("choices", [])):
            truncated.setdefault(key, {"max_tokens": store.provenance["max_tokens"], "response_hash": key})
    if any(max_tokens <= failure["max_tokens"] for failure in truncated.values()):
        raise ValueError("Repair output cap must be greater than the truncated cap")
    overrides = store.data.setdefault("outputCapOverrides", {})
    history = store.data.setdefault("outputCapRepairs", [])
    for original_key, failure in truncated.items():
        overrides[original_key] = max_tokens
        store.data["cache"].pop(failure["response_hash"], None)
        history.append({"original_hash": original_key, "previous_max_tokens": failure["max_tokens"],
                        "max_tokens": max_tokens, "reason": "finish_reason=length",
                        "at": datetime.now(timezone.utc).isoformat()})
    count = len(truncated)
    truncated.clear()
    store.save()
    return count


def estimate_request(body):
    # A different tokenizer is an estimate, not a guarantee. Actual usage/headers
    # correct the ledger after each response; full contexts are never truncated.
    import tiktoken
    payload = json.loads(body)
    tokens = len(tiktoken.get_encoding("cl100k_base").encode(body.decode(), disallowed_special=()))
    return math.ceil(tokens * 1.15) + payload.get("max_tokens", 2048)


class BudgetTransport(httpx.AsyncBaseTransport):
    """Intercepts EVERY SDK/Instructor call, including internal metric steps."""

    def __init__(self, store, inner, *, clock=time.time, sleep=asyncio.sleep,
                 estimate=estimate_request, min_interval=4, requests_per_day=900,
                 tokens_per_day=180000, tokens_per_minute=7500,
                 max_requests=180, max_retries=2):
        self.store, self.inner, self.clock, self.sleep = store, inner, clock, sleep
        self.estimate, self.min_interval = estimate, min_interval
        self.requests_per_day, self.tokens_per_day = requests_per_day, tokens_per_day
        self.tokens_per_minute, self.max_requests = tokens_per_minute, max_requests
        self.max_retries, self.sent = max_retries, 0

    def stop(self, message):
        # Groq/Instructor can wrap transport errors; retain the reason independently.
        self.store.data["stopReason"] = message
        self.store.save()
        raise BudgetStop(message)

    async def handle_async_request(self, request):
        self.store.last_response_key = None
        body = await request.aread()
        original_key = digest(body)
        payload = json.loads(body)
        override = self.store.data.get("outputCapOverrides", {}).get(original_key)
        if override:
            payload["max_tokens"] = override
            body = json.dumps(payload, ensure_ascii=False).encode()
            headers = dict(request.headers)
            headers.pop("content-length", None)
            request = httpx.Request(request.method, request.url, headers=headers, content=body,
                                    extensions=request.extensions)
        key = digest(body)
        request_settings = {"hash": key, "original_hash": original_key, "max_tokens": payload.get("max_tokens")}
        if hasattr(self.store, "metric_requests"):
            self.store.metric_requests.append(request_settings)
        cached = self.store.data["cache"].get(key)
        if cached:
            self.store.last_response_key = key
            raw = base64.b64decode(cached["body"])
            if any(c.get("finish_reason") == "length" for c in json.loads(raw).get("choices", [])):
                self.store.data.setdefault("truncatedOutputs", {})[original_key] = {
                    "max_tokens": payload["max_tokens"], "response_hash": key,
                }
                self.store.save()
            return httpx.Response(200, headers=cached["headers"],
                                  content=raw, request=request)
        reserved = self.estimate(body)
        for attempt in range(self.max_retries + 1):
            while True:
                now = self.clock()
                day = datetime.fromtimestamp(now, timezone.utc).date().isoformat()
                rows = self.store.data["requests"]
                daily = [r for r in rows if r["day"] == day]
                if self.sent >= self.max_requests or len(daily) >= self.requests_per_day:
                    self.stop("Daily/invocation request budget reached")
                if sum(r["reserved_tokens"] for r in daily) + reserved > self.tokens_per_day:
                    self.stop("Estimated daily token budget reached")
                wait = max(0, (rows[-1]["at"] + self.min_interval - now) if rows else 0)
                recent = [r for r in rows if r["at"] > now - 61]
                # If our proxy tokenizer overestimates one request, try it alone
                # in an empty window. The provider remains the source of truth.
                if recent and sum(r["reserved_tokens"] for r in recent) + reserved > self.tokens_per_minute:
                    wait = max(wait, min(r["at"] for r in recent) + 61 - now)
                if wait <= 0:
                    break
                await self.sleep(wait)
            row = {"at": now, "day": day, "hash": key, "reserved_tokens": reserved}
            row.update(request_settings)
            row["estimated_tokens"] = reserved
            rows.append(row)
            self.sent += 1
            self.store.save()  # Interrupted/unknown requests remain charged conservatively.
            response = await self.inner.handle_async_request(request)
            await response.aread()
            row["status"] = response.status_code
            row["headers"] = {k: v for k, v in response.headers.items()
                              if k.startswith("x-ratelimit-") or k == "retry-after"}
            if response.is_success:
                result = response.json()
                usage = result.get("usage", {})
                row["usage"] = usage
                if isinstance(usage.get("total_tokens"), int):
                    row["reserved_tokens"] = usage["total_tokens"]
                self.store.data["cache"][key] = {
                    "headers": {"content-type": "application/json"},
                    "body": base64.b64encode(response.content).decode(),
                }
                self.store.last_response_key = key
                if any(c.get("finish_reason") == "length" for c in result.get("choices", [])):
                    self.store.data.setdefault("truncatedOutputs", {})[original_key] = {
                        "max_tokens": payload["max_tokens"], "response_hash": key,
                    }
                else:
                    self.store.data.get("truncatedOutputs", {}).pop(original_key, None)
            self.store.save()
            if response.status_code != 429:
                return response
            if attempt == self.max_retries:
                if self.max_retries == 0:
                    self.stop("Groq 429: retries disabled; resume later")
                self.stop("Groq 429: bounded retries exhausted")
            try:
                delay = float(response.headers.get("retry-after", "60"))
            except ValueError:
                delay = 60
            # A long daily-limit wait is a stop, not a background all-day retry.
            if delay > 300:
                self.stop("Groq 429: quota reset over 5 minutes away; resume later")
            await self.sleep(max(delay, self.min_interval))
        raise AssertionError("Unreachable")

    async def aclose(self):
        await self.inner.aclose()


async def evaluate_samples(samples, store, score, limit):
    for sample in samples[:limit]:
        qid = sample["id"]
        scores = store.data["scores"].setdefault(qid, {})
        for metric in METRICS:
            if metric in scores:
                continue
            try:
                store.data.pop("stopReason", None)
                store.last_response_key = None
                store.metric_requests = []
                result = await score(sample, metric)
                value = result["value"]
                if not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1:
                    raise ValueError("Invalid/NaN metric result")
                scores[metric] = result
                result["requests"] = store.metric_requests
                store.data["errors"].pop(qid + ":" + metric, None)
                store.save()
                print(f"{qid} {metric}: {value:.4f}", flush=True)
            except Exception as error:
                # Error strings may contain provider payloads or secrets. Persist
                # sanitized type/status only; BudgetStop messages are our own.
                message = store.data.get("stopReason") or (str(error) if isinstance(error, BudgetStop) else type(error).__name__)
                # A HTTP 200 may still contain invalid structured judge output.
                # Drop only that step so an explicit rerun can ask again while
                # retaining previous validated steps and their original scores.
                bad_key = getattr(store, "last_response_key", None)
                if bad_key and not store.data.get("stopReason"):
                    store.data["cache"].pop(bad_key, None)
                store.data["errors"][qid + ":" + metric] = message
                store.save()
                print(f"Stopped at {qid}/{metric}: {message}", flush=True)
                return False
    return True


def export_reports(samples, store):
    rows, groups = [], {}
    for sample in samples:
        scores = store.data["scores"].get(sample["id"], {})
        row = {"id": sample["id"], "dataset": sample["dataset"],
               "manual_verdict": sample["manual_verdict"]}
        for metric in METRICS:
            row[metric] = scores.get(metric, {}).get("value", "")
        row["status"] = "COMPLETE" if all(m in scores for m in METRICS) else "PENDING"
        row["error"] = "; ".join(store.data["errors"].get(sample["id"] + ":" + m, "")
                                  for m in METRICS).strip("; ")
        rows.append(row)
        groups.setdefault(sample["dataset"], []).append(row)
    with (store.path / "scores.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    summary = {"total": len(samples), "complete": sum(r["status"] == "COMPLETE" for r in rows),
               "requests": len(store.data["requests"]),
               "tokens_accounted": sum(r["reserved_tokens"] for r in store.data["requests"]),
               "datasets": {}}
    for name, group in {"ALL": rows, **groups}.items():
        summary["datasets"][name] = {}
        for metric in METRICS:
            values = [r[metric] for r in group if r[metric] != ""]
            summary["datasets"][name][metric] = {
                "mean": sum(values) / len(values) if values else None,
                "scored": len(values), "total": len(group),
            }
    atomic_json(store.path / "summary.json", summary)
    lines = ["# Ragas — Groq evaluation", "",
             "Manual correctness and automated metric scores measure different properties; scores below 1 require review, not an automatic INCORRECT verdict.", "",
             "Synthetic corpus questions: " + (", ".join(s["id"] for s in samples if s.get("synthetic")) or "none") + ". Datasets are reported separately.", "",
             f"Completed: {summary['complete']}/{len(samples)}. Requests: {summary['requests']}. Tokens accounted: {summary['tokens_accounted']} (actual usage where returned, estimates otherwise).", "",
             "Provenance, settings and structured judge statements/reasons: `state.json`.", "",
             f"Explicit output-cap repairs: {len(store.data.get('outputCapRepairs', []))}; only truncated steps use recorded overrides.", "",
             "| Dataset | Metric | Mean | Scored / total |", "| --- | --- | --- | --- |"]
    for name, metrics in summary["datasets"].items():
        for metric, values in metrics.items():
            mean = "pending" if values["mean"] is None else f"{values['mean']:.4f}"
            lines.append(f"| {name} | {metric} | {mean} | {values['scored']}/{values['total']} |")
    lines.extend(["", "## Questions needing inspection", ""])
    for row in rows:
        if row["status"] != "COMPLETE" or any(row[m] != "" and row[m] < 1 for m in METRICS):
            lines.append(f"- {row['id']}: {row['status']}; faithfulness={row['faithfulness']}; context_recall={row['context_recall']}; {row['error']}")
    lines.extend(["", "## Judge findings versus manual grades", ""])
    for sample, row in zip(samples, rows):
        findings = []
        for metric, result in store.data["scores"].get(sample["id"], {}).items():
            for detail in result.get("details", []):
                for item in detail["result"].get("classifications", detail["result"].get("statements", [])):
                    if isinstance(item, dict) and (item.get("verdict") == 0 or item.get("attributed") == 0):
                        findings.append((metric, item))
        if findings:
            lines.extend([f"### {sample['id']} — manual {sample['manual_verdict']}", "",
                          "Question: " + sample.get("user_input", ""), "",
                          "Reference: " + sample.get("reference", ""), "",
                          "Saved answer:", "",
                          "\n".join("> " + line for line in sample.get("response", "").splitlines()), ""])
            for metric, item in findings:
                lines.extend([f"**{metric}:** {item['statement']}", "", item['reason'], ""])
    (store.path / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def make_scorer(client, model, max_tokens):
    # Disable third-party telemetry before importing Ragas/Instructor.
    os.environ["RAGAS_DO_NOT_TRACK"] = "true"
    os.environ["INSTRUCTOR_DISABLE_TELEMETRY"] = "1"
    import instructor
    from ragas.llms.base import InstructorBaseRagasLLM, InstructorLLM
    from ragas.metrics.collections import ContextRecall, Faithfulness

    # Ragas 0.4.3's generic factory assumes client.messages.create for Groq.
    # Use Instructor's native Groq adapter with the unmodified Ragas LLM/metrics.
    delegate = InstructorLLM(
        client=instructor.from_groq(client, mode=instructor.Mode.MD_JSON),
        model=model, provider="groq", temperature=0, top_p=1,
        max_tokens=max_tokens, max_retries=1,
    )

    class RecordingLLM(InstructorBaseRagasLLM):
        def __init__(self):
            self.details = []

        def generate(self, *_):
            raise RuntimeError("Only async scoring is supported")

        async def agenerate(self, prompt, response_model):
            result = await delegate.agenerate(prompt, response_model)
            if response_model.__name__ == "NLIStatementOutput":
                if any(s.verdict not in (0, 1) for s in result.statements):
                    raise ValueError("Judge must return binary verdicts")
                generated = self.details[-1]["result"]["statements"]
                if Counter(generated) != Counter(s.statement for s in result.statements):
                    raise ValueError("Judge omitted/changed statements")
            if response_model.__name__ == "ContextRecallOutput":
                if any(s.attributed not in (0, 1) for s in result.classifications):
                    raise ValueError("Judge must return binary attributions")
            self.details.append({"schema": response_model.__name__, "result": result.model_dump()})
            return result

    llm = RecordingLLM()
    metrics = {"faithfulness": Faithfulness(llm=llm), "context_recall": ContextRecall(llm=llm)}

    async def score(sample, metric):
        llm.details = []
        arguments = {"user_input": sample["user_input"], "retrieved_contexts": sample["retrieved_contexts"]}
        if metric == "faithfulness":
            arguments["response"] = sample["response"]
        else:
            arguments["reference"] = sample["reference"]
        result = await metrics[metric].ascore(**arguments)
        return {"value": result.value, "details": llm.details,
                "scoredAt": datetime.now(timezone.utc).isoformat()}

    return score


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--answers", nargs="+", type=Path,
                        default=[ROOT / "evals/rag/results" / (run + ".answers.jsonl") for run in DEFAULT_RUNS])
    parser.add_argument("--out", type=Path, default=ROOT / "evals/rag/results/ragas-groq-qwen-50")
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--limit", type=int, default=5, help="First N questions, including already scored questions")
    parser.add_argument("--max-requests", type=int, default=30, help="Maximum NEW requests in this invocation")
    parser.add_argument("--max-retries", type=int, choices=(0, 1, 2), default=2,
                        help="Retries per HTTP 429; use 0 to stop at the first 429")
    parser.add_argument("--requests-per-day", type=int, default=900)
    parser.add_argument("--tokens-per-day", type=int, default=180000)
    parser.add_argument("--tokens-per-minute", type=int, default=7500)
    parser.add_argument("--min-interval", type=float, default=4)
    parser.add_argument("--max-tokens", type=int, default=2048)
    parser.add_argument("--repair-truncated-max-tokens", type=int,
                        help="Explicitly increase output cap only for previously truncated steps; records repair history")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--report-only", action="store_true")
    args = parser.parse_args()
    if any(getattr(args, name) <= 0 for name in (
        "limit", "max_requests", "requests_per_day", "tokens_per_day", "tokens_per_minute", "min_interval", "max_tokens"
    )):
        parser.error("Budgets, limit and interval must be positive")
    if args.repair_truncated_max_tokens is not None and args.repair_truncated_max_tokens <= 0:
        parser.error("Repair output cap must be positive")
    if args.repair_truncated_max_tokens and (args.dry_run or args.report_only):
        parser.error("Repair cannot be combined with --dry-run or --report-only")
    samples, inputs = load_runs(args.answers)
    if args.limit > len(samples):
        parser.error("--limit exceeds input question count")
    if args.dry_run:
        print(json.dumps({"questions": len(samples), "selected": args.limit, "model": args.model,
                          "metrics": METRICS, "estimated_base_requests": args.limit * 3,
                          "datasets": {n: sum(s['dataset'] == n for s in samples) for n in sorted({s['dataset'] for s in samples})}}, indent=2))
        return 0
    settings = {"formatVersion": 1, "inputs": inputs, "model": args.model,
                "versions": {name: importlib.metadata.version(name) for name in ("ragas", "groq", "instructor", "httpx", "tiktoken", "langchain-community")},
                "adapter": "Instructor native Groq MD_JSON -> Ragas InstructorLLM",
                "metrics": list(METRICS), "temperature": 0, "top_p": 1, "max_tokens": args.max_tokens,
                "reference": "expectedAnswer", "language": "original Vietnamese; stock Ragas prompts",
                "estimate": "cl100k_base * 1.15 + max_tokens"}
    with RunStore(args.out, settings) as store:
        try:
            if args.report_only:
                return 0
            from dotenv import load_dotenv
            from groq import AsyncGroq
            load_dotenv(ROOT / ".env")
            if not os.environ.get("GROQ_API_KEY"):
                raise ValueError("GROQ_API_KEY is required")
            store.data.setdefault("invocations", []).append({
                "at": datetime.now(timezone.utc).isoformat(), "limit": args.limit,
                **{name: getattr(args, name) for name in ("max_requests", "max_retries", "requests_per_day", "tokens_per_day",
                                                        "tokens_per_minute", "min_interval")},
                "repair_truncated_max_tokens": args.repair_truncated_max_tokens,
            })
            store.save()
            if args.repair_truncated_max_tokens:
                repaired = repair_truncated_outputs(store, args.repair_truncated_max_tokens)
                print(f"Output cap repaired for {repaired} truncated step(s)", flush=True)
            transport = BudgetTransport(store, httpx.AsyncHTTPTransport(),
                                        min_interval=args.min_interval, requests_per_day=args.requests_per_day,
                                        tokens_per_day=args.tokens_per_day, tokens_per_minute=args.tokens_per_minute,
                                        max_requests=args.max_requests, max_retries=args.max_retries)
            async with AsyncGroq(api_key=os.environ["GROQ_API_KEY"], max_retries=0,
                                 http_client=httpx.AsyncClient(transport=transport, timeout=120)) as client:
                score = make_scorer(client, args.model, args.max_tokens)
                complete = await evaluate_samples(samples, store, score, args.limit)
                return 0 if complete else 2
        finally:
            export_reports(samples, store)
            print(f"Reports: {store.path}", flush=True)


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except KeyboardInterrupt:
        print("Interrupted; completed steps are checkpointed. Resume with the same --out.")
        raise SystemExit(130)
    except Exception as error:
        # Do not expose provider request/response payloads on stderr.
        print(f"Failed: {type(error).__name__}" + (f": {error}" if isinstance(error, (ValueError, BudgetStop)) else ""))
        raise SystemExit(1)
