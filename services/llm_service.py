"""
services/llm_service.py
-----------------------
Initialises and exposes the LangChain ChatOllama client, configured to
point at the remote Colab-hosted Ollama instance via the OLLAMA_BASE_URL
environment variable.

Usage
-----
    from services.llm_service import get_llm

    llm = get_llm()
    response = await llm.ainvoke([HumanMessage(content="Hello")])
    print(response.content)
"""

import os
from dotenv import load_dotenv
from langchain_community.chat_models import ChatOllama

# Safety-net: ensure .env is loaded even if this module is imported
# before main.py has a chance to call load_dotenv().
load_dotenv(override=True)


def get_llm(model: str = "gemma3:12b") -> ChatOllama:
    """
    Return a configured ChatOllama instance.

    The ``base_url`` is read from the ``OLLAMA_BASE_URL`` environment
    variable (set via ``.env``). Falls back to ``http://localhost:11434``
    so the code still works if Ollama is running locally.

    When routing through an ngrok tunnel the ``ngrok-skip-browser-warning``
    header is required — otherwise ngrok returns an HTML interstitial page
    instead of forwarding the request to Ollama, which causes a JSON decode
    error or a connection timeout.
    """
    base_url: str = os.environ.get(
        "OLLAMA_BASE_URL", "http://localhost:11434"
    ).rstrip("/")          # strip any accidental trailing slash

    is_ngrok = "ngrok" in base_url

    return ChatOllama(
        base_url=base_url,
        model=model,
        timeout=180,        # Colab cold-start can be slow; be generous
        # Tell ngrok to skip its "Are you sure?" browser-warning page.
        # Harmless on non-ngrok endpoints (unknown headers are ignored).
        headers={"ngrok-skip-browser-warning": "1"} if is_ngrok else {},
    )
