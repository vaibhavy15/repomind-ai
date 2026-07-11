/* ==========================================================================
   RepoMind AI — Architecture Viewer Interactions
   Diagram source is generated from the mocked dependency graph. Swap DIAGRAMS
   for a real GET /api/repos/:id/architecture?view= call once graph_builder.py
   is wired to actually walk the repo.
   ========================================================================== */

const params = new URLSearchParams(window.location.search);
const repoName = params.get('repo') || 'payments-service';
document.getElementById('repo-crumb').textContent = repoName;
document.getElementById('sidebar-repo-name').textContent = repoName;

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    background: '#05060d',
    primaryColor: '#10143a',
    primaryTextColor: '#f4f6ff',
    primaryBorderColor: '#4d7fff',
    lineColor: '#4deaff',
    secondaryColor: '#a855f7',
    tertiaryColor: '#0b0f2e',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '13px',
  },
});

const DIAGRAMS = {
  flowchart: `flowchart TD
    A[Client] -->|HTTPS| B[api/routes.py]
    B --> C{Authenticated?}
    C -->|no| D[401 Unauthorized]
    C -->|yes| E[services layer]
    E --> F[(Postgres)]
    E --> G[ChromaDB embeddings]
    E --> H[Gemini 2.5]
    H --> I[Response + citations]`,

  dependency: `graph LR
    jwt[auth/jwt.py] --> login[auth/login.py]
    login --> middleware[auth/middleware.py]
    middleware --> routes[api/routes.py]
    routes --> users[api/endpoints/users.py]
    routes --> tx[api/endpoints/transactions.py]
    users --> models[db/models.py]
    tx --> models
    models --> session[db/session.py]
    parser[services/repo_parser.py] --> graph[services/graph_builder.py]`,

  frontend: `flowchart LR
    Login[Login Page] --> Dash[Dashboard]
    Dash --> Upload[Upload Modal]
    Upload --> Stages[Staged Indexing]
    Stages --> ChatUI[AI Chat]
    Dash --> ChatUI
    ChatUI --> Explorer[Repository Explorer]
    Dash --> ArchView[Architecture Viewer]
    Dash --> Analytics[Analytics]`,

  backend: `flowchart TD
    Req[Incoming Request] --> MW[auth middleware]
    MW --> Route[route handler]
    Route --> Service[service function]
    Service --> DB[(Postgres via SQLAlchemy)]
    Service --> Vec[(ChromaDB)]
    Service --> LLM[Gemini 2.5 Flash]
    LLM --> Resp[Streamed response]`,

  database: `erDiagram
    USERS ||--o{ TRANSACTIONS : has
    USERS {
      string id PK
      string email
      string hashed_password
    }
    TRANSACTIONS {
      string id PK
      string user_id FK
      int amount_cents
      datetime created_at
    }
    AUDIT_LOG {
      string id PK
      string table_name
      string action
      datetime logged_at
    }`,
};

const container = document.getElementById('diagram-container');
let renderCount = 0;

async function renderDiagram(key) {
  container.innerHTML = '<div class="arch-loading">Rendering diagram…</div>';
  const id = `mermaid-${key}-${renderCount++}`;
  try {
    const { svg } = await mermaid.render(id, DIAGRAMS[key]);
    container.innerHTML = svg;
  } catch (err) {
    container.innerHTML = '<div class="arch-loading">Could not render this diagram.</div>';
  }
}

document.querySelectorAll('.arch-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.arch-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    renderDiagram(tab.dataset.diagram);
  });
});

renderDiagram('flowchart');
