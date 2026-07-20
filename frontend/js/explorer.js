(function () {
  // Guards against this script executing twice on the same page (e.g. a
  // duplicate <script> tag, a dev-server double-injection, or caching
  // quirks) — without this, a second run would crash on redeclaring the
  // top-level const/class bindings below.
  if (window.__repomind_loaded_explorer) return;
  window.__repomind_loaded_explorer = true;

/* ==========================================================================
   RepoMind AI — Repository Explorer Interactions
   Real API calls via js/api.js. The tree is built client-side from the flat
   file list the backend returns; content and "AI Explain" are both real
   calls (explain reuses the chat ask endpoint with a synthesized question).
   ========================================================================== */

const { apiFetch, ApiError } = window.RepoMindAPI;

const params = new URLSearchParams(window.location.search);
const repoId = params.get('repo');

const treeRoot = document.getElementById('tree-root');
const previewBody = document.getElementById('preview-body');
const previewPathEl = document.getElementById('preview-path-label');

const LANG_HLJS = { Python: 'python', TypeScript: 'typescript', JavaScript: 'javascript', Markdown: 'markdown', JSON: 'json', SQL: 'sql', YAML: 'yaml' };

if (!repoId) {
  window.renderNoRepoEmptyState(document.querySelector('.explorer-shell'), {
    title: 'No repository selected',
    message: 'The file explorer needs a repository to browse. Open this page from a repository on your dashboard, or pick one below.',
  });
} else {
  init();
}

async function init() {
  try {
    const repo = await apiFetch(`/repos/${repoId}`);
    document.getElementById('repo-crumb').textContent = repo.name;
    document.getElementById('sidebar-repo-name').textContent = repo.name;

    if (repo.status !== 'indexed') {
      treeRoot.innerHTML = `<p style="font-size:12.5px; color:var(--ink-2); padding:8px;">Still ${repo.status} — check back once indexing finishes.</p>`;
      previewBody.innerHTML = '<div class="preview-empty"><p>Nothing to preview yet.</p></div>';
      return;
    }

    const files = await apiFetch(`/repos/${repoId}/files`);
    if (!files.length) {
      treeRoot.innerHTML = '<p style="font-size:12.5px; color:var(--ink-2); padding:8px;">No files were indexed for this repository.</p>';
      return;
    }

    const treeData = buildTreeData(files);
    treeRoot.appendChild(renderTree(treeData));

    const requestedFile = params.get('file');
    const targetFile = requestedFile && files.some((f) => f.path === requestedFile) ? requestedFile : files[0].path;
    if (requestedFile && targetFile === requestedFile) revealInTree(requestedFile);
    openFile(targetFile);
  } catch (err) {
    treeRoot.innerHTML = `<p style="font-size:12.5px; color:#ff7a90; padding:8px;">${err instanceof ApiError ? err.detail : 'Could not reach the API.'}</p>`;
  }
}

// -- build a nested {folder: {...}} structure from a flat list of paths ----
function buildTreeData(files) {
  const root = {};
  files.forEach(({ path, language }) => {
    const parts = path.split('/');
    let node = root;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        node[part] = { __file: true, path, language };
      } else {
        node[part] = node[part] || {};
        node = node[part];
      }
    });
  });
  return root;
}

function renderTree(obj) {
  const ul = document.createElement('ul');
  Object.keys(obj)
    .sort((a, b) => {
      const aIsFolder = !obj[a].__file;
      const bIsFolder = !obj[b].__file;
      if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
      return a.localeCompare(b);
    })
    .forEach((key) => {
      const value = obj[key];
      const li = document.createElement('li');
      li.className = 'tree-node';

      if (value.__file) {
        li.innerHTML = `
          <div class="tree-file" data-path="${value.path}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            ${key}
          </div>`;
        li.querySelector('.tree-file').addEventListener('click', () => openFile(value.path));
      } else {
        li.innerHTML = `
          <div class="tree-folder" data-toggle>
            <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            ${key}
          </div>`;
        li.appendChild(renderTree(value));
        li.querySelector('[data-toggle]').addEventListener('click', () => li.classList.toggle('collapsed'));
      }
      ul.appendChild(li);
    });
  return ul;
}

function revealInTree(path) {
  const el = document.querySelector(`.tree-file[data-path="${CSS.escape(path)}"]`);
  el?.scrollIntoView({ block: 'center' });
}

// -- search filter -----------------------------------------------------
document.getElementById('tree-search-input').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  treeRoot.querySelectorAll('.tree-node').forEach((node) => {
    const label = (node.querySelector('.tree-file, .tree-folder')?.textContent || '').toLowerCase();
    const hasMatchInside = q && Array.from(node.querySelectorAll('.tree-file')).some((f) => f.textContent.toLowerCase().includes(q));
    const isFolder = !!node.querySelector('.tree-folder');
    const matches = !q || label.includes(q) || hasMatchInside;
    node.classList.toggle('tree-hidden', !matches);
    if (q && matches && isFolder) node.classList.remove('collapsed');
  });
});

// -- preview -----------------------------------------------------------
async function openFile(path) {
  document.querySelectorAll('.tree-file').forEach((f) => f.classList.remove('active'));
  document.querySelector(`.tree-file[data-path="${CSS.escape(path)}"]`)?.classList.add('active');
  previewPathEl.textContent = path;
  previewBody.innerHTML = '<div class="preview-empty"><p>Loading…</p></div>';

  try {
    const file = await apiFetch(`/repos/${repoId}/files/content?path=${encodeURIComponent(path)}`);
    const lang = LANG_HLJS[file.language] || 'plaintext';
    previewBody.innerHTML = `
      <div class="preview-code glass">
        <pre><code class="language-${lang}">${escapeHtml(file.content)}</code></pre>
      </div>
      <div class="explain-panel glass" id="explain-panel">
        <span class="eyebrow">AI Explain</span>
        <p id="explain-text"></p>
      </div>
      <button class="btn btn-primary btn-sm" id="explain-btn" style="margin-top:16px;">✨ AI Explain this file</button>
    `;
    if (window.hljs) previewBody.querySelectorAll('code').forEach((el) => window.hljs.highlightElement(el));

    document.getElementById('explain-btn').addEventListener('click', () => explainFile(path));
  } catch (err) {
    previewBody.innerHTML = `<div class="preview-empty"><p>${err instanceof ApiError ? err.detail : 'Could not load this file.'}</p></div>`;
  }
}

async function explainFile(path) {
  const panel = document.getElementById('explain-panel');
  const textEl = document.getElementById('explain-text');
  const btn = document.getElementById('explain-btn');
  panel.classList.add('show');
  textEl.textContent = 'Thinking…';
  btn.disabled = true;

  try {
    const res = await apiFetch(`/repos/${repoId}/chat/ask`, {
      method: 'POST',
      body: JSON.stringify({ question: `Explain what ${path} does and why it's written this way.` }),
    });
    textEl.textContent = res.answer;
  } catch (err) {
    textEl.textContent = err instanceof ApiError ? err.detail : 'Could not reach the API.';
  } finally {
    btn.disabled = false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// mobile tree toggle
document.getElementById('mobile-tree-toggle')?.addEventListener('click', () => {
  document.getElementById('tree-pane').classList.toggle('show');
});

})();
