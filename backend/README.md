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
alembic upgrade head                                   # creates/updates the schema — see below
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` for interactive Swagger docs generated
from the actual route/schema definitions.

### Migrations (Alembic)

Schema is managed by Alembic now — `alembic upgrade head` is a required step
before starting the server, on a fresh DB or an existing one. The app no
longer auto-creates tables on startup (it used to via `create_all()`, which
silently did *nothing* when a table already existed but was missing a new
column — that's exactly how the "column X does not exist" error happens).

**Fresh database:** `alembic upgrade head` creates everything. Nothing else needed.

**Existing database, hitting a "column ... does not exist" error right now:**
this means your DB predates a schema change. Fix it without losing data:

```sql
-- run whichever ALTER matches the missing column the error names, e.g.:
ALTER TABLE repositories ADD COLUMN failure_reason VARCHAR;
```
```bash
alembic stamp head   # tells Alembic "this DB is now at the latest schema", without re-running CREATE TABLE
```

If you'd rather not hand-write the `ALTER` (or don't care about existing
dev data), it's simpler to just drop and rebuild:
```sql
DROP SCHEMA public CASCADE; CREATE SCHEMA public;   -- Postgres
```
```bash
rm backend/repomind.db   # SQLite
alembic upgrade head
```

**Going forward, after pulling any future update to this project:** always
run `alembic upgrade head` again before starting the server — if the models
changed, there'll be a new migration file waiting to be applied.

## What's real vs. what's stubbed

| Piece | Status |
|---|---|
| Signup / login / JWT issuance & verification | **Real.** bcrypt hashing, signed+expiring tokens, refresh flow. |
| GitHub / Google OAuth login | **Real**, once you supply your own client ID/secret (see below) — the whole redirect → callback → account-creation flow is implemented and tested. Buttons auto-disable on the frontend if unconfigured. |
| Forgot/reset password | **Real.** No email provider is wired up, so in `DEBUG` mode the reset link is returned directly in the API response instead of emailed — see `forgot_password()` in `auth.py` for exactly where to plug in a real mailer. |
| Profile update, change password, delete account | **Real.** `PATCH /auth/me`, `POST /auth/me/change-password`, `DELETE /auth/me` (cascades to all owned data). |
| Per-user Gemini key + notification preferences | **Real**, stored on `User.preferences` (JSON column). Chat uses a user's own key over the server default when set. |
| Real activity feed + usage counters | **Real.** Every meaningful action (signup, repo connect, question asked, security scan viewed) writes an `Event` row — see `activity_service.py`. Powers `GET /auth/me/activity` and `/auth/me/usage`. |
| ZIP upload → file walk → Python AST function/class counts | **Real.** Try it — upload any `.zip` of a small repo. |
| GitHub URL → `git clone` → same parsing | **Real** (needs network + optionally a token for private repos). |
| Database models & relationships (Postgres/SQLite via SQLAlchemy) | **Real.** |
| Security findings / duplicate-function / dead-import / nested-loop / common-bug-pattern detection | **Real, heuristic.** AST-based for Python (full accuracy), regex-based for other languages. Covers hardcoded secrets, disabled JWT verification, SQL f-strings, bare `except:`, mutable default args, `== None`, unreachable code, unused imports, duplicate functions. Not a full SAST tool — see `quality_service.py`'s module docstring for exactly what it does and doesn't catch. |
| Code Analyzer (quality score + recommendations) | **Real.** The quality score and recommendations are computed live from the same findings shown in Security/Performance — see `compute_quality_score()` / `synthesize_recommendations()`. |
| README Generator | **Real.** Folder structure, language breakdown, API endpoint table, and install commands are built from actual indexed data. The overview paragraph is AI-generated when a Gemini key is set (server or per-user), otherwise a template sentence. |
| API endpoint detection | **Real, heuristic.** Regex over FastAPI/Flask-style route decorators. Won't detect Express/Django/other frameworks yet. |
| Dependency graph (Architecture page) | **Real** for the "Dependency Graph" tab — built from actual Python `import` statements. The other four diagrams (System Flowchart, Frontend/Backend Flow, Database Flow) are intentionally generic templates; deriving those from arbitrary source needs real semantic understanding, not static analysis. |
| Chat retrieval (ChromaDB) | **Stubbed.** Lazily imported; without `chromadb` installed, `query_similar_chunks` is skipped and the route degrades gracefully. |
| Chat generation (Gemini) | **Stubbed** without a key (server-wide or per-user). Returns a clearly-labeled demo answer otherwise; set a key and it calls the real API with no other code changes. |

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
│   │   └── models.py             # User, Repository, RepoFile, Conversation, Message, Event
│   ├── schemas/                  # Pydantic request/response models
│   │   ├── auth.py               # incl. update/change-password/forgot/reset/activity
│   │   ├── repo.py
│   │   ├── chat.py
│   │   └── quality.py            # findings, endpoints, dependency graph
│   ├── api/
│   │   ├── deps.py               # get_current_user() — bearer token -> User
│   │   └── routes/
│   │       ├── auth.py           # signup/login/refresh/me, forgot/reset, change-password, delete, activity, usage
│   │       ├── oauth.py          # GitHub/Google OAuth start + callback
│   │       ├── repos.py          # connect (URL or ZIP), list, get, files, delete
│   │       ├── chat.py           # ask, conversation history
│   │       ├── analytics.py      # repo stats
│   │       └── quality.py        # security findings, performance, api-endpoints, dependency-graph
│   └── services/
│       ├── repo_parser.py        # real: file walk, Python AST stats, git clone
│       ├── quality_service.py    # real, heuristic: security/perf/API/dependency-graph analysis
│       ├── activity_service.py   # real: writes Event rows for the activity feed
│       ├── oauth_service.py      # real: provider config, token exchange, userinfo fetch
│       ├── embeddings_service.py # stub: ChromaDB indexing + similarity search
│       └── gemini_service.py     # stub: Gemini call with demo-mode fallback, per-user key override
├── requirements.txt
├── .env.example
├── alembic.ini
├── alembic/
│   ├── env.py                    # wired to app.core.config.settings + full model metadata
│   └── versions/
│       └── ..._baseline_schema.py
└── README.md
```

## API surface

All routes are prefixed with `/api`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/signup` | — | Create an account, returns tokens |
| POST | `/auth/login` | — | Returns tokens |
| POST | `/auth/refresh` | — | Exchange a refresh token for a new pair |
| GET | `/auth/me` | ✓ | Current user (incl. plan, preferences, `created_at`) |
| PATCH | `/auth/me` | ✓ | Update name/email/notification prefs/Gemini key (all fields optional) |
| POST | `/auth/me/change-password` | ✓ | Set a new password (current password required unless the account is OAuth-only and has none yet) |
| DELETE | `/auth/me` | ✓ | Delete the account and everything it owns |
| GET | `/auth/me/activity` | ✓ | Last 20 real events (signup, repo connects, questions asked, scans viewed) |
| GET | `/auth/me/usage` | ✓ | Real counts: repositories, files indexed, questions asked, security scans run |
| POST | `/auth/forgot-password` | — | Always returns a generic message; in `DEBUG` mode also returns `dev_reset_link` directly |
| POST | `/auth/reset-password` | — | `{token, new_password}` — token comes from the forgot-password link |
| GET | `/auth/oauth/providers` | — | Which OAuth providers are configured |
| GET | `/auth/oauth/{provider}/login` | — | Redirects to GitHub/Google's consent screen |
| GET | `/auth/oauth/{provider}/callback` | — | Provider redirects here; we issue tokens and redirect to the frontend |
| POST | `/repos` | ✓ | Connect a repo from a GitHub URL (202, indexes in background) |
| POST | `/repos/upload` | ✓ | Connect a repo from a `.zip` (202, indexes in background) |
| GET | `/repos` | ✓ | List your repositories |
| GET | `/repos/{id}` | ✓ | Repo detail + status (`pending`/`indexing`/`indexed`/`failed`) |
| GET | `/repos/{id}/files` | ✓ | List indexed files |
| GET | `/repos/{id}/files/content?path=` | ✓ | Get one file's content (Explorer preview) |
| DELETE | `/repos/{id}` | ✓ | Delete a repo and its data |
| POST | `/repos/{id}/chat/ask` | ✓ | Ask a question, get an answer + cited files |
| GET | `/repos/{id}/chat/conversations` | ✓ | List a repo's conversations, most recent first |
| GET | `/repos/{id}/chat/conversations/{cid}/messages` | ✓ | Conversation history |
| GET | `/repos/{id}/analytics` | ✓ | File/function/class counts, language breakdown, scores |
| GET | `/repos/{id}/security` | ✓ | Real security findings (hardcoded secrets, disabled JWT verification, SQL f-strings, missing rate limiting) |
| GET | `/repos/{id}/performance` | ✓ | Real issues: unused imports, deeply nested loops, structurally duplicated functions |
| GET | `/repos/{id}/api-endpoints` | ✓ | Real FastAPI/Flask-style route detection, with an auth-dependency heuristic |
| GET | `/repos/{id}/dependency-graph` | ✓ | Real Mermaid graph built from actual Python imports resolved to in-repo files |
| GET | `/repos/{id}/code-analysis` | ✓ | Consolidated Code Analyzer data: quality score, bugs, security, performance, recommendations |
| GET | `/repos/{id}/readme` | ✓ | Generates a real README.md from indexed structure (AI-enhanced overview if a Gemini key is set) |

## Setting up GitHub / Google sign-in

The buttons are wired to a real OAuth2 flow, but each provider needs an app
registered with real credentials — I can't create these for you, since they
require your own GitHub/Google account.

### GitHub

1. Go to https://github.com/settings/developers → **New OAuth App**.
2. **Homepage URL**: `http://localhost:5500` (or wherever your frontend is served).
3. **Authorization callback URL**: `http://localhost:8000/api/auth/oauth/github/callback` — this must match exactly, including the port.
4. After creating it, copy the **Client ID**, then generate and copy a **Client Secret**.
5. In `backend/.env`:
   ```
   GITHUB_CLIENT_ID=your-client-id
   GITHUB_CLIENT_SECRET=your-client-secret
   ```

### Google

1. Go to https://console.cloud.google.com/apis/credentials → **Create Credentials → OAuth client ID**.
2. If prompted, configure the OAuth consent screen first (External is fine for testing; add your own email as a test user).
3. Application type: **Web application**.
4. **Authorized redirect URI**: `http://localhost:8000/api/auth/oauth/google/callback` — exact match required.
5. Copy the **Client ID** and **Client Secret**.
6. In `backend/.env`:
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```

### Also set these two (used to build the redirect URLs)

```
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5500
```

Restart `uvicorn` after editing `.env`. A provider whose client ID/secret is
blank is automatically disabled — its button on login/signup dims out and
becomes unclickable (checked via `GET /api/auth/oauth/providers`) instead of
sending you into a broken redirect.

**How the flow works, end to end:**
1. Clicking "Continue with GitHub" navigates (a real page load, not a fetch) to `GET /api/auth/oauth/github/login`.
2. The backend redirects to GitHub's own login/consent screen, with a signed `state` value (no server-side session needed — the state itself is a short-lived JWT we verify on return).
3. GitHub redirects back to `GET /api/auth/oauth/github/callback` with a `code`.
4. The backend exchanges that code for a GitHub access token, fetches the profile (falling back to `/user/emails` if the email isn't public), and finds-or-creates a `User` row — matched first by `(provider, oauth_id)`, then by email, so a user who already signed up with a password can also log in via OAuth without creating a duplicate account.
5. The backend issues our own JWT pair and redirects to `frontend/oauth-callback.html#access_token=...&refresh_token=...` — tokens go in the URL **fragment**, not the query string, since fragments are never sent to any server and won't show up in access logs.
6. `oauth-callback.js` reads the fragment, stores the tokens the same way a password login does, and sends the user to the dashboard.

Tested end-to-end with the provider HTTP calls mocked (this sandbox can't reach github.com/google.com), covering: unconfigured-provider 501, unknown-provider 404, state-token forgery rejection, a full mocked login creating a user with `hashed_password=None`, and a second login with the same identity reusing that user instead of duplicating it.



**This is now wired up.** The frontend calls this API directly via
`frontend/js/api.js` — set `window.REPOMIND_API_BASE` before that script loads
if your backend isn't on `http://localhost:8000` (default assumed).

- Tokens are stored in `localStorage` (`repomind_tokens`, `repomind_user`) since this is a real multi-page site, not a single-page app — every page load is a full navigation, so session state needs to survive that.
- `api.js` auto-refreshes an expired access token once via `/auth/refresh`, and redirects to `login.html` if that fails.
- `app.js` calls `requireAuth()` on every logged-in page, so visiting `dashboard.html` etc. without a session bounces you to login.

What's real end-to-end today:
- Signup/login → dashboard repo list → connect (GitHub URL or ZIP) → **real** polling of indexing status → chat → **real** ask/answer (demo-mode text without a Gemini key) → conversation history → repository explorer with **real** file tree and file content → analytics with **real** file/function/class counts and language breakdown.

What's still a UI preview (backend has no endpoint for it yet, clearly labeled in the UI):
- Settings: password change, notifications, Gemini key storage, plan upgrade, account deletion.
- Profile: usage counters and recent activity feed.
- Architecture diagrams (no endpoint generates real dependency graphs yet — `services/graph_builder.py` exists but isn't wired to a route).
- Analytics: security findings, API endpoint table, and performance issues (no scanner service implemented — see the comment in `analytics.py`).

CORS defaults to `allow_origins=["*"]` with `allow_credentials=False` (safe since auth uses bearer tokens, not cookies) — fine for local dev, tighten `ALLOWED_ORIGINS` before deploying anywhere public.

## Known gaps (by design, for a first pass)

- No rate limiting on `/auth/login` (flagged by the real security scanner in the Analytics page, appropriately).
- Background indexing uses FastAPI `BackgroundTasks`, which runs in-process — fine for a demo, but move to a real task queue (Celery/RQ/arq) before indexing anything at scale.
- Migrations exist now (`alembic/versions/`), but there's only one baseline revision. **When you change `app/db/models.py`, generate a new one instead of hand-editing the DB**: `alembic revision --autogenerate -m "describe the change"`, review the generated file (autogenerate isn't perfect — it won't detect some renames/type changes correctly), then `alembic upgrade head`.
