/* ==========================================================================
   RepoMind AI — Settings Interactions
   Every action here hits a real endpoint: PATCH /auth/me (profile, notifs,
   Gemini key), POST /auth/me/change-password, DELETE /auth/me.
   ========================================================================== */

const { apiFetch, ApiError, getUser, setUser, clearSession } = window.RepoMindAPI;

const toast = document.getElementById('save-toast');
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2500);
}

// -- load real user into the profile fields + gemini key + toggles --------
async function init() {
  try {
    const user = await apiFetch('/auth/me');
    setUser(user);
    window.RepoMindAPI.fillUserChrome();
    document.getElementById('set-name').value = user.name;
    document.getElementById('set-email').value = user.email;

    const prefs = user.preferences || {};
    document.querySelectorAll('.toggle[data-pref]').forEach((t) => {
      t.classList.toggle('on', Boolean(prefs[t.dataset.pref]));
    });
    if (prefs.gemini_api_key) {
      document.getElementById('gemini-key').value = prefs.gemini_api_key;
      document.getElementById('gemini-key-hint').textContent = 'Your saved key is in use for chat on this account.';
    }

    // OAuth-only accounts have no password yet — relabel the password card accordingly
    if (!user.oauth_provider) return;
    const pwForm = document.getElementById('password-form');
    const currentPwField = document.getElementById('set-current-pw').closest('.field');
    currentPwField.style.display = 'none';
    pwForm.closest('.settings-card').querySelector('.settings-sub').textContent =
      `Signed in with ${user.oauth_provider} — set a password here if you'd also like to log in with email.`;
  } catch {
    showToast('Could not load your account — try refreshing.');
  }
}
init();

// -- profile form -----------------------------------------------------
document.getElementById('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('set-name').value.trim();
  const email = document.getElementById('set-email').value.trim();
  try {
    const user = await apiFetch('/auth/me', { method: 'PATCH', body: JSON.stringify({ name, email }) });
    setUser(user);
    window.RepoMindAPI.fillUserChrome();
    showToast('Profile updated.');
  } catch (err) {
    showToast(err instanceof ApiError ? err.detail : 'Could not save changes.');
  }
});

// -- password form -----------------------------------------------------
document.getElementById('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('password-form-error');
  errorEl.style.display = 'none';
  const current_password = document.getElementById('set-current-pw').value;
  const new_password = document.getElementById('set-new-pw').value;

  if (new_password.length < 8) {
    errorEl.textContent = 'New password must be at least 8 characters.';
    errorEl.style.display = 'block';
    return;
  }

  try {
    await apiFetch('/auth/me/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: current_password || null, new_password }),
    });
    document.getElementById('set-current-pw').value = '';
    document.getElementById('set-new-pw').value = '';
    showToast('Password updated.');
  } catch (err) {
    errorEl.textContent = err instanceof ApiError ? err.detail : 'Could not update password.';
    errorEl.style.display = 'block';
  }
});

// -- gemini key ---------------------------------------------------------
document.getElementById('save-gemini-key').addEventListener('click', async () => {
  const key = document.getElementById('gemini-key').value.trim();
  try {
    await apiFetch('/auth/me', { method: 'PATCH', body: JSON.stringify({ gemini_api_key: key || null }) });
    showToast(key ? 'Gemini key saved.' : 'Gemini key cleared — using the server default.');
  } catch (err) {
    showToast(err instanceof ApiError ? err.detail : 'Could not save the key.');
  }
});

document.getElementById('reveal-key').addEventListener('click', (e) => {
  const input = document.getElementById('gemini-key');
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  e.target.textContent = isPassword ? 'HIDE' : 'SHOW';
});

// -- notification toggles: auto-save on click --------------------------
document.querySelectorAll('.toggle[data-pref]').forEach((t) => {
  t.addEventListener('click', async () => {
    const willBeOn = !t.classList.contains('on');
    t.classList.toggle('on', willBeOn);
    try {
      await apiFetch('/auth/me', { method: 'PATCH', body: JSON.stringify({ [t.dataset.pref]: willBeOn }) });
    } catch (err) {
      t.classList.toggle('on', !willBeOn); // revert on failure
      showToast(err instanceof ApiError ? err.detail : 'Could not save that preference.');
    }
  });
});

// -- danger zone: real account deletion ------------------------------
document.getElementById('delete-account-btn').addEventListener('click', async () => {
  const confirmed = window.confirm(
    'This permanently deletes your account and every repository, conversation, and file you\u2019ve indexed. This cannot be undone. Continue?'
  );
  if (!confirmed) return;

  try {
    await apiFetch('/auth/me', { method: 'DELETE' });
    clearSession();
    window.location.href = 'index.html';
  } catch (err) {
    showToast(err instanceof ApiError ? err.detail : 'Could not delete your account — try again.');
  }
});
