import asyncio

import pytest

from services import transcription as tr


class _Resp:
    def __init__(self, status, payload=None, headers=None):
        self.status_code = status
        self._payload = payload or {}
        self.headers = headers or {}
        self.text = ""

    def json(self):
        return self._payload


class _ScriptedClient:
    """Returns the scripted responses in order, then keeps returning the last one."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = 0

    async def post(self, *args, **kwargs):
        self.calls += 1
        return self.script.pop(0) if len(self.script) > 1 else self.script[0]


@pytest.fixture(autouse=True)
def _no_side_effects(monkeypatch):
    async def _no_sleep(_):
        return None

    monkeypatch.setattr(tr.asyncio, "sleep", _no_sleep)
    monkeypatch.setattr("services.ai_usage_service.log_ai_call", lambda **kw: None)
    # No cache: the DB clients are unavailable in tests.
    monkeypatch.setattr("database.get_supabase_admin_client", lambda: None)
    monkeypatch.setattr("database.get_supabase_client", lambda: None)


AUDIO = b"x" * 5000


def test_rate_limit_does_not_consume_regular_attempts():
    script = [_Resp(429, headers={"retry-after": "3"})] * 5 + [_Resp(200, {"text": "ok"})]
    client = _ScriptedClient(script)
    _, text = asyncio.run(tr._transcribe_single_audio(client, "a.opus", AUDIO))
    assert text == "ok"
    assert client.calls == 6  # old code gave up after 3


def test_rate_limit_budget_exhausted_returns_specific_marker(monkeypatch):
    monkeypatch.setattr(tr, "RATE_LIMIT_BUDGET_SECONDS", 0.0)
    client = _ScriptedClient([_Resp(429, headers={"retry-after": "3"})])
    _, text = asyncio.run(tr._transcribe_single_audio(client, "a.opus", AUDIO))
    assert text == tr.RATE_LIMIT_MARKER
    assert tr.is_transcription_failure(text)


def test_server_errors_still_limited_to_max_retries():
    client = _ScriptedClient([_Resp(503)])
    _, text = asyncio.run(tr._transcribe_single_audio(client, "a.opus", AUDIO))
    assert text == tr.FAILED_MARKER
    assert client.calls == tr.MAX_RETRIES


def test_rate_limit_wait_respects_retry_after_and_cap():
    assert tr.rate_limit_wait("3", 1) >= 3
    assert tr.rate_limit_wait("3", 10) <= tr.RATE_LIMIT_MAX_WAIT
    assert tr.rate_limit_wait(None, 4) >= tr.RETRY_BASE_DELAY * 8 or tr.rate_limit_wait(None, 4) == tr.RATE_LIMIT_MAX_WAIT


def test_second_pass_recovers_rate_limited_audio(monkeypatch):
    calls = {"a.opus": 0}

    async def fake_single(client, filename, data, **kw):
        calls[filename] += 1
        return filename, tr.RATE_LIMIT_MARKER if calls[filename] == 1 else "recovered"

    monkeypatch.setattr(tr, "_transcribe_single_audio", fake_single)
    result = asyncio.run(tr.transcribe_all({"a.opus": AUDIO}))
    assert result == {"a.opus": "recovered"}
    assert calls["a.opus"] == 2


def test_second_pass_skips_permanent_errors(monkeypatch):
    calls = {"a.opus": 0}

    async def fake_single(client, filename, data, **kw):
        calls[filename] += 1
        return filename, "[Erro 400 na transcrição]"

    monkeypatch.setattr(tr, "_transcribe_single_audio", fake_single)
    result = asyncio.run(tr.transcribe_all({"a.opus": AUDIO}))
    assert result["a.opus"] == "[Erro 400 na transcrição]"
    assert calls["a.opus"] == 1


def test_silence_is_not_counted_as_failure():
    assert not tr.is_transcription_failure("[Áudio sem fala detectada]")
    assert not tr.is_transcription_failure("texto normal")
