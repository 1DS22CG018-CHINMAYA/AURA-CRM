"""
database.py
-----------
Handles the asynchronous MongoDB connection lifecycle using Motor + Beanie.
The `init_db` function is the single entry-point for both production startup
and test fixtures. Tests can override the URI to target a dedicated test
database without touching production data.
"""

import os
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from dotenv import load_dotenv

# Load variables from .env (ignored if env vars are already set externally,
# e.g., by a test fixture or CI/CD pipeline).
load_dotenv()

# Module-level reference so callers can close the connection cleanly.
_mongo_client: AsyncIOMotorClient | None = None


async def init_db(uri: str | None = None, db_name: str = "aura_db") -> None:
    """
    Initialise Motor client and Beanie ODM.

    Parameters
    ----------
    uri:
        MongoDB connection string. If *None*, the value of the ``MONGODB_URI``
        environment variable is used. Pass an explicit value in tests.
    db_name:
        Name of the database to use.  Tests pass ``"aura_test_db"`` here so
        they never touch the production database.
    """
    global _mongo_client
    # Why did this line come 

    # Lazy import to avoid circular dependency between database ↔ models.
    # what does circular dependency mean here 
    from models import User, Client, Task, Note, Briefing

    connection_uri = uri or os.environ.get("MONGODB_URI")
    if not connection_uri:
        raise ValueError(
            "MongoDB URI not provided. "
            "Set the MONGODB_URI environment variable or pass `uri` explicitly."
        )

    _mongo_client = AsyncIOMotorClient(connection_uri)
    database = _mongo_client[db_name]

    # what does init_beanie do here  and why are we using this know more on this 
    await init_beanie(
        database=database,
        document_models=[User, Client, Task, Note, Briefing],
    )


async def close_db() -> None:
    """Close the Motor client connection pool."""
    global _mongo_client
    if _mongo_client is not None:
        _mongo_client.close()
        _mongo_client = None


def get_client() -> AsyncIOMotorClient | None:
    """Return the active Motor client (useful for tests that need low-level access)."""
    return _mongo_client
