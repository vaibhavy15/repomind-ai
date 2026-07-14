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
