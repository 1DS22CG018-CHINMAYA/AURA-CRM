"""
services/chat_graph.py
----------------------
Two-node LangGraph RAG pipeline for the Aura CRM conversational assistant.

Graph topology
--------------
    START  →  retrieve_node  →  generate_node  →  END

retrieve_node
    Takes the latest user message, runs a global vector search over all
    client notes, fetches the matching Client names from MongoDB, and builds
    a structured context block.

generate_node
    Combines the context block with the full conversation history and the
    permanent system prompt, then calls ChatOllama (Gemma 3 12B) to produce
    a grounded, conversational answer.

Usage
-----
    from services.chat_graph import chat_graph

    result = await chat_graph.ainvoke({
        "messages": [{"role": "user", "content": "Who asked about the Q2 roadmap?"}],
        "context":  "",
    })
    ai_reply = result["messages"][-1]["content"]
"""

from typing import Any, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langgraph.graph import END, START, StateGraph
from langgraph.checkpoint.memory import MemorySaver

from services.llm_service import get_llm
from services.vector_service import search_all_notes


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

class ChatState(TypedDict):
    """Shared state flowing through the two RAG nodes."""
    messages: list[dict[str, str]]   # [{"role": "user"|"ai", "content": "..."}]
    context:  str                    # Retrieved note snippets (set by retrieve_node)
    user_id:  str                    # Authenticated user — scopes vector search


# ---------------------------------------------------------------------------
# Node 1 — Retrieve
# ---------------------------------------------------------------------------

async def retrieve_node(state: ChatState) -> dict:
    """
    Pull the latest user message, embed it, and do a global vector search.

    Enriches each hit with the client name using a lightweight Beanie lookup
    (imported lazily to avoid circular imports at module load time).

    Returns a ``context`` string formatted as:

        [Client: Sarah Johnson]
        "… note snippet …"
        Match confidence: 83%

        [Client: David Chen]
        …
    """
    # Find the most recent user turn
    user_msg = ""
    for msg in reversed(state["messages"]):
        if msg["role"] == "user":
            user_msg = msg["content"]
            break

    if not user_msg.strip():
        return {"context": "No context available."}

    hits = await search_all_notes(query=user_msg, user_id=state["user_id"], top_k=5)

    if not hits:
        return {"context": "No relevant notes found in the database."}

    # Enrich hits with client names
    from bson import ObjectId
    from models import Client

    lines: list[str] = []
    for hit in hits:
        meta      = hit.get("metadata", {})
        client_id = meta.get("client_id")
        score     = hit["score"]
        confidence = max(0, min(100, round((score - 0.4) / 0.6 * 100)))

        client_name = "Unknown Client"
        if client_id:
            try:
                client = await Client.get(ObjectId(client_id))
                if client:
                    client_name = client.name
            except Exception:
                pass

        lines.append(
            f"[Client: {client_name}]\n"
            f"{hit['text'].strip()}\n"
            f"Match confidence: {confidence}%"
        )

    context = "\n\n---\n\n".join(lines)
    return {"context": context}


# ---------------------------------------------------------------------------
# Node 2 — Generate
# ---------------------------------------------------------------------------

async def generate_node(state: ChatState) -> dict:
    """
    Build the full prompt (system + context + history) and call the LLM.

    Appends the AI's response as a new message dict to ``messages``.
    """
    llm = get_llm()

    system_prompt = (
        "You are Aura, an elite AI assistant embedded inside a CRM application. "
        "Your job is to help sales and account managers by answering questions "
        "about their clients using the retrieved meeting notes provided below.\n\n"
        "RULES:\n"
        "1. Always ground your answers in the provided context. If the context is "
        "empty or insufficient, say so honestly — do NOT hallucinate client names or facts.\n"
        "2. Always mention the Client's NAME explicitly when referencing a note (e.g., "
        "\"According to your notes from Sarah Johnson, …\").\n"
        "3. Be concise, professional, and conversational. 2–4 sentences maximum unless "
        "the user asks for a detailed breakdown.\n"
        "4. If multiple clients are relevant, summarise each one briefly.\n\n"
        f"RETRIEVED CONTEXT FROM NOTE DATABASE:\n"
        f"{'─' * 60}\n"
        f"{state['context']}\n"
        f"{'─' * 60}"
    )

    # Convert frontend message dicts → LangChain message objects
    lc_messages: list[Any] = [SystemMessage(content=system_prompt)]
    for msg in state["messages"]:
        if msg["role"] == "user":
            lc_messages.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "ai":
            lc_messages.append(AIMessage(content=msg["content"]))

    response = await llm.ainvoke(lc_messages)
    ai_text  = response.content.strip()

    updated_messages = list(state["messages"]) + [{"role": "ai", "content": ai_text}]
    return {"messages": updated_messages}


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------

def _build_chat_graph():
    builder = StateGraph(ChatState)

    builder.add_node("retrieve", retrieve_node)
    builder.add_node("generate", generate_node)

    builder.add_edge(START, "retrieve")
    builder.add_edge("retrieve", "generate")
    builder.add_edge("generate", END)
    # 1. Initialize the memory saver
    memory = MemorySaver()
    return builder.compile()


# Module-level singleton
chat_graph = _build_chat_graph()
