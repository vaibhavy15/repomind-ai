/* ==========================================================================
   RepoMind AI — Dashboard Interactions
   The staged loader is fully client-side theatre for now — swap dispatchStages()
   for a WebSocket/poll against POST /api/repos once indexing is real.
   ========================================================================== */

const overlay = document.getElementById('upload-overlay');
const openBtns = document.querySelectorAll('[data-open-upload]');
const closeBtn = document.getElementById('modal-close');
const modalHead = document.getElementById('modal-head');
const uploadForm = document.getElementById('upload-form');
const stageLoader = document.getElementById('stage-loader');
const stageDoneActions = document.getElementById('stage-done-actions');

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
  stageLoader.classList.remove('active');
  stageDoneActions.classList.remove('show');
  document.querySelectorAll('.stage-row').forEach((r) => r.classList.remove('active', 'done'));
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
    if (file) showFileName(file.name);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) showFileName(fileInput.files[0].name);
  });
}
function showFileName(name) {
  dropzone.classList.add('has-file');
  dropzone.querySelector('p').textContent = name;
}

// -- submit -> staged loader -------------------------------------------
uploadForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const activePanel = document.querySelector('.upload-panel.active');
  let repoLabel = 'uploaded-project';
  if (activePanel.id === 'panel-url') {
    const url = document.getElementById('github-url').value.trim();
    if (!url) return;
    repoLabel = url.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '') || repoLabel;
  } else if (fileInput.files[0]) {
    repoLabel = fileInput.files[0].name.replace(/\.zip$/i, '');
  } else {
    return;
  }

  modalHead.style.display = 'none';
  uploadForm.style.display = 'none';
  stageLoader.classList.add('active');
  runStages(repoLabel);
});

const STAGES = [
  'Reading files…',
  'Parsing code…',
  'Generating embeddings…',
  'Building knowledge graph…',
  'Analyzing dependencies…',
];

function runStages(repoLabel) {
  const rows = Array.from(document.querySelectorAll('.stage-row'));
  const footer = document.getElementById('stage-footer-text');
  let i = 0;

  function next() {
    if (i > 0) { rows[i - 1].classList.remove('active'); rows[i - 1].classList.add('done'); }
    if (i >= rows.length) {
      footer.textContent = 'Finished.';
      document.getElementById('stage-ring-wrap').style.opacity = '0';
      stageDoneActions.classList.add('show');
      addRepoCard(repoLabel);
      return;
    }
    rows[i].classList.add('active');
    footer.textContent = STAGES[i];
    i++;
    window.setTimeout(next, 700 + Math.random() * 500);
  }
  next();
}

function addRepoCard(repoLabel) {
  const grid = document.getElementById('repo-grid');
  const slug = repoLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'new-repo';
  const card = document.createElement('article');
  card.className = 'repo-card glass';
  card.innerHTML = `
    <div class="repo-card-top">
      <div class="repo-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
      <span class="repo-status"><span></span>Indexed</span>
    </div>
    <div>
      <div class="repo-name">${repoLabel}</div>
      <div class="repo-path">just now · ${Math.floor(200 + Math.random() * 900)} files</div>
    </div>
    <div class="repo-lang-row">
      <span class="lang-chip">Python</span><span class="lang-chip">TypeScript</span>
    </div>
    <div class="repo-stats">
      <div class="repo-stat"><b>${Math.floor(40 + Math.random() * 200)}</b><span>Functions</span></div>
      <div class="repo-stat"><b>${Math.floor(4 + Math.random() * 40)}</b><span>Classes</span></div>
      <div class="repo-stat"><b>${(3 + Math.random() * 4).toFixed(1)}</b><span>Complexity</span></div>
    </div>
    <div class="repo-card-actions">
      <a href="chat.html?repo=${encodeURIComponent(slug)}" class="btn btn-primary btn-sm">Open Chat</a>
      <a href="#" class="btn btn-ghost btn-sm">Explore</a>
    </div>
  `;
  const connectCard = grid.querySelector('.repo-connect-card');
  grid.insertBefore(card, connectCard.nextSibling);

  document.getElementById('open-new-chat').href = `chat.html?repo=${encodeURIComponent(slug)}`;
  document.getElementById('open-new-chat-label').textContent = repoLabel;
}

document.getElementById('modal-back-to-dash')?.addEventListener('click', closeModal);
