/* ==========================================================================
   RepoMind AI — Chat Interactions
   Responses are mocked from a small local knowledge base keyed by intent.
   Swap requestAnswer() for a real streamed POST /api/chat call once the
   Gemini + ChromaDB pipeline is wired up — the render pipeline (markdown,
   citation chips, syntax highlighting) already expects raw markdown chunks.
   ========================================================================== */

const params = new URLSearchParams(window.location.search);
const repoName = params.get('repo') || 'payments-service';
document.getElementById('repo-crumb').textContent = repoName;
document.getElementById('sidebar-repo-name').textContent = repoName;

const chatScroll = document.getElementById('chat-scroll');
const chatEmpty = document.getElementById('chat-empty');
const chatInner = document.getElementById('chat-inner');
const input = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');

// -- mock knowledge base ----------------------------------------------
const KB = [
  {
    keys: ['auth', 'jwt', 'login', 'authentication'],
    md: `Authentication is handled in three places:

- [[auth/jwt.py]] — signs and verifies tokens using RS256
- [[auth/login.py]] — validates credentials and issues the initial token pair
- [[auth/middleware.py]] — runs on every request to check signature and expiry

The access token is short-lived (15 minutes); [[auth/jwt.py]] also issues a longer-lived refresh token that's rotated on use, so a stolen refresh token can only be replayed once.

\`\`\`python
def create_access_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": now() + timedelta(minutes=15)}
    return jwt.encode(payload, PRIVATE_KEY, algorithm="RS256")
\`\`\`

Nothing calls the database on every request — the middleware verifies the signature locally, so auth checks stay fast even under load.`,
  },
  {
    keys: ['database', 'db', 'schema', 'postgres'],
    md: `The database flow starts at [[db/session.py]], which opens a pooled connection per request and closes it in a \`finally\` block so connections can't leak under error paths.

Models live in [[db/models.py]]. The core tables are:

1. \`users\` — one row per account, referenced by nearly everything else
2. \`transactions\` — append-only; rows are never updated, only inserted
3. \`audit_log\` — written by a Postgres trigger, not application code

The append-only pattern on \`transactions\` is deliberate — it makes the ledger reconstructable from history alone, which [[services/repo_parser.py]] relies on for the analytics rollups.`,
  },
  {
    keys: ['architecture', 'overview', 'structure'],
    md: `At a high level, this repo follows a fairly standard layered structure:

\`\`\`
api/         → route handlers, thin — validation + delegation only
services/    → business logic lives here
db/          → SQLAlchemy models + session management
auth/        → JWT issuance and verification
\`\`\`

Requests enter through [[api/routes.py]], get validated, and are handed to a matching function in \`services/\`. That's the one rule this codebase is consistent about — route handlers never talk to the database directly, they always go through a service function.

Cross-cutting concerns (auth, logging, rate limiting) are all implemented as middleware in [[auth/middleware.py]] rather than repeated per-route.`,
  },
  {
    keys: ['readme', 'documentation', 'docs'],
    md: `Here's a draft README based on what's actually in the repo:

\`\`\`markdown
# payments-service

FastAPI service handling authentication and transaction processing.

## Install
pip install -r requirements.txt

## Environment variables
- DATABASE_URL
- JWT_PRIVATE_KEY
- JWT_PUBLIC_KEY

## Run
uvicorn main:app --reload
\`\`\`

I kept this short — want me to expand the deployment and API sections too?`,
  },
  {
    keys: ['duplicate', 'dead code', 'unused'],
    md: `Found two spots worth a look:

- [[services/repo_parser.py]] and [[services/graph_builder.py]] both implement near-identical file-walking logic — about 40 lines of overlap. Worth extracting into a shared \`walk_repo()\` helper.
- \`format_currency()\` is defined separately in [[api/endpoints/users.py]] and one other file, with slightly different rounding behavior — that's a bug risk, not just duplication.

No dead code detected in the core \`services/\` or \`auth/\` modules.`,
  },
  {
    keys: ['api', 'endpoint', 'routes'],
    md: `RepoMind detected 14 endpoints. The busiest file is [[api/routes.py]]:

| Method | Path | Auth |
|---|---|---|
| POST | /auth/login | none |
| POST | /auth/refresh | refresh token |
| GET | /users/:id | access token |
| POST | /transactions | access token |

All authenticated routes go through [[auth/middleware.py]] before reaching the handler — there's no endpoint in this repo that skips it, including internal/admin routes.`,
  },
];

const FALLBACK_MD = `I couldn't find a strong match for that in **${repoName}** yet — try rephrasing, or ask about authentication, the database flow, architecture, or the API surface. Once the real indexing pipeline is connected, this will search the actual embedded codebase instead of a fixed set of demo answers.`;

function findAnswer(question) {
  const q = question.toLowerCase();
  const hit = KB.find((entry) => entry.keys.some((k) => q.includes(k)));
  return hit ? hit.md : FALLBACK_MD;
}

// -- rendering helpers ---------------------------------------------------
function citePreprocess(md) {
  return md.replace(/\[\[([^\]]+)\]\]/g, (_, file) =>
    `<span class="cite-chip">${escapeHtml(file)}</span>`
  );
}
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMarkdown(raw) {
  const withChips = citePreprocess(raw);
  return window.marked ? window.marked.parse(withChips) : withChips;
}

function highlightAll(container) {
  if (window.hljs) container.querySelectorAll('pre code').forEach((el) => window.hljs.highlightElement(el));
}

function scrollToBottom() {
  chatScroll.scrollTop = chatScroll.scrollHeight;
}

// -- message construction -------------------------------------------------
function addUserMessage(text) {
  chatEmpty.style.display = 'none';
  const el = document.createElement('div');
  el.className = 'msg user';
  el.innerHTML = `
    <div class="msg-avatar"><span class="initial">A</span></div>
    <div class="msg-body">${escapeHtml(text)}</div>
  `;
  chatInner.appendChild(el);
  scrollToBottom();
}

function addAiMessage(markdown) {
  const el = document.createElement('div');
  el.className = 'msg ai';
  el.innerHTML = `
    <div class="msg-avatar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg></div>
    <div class="msg-body">
      <div class="msg-typing"><span></span><span></span><span></span></div>
      <div class="msg-md" style="display:none;"></div>
    </div>
  `;
  chatInner.appendChild(el);
  scrollToBottom();

  const typingEl = el.querySelector('.msg-typing');
  const mdEl = el.querySelector('.msg-md');

  window.setTimeout(() => {
    typingEl.style.display = 'none';
    mdEl.style.display = 'block';
    streamMarkdown(markdown, mdEl, () => {
      const actions = document.createElement('div');
      actions.className = 'msg-actions';
      actions.innerHTML = `
        <button type="button" data-copy>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy
        </button>`;
      el.querySelector('.msg-body').appendChild(actions);
      actions.querySelector('[data-copy]').addEventListener('click', () => {
        navigator.clipboard?.writeText(markdown);
      });
    });
  }, 500 + Math.random() * 400);
}

function streamMarkdown(fullMd, targetEl, onDone) {
  const chunkSize = 6;
  let pos = 0;
  function tick() {
    pos = Math.min(fullMd.length, pos + chunkSize);
    targetEl.innerHTML = renderMarkdown(fullMd.slice(0, pos));
    scrollToBottom();
    if (pos < fullMd.length) {
      window.setTimeout(tick, 12);
    } else {
      highlightAll(targetEl);
      onDone();
    }
  }
  tick();
}

// -- send flow --------------------------------------------------------
function sendMessage(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  addUserMessage(trimmed);
  input.value = '';
  autosize();
  updateSendState();
  window.setTimeout(() => addAiMessage(findAnswer(trimmed)), 200);
}

document.querySelectorAll('.prompt-chip').forEach((chip) => {
  chip.addEventListener('click', () => sendMessage(chip.textContent));
});

sendBtn.addEventListener('click', () => sendMessage(input.value));
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(input.value);
  }
});

function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(140, input.scrollHeight) + 'px';
}
function updateSendState() {
  sendBtn.disabled = input.value.trim().length === 0;
}
input.addEventListener('input', () => { autosize(); updateSendState(); });
updateSendState();

// -- new chat / history (mock) --------------------------------------------
document.getElementById('new-chat-btn').addEventListener('click', () => {
  chatInner.querySelectorAll('.msg').forEach((m) => m.remove());
  chatEmpty.style.display = 'block';
  document.querySelectorAll('.history-item').forEach((h) => h.classList.remove('active'));
});

document.querySelectorAll('.history-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.history-item').forEach((h) => h.classList.remove('active'));
    item.classList.add('active');
    chatInner.querySelectorAll('.msg').forEach((m) => m.remove());
    chatEmpty.style.display = 'none';
    const q = item.dataset.question;
    addUserMessage(q);
    addAiMessage(findAnswer(q));
  });
});

// event delegation for citation chip clicks (explorer isn't built yet)
chatInner.addEventListener('click', (e) => {
  if (e.target.classList.contains('cite-chip')) {
    e.target.setAttribute('title', 'Open in Explorer — coming soon');
  }
});
