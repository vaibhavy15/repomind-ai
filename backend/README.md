# RepoMind AI — Backend

FastAPI service: JWT auth, repository indexing, chat, and analytics. Runs and
passes its own smoke tests today with **zero external services** — Gemini and
ChromaDB are lazily imported and fall back to clearly-labeled demo behavior
when their dependencies or API keys aren't present, so you can boot the whole
stack before wiring up either one.

## Quickstart

```bash
cd backend
python -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                  # then edit as needed
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` for interactive Swagger docs generated
from the actual route/schema definitions.

## What's real vs. what's stubbed

| Piece | Status |
|---|---|
| Signup / login / JWT issuance & verification | **Real.** bcrypt hashing, signed+expiring tokens, refresh flow. |
| Password validation, duplicate-email checks | **Real.** |
| ZIP upload → file walk → Python AST function/class counts | **Real.** Try it — upload any `.zip` of a small repo. |
| GitHub URL → `git clone` → same parsing | **Real** (needs network + optionally `GITHUB_TOKEN` for private repos). |
| Database models & relationships (Postgres/SQLite via SQLAlchemy) | **Real.** |
| Chat retrieval (ChromaDB) | **Stubbed.** Lazily imported; without `chromadb` installed, `query_similar_chunks` is skipped and the route degrades gracefully. |
| Chat generation (Gemini) | **Stubbed.** Without `GEMINI_API_KEY`, returns a clearly-labeled demo answer. Set the key and it calls the real API with no other code changes. |
| Security scanner, duplicate-code detection, doc-coverage scoring | **Not implemented.** `analytics.py` has a comment marking where a `quality_service.py` module should plug in. |

## Wiring up the real AI

1. `pip install chromadb google-genai` (already in `requirements.txt`, just uncommented for when you're ready).
2. Get a Gemini key at https://aistudio.google.com/apikey and set `GEMINI_API_KEY` in `.env`.
3. That's it — `gemini_service.py` and `embeddings_service.py` check for the key/package at call time, not at import time.

## Project layout

```
backend/
├── app/
│   ├── main.py                  # FastAPI app, CORS, router registration, table creation
│   ├── core/
│   │   ├── config.py             # Settings loaded from .env
│   │   └── security.py           # bcrypt hashing + JWT create/verify
│   ├── db/
│   │   ├── base.py               # SQLAlchemy declarative base
│   │   ├── session.py            # Engine + get_db() dependency
│   │   └── models.py             # User, Repository, RepoFile, Conversation, Message
│   ├── schemas/                  # Pydantic request/response models
│   │   ├── auth.py
│   │   ├── repo.py
│   │   └── chat.py
│   ├── api/
│   │   ├── deps.py               # get_current_user() — bearer token -> User
│   │   └── routes/
│   │       ├── auth.py           # /api/auth/{signup,login,refresh,me}
│   │       ├── repos.py          # /api/repos (connect, list, get, upload, delete)
│   │       ├── chat.py           # /api/repos/:id/chat/ask
│   │       └── analytics.py      # /api/repos/:id/analytics
│   └── services/
│       ├── repo_parser.py        # real: file walking, Python AST stats, git clone
│       ├── embeddings_service.py # stub: ChromaDB indexing + similarity search
│       └── gemini_service.py     # stub: Gemini call with demo-mode fallback
├── requirements.txt
├── .env.example
└── README.md
```

## API surface

All routes are prefixed with `/api`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/signup` | — | Create an account, returns tokens |
| POST | `/auth/login` | — | Returns tokens |
| POST | `/auth/refresh` | — | Exchange a refresh token for a new pair |
| GET | `/auth/me` | ✓ | Current user |
| POST | `/repos` | ✓ | Connect a repo from a GitHub URL (202, indexes in background) |
| POST | `/repos/upload` | ✓ | Connect a repo from a `.zip` (202, indexes in background) |
| GET | `/repos` | ✓ | List your repositories |
| GET | `/repos/{id}` | ✓ | Repo detail + status (`pending`/`indexing`/`indexed`/`failed`) |
| GET | `/repos/{id}/files` | ✓ | List indexed files |
| DELETE | `/repos/{id}` | ✓ | Delete a repo and its data |
| POST | `/repos/{id}/chat/ask` | ✓ | Ask a question, get an answer + cited files |
| GET | `/repos/{id}/chat/conversations/{cid}/messages` | ✓ | Conversation history |
| GET | `/repos/{id}/analytics` | ✓ | File/function/class counts, language breakdown, scores |

## Connecting the frontend

The frontend currently uses local mock data in `js/*.js` so it's fully
demoable without a backend running. To wire it up for real:

1. Set `ALLOWED_ORIGINS` in `.env` to wherever you're serving the frontend from.
2. In the frontend JS, replace the mock lookups with `fetch()` calls to this API, storing the returned `access_token` (e.g. in memory + a refresh flow — avoid `localStorage` for anything sensitive in production).
3. `chat.js`'s `findAnswer()` → `POST /api/repos/:id/chat/ask`.
4. `dashboard.js`'s `runStages()` → poll `GET /api/repos/:id` until `status === "indexed"` instead of the fixed setTimeout sequence.
5. `analytics.js` and `explorer.js` → `GET /api/repos/:id/analytics` and `GET /api/repos/:id/files`.

## Known gaps (by design, for a first pass)

- No Alembic migrations — `Base.metadata.create_all()` runs on startup, fine for dev, not for schema evolution in production.
- No rate limiting on `/auth/login` (flagged by the mock security scanner in the frontend demo, appropriately).
- `security_score` is a placeholder constant; a real scanner (regex/AST rules for hardcoded secrets, SQL string formatting, etc.) isn't implemented yet.
- Background indexing uses FastAPI `BackgroundTasks`, which runs in-process — fine for a demo, but move to a real task queue (Celery/RQ/arq) before indexing anything at scale.
