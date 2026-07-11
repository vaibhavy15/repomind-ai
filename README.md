# RepoMind AI

An AI-powered codebase understanding platform. Upload a repository — GitHub
URL or ZIP — and ask it questions in plain language. Answers cite the exact
files they came from.

This repo has two independent halves that aren't wired together yet:

```
repomind-ai/
├── frontend/     — fully built, cinematic dark-space UI, runs standalone with mock data
└── backend/      — real FastAPI service (auth, DB, indexing), AI calls stubbed until you add a Gemini key
```

## Run the frontend (no setup required)

Open `frontend/index.html` directly in a browser, or serve the folder:

```bash
cd frontend
python3 -m http.server 5500
# visit http://localhost:5500
```

Every page works today — signup, dashboard with the cinematic indexing
sequence, AI chat with streaming markdown + citations, repository explorer,
architecture diagrams (Mermaid), analytics (Chart.js), settings, and profile
— all against realistic mock data defined at the top of each page's `js/*.js`
file, clearly commented with what real endpoint should replace it.

## Run the backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
# docs at http://localhost:8000/docs
```

Auth, the database, and repository parsing (file walking, Python AST
function/class counts, ZIP upload, `git clone` from a GitHub URL) are real
and tested. Chat retrieval (ChromaDB) and generation (Gemini) are lazily
stubbed — the app boots and every endpoint responds without either one
installed, using clearly-labeled demo answers, and starts making real calls
the moment you install `chromadb`/`google-genai` and set `GEMINI_API_KEY`.
See `backend/README.md` for the full breakdown of what's real vs. stubbed,
and the API reference.

## Connecting them

They're not wired together yet on purpose — the frontend needed to be
demoable on its own, and the backend needed to be verifiably correct on its
own. `backend/README.md` has a short section on exactly which mock functions
in the frontend JS map to which live endpoints.

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
│   │   ├── galaxy.js               Three.js background: starfield, nebula, codegraph constellation
│   │   ├── main.js                 Landing page: nav state, scroll reveals, FAQ, card glow
│   │   ├── auth.js                 Login/signup/forgot-password validation + mock submit
│   │   ├── app.js                  Shared: mobile sidebar toggle
│   │   ├── dashboard.js            Upload modal, dropzone, staged indexing sequence
│   │   ├── chat.js                 Mock KB, markdown streaming, citation rendering, history
│   │   ├── explorer.js             Mock file tree, search filter, file preview, AI Explain
│   │   ├── architecture.js         Mermaid diagram definitions + tab switching
│   │   ├── analytics.js            Chart.js setup, animated counters, tab switching
│   │   └── settings.js             Toggles, mock save, danger-zone confirm
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
        │       ├── repos.py        connect (URL or ZIP), list, get, files, delete
        │       ├── chat.py         ask, conversation history
        │       └── analytics.py    repo stats
        └── services/
            ├── repo_parser.py      Real: file walk, Python AST stats, git clone
            ├── embeddings_service.py  Stub: ChromaDB indexing + query
            └── gemini_service.py   Stub: Gemini call with demo-mode fallback
```

## Design system

Dark space theme — void black, indigo nebula, three-tone neon (blue / cyan /
violet) — with Space Grotesk for display type, Inter for body text, and
JetBrains Mono for file paths, code, and data. Every logged-in page shares
the same sidebar/topbar shell (`css/app.css`) so the product feels like one
system rather than a set of demo pages bolted together.
