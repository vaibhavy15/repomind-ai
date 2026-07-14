(function () {
  if (window.__repomind_loaded_oauth_callback) return;
  window.__repomind_loaded_oauth_callback = true;

  /* ==========================================================================
     RepoMind AI — OAuth Callback
     The backend redirects here two ways:
       - success: tokens in the URL fragment (#access_token=...&refresh_token=...)
         — fragments never reach any server, so this is the safe place for them
       - failure: ?error=... in the query string
     ========================================================================== */

  const { apiFetch, setTokens, setUser } = window.RepoMindAPI || {};

  function showError(message) {
    document.getElementById('callback-loading').style.display = 'none';
    document.getElementById('callback-error').style.display = 'block';
    document.getElementById('callback-error-text').textContent = message;
  }

  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (error) {
    showError(error);
    return;
  }

  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');

  if (!accessToken || !refreshToken) {
    showError('No sign-in tokens were returned. Please try again.');
    return;
  }

  setTokens({ access_token: accessToken, refresh_token: refreshToken, token_type: 'bearer' });

  apiFetch('/auth/me')
    .then((user) => {
      setUser(user);
      window.location.href = 'dashboard.html';
    })
    .catch(() => {
      // tokens were valid enough to be issued by us, so let the user in and
      // let the dashboard's own auth guard handle anything genuinely wrong
      window.location.href = 'dashboard.html';
    });
})();
