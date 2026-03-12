"""
services/vector_service.py
---------------------------
MongoDB Atlas Vector Search implementation for Aura CRM semantic memory.

Architecture
------------
* **Embeddings** : Custom ``GemmaEmbeddings`` class wrapping the local
  ``sentence-transformers`` Gemma model — fully offline after first download.
  Uses ``encode_document()`` for corpus text and ``encode_query()`` for
  search queries (asymmetric bi-encoder pattern).

* **Vector store** : ``MongoDBAtlasVectorSearch`` from ``langchain_mongodb``,
  backed by the ``aura_db.note_vectors`` collection in Atlas. Requires a
  pre-configured Atlas Search index named ``vector_index`` (see note below).

* **Test override** : call ``use_test_vectorstore(vs, collection)`` from a
  pytest fixture to redirect all vector operations to a test collection.
  Call ``reset_test_vectorstore()`` in teardown to drop the collection and
  restore production defaults.

Atlas index required
--------------------
The ``vector_index`` on ``note_vectors`` must be configured with:

    {
      "fields": [
        { "type": "vector",  "path": "embedding",
          "numDimensions": <model_dim>,  "similarity": "cosine" },
        { "type": "filter",  "path": "metadata.client_id" }
      ]
    }

The ``metadata.client_id`` filter field is REQUIRED for per-client search.
For the test collection (``note_vectors_test``) the same index must exist.

Blocking I/O
------------
Both ``add_texts`` and ``similarity_search_with_score`` are synchronous.
They are wrapped in ``asyncio.to_thread`` to keep the FastAPI event loop free.
"""

import asyncio
import os
from typing import Optional

from langchain_core.embeddings import Embeddings
from langchain_mongodb import MongoDBAtlasVectorSearch
from pymongo import MongoClient
from sentence_transformers import SentenceTransformer


# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

EMBEDDING_MODEL      = "google/embeddinggemma-300m"   # HuggingFace model ID
ATLAS_DB_NAME        = "aura_db"
PRODUCTION_COLL      = "note_vectors"
TEST_COLL            = "note_vectors_test"
ATLAS_INDEX_NAME     = "vector_index"


# ─────────────────────────────────────────────────────────────────────────────
# Custom embeddings — Gemma bi-encoder wrapper
# ─────────────────────────────────────────────────────────────────────────────

class GemmaEmbeddings(Embeddings):
    """
    LangChain ``Embeddings`` adapter for the local Gemma embedding model.

    ``encode_document()`` and ``encode_query()`` use the asymmetric bi-encoder
    API introduced in sentence-transformers 3.x.  If your model version only
    exposes ``encode()``, replace both calls with ``self.model.encode()``.
    """

    def __init__(self) -> None:
        self.model = SentenceTransformer(EMBEDDING_MODEL)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of corpus documents."""
        return self.model.encode_document(texts).tolist()

    def embed_query(self, text: str) -> list[float]:
        """Embed a single search query."""
        return self.model.encode_query(text).tolist()


# ─────────────────────────────────────────────────────────────────────────────
# Module-level singletons
# ─────────────────────────────────────────────────────────────────────────────

_embeddings: Optional[GemmaEmbeddings]              = None
_production_vector_store: Optional[MongoDBAtlasVectorSearch] = None

# Test overrides (set by use_test_vectorstore / reset_test_vectorstore)
_test_vector_store: Optional[MongoDBAtlasVectorSearch] = None
_test_pymongo_collection = None   # raw pymongo Collection for teardown


# ─────────────────────────────────────────────────────────────────────────────
# Test-environment hooks
# ─────────────────────────────────────────────────────────────────────────────

def use_test_vectorstore(
    vector_store: MongoDBAtlasVectorSearch,
    pymongo_collection,
) -> None:
    """
    Redirect all vector operations to ``vector_store`` (backed by the test
    collection).  ``pymongo_collection`` is retained so teardown can drop it.
    """
    global _test_vector_store, _test_pymongo_collection
    _test_vector_store      = vector_store
    _test_pymongo_collection = pymongo_collection


def reset_test_vectorstore() -> None:
    """
    Drop the test collection and clear all overrides so subsequent tests (or
    a live server) use the production vector store.
    """
    global _test_vector_store, _test_pymongo_collection
    if _test_pymongo_collection is not None:
        _test_pymongo_collection.drop()
    _test_vector_store       = None
    _test_pymongo_collection  = None


# ─────────────────────────────────────────────────────────────────────────────
# Internal factory helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_embeddings() -> GemmaEmbeddings:
    """Lazy-initialise the embedding model (downloads on first call ~300 MB)."""
    global _embeddings
    if _embeddings is None:
        _embeddings = GemmaEmbeddings()
    return _embeddings


def _get_vector_store() -> MongoDBAtlasVectorSearch:
    """Return the active vector store — test override takes precedence."""
    if _test_vector_store is not None:
        return _test_vector_store

    global _production_vector_store
    if _production_vector_store is None:
        uri = os.environ.get("MONGODB_URI")
        if not uri:
            raise RuntimeError(
                "MONGODB_URI is not set — cannot initialise MongoDBAtlasVectorSearch."
            )
        client     = MongoClient(uri)
        collection = client[ATLAS_DB_NAME][PRODUCTION_COLL]
        _production_vector_store = MongoDBAtlasVectorSearch(
            collection   = collection,
            embedding    = _get_embeddings(),
            index_name   = ATLAS_INDEX_NAME,
        )
    return _production_vector_store


# ─────────────────────────────────────────────────────────────────────────────
# Public async API
# ─────────────────────────────────────────────────────────────────────────────

async def add_note_to_vectorstore(
    note_id:   str,
    client_id: str,
    user_id:   str,
    text:      str,
) -> None:
    """
    Embed ``text`` and upsert it into the Atlas ``note_vectors`` collection.

    Parameters
    ----------
    note_id:
        MongoDB ObjectId string of the Note document — used as the vector doc
        ID so re-processing the same note overwrites rather than duplicates.
    client_id:
        Stored in ``metadata.client_id`` and used as a pre-filter in
        per-client searches (``search_client_notes``).
    user_id:
        Stored in ``metadata.user_id`` and used as a pre-filter in global
        searches (``search_all_notes``) to enforce user-level data isolation.
    text:
        The content to embed — typically the LLM-generated summary.
    """
    vs = _get_vector_store()
    await asyncio.to_thread(
        vs.add_texts,
        texts     = [text],
        metadatas = [{"note_id": note_id, "client_id": client_id, "user_id": user_id}],
        ids       = [note_id],
    )


async def search_client_notes(
    client_id: str,
    query:     str,
    top_k:     int = 3,
) -> list[dict]:
    """
    Return the ``top_k`` most semantically similar notes for ``client_id``.

    Uses ``pre_filter`` to restrict the Atlas vector search to documents
    whose ``metadata.client_id`` exactly matches ``client_id``.

    Returns
    -------
    list of dicts, each with keys: ``text``, ``metadata``, ``score``.
    """
    vs = _get_vector_store()
    results = await asyncio.to_thread(
        vs.similarity_search_with_score,
        query,
        k          = top_k,
        pre_filter = {"client_id": {"$eq": client_id}},
    )
    return [
        {
            "text":     doc.page_content,
            "metadata": doc.metadata,
            "score":    round(float(score), 4),
        }
        for doc, score in results
    ]


async def search_all_notes(
    query:   str,
    user_id: str,
    top_k:   int = 5,
) -> list[dict]:
    """
    Global semantic search — scans all ``note_vectors`` documents that belong
    to ``user_id``.  The ``user_id`` pre-filter enforces user-level isolation
    so User A can never see User B's client notes.

    Returns
    -------
    list of dicts, each with keys: ``text``, ``metadata`` (includes
    ``client_id``, ``user_id``, ``note_id``), ``score``.
    Sorted by descending similarity score.
    """
    vs = _get_vector_store()
    results = await asyncio.to_thread(
        vs.similarity_search_with_score,
        query,
        k          = top_k,
        pre_filter = {"user_id": {"$eq": user_id}},   # ← isolation boundary
    )
    return [
        {
            "text":     doc.page_content,
            "metadata": doc.metadata,
            "score":    round(float(score), 4),
        }
        for doc, score in results
    ]


async def warm_up() -> None:
    """
    Pre-load the HuggingFace embedding model into memory.

    Call this from the FastAPI lifespan so the model is ready before the
    first user request.  Loading from the local cache takes ~10-60 s;
    the first-ever download can take several minutes.
    """
    await asyncio.to_thread(_get_embeddings)
