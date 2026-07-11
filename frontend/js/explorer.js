/* ==========================================================================
   RepoMind AI — Repository Explorer Interactions
   Tree + file contents are mocked. Swap TREE/FILES for a real
   GET /api/repos/:id/tree and GET /api/repos/:id/file?path= call later.
   ========================================================================== */

const params = new URLSearchParams(window.location.search);
const repoName = params.get('repo') || 'payments-service';
document.getElementById('repo-crumb').textContent = repoName;
document.getElementById('sidebar-repo-name').textContent = repoName;

const TREE = {
  'auth': {
    'jwt.py': `import jwt\nfrom datetime import datetime, timedelta\n\nPRIVATE_KEY = load_key("JWT_PRIVATE_KEY")\n\n\ndef create_access_token(user_id: str) -> str:\n    payload = {\n        "sub": user_id,\n        "exp": datetime.utcnow() + timedelta(minutes=15),\n    }\n    return jwt.encode(payload, PRIVATE_KEY, algorithm="RS256")\n\n\ndef verify_token(token: str) -> dict:\n    return jwt.decode(token, PUBLIC_KEY, algorithms=["RS256"])`,
    'login.py': `from fastapi import APIRouter, HTTPException\nfrom .jwt import create_access_token\nfrom ..db.session import get_session\n\nrouter = APIRouter()\n\n\n@router.post("/auth/login")\ndef login(credentials: LoginRequest, db=Depends(get_session)):\n    user = db.query(User).filter_by(email=credentials.email).first()\n    if not user or not verify_password(credentials.password, user.hashed_password):\n        raise HTTPException(status_code=401, detail="Invalid credentials")\n    return {"access_token": create_access_token(user.id)}`,
    'middleware.py': `from fastapi import Request\nfrom .jwt import verify_token\n\n\nasync def auth_middleware(request: Request, call_next):\n    token = request.headers.get("authorization", "").removeprefix("Bearer ")\n    try:\n        request.state.user = verify_token(token)\n    except Exception:\n        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})\n    return await call_next(request)`,
  },
  'api': {
    'routes.py': `from fastapi import APIRouter\nfrom .endpoints import users, transactions\n\nrouter = APIRouter()\nrouter.include_router(users.router)\nrouter.include_router(transactions.router)`,
    'endpoints': {
      'users.py': `@router.get("/users/{user_id}")\ndef get_user(user_id: str, db=Depends(get_session)):\n    return db.query(User).get(user_id)`,
    },
  },
  'db': {
    'models.py': `class User(Base):\n    __tablename__ = "users"\n    id = Column(String, primary_key=True)\n    email = Column(String, unique=True)\n    hashed_password = Column(String)\n\n\nclass Transaction(Base):\n    __tablename__ = "transactions"\n    id = Column(String, primary_key=True)\n    user_id = Column(String, ForeignKey("users.id"))\n    amount_cents = Column(Integer)\n    created_at = Column(DateTime, default=datetime.utcnow)`,
    'session.py': `engine = create_engine(settings.DATABASE_URL, pool_size=10)\nSessionLocal = sessionmaker(bind=engine)\n\n\ndef get_session():\n    db = SessionLocal()\n    try:\n        yield db\n    finally:\n        db.close()`,
  },
  'services': {
    'repo_parser.py': `def walk_repo(path: Path) -> list[FileNode]:\n    nodes = []\n    for entry in path.rglob("*"):\n        if entry.is_file():\n            nodes.append(FileNode(path=entry, language=detect_language(entry)))\n    return nodes`,
    'graph_builder.py': `def build_graph(nodes: list[FileNode]) -> Graph:\n    graph = Graph()\n    for node in nodes:\n        graph.add_node(node.path)\n        for imp in extract_imports(node):\n            graph.add_edge(node.path, imp)\n    return graph`,
  },
  'requirements.txt': `fastapi==0.111.0\nsqlalchemy==2.0.30\npsycopg2-binary==2.9.9\npyjwt==2.8.0\nchromadb==0.5.0`,
  'README.md': `# payments-service\n\nFastAPI service handling authentication and transaction processing.`,
};

const LANG_BY_EXT = { py: 'python', ts: 'typescript', tsx: 'typescript', js: 'javascript', md: 'markdown', txt: 'plaintext', json: 'json' };

// -- render tree -----------------------------------------------------------
const treeRoot = document.getElementById('tree-root');

function buildTree(obj, path = '') {
  const ul = document.createElement('ul');
  Object.keys(obj).sort((a, b) => {
    const aIsFolder = typeof obj[a] === 'object';
    const bIsFolder = typeof obj[b] === 'object';
    if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
    return a.localeCompare(b);
  }).forEach((key) => {
    const value = obj[key];
    const fullPath = path ? `${path}/${key}` : key;
    const li = document.createElement('li');
    li.className = 'tree-node';

    if (typeof value === 'object') {
      li.innerHTML = `
        <div class="tree-folder" data-toggle>
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          ${key}
        </div>`;
      li.appendChild(buildTree(value, fullPath));
      li.querySelector('[data-toggle]').addEventListener('click', () => li.classList.toggle('collapsed'));
    } else {
      li.innerHTML = `
        <div class="tree-file" data-path="${fullPath}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
          ${key}
        </div>`;
      li.querySelector('.tree-file').addEventListener('click', () => openFile(fullPath, value));
    }
    ul.appendChild(li);
  });
  return ul;
}
treeRoot.appendChild(buildTree(TREE));

// -- search filter -----------------------------------------------------
document.getElementById('tree-search-input').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  treeRoot.querySelectorAll('.tree-node').forEach((node) => {
    const label = (node.querySelector('.tree-file, .tree-folder')?.textContent || '').toLowerCase();
    const hasMatchInside = q && node.querySelector(`.tree-file`) && Array.from(node.querySelectorAll('.tree-file')).some((f) => f.textContent.toLowerCase().includes(q));
    const isFolder = !!node.querySelector('.tree-folder');
    const matches = !q || label.includes(q) || hasMatchInside;
    node.classList.toggle('tree-hidden', !matches);
    if (q && matches && isFolder) node.classList.remove('collapsed');
  });
});

// -- preview -----------------------------------------------------------
const previewBody = document.getElementById('preview-body');
const previewPathEl = document.getElementById('preview-path-label');

function openFile(path, content) {
  document.querySelectorAll('.tree-file').forEach((f) => f.classList.remove('active'));
  document.querySelector(`.tree-file[data-path="${CSS.escape(path)}"]`)?.classList.add('active');

  const ext = path.split('.').pop();
  const lang = LANG_BY_EXT[ext] || 'plaintext';
  previewPathEl.textContent = path;

  previewBody.innerHTML = `
    <div class="preview-code glass">
      <pre><code class="language-${lang}">${escapeHtml(content)}</code></pre>
    </div>
    <div class="explain-panel glass" id="explain-panel">
      <span class="eyebrow">AI Explain</span>
      <p id="explain-text"></p>
    </div>
    <button class="btn btn-primary btn-sm" id="explain-btn" style="margin-top:16px;">✨ AI Explain this file</button>
  `;
  if (window.hljs) previewBody.querySelectorAll('code').forEach((el) => window.hljs.highlightElement(el));

  document.getElementById('explain-btn').addEventListener('click', () => {
    const panel = document.getElementById('explain-panel');
    const textEl = document.getElementById('explain-text');
    panel.classList.add('show');
    textEl.textContent = explainFor(path);
  });
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function explainFor(path) {
  const explanations = {
    'auth/jwt.py': 'Signs and verifies RS256 JWTs. Access tokens expire in 15 minutes, which limits the blast radius if one leaks. Verification only needs the public key, so this can run in any service without touching the database.',
    'auth/login.py': 'Validates credentials against the users table and issues an access token on success. Returns a generic 401 on failure rather than distinguishing "wrong email" from "wrong password", which avoids leaking which emails are registered.',
    'auth/middleware.py': 'Runs before every request. Extracts the bearer token, verifies it, and attaches the decoded payload to request.state.user — downstream handlers never touch JWT logic directly.',
    'db/models.py': 'Defines the two core tables. Transactions reference users by foreign key and are never updated after insert, which keeps the ledger auditable.',
    'db/session.py': 'Opens one pooled connection per request via a generator dependency, closing it in a finally block so a raised exception can\'t leak a connection.',
  };
  return explanations[path] || 'This file doesn\'t have a canned explanation in the demo yet — once the real Gemini pipeline is connected, this button will generate one from the actual file contents.';
}

// open a default file
openFile('auth/jwt.py', TREE.auth['jwt.py']);

// mobile tree toggle
document.getElementById('mobile-tree-toggle')?.addEventListener('click', () => {
  document.getElementById('tree-pane').classList.toggle('show');
});
