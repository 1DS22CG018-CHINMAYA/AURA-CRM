# ⚡ Aura CRM — The AI-Powered Executive Assistant

![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)
![LangChain](https://img.shields.io/badge/LangChain-LangGraph-1C3C3C?style=flat-square&logo=langchain&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-a78bfa?style=flat-square)

---

## 📖 Overview

Aura CRM is not a traditional contact database — it is a **proactive, AI-driven executive assistant** built for modern sales and account management professionals. At its core, Aura transforms the unstructured chaos of day-to-day client interactions — meeting transcripts, voice memos, email summaries — into a structured, queryable, and continuously-updated intelligence layer. Powered by a local **Gemma 3 12B** language model and a **MongoDB Atlas Vector Store**, every note you feed it is automatically summarised, decomposed into actionable tasks, and woven into a semantic memory that you can query in plain English.

What sets Aura apart is its **proactive intelligence loop**. Background scheduler jobs run daily to re-evaluate client health scores from 0–100 by analysing the sentiment and recency of all stored interactions, and to draft a personalised **AI Morning Briefing** that lands in your dashboard before your first meeting. The result is a CRM that doesn't just store data — it *reads* your portfolio, *surfaces* risks, and *tells you* what to do next, without you ever running a single report.

---

## ✨ Core Features

### 🧠 LangGraph Brain Dump Engine
Drop raw, unstructured meeting notes into the **Brain Dump** panel. A two-node **LangGraph** pipeline (powered by Gemma 3 via Ollama) fires sequentially:
1. **Extract** — identifies every discrete action item, commitment, and follow-up date
2. **Summarise** — condenses the full note into a concise executive summary

Both the structured task list and the summary are persisted to MongoDB, and the summary is immediately embedded and indexed in the Atlas Vector Store for semantic retrieval.

### 🔍 Semantic Memory (RAG Chatbot)
The **Aura Chat** interface delivers a full Retrieval-Augmented Generation conversational experience. Ask questions like *"Which clients mentioned budget concerns last quarter?"* and the system:
- Embeds your query with `google/gemma-embedding-300m`
- Performs a **MongoDB Atlas Vector Search** across every summarised note from every client
- Injects the top-5 retrieved chunks into Gemma 3 12B's context window
- Responds conversationally, always citing the specific client by name

The entire pipeline is managed as a stateful **LangGraph** graph (`retrieve → generate`), making the flow deterministic and easily testable.

### 📊 Proactive Client Health Scoring
An **APScheduler** cron job runs nightly to re-score every client in the system from 0–100. The score is derived by evaluating the sentiment, recency, and frequency of all stored meeting notes via LLM analysis. Scores surface immediately in the Dashboard as:
- **Stable Accounts** (≥ 50) — colour-coded emerald, with a ⭐ for clients scoring above 90
- **At-Risk Clients** (< 50) — colour-coded red, with an animated pulse dot for critical cases (< 30)

### ☀️ AI Morning Briefing
Every morning, a scheduled job drafts a **personalised executive briefing** for each user — a concise narrative covering at-risk relationships, upcoming tasks, and recent interaction highlights. Briefings land in the Dashboard automatically and support inline editing and deletion via `PUT /briefings/{id}` and `DELETE /briefings/{id}`.

### 🎨 Premium Dark-Mode Frontend
The React frontend is built for speed and delight:
- **Optimistic UI updates** via React Query — actions feel instant, rollback on failure
- **Framer Motion** animations throughout — staggered list entries, sliding forms, typing indicators
- **Conversational Chat UI** with Markdown rendering in AI responses
- **Manual CRUD** on all AI-generated data — edit tasks, rename clients, override briefings
- **Smart session management** — email-based lookup lets returning users sign in without duplication

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, Framer Motion, React Query (`@tanstack/react-query`), Sonner (toasts), Lucide React |
| **Backend** | FastAPI 0.111, Uvicorn, Python 3.11+, APScheduler, Pydantic v2 |
| **Database** | MongoDB Atlas, Motor (async driver), Beanie ODM |
| **AI / LLM** | Gemma 3 12B via Ollama (`langchain-community`), LangGraph, LangChain |
| **Embeddings** | `google/gemma-embedding-300m` via `langchain-huggingface` + `sentence-transformers` |
| **Vector Search** | MongoDB Atlas Vector Search (`langchain-mongodb`) |
| **Testing** | Pytest, pytest-asyncio, HTTPX |

---

## 📋 Prerequisites

Before running Aura locally, ensure you have the following:

1. **MongoDB Atlas** account with:
   - A cluster running (free tier works for development)
   - A **Vector Search Index** configured on the `note_vectors` collection with the correct dimension (`768` for `gemma-embedding-300m`)

2. **Hugging Face account** with:
   - A `HF_TOKEN` (User Access Token) with read access — required to download the Gemma embedding model

3. **Ollama** installed and running locally or on a remote server with:
   - `gemma3:12b` pulled and serving: `ollama pull gemma3:12b`
   - The base URL exposed (default: `http://localhost:11434`)

4. **Node.js** ≥ 18 and **Python** ≥ 3.11 installed

---

## 🚀 Local Setup & Installation

### Step 1 — Clone the repository

```bash
git clone https://github.com/your-username/aura-crm.git
cd aura-crm
```

---

### Step 2 — Backend Setup

```bash
# Create and activate a virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

# Install all dependencies
pip install -r requirements.txt
```

Create a `.env` file in the project root:

```dotenv
# ── MongoDB ────────────────────────────────────────────────────────────────
# Full Atlas connection string (SRV format)
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority

# Name of the Atlas database to use
MONGODB_DB_NAME=aura_crm

# ── Hugging Face ───────────────────────────────────────────────────────────
# User Access Token — required to download the Gemma embedding model
HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ── Ollama ─────────────────────────────────────────────────────────────────
# Base URL of your Ollama instance (local or remote via ngrok / tunnel)
OLLAMA_BASE_URL=http://localhost:11434

# Model tag to use for generation
OLLAMA_MODEL=gemma3:12b
```

Start the backend server:

```bash
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`

---

### Step 3 — Frontend Setup

```bash
cd aura-crm-web-frontend
npm install
```

Create a `.env` file inside `aura-crm-web-frontend/`:

```dotenv
# ── API ────────────────────────────────────────────────────────────────────
# Base URL of the FastAPI backend
VITE_API_URL=http://localhost:8000

# Timeout in ms for standard API calls (0 = no timeout for brain-dump)
VITE_API_TIMEOUT=120000
```

Start the development server:

```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`.

---

## 🗺️ Project Structure

```
aura-crm/
├── main.py                     # FastAPI application, all routes
├── models.py                   # Beanie ODM document definitions
├── database.py                 # MongoDB connection & Beanie init
├── requirements.txt
├── .env                        # Backend secrets (not committed)
│
├── services/
│   ├── brain_dump_graph.py     # LangGraph: extract + summarise pipeline
│   ├── chat_graph.py           # LangGraph: retrieve + generate (RAG chat)
│   ├── vector_service.py       # Atlas Vector Store CRUD & search
│   ├── intelligence_service.py # Health scoring & briefing generation
│   └── llm_service.py          # Ollama / ChatOllama factory
│
└── aura-crm-web-frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── Login.jsx       # Smart sign-in / sign-up flow
    │   │   ├── Dashboard.jsx   # Morning briefing, health widgets, tasks
    │   │   ├── Clients.jsx     # Client CRUD, brain dump, task panel
    │   │   └── Search.jsx      # Conversational RAG chat interface
    │   ├── components/
    │   │   ├── Layout.jsx
    │   │   ├── MarkdownRenderer.jsx
    │   │   ├── ModelStatus.jsx
    │   │   └── Skeleton.jsx
    │   └── api/
    │       └── client.js       # Axios instance with interceptors
    ├── .env                    # Frontend env (not committed)
    └── vite.config.js
```

---

## 🔑 Key API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/users/by-email` | Look up an existing user by email |
| `POST` | `/users/` | Create a new user account |
| `GET` | `/users/{id}/clients` | List clients (with optional health score filter) |
| `POST` | `/clients/{id}/notes/process` | Brain dump — runs the full LangGraph pipeline |
| `GET` | `/search` | Global semantic search across all notes |
| `POST` | `/chat` | RAG conversational chat (retrieve → generate) |
| `GET` | `/users/{id}/briefings/today` | Fetch today's AI morning briefing |
| `PUT` | `/briefings/{id}` | Edit a briefing's content |
| `DELETE` | `/briefings/{id}` | Delete a briefing |
| `POST` | `/clients/{id}/tasks` | Manually create a task |
| `PUT` | `/tasks/{id}` | Update a task (status, title, due date) |

---

## 🧪 Running Tests

```bash
# From the project root with the virtual environment activated
pytest -v
```

Tests use an isolated in-memory MongoDB client (configured via `conftest.py`) to avoid touching production data.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">
  <strong>Built with ⚡ and a lot of ☕ — Aura CRM</strong>
</div>
