"""Offline regressions for evaluation provenance, request budgets and resume."""

import csv
import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

import ragas_groq as rg

os.environ["RAGAS_DO_NOT_TRACK"] = "true"


def write_json(path, value):
    path.write_text(json.dumps(value), encoding="utf-8")


class Fixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.dataset = self.root / "dataset.jsonl"
        question = {
            "id": "Q01", "question": "Giờ họp?", "expectedAnswer": "9 giờ.",
            "requiredFacts": ["9 giờ"], "evidence": [],
        }
        self.dataset.write_text(json.dumps(question) + "\n")
        self.answers = self.root / "run.answers.jsonl"
        self.answer = {
            "id": "Q01", "question": "Giờ họp?", "answered": True,
            "content": "Họp lúc 9 giờ.",
            "sources": [{"documentPublicId": "doc1", "content": "Họp lúc 9 giờ."}],
        }
        self.save_answer()
        write_json(self.root / "run.meta.json", {
            "datasetPath": "dataset.jsonl",
            "datasetSha256": hashlib.sha256(self.dataset.read_bytes()).hexdigest(),
            "questionIds": ["Q01"], "aiMock": False,
        })
        (self.root / "run.grades.csv").write_text("id,verdict,reason\nQ01,CORRECT,Đủ ý\n")

    def save_answer(self):
        self.answers.write_text(json.dumps(self.answer) + "\n")

    def test_loads_original_retrieved_context_and_manual_grade(self):
        samples, provenance = rg.load_runs([self.answers], self.root)
        self.assertEqual(samples[0]["retrieved_contexts"], ["Họp lúc 9 giờ."])
        self.assertEqual(samples[0]["reference"], "9 giờ.")
        self.assertEqual(samples[0]["manual_verdict"], "CORRECT")
        self.assertIn("sha256", provenance[0])

    def test_changed_dataset_is_rejected_before_evaluation(self):
        self.dataset.write_text(self.dataset.read_text() + " ")
        with self.assertRaisesRegex(ValueError, "hash"):
            rg.load_runs([self.answers], self.root)

    def test_provenance_hashes_the_bytes_evaluated_even_if_file_changes_during_load(self):
        original = self.answers.read_bytes()
        real_loads = json.loads
        def parse_and_edit(raw):
            result = real_loads(raw)
            if isinstance(result, dict) and result.get("answered") is True:
                changed = {**result, "content": "Đáp án vừa sửa."}
                self.answers.write_text(json.dumps(changed) + "\n")
            return result
        with patch.object(rg.json, "loads", side_effect=parse_and_edit):
            samples, provenance = rg.load_runs([self.answers], self.root)
        answer_hash = next(p["sha256"] for p in provenance if p["path"] == str(self.answers))
        self.assertEqual(samples[0]["response"], "Họp lúc 9 giờ.")
        self.assertEqual(answer_hash, hashlib.sha256(original).hexdigest())

    def test_duplicate_runs_and_missing_context_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            rg.load_runs([self.answers, self.answers], self.root)
        self.answer["sources"] = []
        self.save_answer()
        with self.assertRaisesRegex(ValueError, "context"):
            rg.load_runs([self.answers], self.root)

    def test_question_mismatch_and_invalid_grade_are_rejected(self):
        self.answer["question"] = "Different question"
        self.save_answer()
        with self.assertRaisesRegex(ValueError, "question"):
            rg.load_runs([self.answers], self.root)
        self.answer["question"] = "Giờ họp?"
        self.save_answer()
        (self.root / "run.grades.csv").write_text("id,verdict,reason\nQ01,PASS,yes\n")
        with self.assertRaisesRegex(ValueError, "grade"):
            rg.load_runs([self.answers], self.root)

    def test_resume_rejects_model_or_input_changes(self):
        path = self.root / "out"
        with rg.RunStore(path, {"model": "one"}) as store:
            store.data["scores"]["Q01"] = {"faithfulness": {"value": 1.0}}
            store.save()
            with self.assertRaisesRegex(RuntimeError, "locked"):
                with rg.RunStore(path, {"model": "one"}):
                    pass
        with rg.RunStore(path, {"model": "one"}) as store:
            self.assertEqual(store.data["scores"]["Q01"]["faithfulness"]["value"], 1)
        with self.assertRaisesRegex(ValueError, "provenance"):
            with rg.RunStore(path, {"model": "two"}):
                pass


class Clock:
    def __init__(self):
        self.now = 1000.0
        self.waits = []

    async def sleep(self, seconds):
        self.waits.append(seconds)
        self.now += seconds


class TransportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        # Importing Ragas once is slower than asyncio's debug warning threshold.
        asyncio_loop = __import__("asyncio").get_running_loop()
        asyncio_loop.slow_callback_duration = 5
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = rg.RunStore(Path(self.temp.name), {"model": "test"})
        self.store.__enter__()
        self.addCleanup(self.store.__exit__, None, None, None)
        self.clock = Clock()

    def request(self, text="a"):
        return httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions",
                             headers={"Authorization": "Bearer SECRET"},
                             json={"model": "test", "messages": [{"role": "user", "content": text}], "max_tokens": 10})

    def transport(self, handler, **settings):
        return rg.BudgetTransport(self.store, httpx.MockTransport(handler),
                                  clock=lambda: self.clock.now, sleep=self.clock.sleep,
                                  estimate=lambda _: 50, min_interval=20,
                                  requests_per_day=100, tokens_per_day=10000,
                                  tokens_per_minute=100, **settings)

    def success(self, request):
        self.assertGreaterEqual(self.store.data["requests"][-1]["reserved_tokens"], 50)
        return httpx.Response(200, json={"usage": {"total_tokens": 50}, "choices": []})

    async def test_all_requests_paced_and_token_window_respected(self):
        transport = self.transport(self.success)
        for text in ("a", "b", "c"):
            await transport.handle_async_request(self.request(text))
        timestamps = [r["at"] for r in self.store.data["requests"]]
        self.assertEqual(timestamps, [1000, 1020, 1061])
        self.assertNotIn("SECRET", (self.store.path / "state.json").read_text())

    async def test_successful_http_steps_cached_across_resume(self):
        transport = self.transport(self.success)
        first = await transport.handle_async_request(self.request())
        self.assertEqual(first.status_code, 200)
        def fail(request):
            self.fail("A cached step must never contact Groq")
        resumed = self.transport(fail)
        second = await resumed.handle_async_request(self.request())
        self.assertEqual(second.json(), first.json())
        self.assertEqual(len(self.store.data["requests"]), 1)

    async def test_429_retry_respects_header_and_is_bounded(self):
        count = 0
        def handler(request):
            nonlocal count
            count += 1
            return httpx.Response(429, headers={"retry-after": "40"}, json={"error": {"message": "slow down"}})
        transport = self.transport(handler, max_retries=1)
        with self.assertRaisesRegex(rg.BudgetStop, "429"):
            await transport.handle_async_request(self.request())
        self.assertEqual(count, 2)
        self.assertGreaterEqual(self.clock.waits[0], 40)

    async def test_cli_zero_retries_stops_at_first_429_and_records_policy(self):
        output = self.store.path / "cli-run"
        def handler(request):
            return httpx.Response(429, headers={"retry-after": "40"},
                                  json={"error": {"message": "slow down"}})
        with patch.object(sys, "argv", ["ragas_groq.py", "--out", str(output),
                                         "--limit", "1", "--max-retries", "0"]), \
                patch.dict(os.environ, {"GROQ_API_KEY": "test"}), \
                patch.object(rg.httpx, "AsyncHTTPTransport", return_value=httpx.MockTransport(handler)):
            self.assertEqual(await rg.main(), 2)
        state = json.loads((output / "state.json").read_text())
        self.assertEqual(len(state["requests"]), 1)
        self.assertEqual(state["requests"][0]["status"], 429)
        self.assertEqual(state["invocations"][-1]["max_retries"], 0)
        with (output / "scores.csv").open(newline="") as handle:
            first = next(csv.DictReader(handle))
        self.assertEqual(first["faithfulness"], "")
        self.assertEqual(first["status"], "PENDING")

    async def test_daily_or_invocation_limit_prevents_network_call(self):
        transport = self.transport(self.success, max_requests=1)
        await transport.handle_async_request(self.request())
        with self.assertRaisesRegex(rg.BudgetStop, "request budget"):
            await transport.handle_async_request(self.request("b"))
        self.assertEqual(len(self.store.data["requests"]), 1)

    async def test_daily_token_limit_is_durable_and_resets_next_day(self):
        transport = self.transport(self.success)
        transport.tokens_per_day = 50
        await transport.handle_async_request(self.request())
        with self.assertRaisesRegex(rg.BudgetStop, "daily token"):
            await transport.handle_async_request(self.request("b"))
        self.clock.now += 86400
        await transport.handle_async_request(self.request("b"))
        self.assertEqual(len(self.store.data["requests"]), 2)

    async def test_overestimated_single_request_uses_empty_window_then_actual_usage(self):
        # A proxy tokenizer must not permanently block a request that fits Qwen.
        def handler(request):
            return httpx.Response(200, json={"usage": {"total_tokens": 30}})
        transport = self.transport(handler)
        transport.tokens_per_minute = 40
        await transport.handle_async_request(self.request())
        await transport.handle_async_request(self.request("b"))
        self.assertEqual([r["at"] for r in self.store.data["requests"]], [1000, 1061])
        self.assertEqual([r["reserved_tokens"] for r in self.store.data["requests"]], [30, 30])

    async def test_partial_metric_resume_and_failed_metric_stays_blank(self):
        samples = [{"id": "Q01", "dataset": "pilot", "manual_verdict": "CORRECT"}]
        self.store.data["scores"]["Q01"] = {"faithfulness": {"value": 1.0}}
        calls = []
        async def score(sample, metric):
            calls.append(metric)
            raise rg.BudgetStop("daily token budget")
        complete = await rg.evaluate_samples(samples, self.store, score, limit=1)
        self.assertFalse(complete)
        self.assertEqual(calls, ["context_recall"])
        self.assertNotIn("context_recall", self.store.data["scores"]["Q01"])
        rg.export_reports(samples, self.store)
        with (self.store.path / "scores.csv").open(newline="") as handle:
            row = list(csv.DictReader(handle))[0]
        self.assertEqual(row["faithfulness"], "1.0")
        self.assertEqual(row["context_recall"], "")
        self.assertEqual(row["manual_verdict"], "CORRECT")

    async def test_real_ragas_and_groq_sdk_preserve_claim_reasons_and_scores(self):
        from groq import AsyncGroq
        outputs = [
            {"statements": ["Họp lúc 9 giờ.", "Có pizza."]},
            {"statements": [
                {"statement": "Họp lúc 9 giờ.", "reason": "Context nêu 9 giờ.", "verdict": 1},
                {"statement": "Có pizza.", "reason": "Context không nói pizza.", "verdict": 0},
            ]},
            {"classifications": [{"statement": "9 giờ.", "reason": "Context nêu 9 giờ.", "attributed": 1}]},
        ]
        def handler(request):
            body = json.loads(request.content)
            self.assertEqual(body["model"], "test")
            return httpx.Response(200, json={
                "id": "completion", "object": "chat.completion", "created": 1000, "model": "test",
                "usage": {"prompt_tokens": 30, "completion_tokens": 20, "total_tokens": 50},
                "choices": [{"index": 0, "finish_reason": "stop", "message": {
                    "role": "assistant", "content": json.dumps(outputs.pop(0)),
                }}],
            })
        sample = {"user_input": "Giờ họp?", "response": "Họp lúc 9 giờ. Có pizza.",
                  "reference": "9 giờ.", "retrieved_contexts": ["Họp lúc 9 giờ."]}
        async with AsyncGroq(api_key="test", max_retries=0, http_client=httpx.AsyncClient(
                transport=self.transport(handler))) as client:
            score = rg.make_scorer(client, "test", 100)
            faith = await score(sample, "faithfulness")
            recall = await score(sample, "context_recall")
        self.assertEqual(faith["value"], 0.5)
        self.assertEqual(recall["value"], 1.0)
        self.assertEqual(faith["details"][1]["result"]["statements"][1]["reason"], "Context không nói pizza.")
        self.assertEqual(len(self.store.data["requests"]), 3)

    async def test_nan_metric_is_error_not_zero_or_manual_verdict_change(self):
        sample = {"id": "Q01", "dataset": "pilot", "manual_verdict": "CORRECT"}
        async def score(*_):
            return {"value": float("nan")}
        self.assertFalse(await rg.evaluate_samples([sample], self.store, score, 1))
        self.assertEqual(self.store.data["scores"]["Q01"], {})
        self.assertEqual(sample["manual_verdict"], "CORRECT")

    async def test_invalid_judge_verdict_is_rejected_instead_of_scoring_truthy(self):
        # Only the external model result is replaced; actual Ragas scoring runs.
        from groq import AsyncGroq
        from ragas.metrics.collections.faithfulness.util import StatementGeneratorOutput, NLIStatementOutput
        from ragas.llms.base import InstructorLLM
        outputs = [StatementGeneratorOutput(statements=["9 giờ."]), NLIStatementOutput(statements=[
            {"statement": "9 giờ.", "reason": "invalid binary", "verdict": 2},
        ])]
        async def generate(*_):
            return outputs.pop(0)
        async with AsyncGroq(api_key="test") as client:
            with patch.object(InstructorLLM, "agenerate", generate):
                score = rg.make_scorer(client, "test", 100)
                with self.assertRaisesRegex(ValueError, "binary"):
                    await score({"user_input": "Giờ họp?", "response": "9 giờ.",
                                 "retrieved_contexts": ["9 giờ."]}, "faithfulness")

    async def test_bad_json_step_retried_on_manual_resume_without_repeating_good_step(self):
        from groq import AsyncGroq
        outputs = [
            {"statements": ["9 giờ."]},
            {"statements": [{"statement": "9 giờ.", "reason": "bad", "verdict": 2}]},
            {"statements": [{"statement": "9 giờ.", "reason": "supported", "verdict": 1}]},
            {"classifications": [{"statement": "9 giờ.", "reason": "supported", "attributed": 1}]},
        ]
        def handler(request):
            return httpx.Response(200, json={
                "id": "completion", "object": "chat.completion", "created": 1000, "model": "test",
                "usage": {"prompt_tokens": 30, "completion_tokens": 20, "total_tokens": 50},
                "choices": [{"index": 0, "finish_reason": "stop", "message": {
                    "role": "assistant", "content": json.dumps(outputs.pop(0)),
                }}],
            })
        sample = {"id": "Q01", "user_input": "Giờ họp?", "response": "9 giờ.",
                  "reference": "9 giờ.", "retrieved_contexts": ["9 giờ."]}
        async with AsyncGroq(api_key="test", max_retries=0, http_client=httpx.AsyncClient(
                transport=self.transport(handler))) as client:
            score = rg.make_scorer(client, "test", 100)
            self.assertFalse(await rg.evaluate_samples([sample], self.store, score, 1))
            self.assertTrue(await rg.evaluate_samples([sample], self.store, score, 1))
        self.assertEqual(self.store.data["scores"]["Q01"]["faithfulness"]["value"], 1)
        self.assertEqual(len(self.store.data["requests"]), 4)
        self.assertEqual(self.store.data["errors"], {})

    async def test_explicit_truncated_step_repair_preserves_scores_and_reuses_good_steps(self):
        from groq import AsyncGroq
        outputs = [
            ({"statements": ["9 giờ."]}, "stop"),
            ({"statements": []}, "length"),
            ({"statements": [{"statement": "9 giờ.", "reason": "supported", "verdict": 1}]}, "stop"),
            ({"classifications": [{"statement": "9 giờ.", "reason": "supported", "attributed": 1}]}, "stop"),
        ]
        payloads = []
        def handler(request):
            payloads.append(json.loads(request.content))
            result, finish = outputs.pop(0)
            return httpx.Response(200, json={
                "id": "completion", "object": "chat.completion", "created": 1000, "model": "test",
                "usage": {"total_tokens": 50},
                "choices": [{"index": 0, "finish_reason": finish, "message": {
                    "role": "assistant", "content": json.dumps(result),
                }}],
            })
        old_score = {"faithfulness": {"value": 0.75}, "context_recall": {"value": 1}}
        self.store.data["scores"]["DONE"] = old_score.copy()
        sample = {"id": "Q01", "user_input": "Giờ họp?", "response": "9 giờ.",
                  "reference": "9 giờ.", "retrieved_contexts": ["9 giờ."]}
        async with AsyncGroq(api_key="test", max_retries=0, http_client=httpx.AsyncClient(
                transport=self.transport(handler))) as client:
            score = rg.make_scorer(client, "test", 100)
            self.assertFalse(await rg.evaluate_samples([sample], self.store, score, 1))
            self.assertEqual(len(self.store.data["truncatedOutputs"]), 1)
            with self.assertRaisesRegex(ValueError, "greater"):
                rg.repair_truncated_outputs(self.store, 100)
            self.assertEqual(rg.repair_truncated_outputs(self.store, 200), 1)
            self.assertTrue(await rg.evaluate_samples([sample], self.store, score, 1))
            self.assertTrue(await rg.evaluate_samples([sample], self.store, score, 1))
        self.assertEqual([p["max_tokens"] for p in payloads], [100, 100, 200, 100])
        self.assertEqual({k: v for k, v in payloads[1].items() if k != "max_tokens"},
                         {k: v for k, v in payloads[2].items() if k != "max_tokens"})
        self.assertEqual(self.store.data["scores"]["DONE"], old_score)
        self.assertEqual(len(self.store.data["requests"]), 4)
        self.assertEqual(len(self.store.data["outputCapRepairs"]), 1)
        self.assertEqual(rg.repair_truncated_outputs(self.store, 200), 0)
        self.assertEqual([r["max_tokens"] for r in self.store.data["scores"]["Q01"]["faithfulness"]["requests"]], [100, 200])

    async def test_repair_discovers_old_cached_truncation_without_mutating_provenance(self):
        import base64
        key = "old-payload-hash"
        self.store.data["provenance"]["max_tokens"] = 100
        self.store.data["cache"][key] = {"headers": {}, "body": base64.b64encode(json.dumps({
            "choices": [{"finish_reason": "length"}],
        }).encode()).decode()}
        self.assertEqual(rg.repair_truncated_outputs(self.store, 200), 1)
        self.assertEqual(self.store.data["provenance"]["max_tokens"], 100)
        self.assertEqual(self.store.data["outputCapOverrides"][key], 200)
        self.assertNotIn(key, self.store.data["cache"])

    async def test_interrupted_repaired_truncation_is_not_discovered_twice(self):
        self.store.data["provenance"]["max_tokens"] = 10
        def handler(request):
            return httpx.Response(200, json={"choices": [{"finish_reason": "length"}]})
        transport = self.transport(handler)
        await transport.handle_async_request(self.request())
        self.assertEqual(rg.repair_truncated_outputs(self.store, 20), 1)
        # Simulate interruption after HTTP success, before evaluator cache eviction.
        await transport.handle_async_request(self.request())
        self.assertEqual(rg.repair_truncated_outputs(self.store, 30), 1)
        self.assertEqual(len(self.store.data["outputCapRepairs"]), 2)
        self.assertEqual(self.store.data["outputCapRepairs"][-1]["previous_max_tokens"], 20)


if __name__ == "__main__":
    unittest.main()
