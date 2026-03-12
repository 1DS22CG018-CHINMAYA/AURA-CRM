"""
test_brain_dump.py
------------------
Tests for the POST /clients/{client_id}/notes/process endpoint (Unit 3).

Test strategy
-------------
* ``test_brain_dump_mocked``
    Always runs. Mocks ``main.brain_dump_graph.ainvoke`` to return a
    controlled, deterministic result. The real MongoDB write path IS
    exercised — we verify that a Note and a Task were actually persisted.

* ``test_brain_dump_live``
    Skipped unless ``OLLAMA_BASE_URL`` is set. Sends a short real note
    through the live LangGraph pipeline and checks that at least one Note
    and one Task hit the database.

* ``test_brain_dump_client_not_found``
    Always runs. Verifies that posting to a non-existent client_id returns
    HTTP 404 without touching the LLM at all.

The session-scoped DB lifecycle is provided automatically by ``conftest.py``.
"""

import os
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from main import app
from models import Client, Note, Task, User

# Pin all async tests in this module to the shared session event loop.
pytestmark = pytest.mark.asyncio(loop_scope="session")
pytest_plugins = ("pytest_asyncio",)


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(loop_scope="session")
async def http_client() -> AsyncClient:
    """ASGI test client wired directly to the FastAPI app."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client


@pytest_asyncio.fixture(loop_scope="session")
async def bd_user() -> User:
    """A User document used as the owner of the test client."""
    user = User(name="Brain Dump User", email="bd@example.com")
    await user.insert()
    yield user
    await user.delete()


@pytest_asyncio.fixture(loop_scope="session")
async def bd_client(bd_user: User) -> Client:
    """A Client document used as the target for brain-dump POST requests."""
    client = Client(
        user_id=bd_user,
        name="Acme Brain Dump",
        company="Acme",
        health_score=100,
    )
    await client.insert()
    yield client
    await client.delete()


# ─────────────────────────────────────────────────────────────────────────────
# Helper — controlled LangGraph return value
# ─────────────────────────────────────────────────────────────────────────────

MOCK_GRAPH_RESULT = {
    "raw_text": "Call John tomorrow. Send proposal by Friday.",
    "client_id": "",           # filled in by the test
    "summary": "The meeting covered two action items: a call with John and a proposal submission.",
    "tasks": [
        {"title": "Call John", "due_date": None},
        {"title": "Send proposal to client", "due_date": "2025-03-14"},
    ],
}


# ─────────────────────────────────────────────────────────────────────────────
# Mocked test  (always runs — no Colab needed)
# ─────────────────────────────────────────────────────────────────────────────

async def test_brain_dump_mocked(http_client: AsyncClient, bd_client: Client):
    """
    Verifies that the endpoint:
      1. Returns HTTP 201 with summary + tasks.
      2. Actually persists a Note in MongoDB.
      3. Actually persists the correct number of Tasks in MongoDB.

    The LangGraph graph is mocked so no LLM call is made.
    """
    raw_text = "Call John tomorrow. Send proposal by Friday."
    mock_result = {**MOCK_GRAPH_RESULT, "client_id": str(bd_client.id)}

    with patch("main.brain_dump_graph") as mock_graph:
        mock_graph.ainvoke = AsyncMock(return_value=mock_result)

        response = await http_client.post(
            f"/clients/{bd_client.id}/notes/process",
            json={"raw_text": raw_text},
        )

    # ── API response assertions ──────────────────────────────────────────────
    assert response.status_code == 201, response.text
    data = response.json()

    assert "note_id" in data
    assert "summary" in data
    assert "tasks" in data
    assert len(data["summary"]) > 0, "summary must be non-empty"
    assert len(data["tasks"]) == 2, "expected 2 tasks from mock result"

    task_titles = {t["title"] for t in data["tasks"]}
    assert "Call John" in task_titles
    assert "Send proposal to client" in task_titles

    # ── Database assertions ──────────────────────────────────────────────────
    # Note was saved with the correct content and summary
    note = await Note.get(data["note_id"])
    assert note is not None, "Note was not saved to MongoDB"
    assert note.content == raw_text
    assert note.summary is not None and len(note.summary) > 0

    # Tasks were saved and are linked to the correct client
    for task_out in data["tasks"]:
        task = await Task.get(task_out["id"])
        assert task is not None, f"Task {task_out['id']} not found in MongoDB"
        assert task.title == task_out["title"]

    # Cleanup — remove documents created by this test
    await note.delete()
    for task_out in data["tasks"]:
        t = await Task.get(task_out["id"])
        if t:
            await t.delete()


# ─────────────────────────────────────────────────────────────────────────────
# 404 guard  (always runs)
# ─────────────────────────────────────────────────────────────────────────────

async def test_brain_dump_client_not_found(http_client: AsyncClient):
    """Posting to a non-existent client_id must return 404 without hitting the LLM."""
    fake_id = "000000000000000000000099"

    with patch("main.brain_dump_graph") as mock_graph:
        mock_graph.ainvoke = AsyncMock()   # should never be called

        response = await http_client.post(
            f"/clients/{fake_id}/notes/process",
            json={"raw_text": "This should not reach the LLM."},
        )

        mock_graph.ainvoke.assert_not_called()

    assert response.status_code == 404


# ─────────────────────────────────────────────────────────────────────────────
# Live integration test  (skipped unless OLLAMA_BASE_URL is set)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.skipif(
    not os.environ.get("OLLAMA_BASE_URL"),
    reason=(
        "OLLAMA_BASE_URL not set — skipping live LangGraph test. "
        "Start Colab, paste the ngrok URL into .env, then re-run."
    ),
)
async def test_brain_dump_live(http_client: AsyncClient, bd_client: Client):
    """
    End-to-end test through the real LangGraph → Colab Ollama pipeline.

    Sends a short meeting-notes string and asserts that:
      - The endpoint returns HTTP 201.
      - At least 1 task was extracted and saved.
      - The Note document exists in MongoDB with a non-empty summary.
    """
    raw_text = (
        "Had a quick sync with Sarah. She needs the Q4 budget report by Thursday. "
        "Also remind me to follow up with the design team about the new logo next Monday."
    )

    response = await http_client.post(
        f"/clients/{bd_client.id}/notes/process",
        json={"raw_text": raw_text},
    )

    assert response.status_code == 201, (
        f"Expected 201, got {response.status_code}. Body: {response.text}"
    )
    data = response.json()

    assert len(data["summary"]) > 0, "Live LLM returned an empty summary"
    assert len(data["tasks"]) >= 1, "Live LLM extracted no tasks"

    print(f"\n📋 Summary: {data['summary']}")
    print(f"✅ Tasks ({len(data['tasks'])}):")
    for t in data["tasks"]:
        print(f"   • {t['title']}  due={t.get('due_date')}")

    # Verify DB records
    note = await Note.get(data["note_id"])
    assert note is not None
    assert note.summary == data["summary"]

    # Cleanup
    await note.delete()
    for task_out in data["tasks"]:
        t = await Task.get(task_out["id"])
        if t:
            await t.delete()
