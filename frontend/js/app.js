(function () {
  // Guards against this script executing twice on the same page (e.g. a
  // duplicate <script> tag, a dev-server double-injection, or caching
  // quirks) — without this, a second run would crash on redeclaring the
  // top-level const/class bindings below.
  if (window.__repomind_loaded_app) return;
  window.__repomind_loaded_app = true;

/* ==========================================================================
   RepoMind AI — App Shell Interactions
   ========================================================================== */

// every page that includes this script is a logged-in page — bounce to
// login if there's no session, and fill in the real user's name/plan
window.RepoMindAPI?.requireAuth();
window.RepoMindAPI?.fillUserChrome();

// Fix for a real bug: sidebar links to repo-scoped pages (Chat, Explorer,
// Architecture, Analytics, Code Analyzer, README) didn't carry the current
// ?repo= forward, so clicking between them from anywhere except a repo's own
// dashboard card landed on a page with no repo context — stuck on permanent
// loading skeletons that look exactly like empty pages. This propagates it.
function propagateRepoParam() {
  const currentRepo = new URLSearchParams(window.location.search).get('repo');
  if (!currentRepo) return;
  const repoScopedPages = ['chat.html', 'explorer.html', 'architecture.html', 'analytics.html', 'code-analyzer.html', 'readme.html'];
  document.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href) return;
    const base = href.split('?')[0];
    if (repoScopedPages.includes(base) && !href.includes('repo=')) {
      a.setAttribute('href', `${base}?repo=${encodeURIComponent(currentRepo)}`);
    }
  });
}
propagateRepoParam();

// Shared empty state for any repo-scoped page opened without a valid
// ?repo= — replaces a target container with a clear message + CTA instead
// of leaving default "Loading…" skeletons stuck forever.
function renderNoRepoEmptyState(container, { title = 'No repository selected', message = 'Open this page from a repository on your dashboard, or pick one below.' } = {}) {
  if (!container) return;
  container.innerHTML = `
    <div class="page-empty-state">
      <div class="empty-icon-lg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
      <h2>${title}</h2>
      <p>${message}</p>
      <a href="dashboard.html" class="btn btn-primary btn-sm">Go to Dashboard</a>
    </div>
  `;
}
window.renderNoRepoEmptyState = renderNoRepoEmptyState;

const sidebar = document.querySelector('.sidebar');
const menuBtn = document.querySelector('.mobile-menu-btn');
if (menuBtn && sidebar) {
  menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
  document.addEventListener('click', (e) => {
    if (!sidebar.classList.contains('open')) return;
    if (sidebar.contains(e.target) || menuBtn.contains(e.target)) return;
    sidebar.classList.remove('open');
  });
}

// disabled nav items are inert — surface why, instead of dead-ending silently
document.querySelectorAll('.nav-item.disabled').forEach((item) => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
  });
});

// simple logout: any element with data-logout clears the session and redirects
document.querySelectorAll('[data-logout]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    window.RepoMindAPI?.clearSession();
    window.location.href = 'login.html';
  });
});

})();
