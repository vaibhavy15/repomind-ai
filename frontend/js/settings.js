/* ==========================================================================
   RepoMind AI — Settings Interactions
   ========================================================================== */

document.querySelectorAll('.toggle').forEach((t) => {
  t.addEventListener('click', () => t.classList.toggle('on'));
});

const toast = document.getElementById('save-toast');
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2200);
}

document.querySelectorAll('[data-save-form]').forEach((form) => {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    showToast('Changes saved.');
  });
});

document.getElementById('reveal-key')?.addEventListener('click', (e) => {
  const input = document.getElementById('gemini-key');
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  e.target.textContent = isPassword ? 'HIDE' : 'SHOW';
});

document.getElementById('delete-account-btn')?.addEventListener('click', () => {
  const confirmed = window.confirm('This permanently deletes your account and all indexed repositories. This cannot be undone. Continue?');
  if (confirmed) showToast('Account deletion requested — this is a demo, nothing was actually deleted.');
});
