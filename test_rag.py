"""
test_rag.py
-----------
Tests for the MongoDB Atlas Vector Search RAG pipeline (Unit 4).

Strategy
--------
Because Atlas Vector Search requires a pre-configured index on the target
collection, we take a two-layer approach:

Layer 1 — Service unit tests (mocked Atlas search)
    The ``add_note_to_vectorstore`` function writes real documents to the
    test collection (``aura_test_db.note_vectors_test``) via pymongo.
    The ``search_client_notes`` function is tested with a mock Atlas
    response; the pre_filter logic and response formatting are verified
    without a live vector index.

Layer 2 — API endpoint tests (fully mocked)
    ``GET /clients/{client_id}/search`` is exercised via httpx.AsyncClient.
    ``main.search_client_notes`` is patched with AsyncMock so the HTTP
    handling layer is tested independently of Atlas.

Teardown
--------
The session fixture drops ``aura_test_db.note_vectors_test`` after the
entire session completes, keeping the Atlas cluster clean.

Atlas setup required for live search
-------------------------------------
If you want to run real (un-mocked) vector searches against the test
collection, create a Search index named ``vector_index`` on
``aura_test_db.note_vectors_test`` with:

    {
      "fields": [
        { "type": "vector",  "path": "embedding",
          "numDimensions": <model_dim>,  "similarity": "cosine" },
        { "type": "filter",  "path": "metadata.client_id" },
        { "type": "filter",  "path": "metadata.user_id"   }
      ]
    }
"""

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from dotenv import load_dotenv
from httpx import ASGITransport, AsyncClient
from langchain_core.documents import Document
from langchain_mongodb import MongoDBAtlasVectorSearch
from pymongo import MongoClient

import services.vector_service as vs_module
from services.vector_service import add_note_to_vectorstore, search_client_notes
from main import app

load_dotenv()

# All async tests share the session event loop.
pytestmark = pytest.mark.asyncio(loop_scope="session")
pytest_plugins = ("pytest_asyncio",)

TEST_DB         = "aura_test_db"
TEST_COLL_NAME  = "note_vectors_test"
DUMMY_CLIENT_ID = "rag_unit_test_client_001"
DUMMY_USER_ID   = "rag_unit_test_user_001"


# ─────────────────────────────────────────────────────────────────────────────
# Session fixture — real test collection + mocked embeddings
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
def test_vector_store_setup():
    """
    1. Connect to Atlas using MONGODB_URI.
    2. Inject a MongoDBAtlasVectorSearch backed by the test collection.
       The embedding model is mocked with a MagicMock that returns
       deterministic dummy vectors — so tests run without downloading the
       ~300 MB Gemma model.
    3. Override the module-level vector store via ``use_test_vectorstore``.
    4. Teardown: drop the test collection and reset overrides.
    """
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        pytest.skip("MONGODB_URI not set — skipping RAG tests")

    pymongo_client = MongoClient(uri)
    collection     = pymongo_client[TEST_DB][TEST_COLL_NAME]

    # Mock embeddings — fixed 768-dim vectors so no model download is needed.
    mock_embeddings            = MagicMock()
    mock_embeddings.embed_documents.side_effect = lambda texts: [[0.1] * 768] * len(texts)
    mock_embeddings.embed_query.return_value    = [0.1] * 768

    # Build the test vector store pointing at the isolated test collection.
    test_vs = MongoDBAtlasVectorSearch(
        collection = collection,
        embedding  = mock_embeddings,
        index_name = vs_module.ATLAS_INDEX_NAME,
    )

    vs_module.use_test_vectorstore(test_vs, collection)

    yield collection   # tests run here

    # Teardown: drop test collection and restore defaults.
    vs_module.reset_test_vectorstore()
    pymongo_client.close()


@pytest_asyncio.fixture(loop_scope="session")
async def http_client() -> AsyncClient:
    """ASGI test client wired directly to the FastAPI app."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client


# ─────────────────────────────────────────────────────────────────────────────
# Test 1 — add_note_to_vectorstore writes to the test collection
# ─────────────────────────────────────────────────────────────────────────────

async def test_add_note_writes_to_collection(test_vector_store_setup):
    """
    Verifies that ``add_note_to_vectorstore`` stores a document with the
    correct metadata in the test MongoDB collection.

    The embedding is already mocked at the fixture level, so this exercises
    the real pymongo write path without needing a live model.
    """
    NOTE_ID   = "test-note-write-001"
    NOTE_TEXT = "Client discussed Q4 budget and revenue forecasting strategy."

    await add_note_to_vectorstore(
        note_id   = NOTE_ID,
        client_id = DUMMY_CLIENT_ID,
        user_id   = DUMMY_USER_ID,
        text      = NOTE_TEXT,
    )

    # Verify the document landed in Atlas with the correct metadata.
    pymongo_collection = test_vector_store_setup
    stored = pymongo_collection.find_one({"_id": NOTE_ID})

    # langchain-mongodb flattens metadata into the top-level document.
    # Fields are stored as: { "_id": ..., "text": ..., "embedding": [...],
    #                          "note_id": ..., "client_id": ..., "user_id": ... }
    assert stored is not None, f"Document '{NOTE_ID}' not found in test collection"
    assert stored["note_id"]   == NOTE_ID
    assert stored["client_id"] == DUMMY_CLIENT_ID
    assert stored["user_id"]   == DUMMY_USER_ID
    assert stored["text"]      == NOTE_TEXT


# ─────────────────────────────────────────────────────────────────────────────
# Test 2 — search_client_notes formats results correctly
# ─────────────────────────────────────────────────────────────────────────────

async def test_search_client_notes_formats_results():
    """
    Verifies that ``search_client_notes`` correctly:
      - passes the ``pre_filter`` with the given client_id to Atlas
      - returns results in the expected {text, metadata, score} format

    The Atlas search call is mocked — we test the glue / formatting logic,
    not the Atlas infrastructure itself (which requires a live vector index).
    """
    mock_doc = Document(
        page_content = "Q4 budget review and annual financial planning.",
        metadata     = {"note_id": "note-finance-01", "client_id": DUMMY_CLIENT_ID},
    )
    EXPECTED_SCORE = 0.9312

    vs = vs_module._get_vector_store()

    with patch.object(vs, "similarity_search_with_score",
                      return_value=[(mock_doc, EXPECTED_SCORE)]) as mock_search:

        results = await search_client_notes(
            client_id = DUMMY_CLIENT_ID,
            query     = "quarterly financial planning",
            top_k     = 3,
        )

        # Verify pre_filter was passed correctly
        call_kwargs = mock_search.call_args.kwargs
        assert "pre_filter" in call_kwargs, "pre_filter must be passed to Atlas search"
        assert call_kwargs["pre_filter"] == {
            "client_id": {"$eq": DUMMY_CLIENT_ID}
        }

    # Verify response structure
    assert len(results) == 1
    result = results[0]
    assert result["text"]                      == mock_doc.page_content
    assert result["metadata"]["client_id"]     == DUMMY_CLIENT_ID
    assert result["score"]                     == round(EXPECTED_SCORE, 4)


# ─────────────────────────────────────────────────────────────────────────────
# Test 3 — GET /clients/{client_id}/search endpoint
# ─────────────────────────────────────────────────────────────────────────────

async def test_search_endpoint(http_client: AsyncClient):
    """
    End-to-end test for the ``GET /clients/{client_id}/search`` route.

    ``main.search_client_notes`` is replaced with an AsyncMock so no Atlas
    connection is needed.  We verify the HTTP layer: routing, query param
    parsing, response schema.
    """
    fake_oid    = "cccccccccccccccccccccccc"   # valid 24-hex ObjectId shape
    search_query = "budget planning meeting"

    mock_results = [
        {
            "text":     "Client Sarah reviewed Q4 budget allocation and approved spend.",
            "metadata": {"note_id": "note-001", "client_id": fake_oid},
            "score":    0.8921,
        }
    ]

    with patch("main.search_client_notes", new_callable=AsyncMock) as mock_fn:
        mock_fn.return_value = mock_results

        response = await http_client.get(
            f"/clients/{fake_oid}/search",
            params={"query": search_query, "top_k": 1},
        )

    assert response.status_code == 200, response.text
    data = response.json()

    assert data["query"]              == search_query
    assert "results"                  in data
    assert len(data["results"])       == 1

    top = data["results"][0]
    assert "note_id" in top
    assert "text"    in top
    assert "score"   in top
    assert isinstance(top["score"], float)
    assert top["score"] > 0


# ─────────────────────────────────────────────────────────────────────────────
# Test 4 — Search endpoint returns 422 for missing query param
# ─────────────────────────────────────────────────────────────────────────────

async def test_search_endpoint_missing_query(http_client: AsyncClient):
    """Omitting the required ``query`` param must return HTTP 422."""
    fake_oid = "dddddddddddddddddddddddd"
    response  = await http_client.get(f"/clients/{fake_oid}/search")
    assert response.status_code == 422
