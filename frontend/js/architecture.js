(function () {
  // Guards against this script executing twice on the same page (e.g. a
  // duplicate <script> tag, a dev-server double-injection, or caching
  // quirks) — without this, a second run would crash on redeclaring the
  // top-level const/class bindings below.
  if (window.__repomind_loaded_architecture) return;
  window.__repomind_loaded_architecture = true;

/* ==========================================================================
   RepoMind AI — Architecture Viewer Interactions
   Dependency Graph is real — built from actual Python import statements via
   GET /repos/:id/dependency-graph (see quality_service.build_dependency_graph).
   The other four diagrams stay illustrative templates: deriving a real
   system/frontend/backend/database flow diagram from arbitrary source needs
   real semantic understanding, not just static analysis — out of scope for
   a heuristic scanner.
   ========================================================================== */

const params = new URLSearchParams(window.location.search);
const repoId = params.get('repo');

if (repoId && window.RepoMindAPI) {
  window.RepoMindAPI.apiFetch(`/repos/${repoId}`)
    .then((repo) => {
      document.getElementById('repo-crumb').textContent = repo.name;
      document.getElementById('sidebar-repo-name').textContent = repo.name;
    })
    .catch(() => {
      /* keep the placeholder name if this fails — diagrams below are illustrative anyway */
    });
}

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    background: '#0b0906',
    primaryColor: '#33240f',
    primaryTextColor: '#f7f0e2',
    primaryBorderColor: '#e6b450',
    lineColor: '#3ecfb2',
    secondaryColor: '#d1567c',
    tertiaryColor: '#241a10',
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
let dependencyGraphCache = null;

async function renderDiagram(key) {
  container.innerHTML = '<div class="arch-loading">Rendering diagram…</div>';
  const id = `mermaid-${key}-${renderCount++}`;

  let source = DIAGRAMS[key];
  if (key === 'dependency') {
    try {
      if (!dependencyGraphCache) {
        if (!repoId || !window.RepoMindAPI) throw new Error('no repo selected');
        const res = await window.RepoMindAPI.apiFetch(`/repos/${repoId}/dependency-graph`);
        dependencyGraphCache = res.mermaid;
      }
      source = dependencyGraphCache;
    } catch (err) {
      container.innerHTML = `<div class="arch-loading">${err instanceof window.RepoMindAPI.ApiError ? err.detail : 'Could not load the dependency graph — open this page from a repository.'}</div>`;
      return;
    }
  }

  try {
    const { svg } = await mermaid.render(id, source);
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

    const note = document.getElementById('arch-note');
    note.lastChild.textContent =
      tab.dataset.diagram === 'dependency'
        ? ' Built live from this repository\u2019s actual Python import statements.'
        : ' This is a generic template, not generated from your code — only Dependency Graph reflects the actual repository.';
  });
});

renderDiagram('flowchart');

})();
