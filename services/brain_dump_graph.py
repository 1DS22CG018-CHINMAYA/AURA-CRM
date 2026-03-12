"""
services/brain_dump_graph.py
-----------------------------
A two-node LangGraph workflow that processes raw meeting notes and produces:

  • A typed list of extracted tasks (title + optional due date)
  • A concise 2-sentence summary

Graph topology
--------------
    START  →  extract_tasks_node  →  summarize_node  →  END

Both nodes are async and share the same ChatOllama instance (via get_llm()).
The compiled graph is exported as ``brain_dump_graph`` — callers just need:

    result = await brain_dump_graph.ainvoke({
        "raw_text": "...",
        "client_id": "...",
        "tasks": [],
        "summary": "",
    })
"""

import json
import re
from datetime import date
from typing import Any, TypedDict

from langchain_core.messages import HumanMessage
from langgraph.graph import END, START, StateGraph

from services.llm_service import get_llm


# ─────────────────────────────────────────────────────────────────────────────
# State schema
# ─────────────────────────────────────────────────────────────────────────────

class GraphState(TypedDict):
    """Shared mutable state that flows through every node in the graph."""
    raw_text: str                    # Original meeting notes (read-only for nodes)
    client_id: str                   # MongoDB ObjectId string of the owning Client
    tasks: list[dict[str, Any]]      # Populated by extract_tasks_node
    summary: str                     # Populated by summarize_node


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _extract_json_array(text: str) -> list[dict]:
    """
    Robustly pull the first JSON array from an LLM response string.

    Handles common LLM quirks:
      - Markdown code fences: ```json ... ```
      - Extra prose before/after the array
      - Models that return a single object instead of a list
    """
    # Strip markdown code fences (```json...``` or ```...```)
    clean = re.sub(r"```(?:json)?", "", text, flags=re.IGNORECASE).replace("```", "")

    # Try to find [...] block first (preferred format)
    array_match = re.search(r"\[.*?\]", clean, re.DOTALL)
    if array_match:
        try:
            result = json.loads(array_match.group())
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass

    # Fallback: try the whole cleaned string
    try:
        result = json.loads(clean.strip())
        if isinstance(result, list):
            return result
        if isinstance(result, dict):     # single task returned as object
            return [result]
    except json.JSONDecodeError:
        pass

    return []   # give up gracefully — caller handles empty list


# ─────────────────────────────────────────────────────────────────────────────
# Node 1 — Extract tasks
# ─────────────────────────────────────────────────────────────────────────────

async def extract_tasks_node(state: GraphState) -> dict:
    """
    Parse the raw meeting notes and return a list of structured action items.

    Each task dict contains:
      - ``title``    : str               — short description of the action
      - ``due_date`` : str | None        — ISO 8601 date (e.g. "2025-03-15") or null

    The LLM is instructed to output *only* a valid JSON array so the result
    can be parsed without ambiguity.
    """
    llm = get_llm()
    today = date.today().isoformat()   # e.g. "2026-02-28"

    prompt = f"""You are an elite Executive Assistant and CRM AI. Your job is to extract actionable tasks from unstructured meeting notes.
Today's date is: {today}. Use this to calculate exact dates for relative terms like "tomorrow" or "next Friday".

RULES:
1. Extract ALL implicit and explicit action items meant for the user to complete.
2. Standardize the 'title' to always start with a strong action verb (e.g., "Send...", "Draft...", "Schedule..."). Keep it under 10 words.
3. For 'due_date', output an exact ISO 8601 date (YYYY-MM-DD). If absolutely no date/timeframe is implied, output null.
4. Output ONLY a valid JSON array. No markdown, no prose, no conversational text.

CRITICAL RULE: You MUST extract or infer a MINIMUM of 3 tasks from these notes. If there are fewer than 3 explicit tasks, you must logically infer next steps (e.g., "Schedule follow-up meeting", "Review account status", "Send meeting recap email") so that the final JSON array contains AT LEAST 3 items. Never return fewer than 3 tasks.

EXAMPLE INPUT:
"Talked to John. He was frustrated about the billing bug. I told him I'd email the tech team today and get back to him with an update by next Wednesday."

EXAMPLE OUTPUT:
[
  {{"title": "Email tech team regarding John's billing bug", "due_date": "{today}"}},
  {{"title": "Update John on billing bug resolution", "due_date": "2026-03-04"}},
  {{"title": "Schedule follow-up call with John", "due_date": null}}
]

ACTUAL MEETING NOTES:
{state['raw_text']}

JSON array:"""

    response = await llm.ainvoke([HumanMessage(content=prompt)])
    tasks = _extract_json_array(response.content)
    return {"tasks": tasks}


# ─────────────────────────────────────────────────────────────────────────────
# Node 2 — Summarize
# ─────────────────────────────────────────────────────────────────────────────

async def summarize_node(state: GraphState) -> dict:
    """
    Produce a concise, professional 2-sentence summary of the meeting notes.
    Runs *after* extract_tasks_node so state already contains the task list
    (the node doesn't use it, but order matters for the audit trail).
    """
    llm = get_llm()

    prompt = f"""You are a senior Account Manager writing a formal CRM entry. Write a detailed, professional summary of the following client meeting notes.

FORMATTING RULES:
1. Start with an 'Overview' paragraph (2-3 sentences) summarizing the core purpose and main pain points of the discussion.
2. Follow with a 'Key Takeaways' section using 2-4 bullet points to highlight important decisions, contextual facts, or agreed-upon resolutions.
3. Maintain an objective, executive tone.
4. Output ONLY the summary paragraph and the bullet points. Do not include any introductory chat, preambles, or concluding remarks.

MEETING NOTES:
{state['raw_text']}

SUMMARY:"""
    response = await llm.ainvoke([HumanMessage(content=prompt)])
    return {"summary": response.content.strip()}


# ─────────────────────────────────────────────────────────────────────────────
# Graph construction
# ─────────────────────────────────────────────────────────────────────────────

def _build_graph():
    """Wire the two nodes sequentially and compile the LangGraph."""
    builder = StateGraph(GraphState)

    builder.add_node("extract_tasks", extract_tasks_node)
    builder.add_node("summarize", summarize_node)

    # Sequential flow: extract first, then summarise
    builder.add_edge(START, "extract_tasks")
    builder.add_edge("extract_tasks", "summarize")
    builder.add_edge("summarize", END)

    return builder.compile()


# Module-level singleton — import and call ``.ainvoke()`` directly.
brain_dump_graph = _build_graph()
