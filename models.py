"""
models.py
---------
# Understand what does ODM mean how do ethey work here ?? 
Beanie ODM document definitions for the Aura CRM data layer.
All documents inherit from beanie.Document and are registered with Beanie
during application startup via `database.init_db`.
"""

from datetime import datetime
from typing import Literal, Optional

from beanie import Document, Link
from pydantic import EmailStr, Field


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class User(Document):
    """A human user of the Aura CRM platform."""

    name: str
    email: EmailStr

# what does class Settings do here and how does it work ?? 
    class Settings:
        name = "users"


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

class Client(Document):
    """A customer/client record owned by a User."""

    user_id: Link[User]
    name: str
    company: str
    health_score: int = Field(default=100, ge=0, le=100)

    class Settings:
        name = "clients"


# ---------------------------------------------------------------------------
# Task
# ---------------------------------------------------------------------------

class Task(Document):
    """An actionable task associated with a Client."""

    client_id: Link[Client]
    title: str
    status: Literal["pending", "completed", "overdue"] = "pending"
    due_date: Optional[datetime] = None

    class Settings:
        name = "tasks"


# ---------------------------------------------------------------------------
# Note
# ---------------------------------------------------------------------------

class Note(Document):
    """A free-form note attached to a Client."""

    client_id: Link[Client]
    content: str
    summary: Optional[str] = None     # LLM-generated summary (set after processing)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "notes"


# ---------------------------------------------------------------------------
# Briefing
# ---------------------------------------------------------------------------

class Briefing(Document):
    """A generated briefing document for a User (AI-generated in a later phase)."""

    user_id: Link[User]
    content: str
    generated_date: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "briefings"
