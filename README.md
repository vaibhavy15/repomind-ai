# RepoMind AI

An AI-powered codebase understanding platform. Upload a repository — GitHub
URL or ZIP — and ask it questions in plain language. Answers cite the exact
files they came from.

This repo has two halves that are now **wired together**:

```
repomind-ai/
├── frontend/     — cinematic dark-space UI, calls the backend directly via js/api.js
└── backend/      — real FastAPI service (auth, DB, indexing), AI calls stubbed until you add a Gemini key
```

## Run both together

**1. Start the backend first:**

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

> Upgrading from an older copy of this project and seeing a `column ... does
> not exist` error? See "Migrations" in `backend/README.md` — it's a one-line
> fix that doesn't lose your data.

**2. Serve the frontend:**

```bash
cd frontend
python3 -m http.server 5500
# visit http://localhost:5500
```

Sign up, connect a repo (a small public GitHub URL or a `.zip`), and it'll
really index, really show up in chat, and really populate the explorer and
analytics pages — all against the backend you just started. If your backend
isn't on `http://localhost:8000`, set `window.REPOMIND_API_BASE` before
`js/api.js` loads on each page.

Login/session state lives in the browser's `localStorage` (this is a real
multi-page site, not an SPA, so it needs to survive full page navigations)
and auto-refreshes expired tokens.

## What's real vs. still a UI preview

Auth (including GitHub/Google OAuth — bring your own client ID/secret), repo
connect/upload/indexing/polling, chat ask + history, the file explorer, and
the full account-management surface (profile edit, password change, forgot/
reset password, account deletion, per-user Gemini key, notification prefs)
are all real, tested against a live server. The Analytics page's security
findings, API endpoint detection, and performance issues are real too — a
heuristic static-analysis pass (AST-based for Python, regex for other
languages) over the actual indexed source, not mock data. The Architecture
page's "Dependency Graph" tab is real (built from actual Python imports);
its other four diagrams stay generic templates on purpose — deriving those
from arbitrary source needs real semantic understanding, not static
analysis. `backend/README.md` has the full real-vs-stubbed breakdown.

## Full file structure

```
repomind-ai/
├── README.md
│
├── frontend/
│   ├── index.html                  Landing page (hero, features, pricing preview, FAQ)
│   ├── about.html                  Company story, values, team
│   ├── login.html                  Auth: log in
│   ├── signup.html                 Auth: sign up
│   ├── forgot-password.html        Auth: reset flow
│   ├── oauth-callback.html         Receives tokens after GitHub/Google sign-in redirects back
│   ├── dashboard.html              Repo list + connect-repository modal (cinematic indexing)
│   ├── chat.html                   AI chat: streaming markdown, citations, suggested prompts
│   ├── explorer.html               Repository file tree + code preview + AI Explain
│   ├── architecture.html           Mermaid diagrams: flowchart / dependency / frontend / backend / db
│   ├── analytics.html              Stats, charts, security findings, API table, performance issues
│   ├── settings.html               Profile, password, Gemini key, notifications, plan, danger zone
│   ├── profile.html                Account overview + recent activity
│   │
│   ├── css/
│   │   ├── base.css                Design tokens: color, type, spacing, shared components
│   │   ├── landing.css             Landing page sections
│   │   ├── auth.css                Login/signup/forgot-password
│   │   ├── about.css                About page (timeline, team, stats)
│   │   ├── app.css                 Shared app shell: sidebar + topbar (all logged-in pages)
│   │   ├── dashboard.css           Repo grid, upload modal, staged loader
│   │   ├── chat.css                Message bubbles, markdown, citations, input bar
│   │   ├── explorer.css            File tree, code preview pane
│   │   ├── architecture.css        Diagram tabs + canvas
│   │   ├── analytics.css           Stat tiles, charts, findings/endpoints/perf tabs
│   │   ├── settings.css            Setting cards, toggles, danger zone
│   │   └── profile.css             Profile banner, usage grid, activity list
│   │
│   ├── js/
│   │   ├── api.js                  Shared API client: tokens, auth guard, fetch wrapper w/ auto-refresh
│   │   ├── galaxy.js               Three.js background: starfield, nebula, codegraph constellation
│   │   ├── main.js                 Landing page: nav state, scroll reveals, FAQ, card glow
│   │   ├── auth.js                 Login/signup wired to the real API; forgot-password stays mocked
│   │   ├── oauth-callback.js       Reads tokens from the OAuth redirect and completes sign-in
│   │   ├── app.js                  Shared: auth guard, user chrome, mobile sidebar, logout
│   │   ├── dashboard.js            Real repo list/connect/upload + status polling
│   │   ├── chat.js                 Real ask endpoint + real conversation history
│   │   ├── explorer.js             Real file tree + file content + AI Explain (real chat call)
│   │   ├── architecture.js         Mermaid diagram definitions + tab switching (illustrative)
│   │   ├── analytics.js            Real stats/charts; security/API/perf tabs stay illustrative
│   │   ├── settings.js             Real profile load; password/notifications/plan stay UI-only
│   │   └── profile.js              Real name/email load; usage + activity stay illustrative
│   │
│   └── assets/                     (empty — favicon/OG image go here)
│
└── backend/
    ├── README.md                   Setup, what's real vs. stubbed, full API reference
    ├── requirements.txt
    ├── .env.example
    ├── .gitignore
    └── app/
        ├── main.py                 FastAPI app, CORS, router registration
        ├── core/
        │   ├── config.py           Settings from environment
        │   └── security.py         bcrypt hashing + JWT create/verify (real)
        ├── db/
        │   ├── base.py             SQLAlchemy declarative base
        │   ├── session.py          Engine + get_db() dependency
        │   └── models.py           User, Repository, RepoFile, Conversation, Message
        ├── schemas/
        │   ├── auth.py
        │   ├── repo.py
        │   └── chat.py
        ├── api/
        │   ├── deps.py             get_current_user() from bearer token
        │   └── routes/
        │       ├── auth.py         signup / login / refresh / me
        │       ├── oauth.py        GitHub/Google OAuth2 login + callback
        │       ├── repos.py        connect (URL or ZIP), list, get, files, delete
        │       ├── chat.py         ask, conversation history
        │       └── analytics.py    repo stats
        └── services/
            ├── repo_parser.py      Real: file walk, Python AST stats, git clone
            ├── embeddings_service.py  Stub: ChromaDB indexing + query
            ├── gemini_service.py   Stub: Gemini call with demo-mode fallback
            └── oauth_service.py    Real: GitHub/Google OAuth2 code exchange + profile fetch
```

## Design system

Dark space theme — void black, indigo nebula, three-tone neon (blue / cyan /
violet) — with Space Grotesk for display type, Inter for body text, and
JetBrains Mono for file paths, code, and data. Every logged-in page shares
the same sidebar/topbar shell (`css/app.css`) so the product feels like one
system rather than a set of demo pages bolted together.
