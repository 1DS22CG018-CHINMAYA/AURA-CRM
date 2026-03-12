"""
test_main.py
------------
Integration tests for the Aura CRM API skeleton.

The session-scoped database lifecycle lives in ``conftest.py`` and runs
automatically for every test in the session. This file only defines the
function-scoped fixtures and the actual test functions.
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from main import app
from models import Client, User

# Force ALL async test functions in this file onto the shared session loop.
pytestmark = pytest.mark.asyncio(loop_scope="session")
pytest_plugins = ("pytest_asyncio",)




@pytest_asyncio.fixture(loop_scope="session")
async def async_client() -> AsyncClient:
    """
    Provide an httpx AsyncClient wired directly to the FastAPI ASGI app.
    We skip the lifespan events (database is already up via session fixture).
    """
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client


@pytest_asyncio.fixture(loop_scope="session")
async def test_user() -> User:
    """Insert a fresh User document before each test and delete it after."""
    user = User(name="Test User", email="testuser@example.com")
    await user.insert()
    yield user
    await user.delete()


@pytest_asyncio.fixture(loop_scope="session")
async def test_client(test_user: User) -> Client:
    """Insert a fresh Client document before each test and delete it after."""
    client = Client(
        user_id=test_user,
        name="Acme Corp",
        company="Acme",
        health_score=90,
    )
    await client.insert()
    yield client
    await client.delete()


# =========================================================================
# Tests — POST /clients/
# =========================================================================

async def test_create_client_success(async_client: AsyncClient, test_user: User):
    """A valid payload should create a client and return HTTP 201."""
    payload = {
        "user_id": str(test_user.id),
        "name": "New Client",
        "company": "NewCo",
        "health_score": 85,
    }
    response = await async_client.post("/clients/", json=payload)

    assert response.status_code == 201, response.text
    data = response.json()
    assert data["name"] == "New Client"
    assert data["company"] == "NewCo"
    assert data["health_score"] == 85
    assert "id" in data

    # Cleanup: remove the client created by this test
    created = await Client.get(data["id"])
    if created:
        await created.delete()


async def test_create_client_nonexistent_user(async_client: AsyncClient):
    """Referencing a non-existent user_id should return HTTP 404."""
    fake_oid = "000000000000000000000001"
    payload = {
        "user_id": fake_oid,
        "name": "Ghost Client",
        "company": "Ghost Inc",
    }
    response = await async_client.post("/clients/", json=payload)
    assert response.status_code == 404


# =========================================================================
# Tests — GET /clients/{client_id}
# =========================================================================

async def test_get_client_success(async_client: AsyncClient, test_client: Client):
    """Fetching an existing client by ID should return HTTP 200 with correct data."""
    response = await async_client.get(f"/clients/{test_client.id}")

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["id"] == str(test_client.id)
    assert data["name"] == test_client.name
    assert data["company"] == test_client.company
    assert data["health_score"] == test_client.health_score


async def test_get_client_not_found(async_client: AsyncClient):
    """Fetching a non-existent client ID should return HTTP 404."""
    fake_oid = "000000000000000000000002"
    response = await async_client.get(f"/clients/{fake_oid}")
    assert response.status_code == 404


# =========================================================================
# Tests — GET /health
# =========================================================================

async def test_health_check(async_client: AsyncClient):
    """Liveness probe should always return 200 with status ok."""
    response = await async_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
