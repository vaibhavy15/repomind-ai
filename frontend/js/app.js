/* ==========================================================================
   RepoMind AI — App Shell Interactions
   ========================================================================== */

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
