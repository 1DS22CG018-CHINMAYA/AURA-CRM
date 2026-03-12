"""
conftest.py
-----------
Shared pytest fixtures for the entire Aura CRM test suite.

Why conftest.py?
----------------
pytest automatically discovers this file and makes its fixtures available to
every test module in the same directory — no imports needed.

The session-scoped database lifecycle lives here so it runs exactly ONCE per
pytest session regardless of how many test files are collected. Previously
each test module managed its own init_db / close_db lifecycle, which caused
fixture conflicts and double-initialization when running all tests together.

Event-loop note
---------------
Everything is pinned to ``loop_scope="session"`` to keep Motor's
``AsyncIOMotorClient`` on the same event loop as the tests that use it.
See the extended comment in test_main.py for the full explanation.
"""

import os

import pytest
import pytest_asyncio
from dotenv import load_dotenv

load_dotenv()

from database import close_db, get_client, init_db  # noqa: E402

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

TEST_DB_NAME = "aura_test_db"

# ─────────────────────────────────────────────────────────────────────────────
# Session-scoped database lifecycle  (shared by ALL test modules)
# ─────────────────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def mongo_uri() -> str:
    """Return the MongoDB URI from the environment, raising early if absent."""
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        pytest.fail(
            "MONGODB_URI environment variable is not set. "
            "Copy .env.example to .env and fill in your Atlas connection string."
        )
    return uri  # type: ignore[return-value]


@pytest_asyncio.fixture(scope="session", autouse=True, loop_scope="session")
async def database_lifecycle(mongo_uri: str):
    """
    Initialise the Beanie ODM against ``aura_test_db`` for the full test
    session, then drop the test database on teardown.

    ``autouse=True`` means this fixture runs automatically for every test
    in the session — no need to request it explicitly.
    """
    await init_db(uri=mongo_uri, db_name=TEST_DB_NAME)

    yield  # ← all tests in the session run here

    # Teardown: wipe the test database so Atlas stays clean
    motor_client = get_client()
    if motor_client is not None:
        await motor_client.drop_database(TEST_DB_NAME)

    await close_db()
