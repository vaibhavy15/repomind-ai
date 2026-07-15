(function () {
  // Guards against this script executing twice on the same page (e.g. a
  // duplicate <script> tag, a dev-server double-injection, or caching
  // quirks) — without this, a second run would crash on redeclaring the
  // top-level const/class bindings below.
  if (window.__repomind_loaded_dashboard) return;
  window.__repomind_loaded_dashboard = true;

/* ==========================================================================
   RepoMind AI — Dashboard Interactions
   Real API calls via js/api.js. Indexing has no per-stage signal from the
   backend, so the staged loader shows a client-side stage animation for feel
   while a separate poll loop checks the real repository status to decide
   when to actually finish or fail.
   ========================================================================== */

const { apiFetch, ApiError, getUser } = window.RepoMindAPI;

const overlay = document.getElementById('upload-overlay');
const openBtns = document.querySelectorAll('[data-open-upload]');
const closeBtn = document.getElementById('modal-close');
const modalHead = document.getElementById('modal-head');
const uploadForm = document.getElementById('upload-form');
const stageLoader = document.getElementById('stage-loader');
const stageDoneActions = document.getElementById('stage-done-actions');
const repoGrid = document.getElementById('repo-grid');

// -- greeting -----------------------------------------------------------
const user = getUser();
if (user) document.getElementById('dash-greeting').textContent = `Welcome back, ${user.name.split(' ')[0]}`;

// -- load real repos on page load ------------------------------------------
let backgroundPollTimer = null;

async function loadRepos() {
  const subhead = document.getElementById('dash-subhead');
  try {
    const repos = await apiFetch('/repos');
    document.querySelectorAll('.repo-card').forEach((el) => el.remove());
    repos
      .slice()
      .reverse()
      .forEach((repo) => insertRepoCard(repo));
    subhead.textContent = repos.length
      ? `${repos.length} ${repos.length === 1 ? 'repository' : 'repositories'} connected · ask any of them a question in Chat`
      : 'Connect your first repository to get started.';

    const stillWorking = repos.some((r) => r.status === 'indexing' || r.status === 'pending');
    if (stillWorking && !backgroundPollTimer) {
      backgroundPollTimer = window.setInterval(async () => {
        const fresh = await apiFetch('/repos').catch(() => null);
        if (!fresh) return;
        if (!fresh.some((r) => r.status === 'indexing' || r.status === 'pending')) {
          window.clearInterval(backgroundPollTimer);
          backgroundPollTimer = null;
        }
        document.querySelectorAll('.repo-card').forEach((el) => el.remove());
        fresh.slice().reverse().forEach((repo) => insertRepoCard(repo));
      }, 3000);
    }
  } catch (err) {
    subhead.textContent = err instanceof ApiError ? `Couldn't load repositories: ${err.detail}` : 'Could not reach the API.';
  }
}
loadRepos();

function openModal() {
  overlay.classList.add('open');
  resetModal();
}
function closeModal() { overlay.classList.remove('open'); }

openBtns.forEach((btn) => btn.addEventListener('click', openModal));
closeBtn.addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

function resetModal() {
  modalHead.style.display = 'flex';
  uploadForm.style.display = 'block';
  uploadForm.reset();
  document.getElementById('dropzone')?.classList.remove('has-file');
  const dzp = document.querySelector('#dropzone p');
  if (dzp) dzp.textContent = 'Drag and drop a .zip, or click to browse';
  stageLoader.classList.remove('active');
  stageDoneActions.classList.remove('show');
  document.querySelectorAll('.stage-row').forEach((r) => r.classList.remove('active', 'done', 'error'));
  document.getElementById('stage-ring-wrap').style.opacity = '1';
  setModalError('');
}

function setModalError(message) {
  let el = document.getElementById('modal-error');
  if (!el) {
    el = document.createElement('p');
    el.id = 'modal-error';
    el.style.cssText = 'color:#ff7a90; font-size:12.5px; margin-top:14px; text-align:center;';
    uploadForm.appendChild(el);
  }
  el.textContent = message;
}

// -- upload tabs (GitHub URL vs ZIP) --------------------------------------
document.querySelectorAll('.upload-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.upload-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.upload-panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.panel).classList.add('active');
  });
});

// -- dropzone --------------------------------------------------------------
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('zip-input');
if (dropzone) {
  dropzone.addEventListener('click', () => fileInput.click());
  ['dragenter', 'dragover'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('drag-over'); })
  );
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) {
      fileInput.files = e.dataTransfer.files;
      showFileName(file.name);
    }
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) showFileName(fileInput.files[0].name);
  });
}
function showFileName(name) {
  dropzone.classList.add('has-file');
  dropzone.querySelector('p').textContent = name;
}

// -- submit -> real connect call -> staged loader -------------------------
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  setModalError('');
  const activePanel = document.querySelector('.upload-panel.active');

  let repo;
  try {
    if (activePanel.id === 'panel-url') {
      const url = document.getElementById('github-url').value.trim();
      if (!url) return;
      repo = await apiFetch('/repos', { method: 'POST', body: JSON.stringify({ github_url: url }) });
    } else {
      if (!fileInput.files[0]) return;
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      repo = await apiFetch('/repos/upload', { method: 'POST', body: formData });
    }
  } catch (err) {
    setModalError(err instanceof ApiError ? err.detail : 'Could not reach the API.');
    return;
  }

  modalHead.style.display = 'none';
  uploadForm.style.display = 'none';
  stageLoader.classList.add('active');
  runStagesAndPoll(repo.id);
});

const STAGE_LABELS = [
  'Reading files…',
  'Parsing code…',
  'Generating embeddings…',
  'Building knowledge graph…',
  'Analyzing dependencies…',
];

// Advances the visual stage list on a timer (purely cosmetic — the backend
// doesn't report per-stage progress), while a separate poll loop checks the
// real repository status and decides when to actually finish or fail.
function runStagesAndPoll(repoId) {
  const rows = Array.from(document.querySelectorAll('.stage-row'));
  const footer = document.getElementById('stage-footer-text');
  let visualStage = 0;
  let finished = false;

  const stageTimer = window.setInterval(() => {
    if (finished || visualStage >= rows.length) return;
    if (visualStage > 0) rows[visualStage - 1].classList.add('done');
    rows[visualStage].classList.add('active');
    footer.textContent = STAGE_LABELS[visualStage];
    visualStage++;
  }, 900);

  const poll = window.setInterval(async () => {
    let repo;
    try {
      repo = await apiFetch(`/repos/${repoId}`);
    } catch {
      return; // transient network hiccup — keep polling
    }

    if (repo.status === 'indexed') {
      finished = true;
      window.clearInterval(stageTimer);
      window.clearInterval(poll);
      rows.forEach((r) => { r.classList.remove('active'); r.classList.add('done'); });
      footer.textContent = 'Finished.';
      document.getElementById('stage-ring-wrap').style.opacity = '0';
      stageDoneActions.classList.add('show');
      document.getElementById('open-new-chat').href = `chat.html?repo=${encodeURIComponent(repo.id)}`;
      document.getElementById('open-new-chat-label').textContent = repo.name;
      loadRepos();
    } else if (repo.status === 'failed') {
      finished = true;
      window.clearInterval(stageTimer);
      window.clearInterval(poll);
      rows[Math.max(0, visualStage - 1)]?.classList.add('error');
      footer.textContent = repo.failure_reason || 'Indexing failed — check the URL is public and reachable, or try a smaller ZIP.';
      document.getElementById('stage-ring-wrap').style.opacity = '0';
      loadRepos();
    }
  }, 1500);
}

function insertRepoCard(repo) {
  const card = document.createElement('article');
  card.className = 'repo-card glass';
  const isIndexed = repo.status === 'indexed';
  const statusLabel = { indexed: 'Indexed', indexing: 'Indexing…', pending: 'Pending', failed: 'Failed' }[repo.status] || repo.status;
  card.innerHTML = `
    <div class="repo-card-top">
      <div class="repo-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
      <span class="repo-status"><span></span>${statusLabel}</span>
    </div>
    <div>
      <div class="repo-name">${escapeHtml(repo.name)}</div>
      <div class="repo-path">${repo.source_type === 'github' ? 'GitHub' : 'ZIP upload'} · ${new Date(repo.created_at).toLocaleDateString()}</div>
      ${repo.status === 'failed' && repo.failure_reason ? `<div style="font-size:11.5px; color:#ff7a90; margin-top:6px; line-height:1.5;">${escapeHtml(repo.failure_reason)}</div>` : ''}
    </div>
    <div class="repo-stats">
      <div class="repo-stat"><b>${repo.file_count}</b><span>Files</span></div>
      <div class="repo-stat"><b>${repo.function_count}</b><span>Functions</span></div>
      <div class="repo-stat"><b>${repo.class_count}</b><span>Classes</span></div>
    </div>
    <div class="repo-card-actions">
      ${
        repo.status === 'failed'
          ? `<button type="button" class="btn btn-ghost btn-sm delete-repo-btn" data-repo-id="${repo.id}" style="flex:1; justify-content:center;">Delete</button>`
          : `<a href="chat.html?repo=${encodeURIComponent(repo.id)}" class="btn btn-primary btn-sm" ${isIndexed ? '' : 'aria-disabled="true" style="pointer-events:none; opacity:.5;"'}>Open Chat</a>
             <a href="explorer.html?repo=${encodeURIComponent(repo.id)}" class="btn btn-ghost btn-sm" ${isIndexed ? '' : 'aria-disabled="true" style="pointer-events:none; opacity:.5;"'}>Explore</a>`
      }
    </div>
  `;
  const connectCard = repoGrid.querySelector('.repo-connect-card');
  repoGrid.insertBefore(card, connectCard.nextSibling);

  card.querySelector('.delete-repo-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Deleting…';
    try {
      await apiFetch(`/repos/${btn.dataset.repoId}`, { method: 'DELETE' });
      card.remove();
    } catch {
      btn.disabled = false;
      btn.textContent = 'Delete';
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.getElementById('modal-back-to-dash')?.addEventListener('click', closeModal);

})();
