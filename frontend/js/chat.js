(function () {
  // Guards against this script executing twice on the same page (e.g. a
  // duplicate <script> tag, a dev-server double-injection, or caching
  // quirks) — without this, a second run would crash on redeclaring the
  // top-level const/class bindings below.
  if (window.__repomind_loaded_chat) return;
  window.__repomind_loaded_chat = true;

/* ==========================================================================
   RepoMind AI — Chat Interactions
   Real API calls via js/api.js. The render pipeline (markdown, citation
   chips, syntax highlighting, streaming reveal) is unchanged from the demo —
   it already expected raw markdown with [[file/path]] citations, which is
   exactly what the backend's Gemini/demo-mode answers return.
   ========================================================================== */

const { apiFetch, ApiError } = window.RepoMindAPI;

const params = new URLSearchParams(window.location.search);
const repoId = params.get('repo');

const chatScroll = document.getElementById('chat-scroll');
const chatEmpty = document.getElementById('chat-empty');
const chatInner = document.getElementById('chat-inner');
const input = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const historyList = document.getElementById('history-list');

let currentConversationId = null;
let repoReady = false;

if (!repoId) {
  chatEmpty.querySelector('h2').textContent = 'No repository selected';
  chatEmpty.querySelector('p').textContent = 'Head back to the dashboard and open a repository from there.';
  chatEmpty.querySelector('.prompt-chips').style.display = 'none';
} else {
  init();
}

async function init() {
  try {
    const repo = await apiFetch(`/repos/${repoId}`);
    document.getElementById('repo-crumb').textContent = repo.name;
    document.getElementById('sidebar-repo-name').textContent = repo.name;
    input.placeholder = `Ask about ${repo.name}…`;

    if (repo.status !== 'indexed') {
      chatEmpty.querySelector('h2').textContent = `Still ${repo.status}…`;
      chatEmpty.querySelector('p').textContent = 'This repository needs to finish indexing before you can chat with it. Head back to the dashboard — it\u2019ll show progress there.';
      chatEmpty.querySelector('.prompt-chips').style.display = 'none';
      input.disabled = true;
      input.placeholder = 'Waiting for indexing to finish…';
      return;
    }

    repoReady = true;
    loadHistory();
  } catch (err) {
    chatEmpty.querySelector('h2').textContent = 'Could not load this repository';
    chatEmpty.querySelector('p').textContent = err instanceof ApiError ? err.detail : 'Could not reach the API.';
    chatEmpty.querySelector('.prompt-chips').style.display = 'none';
  }
}

async function loadHistory() {
  try {
    const conversations = await apiFetch(`/repos/${repoId}/chat/conversations`);
    historyList.innerHTML = '';
    if (!conversations.length) {
      historyList.innerHTML = '<div style="padding:8px 12px; font-size:12px; color:var(--ink-3);">No conversations yet</div>';
      return;
    }
    conversations.forEach((conv) => {
      const btn = document.createElement('button');
      btn.className = 'history-item';
      btn.textContent = conv.title || 'Untitled chat';
      btn.dataset.conversationId = conv.id;
      btn.addEventListener('click', () => openConversation(conv.id));
      historyList.appendChild(btn);
    });
  } catch {
    historyList.innerHTML = '<div style="padding:8px 12px; font-size:12px; color:var(--ink-3);">Couldn\u2019t load history</div>';
  }
}

async function openConversation(conversationId) {
  currentConversationId = conversationId;
  document.querySelectorAll('.history-item').forEach((h) => h.classList.toggle('active', h.dataset.conversationId === conversationId));
  chatInner.querySelectorAll('.msg').forEach((m) => m.remove());
  chatEmpty.style.display = 'none';

  try {
    const messages = await apiFetch(`/repos/${repoId}/chat/conversations/${conversationId}/messages`);
    messages.forEach((m) => {
      if (m.role === 'user') addUserMessage(m.content);
      else addAiMessage(m.content, { instant: true });
    });
  } catch (err) {
    addErrorMessage(err instanceof ApiError ? err.detail : 'Could not load this conversation.');
  }
}

// -- rendering helpers ---------------------------------------------------
function citePreprocess(md) {
  return md.replace(/\[\[([^\]]+)\]\]/g, (_, file) => `<span class="cite-chip">${escapeHtml(file)}</span>`);
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    <div class="msg-avatar"><span class="initial">${(window.RepoMindAPI.getUser()?.name || 'A')[0].toUpperCase()}</span></div>
    <div class="msg-body">${escapeHtml(text)}</div>
  `;
  chatInner.appendChild(el);
  scrollToBottom();
}

function addErrorMessage(text) {
  const el = document.createElement('div');
  el.className = 'msg ai';
  el.innerHTML = `
    <div class="msg-avatar"><svg viewBox="0 0 24 24" fill="none" stroke="#ff7a90" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg></div>
    <div class="msg-body"><div class="msg-md" style="color:#ff7a90;">${escapeHtml(text)}</div></div>
  `;
  chatInner.appendChild(el);
  scrollToBottom();
}

function addAiMessage(markdown, { instant = false } = {}) {
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

  const reveal = () => {
    typingEl.style.display = 'none';
    mdEl.style.display = 'block';
    if (instant) {
      mdEl.innerHTML = renderMarkdown(markdown);
      highlightAll(mdEl);
      scrollToBottom();
    } else {
      streamMarkdown(markdown, mdEl, () => addCopyAction(el, markdown));
    }
  };

  if (instant) reveal();
  else window.setTimeout(reveal, 400 + Math.random() * 300);
}

function addCopyAction(messageEl, markdown) {
  const actions = document.createElement('div');
  actions.className = 'msg-actions';
  actions.innerHTML = `
    <button type="button" data-copy>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      Copy
    </button>`;
  messageEl.querySelector('.msg-body').appendChild(actions);
  actions.querySelector('[data-copy]').addEventListener('click', () => navigator.clipboard?.writeText(markdown));
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
async function sendMessage(text) {
  const trimmed = text.trim();
  if (!trimmed || !repoReady) return;
  addUserMessage(trimmed);
  input.value = '';
  autosize();
  updateSendState();

  try {
    const res = await apiFetch(`/repos/${repoId}/chat/ask`, {
      method: 'POST',
      body: JSON.stringify({ conversation_id: currentConversationId, question: trimmed }),
    });
    currentConversationId = res.conversation_id;
    addAiMessage(res.answer);
    loadHistory();
  } catch (err) {
    addErrorMessage(err instanceof ApiError ? err.detail : 'Could not reach the API — check the backend is running.');
  }
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

// -- new chat --------------------------------------------------------
document.getElementById('new-chat-btn').addEventListener('click', () => {
  currentConversationId = null;
  chatInner.querySelectorAll('.msg').forEach((m) => m.remove());
  chatEmpty.style.display = 'block';
  document.querySelectorAll('.history-item').forEach((h) => h.classList.remove('active'));
});

// citation chip clicks -> open that exact file in the Explorer
chatInner.addEventListener('click', (e) => {
  if (e.target.classList.contains('cite-chip')) {
    const filePath = e.target.textContent.trim();
    window.location.href = `explorer.html?repo=${encodeURIComponent(repoId)}&file=${encodeURIComponent(filePath)}`;
  }
});

})();
