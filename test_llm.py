"""
test_llm.py
-----------
Tests for the /api/llm-ping endpoint (Unit 2 — Colab-Ollama Bridge).

Test strategy
-------------
* ``test_llm_ping_mocked``
    Always runs. Uses ``unittest.mock`` to replace the real LLM with a
    controlled stub so no Colab connection is required. This is the primary
    CI-safe test that verifies the endpoint wiring is correct.

* ``test_llm_ping_live``
    Only runs when ``OLLAMA_BASE_URL`` is present in the environment.
    Sends a real request through the ngrok tunnel to the Colab Ollama
    instance and asserts we receive a non-empty string back.

Event-loop note
---------------
Same loop-scope strategy as test_main.py — everything pinned to the
session event loop to avoid Motor "different loop" errors.
"""

import os
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import ASGITransport, AsyncClient
from dotenv import load_dotenv

load_dotenv()

from main import app  # noqa: E402  (env must be loaded first)

# Pin all async tests in this module to the session event loop.
pytestmark = pytest.mark.asyncio(loop_scope="session")

pytest_plugins = ("pytest_asyncio",)


# =========================================================================
# Shared fixture
# =========================================================================

@pytest_asyncio.fixture(loop_scope="session")
async def http_client() -> AsyncClient:
    """
    ASGI test client wired directly to the FastAPI app.
    No DB lifecycle needed here — the LLM endpoint doesn't touch MongoDB.
    """
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client


# =========================================================================
# Mocked test  (always runs — no Colab needed)
# =========================================================================

async def test_llm_ping_mocked(http_client: AsyncClient):
    """
    Unit test: replaces the real ChatOllama with a lightweight stub.

    We patch ``main.get_llm`` (the name as imported into main.py) so that
    the endpoint receives our fake LLM instead of trying to reach Colab.
    """
    from langchain_core.messages import AIMessage

    # Build a mock LLM whose ainvoke() coroutine returns a fake AIMessage.
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(return_value=AIMessage(content="pong"))

    with patch("main.get_llm", return_value=mock_llm):
        response = await http_client.get("/api/llm-ping")

    assert response.status_code == 200, response.text
    data = response.json()
    assert "response" in data
    assert data["response"] == "pong"


# =========================================================================
# Live integration test  (skipped unless OLLAMA_BASE_URL is set)
# =========================================================================

@pytest.mark.skipif(
    not os.environ.get("OLLAMA_BASE_URL"),
    reason=(
        "OLLAMA_BASE_URL not set — skipping live Colab LLM test. "
        "Start Colab, copy the ngrok URL into .env, then re-run."
    ),
)
async def test_llm_ping_live(http_client: AsyncClient):
    """
    Live integration test: fires a real HTTP request through the ngrok
    tunnel to the Colab-hosted Ollama instance.

    Assertions are intentionally loose — we just verify the endpoint
    returns 200 and a non-empty string, since LLM output is non-deterministic.
    """
    response = await http_client.get("/api/llm-ping")

    assert response.status_code == 200, (
        f"Expected 200, got {response.status_code}. "
        f"Check that Colab is still running and the ngrok tunnel is alive.\n"
        f"Response body: {response.text}"
    )

    data = response.json()
    assert "response" in data, f"Missing 'response' key in: {data}"
    assert isinstance(data["response"], str)
    assert len(data["response"]) > 0, "LLM returned an empty string"

    # Friendly output when running pytest -v -s
    print(f"\n🤖 LLM replied: {data['response']!r}")
