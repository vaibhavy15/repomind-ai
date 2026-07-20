(function () {
  if (window.__repomind_loaded_readme) return;
  window.__repomind_loaded_readme = true;

/* ==========================================================================
   RepoMind AI — README Generator
   Real data from GET /repos/:id/readme. The download button creates a real
   .md file client-side via a Blob — no server round-trip needed for that part.
   ========================================================================== */

const { apiFetch, ApiError } = window.RepoMindAPI;
const params = new URLSearchParams(window.location.search);
const repoId = params.get('repo');

const content = document.getElementById('readme-content');
let currentMarkdown = '';
let currentRepoName = 'README';

if (!repoId) {
  window.renderNoRepoEmptyState(content, {
    title: 'No repository selected',
    message: 'Pick a repository to generate a README for. Open this page from a repository on your dashboard, or pick one below.',
  });
} else {
  init();
}

async function init() {
  try {
    const repo = await apiFetch(`/repos/${repoId}`);
    document.getElementById('repo-crumb').textContent = repo.name;
    document.getElementById('sidebar-repo-name').textContent = repo.name;
    currentRepoName = repo.name;

    if (repo.status !== 'indexed') {
      content.innerHTML = `<div class="readme-loading">This repository is still ${escapeHtml(repo.status)} — the README will generate automatically once indexing finishes.</div>`;
      return;
    }

    await generate();
  } catch (err) {
    content.innerHTML = `<div class="readme-error">${err instanceof ApiError ? escapeHtml(err.detail) : 'Could not reach the API.'}</div>`;
  }
}

async function generate() {
  content.innerHTML = '<div class="readme-loading">Generating README…</div>';
  try {
    const res = await apiFetch(`/repos/${repoId}/readme`);
    currentMarkdown = res.markdown;
    renderPreview(currentMarkdown);
  } catch (err) {
    content.innerHTML = `<div class="readme-error">${err instanceof ApiError ? escapeHtml(err.detail) : 'Could not generate a README right now.'}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderPreview(markdown) {
  content.innerHTML = `
    <div class="readme-toolbar">
      <div>
        <h1>README.md</h1>
        <p>Generated from ${escapeHtml(currentRepoName)}'s indexed file structure, language breakdown, and detected API endpoints.</p>
      </div>
      <div class="readme-toolbar-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="regen-btn">Regenerate</button>
        <button type="button" class="btn btn-primary btn-sm" id="download-btn">Download README.md</button>
      </div>
    </div>
    <div class="readme-card glass">
      <div class="msg-md" id="readme-preview"></div>
      <div class="readme-generated-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        This is a starting point generated from real repository data — review before publishing, especially the Usage and License sections.
      </div>
    </div>
  `;

  const previewEl = document.getElementById('readme-preview');
  previewEl.innerHTML = window.marked ? window.marked.parse(markdown) : markdown;
  if (window.hljs) previewEl.querySelectorAll('pre code').forEach((el) => window.hljs.highlightElement(el));

  document.getElementById('regen-btn').addEventListener('click', generate);
  document.getElementById('download-btn').addEventListener('click', downloadReadme);
}

function downloadReadme() {
  const blob = new Blob([currentMarkdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'README.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

})();
