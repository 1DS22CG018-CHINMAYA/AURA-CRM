"""
services/intelligence_service.py
----------------------------------
Background AI intelligence functions for Aura CRM.

``evaluate_client_health(client_id)``
    Fetches the last 3 meeting notes for a client, asks the LLM to assign
    a sentiment health score (0-100), and persists the result back to the
    Client document in MongoDB.  Called as a FastAPI BackgroundTask so it
    never blocks the API response.

``generate_user_briefing(user_id)``
    Collects at-risk clients (health_score < 50) and urgent tasks (due today
    or overdue), asks the LLM to write a single condensed Morning Briefing
    paragraph, and saves it as a Briefing document in MongoDB.  Called by
    the APScheduler cron job (daily at 06:00) or via a manual test endpoint.

All exceptions are caught and logged — background functions must never
propagate errors that could crash the scheduler or a worker thread.
"""

import json
import logging
import re
from datetime import datetime, date

from beanie import PydanticObjectId
from langchain_core.messages import HumanMessage

from models import Briefing, Client, Note, Task, User
from services.llm_service import get_llm

log = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Function 1 — Client health scoring
# ─────────────────────────────────────────────────────────────────────────────

async def evaluate_client_health(client_id: str) -> None:
    """
    Run LLM sentiment analysis over the 3 most recent notes for ``client_id``
    and update ``Client.health_score`` (0-100) in MongoDB.

    Safe to call as a ``BackgroundTask`` — all errors are caught so they
    never surface back to the HTTP response.
    """
    try:
        client = await Client.get(PydanticObjectId(client_id))
        if client is None:
            log.warning("evaluate_client_health: client %s not found", client_id)
            return

        # Fetch the 3 most recent notes (Link[Client] stored as DBRef → query via $id)
        notes = (
            await Note.find({"client_id.$id": PydanticObjectId(client_id)})
            .sort("-created_at")
            .limit(3)
            .to_list()
        )
        if not notes:
            log.info("evaluate_client_health: no notes for client %s — skipping", client_id)
            return

        notes_block = "\n\n".join(
            f"Note {i + 1}:\n{n.content}" for i, n in enumerate(notes)
        )

        llm = get_llm()
        prompt = (
            "You are a client sentiment analyser for a CRM.\n"
            "Read the meeting notes below and output ONLY a single integer "
            "from 0 to 100 representing the client's health/satisfaction score.\n"
            "  0  = extremely dissatisfied, serious churn risk\n"
            "  100 = completely satisfied\n"
            "Output the integer and nothing else — no explanation, no punctuation.\n\n"
            f"MEETING NOTES:\n{notes_block}\n\n"
            "HEALTH SCORE:"
        )

        response = await llm.ainvoke([HumanMessage(content=prompt)])

        # Defensive parse: grab the first 1–3 digit integer in the response
        match = re.search(r"\b(\d{1,3})\b", response.content.strip())
        if match:
            score = max(0, min(100, int(match.group(1))))
        else:
            log.warning(
                "evaluate_client_health: unparseable LLM response %r — using 50",
                response.content,
            )
            score = 50

        await client.set({Client.health_score: score})
        log.info(
            "evaluate_client_health: client %s health_score → %d", client_id, score
        )

    except Exception:
        log.exception("evaluate_client_health failed for client %s", client_id)


# ─────────────────────────────────────────────────────────────────────────────
# Function 2 — Daily morning briefing
# ─────────────────────────────────────────────────────────────────────────────

async def generate_user_briefing(user_id: str) -> None:
    """
    Generate and persist a morning briefing for ``user_id``.

    Collected data
    --------------
    * Clients with ``health_score < 50`` (At Risk)
    * Tasks for the user's clients that are due today or have status "overdue"

    The LLM is prompted to write a single, condensed Morning Briefing
    paragraph.  The result is saved as a new ``Briefing`` document.
    """
    try:
        user = await User.get(PydanticObjectId(user_id))
        if user is None:
            log.warning("generate_user_briefing: user %s not found", user_id)
            return

        uid = PydanticObjectId(user_id)

        # 1. At-risk clients (health_score < 50) belonging to this user
        at_risk = await Client.find(
            {"user_id.$id": uid, "health_score": {"$lt": 50}}
        ).to_list()

        # 2. All clients for this user (to find their tasks)
        all_clients = await Client.find({"user_id.$id": uid}).to_list()
        all_client_ids = [c.id for c in all_clients]

        # 3. Tasks due today or already overdue for any of the user's clients
        today_start = datetime.utcnow().replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        today_end = datetime.utcnow().replace(
            hour=23, minute=59, second=59, microsecond=999999
        )

        urgent_tasks = (
            await Task.find(
                {
                    "client_id.$id": {"$in": all_client_ids},
                    "$or": [
                        {"due_date": {"$gte": today_start, "$lte": today_end}},
                        {"status": "overdue"},
                    ],
                }
            ).to_list()
            if all_client_ids
            else []
        )

        # 4. Build LLM prompt
        at_risk_payload = [
            {
                "name": c.name,
                "company": c.company,
                "health_score": c.health_score,
            }
            for c in at_risk
        ]
        tasks_payload = [
            {
                "title": t.title,
                "due_date": str(t.due_date) if t.due_date else None,
                "status": t.status,
            }
            for t in urgent_tasks
        ]

        llm = get_llm()
        prompt = (
            "You are an Executive Assistant generating a morning briefing for a CRM user.\n\n"
            "AT-RISK CLIENTS (health_score < 50):\n"
            f"{json.dumps(at_risk_payload, indent=2)}\n\n"
            "URGENT TASKS (due today or overdue):\n"
            f"{json.dumps(tasks_payload, indent=2)}\n\n"
            "Write a single, highly condensed, professional Morning Briefing paragraph. "
            "Be specific about client names and task titles. "
            "Prioritise what the user must do today. "
            "Output ONLY the briefing paragraph — no labels, no preamble."
        )

        response = await llm.ainvoke([HumanMessage(content=prompt)])
        content = response.content.strip()

        # 5. Persist briefing
        briefing = Briefing(user_id=user, content=content)
        await briefing.insert()
        log.info("generate_user_briefing: briefing saved for user %s", user_id)

    except Exception:
        log.exception("generate_user_briefing failed for user %s", user_id)
