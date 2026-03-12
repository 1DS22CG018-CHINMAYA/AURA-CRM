"""
main.py
-------
FastAPI application entry-point for Aura CRM.
Database startup / shutdown are registered as lifespan events so that the
Motor connection pool is always opened before the first request and closed
gracefully when the server shuts down.
"""

# ── Load .env FIRST — before any service module reads os.environ ────────────
from dotenv import load_dotenv
load_dotenv(override=True)   # override=True forces re-read even if vars exist
# ─────────────────────────────────────────────────────────────────────────────

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import AsyncGenerator, Optional

log = logging.getLogger(__name__)

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from beanie import PydanticObjectId
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, EmailStr

from database import close_db, init_db
from models import Briefing, Client, Note, Task, User
from services.brain_dump_graph import brain_dump_graph
from services.chat_graph import chat_graph
from services.intelligence_service import evaluate_client_health, generate_user_briefing
from services.llm_service import get_llm
from services.vector_service import add_note_to_vectorstore, search_client_notes, search_all_notes, warm_up
import uuid

# ---------------------------------------------------------------------------
# Model readiness tracking
# ---------------------------------------------------------------------------

_models_ready: bool = False

async def _warm_up_models() -> None:
    """Pre-load the HuggingFace embedding model at startup (non-blocking)."""
    global _models_ready
    log.info("[warmup] Starting embedding model pre-load…")
    try:
        await warm_up()
        _models_ready = True
        log.info("[warmup] Embedding models ready ✅")
    except Exception:
        log.exception("[warmup] Model pre-load failed — will load on first request")
        _models_ready = True   # Don't block the UI indefinitely


# ---------------------------------------------------------------------------
# Lifespan (startup + shutdown)
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage the Motor connection pool and APScheduler for the app lifetime."""
    await init_db()          # Connect to MongoDB Atlas

    # Start the background scheduler (daily briefing at 06:00 UTC)
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        _run_daily_briefings,
        CronTrigger(hour=6, minute=0),
        id="daily_morning_briefing",
        replace_existing=True,
    )
    scheduler.start()

    # Kick off model warmup in the background — doesn't block server startup
    asyncio.create_task(_warm_up_models())

    yield

    scheduler.shutdown(wait=False)
    await close_db()         # Gracefully close the Motor connection pool


async def _run_daily_briefings() -> None:
    """Cron callback: generate morning briefings for every user in the DB."""
    users = await User.find_all().to_list()
    for user in users:
        await generate_user_briefing(str(user.id))


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Aura CRM",
    description="AI-powered Customer Relationship Management API",
    version="0.1.0",
    lifespan=lifespan,
)

# --- ADD THIS ENTIRE BLOCK ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Whitelists your Vite frontend
    allow_credentials=True,
    allow_methods=["*"],                      # Allows all HTTP methods (GET, POST, etc.)
    allow_headers=["*"],                      # Allows all headers
)
# -----------------------------

# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

# --- User schemas -------------------------------------------------------

class CreateUserRequest(BaseModel):
    """Payload for the onboarding / login endpoint."""
    name: str
    email: EmailStr


class UserResponse(BaseModel):
    """Public representation of a User document."""
    id: PydanticObjectId
    name: str
    email: EmailStr


# --- Client schemas ------------------------------------------------------

class CreateClientRequest(BaseModel):
    """Payload for creating a new client."""
    user_id: PydanticObjectId
    name: str
    company: str
    health_score: int = 100


class UpdateClientRequest(BaseModel):
    """Payload for updating a client — all fields optional."""
    name:    Optional[str] = None
    company: Optional[str] = None
    health_score: Optional[int] = None


class ClientResponse(BaseModel):
    """Public representation of a Client document."""
    id: PydanticObjectId
    user_id: PydanticObjectId
    name: str
    company: str
    health_score: int


# --- Brain Dump schemas ---------------------------------------------------

class BrainDumpRequest(BaseModel):
    """Payload for the brain-dump processor endpoint."""
    raw_text: str


class ExtractedTaskOut(BaseModel):
    """Public representation of a Task created by the brain-dump processor."""
    id: PydanticObjectId
    title: str
    due_date: Optional[datetime] = None


class BrainDumpResponse(BaseModel):
    """Response returned by POST /clients/{client_id}/notes/process."""
    note_id: PydanticObjectId
    summary: str
    tasks: list[ExtractedTaskOut]


class NoteResponse(BaseModel):
    """Public representation of a saved Note document."""
    id: PydanticObjectId
    summary: str
    created_at: datetime


# --- Semantic Search schemas ----------------------------------------------

class SearchResultItem(BaseModel):
    """A single result from the vector similarity search."""
    note_id: str
    text: str
    score: float


class SearchResponse(BaseModel):
    """Response returned by GET /clients/{client_id}/search."""
    query: str
    results: list[SearchResultItem]


# --- Intelligence / Briefing schemas -------------------------------------

class BriefingResponse(BaseModel):
    """Public representation of a generated Briefing document."""
    id: PydanticObjectId
    user_id: PydanticObjectId
    content: str
    generated_date: datetime


# --- Tasks schemas -------------------------------------------------------

class TaskResponse(BaseModel):
    """Public representation of a Task document."""
    id: PydanticObjectId
    client_id: PydanticObjectId
    title: str
    status: str
    due_date: Optional[datetime] = None


class UpdateTaskRequest(BaseModel):
    """Payload for updating a Task — all fields optional."""
    status:   Optional[str]      = None
    title:    Optional[str]      = None
    due_date: Optional[datetime] = None


class UpdateBriefingRequest(BaseModel):
    """Payload for PUT /briefings/{briefing_id}."""
    content: str


class CreateTaskRequest(BaseModel):
    """Payload for POST /clients/{client_id}/tasks (manual task creation)."""
    title:    str
    due_date: Optional[datetime] = None


"""
We can comment this class as this was supposed to be used for one of the feature which was later 
taught of neglecting it for now
"""
class GlobalSearchResult(BaseModel):
    """Single hit from the global semantic search."""
    text:          str
    score:         float
    confidence:    int              # 0-100 percentage shown in the UI
    client_id:     Optional[str]   = None
    client_name:   Optional[str]   = None
    note_id:       Optional[str]   = None


class ChatMessage(BaseModel):
    """A single turn in the conversation."""
    role:    str   # "user" | "ai"
    content: str


class ChatRequest(BaseModel):
    """Payload for POST /chat."""
    messages: list[ChatMessage]
    user_id:  str   # Required — scopes the vector search to this user's notes only


class ChatResponse(BaseModel):
    """Response from POST /chat — just the new AI turn."""
    role:    str = "ai"
    content: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _client_to_response(client: Client) -> ClientResponse:
    """Map a Beanie Client document to the public ClientResponse schema."""
    # When fetched without `fetch_links=True`, user_id is a DBRef/Link object.
    # We extract the raw ObjectId safely.
    user_oid = (
        client.user_id.ref.id          # type: ignore[union-attr]
        if hasattr(client.user_id, "ref")
        else client.user_id.id         # type: ignore[union-attr]
    )
    return ClientResponse(
        id=client.id,  # type: ignore[arg-type]
        user_id=user_oid,
        name=client.name,
        company=client.company,
        health_score=client.health_score,
    )


# ---------------------------------------------------------------------------
# Routes — Users
# ---------------------------------------------------------------------------

@app.get(
    "/users/by-email",
    response_model=UserResponse,
    summary="Look up an existing user by email address",
    tags=["Users"],
)
async def get_user_by_email(
    email: str = Query(..., description="Email address to look up"),
) -> UserResponse:
    """
    Return the **User** whose ``email`` matches exactly (case-insensitive).

    * **200** — user exists, returns their id/name/email.
    * **404** — no user with this email; the frontend should offer sign-up.
    """
    user = await User.find_one({"email": {"$regex": f"^{email.strip()}$", "$options": "i"}})
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found for this email address.",
        )
    return UserResponse(id=user.id, name=user.name, email=user.email)  # type: ignore[arg-type]


@app.post(
    "/users/",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create / onboard a new user",
    tags=["Users"],
)
async def create_user(payload: CreateUserRequest) -> UserResponse:
    """
    Create a new **User** document and return its ``id``.
    The React frontend stores this id in ``localStorage`` as the session token.
    Callers should first check ``GET /users/by-email`` to avoid duplicates.
    """
    # Guard: reject if the email is already registered
    existing = await User.find_one(
        {"email": {"$regex": f"^{payload.email.strip()}$", "$options": "i"}}
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists. Please sign in instead.",
        )
    user = User(name=payload.name, email=payload.email.strip())
    await user.insert()
    return UserResponse(
        id=user.id,        # type: ignore[arg-type]
        name=user.name,
        email=user.email,
    )


# ---------------------------------------------------------------------------
# Routes — Clients
# ---------------------------------------------------------------------------

@app.post(
    "/clients/",
    response_model=ClientResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new client",
    tags=["Clients"],
)
async def create_client(payload: CreateClientRequest) -> ClientResponse:
    """
    Create a new **Client** record linked to an existing User.

    - Verifies that the referenced User exists.
    - Returns the newly created Client document.
    """
    user = await User.get(payload.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{payload.user_id}' not found.",
        )

    client = Client(
        user_id=user,           # Beanie accepts the full document as a Link
        name=payload.name,
        company=payload.company,
        health_score=payload.health_score,
    )
    await client.insert()
    return _client_to_response(client)


@app.get(
    "/clients/{client_id}",
    response_model=ClientResponse,
    summary="Retrieve a client by ID",
    tags=["Clients"],
)
async def get_client(client_id: PydanticObjectId) -> ClientResponse:
    """
    Fetch a **Client** by its MongoDB ObjectId.

    Returns **404** if the client does not exist.
    """
    client = await Client.get(client_id)
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client '{client_id}' not found.",
        )
    return _client_to_response(client)


@app.put(
    "/clients/{client_id}",
    response_model=ClientResponse,
    summary="Update a client's editable fields",
    tags=["Clients"],
)
async def update_client(
    client_id: PydanticObjectId,
    payload: UpdateClientRequest,
) -> ClientResponse:
    """Rename or update a **Client**. Only supplied fields are changed."""
    client = await Client.get(client_id)
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Client '{client_id}' not found.")

    patch: dict = {}
    if payload.name         is not None: patch[Client.name]         = payload.name
    if payload.company      is not None: patch[Client.company]      = payload.company
    if payload.health_score is not None: patch[Client.health_score] = payload.health_score
    if patch:
        await client.set(patch)
    return _client_to_response(client)


@app.delete(
    "/clients/{client_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a client and all associated tasks/notes",
    tags=["Clients"],
)
async def delete_client(client_id: PydanticObjectId) -> None:
    """
    Hard-delete a **Client** and cascade-delete all related Tasks and Notes.
    Returns **204 No Content** on success.
    """
    client = await Client.get(client_id)
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Client '{client_id}' not found.")

    # Cascade: delete every task and note belonging to this client
    await Task.find({"client_id.$id": client_id}).delete()
    await Note.find({"client_id.$id": client_id}).delete()
    await client.delete()


# ---------------------------------------------------------------------------
# Routes — Brain Dump Processor
# ---------------------------------------------------------------------------

@app.post(
    "/clients/{client_id}/notes/process",
    response_model=BrainDumpResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Process raw meeting notes with LangGraph",
    tags=["Brain Dump"],
)
async def process_brain_dump(
    client_id: PydanticObjectId,
    payload: BrainDumpRequest,
    background_tasks: BackgroundTasks,
) -> BrainDumpResponse:
    """
    Run the LangGraph **Brain Dump** workflow on raw meeting notes:

    1. Verify the referenced Client exists.
    2. Run the LangGraph pipeline (extract tasks → summarise).
    3. Persist a **Note** document containing the raw text + AI summary.
    4. Persist one **Task** document per extracted action item.
    5. Return the summary and all created tasks.
    """
    # 1. Verify client exists
    client = await Client.get(client_id)
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client '{client_id}' not found.",
        )

    # 2. Run LangGraph workflow
    result = await brain_dump_graph.ainvoke({
        "raw_text": payload.raw_text,
        "client_id": str(client_id),
        "tasks": [],
        "summary": "",
    })

    # 3. Persist Note
    note = Note(
        client_id=client,
        content=payload.raw_text,
        summary=result["summary"],
    )
    await note.insert()

    # 3b. Sync summary into Atlas Vector Search
    # Resolve the user_id from the client link so the vector doc is user-scoped.
    raw_uid = client.user_id.ref.id if hasattr(client.user_id, "ref") else client.user_id.id  # type: ignore
    await add_note_to_vectorstore(
        note_id   = str(note.id),
        client_id = str(client_id),
        user_id   = str(raw_uid),
        text      = result["summary"],
    )

    # 3c. Kick off health re-scoring as a background task (non-blocking)
    background_tasks.add_task(evaluate_client_health, str(client_id))

    # 4. Persist Tasks
    created_tasks: list[Task] = []
    for task_data in result["tasks"]:
        due_date: Optional[datetime] = None
        raw_date = task_data.get("due_date")
        if raw_date:
            try:
                due_date = datetime.fromisoformat(str(raw_date))
            except (ValueError, TypeError):
                due_date = None     # unparseable date → graceful fallback

        task = Task(
            client_id=client,
            title=task_data.get("title", "Untitled Task"),
            due_date=due_date,
        )
        await task.insert()
        created_tasks.append(task)

    # 5. Return structured response
    return BrainDumpResponse(
        note_id=note.id,               # type: ignore[arg-type]
        summary=result["summary"],
        tasks=[
            ExtractedTaskOut(
                id=t.id,               # type: ignore[arg-type]
                title=t.title,
                due_date=t.due_date,
            )
            for t in created_tasks
        ],
    )


@app.get(
    "/clients/{client_id}/notes",
    response_model=list[NoteResponse],
    summary="List all processed notes for a client (newest first)",
    tags=["Notes"],
)
async def list_client_notes(client_id: PydanticObjectId) -> list[NoteResponse]:
    """
    Return all **Note** documents for ``client_id``, sorted newest-first.
    Each note includes the AI-generated ``summary`` and its ``created_at`` timestamp.
    """
    client = await Client.get(client_id)
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client '{client_id}' not found.",
        )
    notes = (
        await Note.find({"client_id.$id": client_id})
        .sort("-created_at")
        .to_list()
    )
    return [
        NoteResponse(
            id=n.id,                    # type: ignore[arg-type]
            summary=n.summary or "",
            created_at=n.created_at,
        )
        for n in notes
    ]


# ---------------------------------------------------------------------------
# Routes — Semantic Search (RAG)
# ---------------------------------------------------------------------------

@app.get(
    "/clients/{client_id}/search",
    response_model=SearchResponse,
    summary="Semantic search over a client's notes",
    tags=["Search"],
)
async def search_notes(
    client_id: PydanticObjectId,
    query: str = Query(..., min_length=1, description="Natural-language search query"),
    top_k: int = Query(default=3, ge=1, le=10, description="Number of results to return"),
) -> SearchResponse:
    """
    Embed ``query`` with the local HuggingFace model and return the
    ``top_k`` most semantically similar notes for ``client_id`` from ChromaDB.
    """
    raw_results = await search_client_notes(
        client_id=str(client_id),
        query=query,
        top_k=top_k,
    )
    return SearchResponse(
        query=query,
        results=[
            SearchResultItem(
                note_id=r["metadata"].get("note_id", ""),
                text=r["text"],
                score=r["score"],
            )
            for r in raw_results
        ],
    )



# ---------------------------------------------------------------------------
# Routes — Proactive Intelligence (Briefings)
# ---------------------------------------------------------------------------

@app.post(
    "/test/trigger-briefing/{user_id}",
    status_code=status.HTTP_200_OK,
    summary="Manually trigger a morning briefing (for TDD / dev use)",
    tags=["Intelligence"],
)
async def trigger_briefing(user_id: PydanticObjectId) -> dict:
    """
    Synchronously generate and persist a morning briefing for ``user_id``.
    In production, briefings are created automatically by the 06:00 cron job.
    This endpoint exists for TDD and manual developer use.
    """
    await generate_user_briefing(str(user_id))
    return {"status": "ok", "message": f"Briefing generated for user {user_id}"}


@app.get(
    "/users/{user_id}/briefings/today",
    response_model=BriefingResponse,
    summary="Retrieve the morning briefing generated today for a user",
    tags=["Intelligence"],
)
async def get_today_briefing(user_id: PydanticObjectId) -> BriefingResponse:
    """
    Return the most recent ``Briefing`` generated today (UTC) for ``user_id``.
    Returns **404** if no briefing was generated yet today.
    """
    today_start = datetime.utcnow().replace(hour=0,  minute=0,  second=0,  microsecond=0)
    today_end   = datetime.utcnow().replace(hour=23, minute=59, second=59, microsecond=999999)

    briefing = await Briefing.find_one(
        {
            "user_id.$id": user_id,
            "generated_date": {"$gte": today_start, "$lte": today_end},
        }
    )
    if briefing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No briefing generated today for user '{user_id}'.",
        )

    user_oid = (
        briefing.user_id.ref.id       # type: ignore[union-attr]
        if hasattr(briefing.user_id, "ref")
        else briefing.user_id.id      # type: ignore[union-attr]
    )
    return BriefingResponse(
        id=briefing.id,               # type: ignore[arg-type]
        user_id=user_oid,
        content=briefing.content,
        generated_date=briefing.generated_date,
    )


@app.put(
    "/briefings/{briefing_id}",
    response_model=BriefingResponse,
    summary="Update (edit) a briefing's text content",
    tags=["Intelligence"],
)
async def update_briefing(
    briefing_id: PydanticObjectId,
    payload: UpdateBriefingRequest,
) -> BriefingResponse:
    """
    Replace the ``content`` field of an existing **Briefing** document.
    Use this for user-driven inline edits of the AI-generated morning briefing.
    """
    briefing = await Briefing.get(briefing_id)
    if briefing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Briefing '{briefing_id}' not found.",
        )
    await briefing.set({Briefing.content: payload.content.strip()})
    user_oid = (
        briefing.user_id.ref.id
        if hasattr(briefing.user_id, "ref")
        else briefing.user_id.id  # type: ignore
    )
    return BriefingResponse(
        id=briefing.id,               # type: ignore[arg-type]
        user_id=user_oid,
        content=payload.content.strip(),
        generated_date=briefing.generated_date,
    )


@app.delete(
    "/briefings/{briefing_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a briefing document",
    tags=["Intelligence"],
)
async def delete_briefing(briefing_id: PydanticObjectId) -> None:
    """Hard-delete a **Briefing** by its id. Returns **204 No Content**."""
    briefing = await Briefing.get(briefing_id)
    if briefing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Briefing '{briefing_id}' not found.",
        )
    await briefing.delete()


# ---------------------------------------------------------------------------
# LLM Bridge — Colab / Ollama - these api endpoints are strictly for testing 
# ---------------------------------------------------------------------------

@app.get("/api/model-status", tags=["Health"])
async def model_status() -> dict:
    """
    Returns whether the HuggingFace embedding model has finished loading.
    The React frontend polls this at startup and shows a warm-up banner
    until ``ready`` is ``true``.
    """
    return {"ready": _models_ready}


@app.get("/api/llm-ping", tags=["LLM"])
async def llm_ping() -> dict:
    """
    Send a simple prompt to the Colab-hosted Ollama instance and return its
    reply.  Useful as a smoke-test to verify the ngrok tunnel is alive.

    Requires ``OLLAMA_BASE_URL`` to be set in ``.env``.
    """
    llm = get_llm(model="gemma3:12b")
    message = HumanMessage(
        content="Reply with just the single word 'pong'. No punctuation, no extra text."
    )
    ai_message = await llm.ainvoke([message])
    return {"response": ai_message.content.strip()}


# ---------------------------------------------------------------------------
# Routes — Users (clients + tasks)
# ---------------------------------------------------------------------------

@app.get(
    "/users/{user_id}/clients",
    response_model=list[ClientResponse],
    summary="List all clients for a user (optional health_score range filter)",
    tags=["Clients"],
)
async def list_user_clients(
    user_id: PydanticObjectId,
    health_score_min: Optional[int] = Query(
        None, ge=0, le=100,
        description="Return only clients with health_score ≥ this value",
    ),
    health_score_max: Optional[int] = Query(
        None, ge=0, le=100,
        description="Return only clients with health_score ≤ this value",
    ),
) -> list[ClientResponse]:
    """
    Return all clients belonging to ``user_id``, optionally filtered by a
    ``health_score`` range.

    Examples
    --------
    * At-risk:  ``?health_score_max=49``  → score ≤ 49
    * Healthy:  ``?health_score_min=50``  → score ≥ 50
    * Premium:  ``?health_score_min=80&health_score_max=100``
    """
    query: dict = {"user_id.$id": user_id}
    score_filter: dict = {}
    if health_score_min is not None:
        score_filter["$gte"] = health_score_min
    if health_score_max is not None:
        score_filter["$lte"] = health_score_max
    if score_filter:
        query["health_score"] = score_filter

    clients = await Client.find(query).sort("-health_score").to_list()
    return [_client_to_response(c) for c in clients]


@app.get(
    "/users/{user_id}/tasks/today",
    response_model=list[TaskResponse],
    summary="Fetch tasks due today or overdue for all of a user's clients",
    tags=["Tasks"],
)
async def get_user_tasks_today(user_id: PydanticObjectId) -> list[TaskResponse]:
    all_clients = await Client.find({"user_id.$id": user_id}).to_list()
    all_client_ids = [c.id for c in all_clients]
    if not all_client_ids:
        return []

    # Return ALL tasks for the user's clients regardless of due date.
    # The frontend sorts pending tasks first and completed tasks last.
    tasks = await Task.find(
        {"client_id.$id": {"$in": all_client_ids}},
    ).sort([("due_date", 1)]).limit(200).to_list()

    output = []
    for t in tasks:
        coid = (
            t.client_id.ref.id if hasattr(t.client_id, "ref") else t.client_id.id  # type: ignore
        )
        output.append(
            TaskResponse(
                id=t.id,             # type: ignore[arg-type]
                client_id=coid,
                title=t.title,
                status=t.status,
                due_date=t.due_date,
            )
        )
    return output


@app.put(
    "/tasks/{task_id}",
    response_model=TaskResponse,
    summary="Update a task's status",
    tags=["Tasks"],
)
async def update_task(
    task_id: PydanticObjectId,
    payload: UpdateTaskRequest,
) -> TaskResponse:
    task = await Task.get(task_id)
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task '{task_id}' not found.",
        )

    patch: dict = {}
    if payload.status   is not None: patch[Task.status]   = payload.status
    if payload.title    is not None: patch[Task.title]    = payload.title
    if payload.due_date is not None: patch[Task.due_date] = payload.due_date
    if patch:
        await task.set(patch)

    coid = task.client_id.ref.id if hasattr(task.client_id, "ref") else task.client_id.id  # type: ignore
    return TaskResponse(
        id=task.id,              # type: ignore[arg-type]
        client_id=coid,
        title=payload.title    or task.title,
        status=payload.status  or task.status,
        due_date=task.due_date,
    )


@app.delete(
    "/tasks/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a task",
    tags=["Tasks"],
)
async def delete_task(task_id: PydanticObjectId) -> None:
    """Hard-delete a single **Task** document. Returns **204 No Content**."""
    task = await Task.get(task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Task '{task_id}' not found.")
    await task.delete()



# ---------------------------------------------------------------------------
# Routes — Client Tasks (client-scoped view)
# ---------------------------------------------------------------------------

@app.post(
    "/clients/{client_id}/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Manually create a task for a specific client",
    tags=["Tasks"],
)
async def create_client_task(
    client_id: PydanticObjectId,
    payload: CreateTaskRequest,
) -> TaskResponse:
    """
    Create a **Task** manually (not via the brain-dump pipeline).

    The ``client_id`` is taken from the URL path.  ``status`` defaults to
    ``"pending"``; ``due_date`` is optional.
    """
    client = await Client.get(client_id)
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client '{client_id}' not found.",
        )

    task = Task(
        client_id=client,
        title=payload.title.strip(),
        status="pending",
        due_date=payload.due_date,
    )
    await task.insert()

    return TaskResponse(
        id=task.id,           # type: ignore[arg-type]
        client_id=client_id,
        title=task.title,
        status=task.status,
        due_date=task.due_date,
    )


@app.get(
    "/clients/{client_id}/tasks",
    response_model=list[TaskResponse],
    summary="List all tasks for a specific client (pending first, completed last)",
    tags=["Tasks"],
)
async def list_client_tasks(client_id: PydanticObjectId) -> list[TaskResponse]:
    """
    Return all **Task** documents whose ``client_id`` matches the given client,
    sorted so pending/overdue tasks appear first (by ``due_date`` ascending,
    nulls last), and completed tasks sink to the bottom.
    """
    tasks = await Task.find(
        {"client_id.$id": client_id}
    ).to_list()

    # Python-side sort: pending first, completed last; within each group sort by due_date
    def sort_key(t: Task):
        done   = 1 if t.status == "completed" else 0
        due    = t.due_date or datetime(9999, 12, 31)   # nulls sort last
        return (done, due)

    tasks.sort(key=sort_key)

    output: list[TaskResponse] = []
    for t in tasks:
        coid = t.client_id.ref.id if hasattr(t.client_id, "ref") else t.client_id.id  # type: ignore
        output.append(TaskResponse(
            id=t.id,          # type: ignore[arg-type]
            client_id=coid,
            title=t.title,
            status=t.status,
            due_date=t.due_date,
        ))
    return output


# ---------------------------------------------------------------------------
# Routes — Global Semantic Search
# ---------------------------------------------------------------------------

@app.get(
    "/search",
    response_model=list[GlobalSearchResult],
    summary="Global semantic search across all client notes",
    tags=["Search"],
)
async def global_search(
    query:   str = Query(..., min_length=2, description="Natural-language search query"),
    user_id: str = Query(..., description="The authenticated user's MongoDB ObjectId — results are scoped to this user only"),
    top_k:   int = Query(5, ge=1, le=20),
) -> list[GlobalSearchResult]:
    """
    Embed ``query`` with the local Gemma model and run an Atlas Vector Search
    restricted to notes belonging to ``user_id``'s clients.

    User isolation is enforced via the ``user_id`` pre-filter on the Atlas
    Vector Index — User A will never see User B's client notes.
    """
    raw_hits = await search_all_notes(query=query, user_id=user_id, top_k=top_k)

    output: list[GlobalSearchResult] = []
    for hit in raw_hits:
        meta      = hit.get("metadata", {})
        client_id = meta.get("client_id")
        note_id   = meta.get("note_id")
        score     = hit["score"]   # cosine similarity in [0, 1]

        # Convert cosine similarity to a 0–100 confidence integer.
        # Scores below 0.4 are noise; 1.0 is perfect match.
        confidence = max(0, min(100, round((score - 0.4) / 0.6 * 100)))

        # Enrich with Client details if we have a client_id
        client_name = None
        resolved_client_id = None
        if client_id:
            try:
                from bson import ObjectId
                client = await Client.get(ObjectId(client_id))
                if client:
                    client_name        = client.name
                    resolved_client_id = str(client.id)
            except Exception:
                pass   # malformed id or deleted client — still return the hit

        output.append(GlobalSearchResult(
            text=hit["text"],
            score=score,
            confidence=confidence,
            client_id=resolved_client_id,
            client_name=client_name,
            note_id=note_id,
        ))

    return output


# ---------------------------------------------------------------------------
# Routes — Conversational RAG Chat
# ---------------------------------------------------------------------------

@app.post(
    "/chat",
    response_model=ChatResponse,
    summary="Conversational RAG chatbot — retrieves from vector DB then generates",
    tags=["Chat"],
)
async def chat_endpoint(payload: ChatRequest) -> ChatResponse:
    """
    Run the two-node LangGraph RAG pipeline:

    1. **retrieve_node** — embeds the latest user message, searches all
       ``note_vectors``, enriches hits with Client names.
    2. **generate_node** — builds a grounded system prompt and calls
       ChatOllama (Gemma 3 12B) with the full conversation history.

    Returns only the new AI message so the frontend can append it cleanly.
    """
    messages_dicts = [{"role": m.role, "content": m.content} for m in payload.messages]
    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    result = await chat_graph.ainvoke({
        "messages": messages_dicts,
        "context":  "",
        "user_id":  payload.user_id,   # ← scopes retrieve_node's vector search
    }, config=config)

    # The last message in state is always the new AI reply
    last_msg = result["messages"][-1]
    return ChatResponse(role=last_msg["role"], content=last_msg["content"])


# ---------------------------------------------------------------------------
# Health-check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["Health"])
async def health_check() -> dict:
    """Simple liveness probe."""
    return {"status": "ok"}
