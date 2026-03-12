"""
test_intelligence.py
--------------------
Tests for Unit 5 — Proactive Intelligence (health scoring + morning briefings).

Test 1 (``test_evaluate_client_health``)
    Creates a User, Client, and 3 Note documents in the test DB.
    Mocks the LLM to return score "78".
    Directly calls ``evaluate_client_health`` and asserts the Client's
    ``health_score`` is updated to 78 in MongoDB.

Test 2 (``test_trigger_and_get_briefing``)
    Creates a test User and an at-risk Client (health_score=20).
    Mocks the LLM to return a controlled briefing string.
    POSTs to ``/test/trigger-briefing/{user_id}`` (synchronous trigger).
    GETs ``/users/{user_id}/briefings/today`` and asserts the briefing
    content was saved correctly.

Both tests clean up their own data in teardown.
The session-scoped DB lifecycle is provided automatically by ``conftest.py``.
"""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import ASGITransport, AsyncClient
from langchain_core.messages import AIMessage

from main import app
from models import Briefing, Client, Note, Task, User
from services.intelligence_service import evaluate_client_health

# All async tests share the session event loop.
pytestmark = pytest.mark.asyncio(loop_scope="session")
pytest_plugins = ("pytest_asyncio",)

MOCK_SCORE     = "78"
MOCK_BRIEFING  = (
    "Urgent attention required: Acme Corp (health score 20) is at serious risk "
    "of churn — prioritise a check-in call today and address outstanding tasks "
    "before end of business."
)


# ─────────────────────────────────────────────────────────────────────────────
# Shared HTTP client fixture
# ─────────────────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(loop_scope="session")
async def http_client() -> AsyncClient:
    """ASGI test client wired directly to the FastAPI app."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client


# ─────────────────────────────────────────────────────────────────────────────
# Test 1 — evaluate_client_health updates the DB record
# ─────────────────────────────────────────────────────────────────────────────

async def test_evaluate_client_health():
    """
    Seeds 3 notes in the test DB, mocks the LLM response to return "78",
    and verifies that the Client's health_score is updated to 78.
    """
    # --- Setup ---------------------------------------------------------------
    user = User(name="Health Test User", email="health@example.com")
    await user.insert()

    client = Client(
        user_id=user, name="Health Test Client",
        company="HealthCo", health_score=100,
    )
    await client.insert()

    notes = []
    for i, text in enumerate([
        "Client seemed frustrated about delayed delivery.",
        "Follow-up call — client is still unhappy, escalated internally.",
        "Product issue partially resolved; client cautiously optimistic.",
    ]):
        n = Note(client_id=client, content=text)
        await n.insert()
        notes.append(n)

    # --- Exercise ------------------------------------------------------------
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(return_value=AIMessage(content=MOCK_SCORE))

    with patch("services.intelligence_service.get_llm", return_value=mock_llm):
        await evaluate_client_health(str(client.id))

    # --- Assert --------------------------------------------------------------
    updated = await Client.get(client.id)
    assert updated is not None
    assert updated.health_score == int(MOCK_SCORE), (
        f"Expected health_score={MOCK_SCORE}, got {updated.health_score}"
    )

    # Verify the LLM was called once
    mock_llm.ainvoke.assert_called_once()

    # --- Teardown ------------------------------------------------------------
    for n in notes:
        await n.delete()
    await client.delete()
    await user.delete()


# ─────────────────────────────────────────────────────────────────────────────
# Test 2 — briefing trigger + GET endpoint
# ─────────────────────────────────────────────────────────────────────────────

async def test_trigger_and_get_briefing(http_client: AsyncClient):
    """
    Triggers briefing generation via the test endpoint, then retrieves it
    via the GET endpoint and asserts it was saved with the correct content.
    """
    # --- Setup ---------------------------------------------------------------
    user = User(name="Briefing Test User", email="brief@example.com")
    await user.insert()

    at_risk_client = Client(
        user_id=user, name="Acme Corp",
        company="Acme", health_score=20,   # < 50 → at risk
    )
    await at_risk_client.insert()

    # --- Trigger briefing via HTTP -------------------------------------------
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(return_value=AIMessage(content=MOCK_BRIEFING))

    with patch("services.intelligence_service.get_llm", return_value=mock_llm):
        trigger_resp = await http_client.post(
            f"/test/trigger-briefing/{user.id}"
        )

    assert trigger_resp.status_code == 200, trigger_resp.text
    assert trigger_resp.json()["status"] == "ok"

    # --- Retrieve today's briefing -------------------------------------------
    get_resp = await http_client.get(f"/users/{user.id}/briefings/today")

    assert get_resp.status_code == 200, get_resp.text
    data = get_resp.json()

    assert "content" in data
    assert data["content"] == MOCK_BRIEFING, (
        f"Briefing content mismatch.\nExpected: {MOCK_BRIEFING!r}\nGot:      {data['content']!r}"
    )
    assert "id" in data
    assert "generated_date" in data

    # --- Teardown ------------------------------------------------------------
    saved_briefing = await Briefing.get(data["id"])
    if saved_briefing:
        await saved_briefing.delete()
    await at_risk_client.delete()
    await user.delete()


# ─────────────────────────────────────────────────────────────────────────────
# Test 3 — GET briefings/today returns 404 when none exist
# ─────────────────────────────────────────────────────────────────────────────

async def test_get_briefing_today_not_found(http_client: AsyncClient):
    """A user with no briefing generated today must receive HTTP 404."""
    user = User(name="No Briefing User", email="nobriefing@example.com")
    await user.insert()

    try:
        resp = await http_client.get(f"/users/{user.id}/briefings/today")
        assert resp.status_code == 404
    finally:
        await user.delete()
