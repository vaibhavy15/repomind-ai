(function () {
  // Guards against this script executing twice on the same page (e.g. a
  // duplicate <script> tag, a dev-server double-injection, or caching
  // quirks) — without this, a second run would crash on redeclaring the
  // top-level const/class bindings below.
  if (window.__repomind_loaded_auth) return;
  window.__repomind_loaded_auth = true;

/* ==========================================================================
   RepoMind AI — Auth Interactions
   Wired to the real FastAPI backend (js/api.js): signup, login, OAuth
   redirect, forgot/reset password all hit real endpoints.
   ========================================================================== */

document.querySelectorAll('.toggle-visibility').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = btn.closest('.field-input').querySelector('input');
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    btn.textContent = isPassword ? 'HIDE' : 'SHOW';
  });
});

function setError(field, message) {
  field.classList.toggle('has-error', Boolean(message));
  const errorEl = field.querySelector('.field-error');
  if (errorEl && message) errorEl.textContent = message;
}

function setFormError(el, message) {
  if (!el) return;
  el.textContent = message || '';
  el.style.display = message ? 'block' : 'none';
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// -- password strength (signup only) ---------------------------------------
const passwordInput = document.getElementById('password') || document.getElementById('signup-password');
const strengthEl = document.getElementById('strength');
if (passwordInput && strengthEl) {
  passwordInput.addEventListener('input', () => {
    const v = passwordInput.value;
    let score = 0;
    if (v.length >= 8) score++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
    if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) score++;
    strengthEl.classList.remove('weak', 'medium', 'strong');
    if (v.length === 0) return;
    strengthEl.classList.add(score <= 1 ? 'weak' : score === 2 ? 'medium' : 'strong');
  });
}

function withLoading(button, task) {
  const original = button.textContent;
  button.disabled = true;
  button.style.opacity = '0.7';
  button.textContent = 'Please wait…';
  return task().finally(() => {
    button.disabled = false;
    button.style.opacity = '1';
    button.textContent = original;
  });
}

function mockSubmit(button, onDone) {
  const original = button.textContent;
  button.disabled = true;
  button.style.opacity = '0.7';
  button.textContent = 'Please wait…';
  window.setTimeout(() => {
    button.disabled = false;
    button.style.opacity = '1';
    button.textContent = original;
    onDone();
  }, 900);
}

const { apiFetch, setTokens, setUser, ApiError } = window.RepoMindAPI || {};

// -- OAuth buttons: real links to the backend, disabled if unconfigured -----
const oauthButtons = document.querySelectorAll('[data-provider]');
if (oauthButtons.length && window.RepoMindAPI) {
  oauthButtons.forEach((btn) => {
    btn.href = `${window.RepoMindAPI.API_BASE}/auth/oauth/${btn.dataset.provider}/login`;
  });

  apiFetch('/auth/oauth/providers')
    .then((status) => {
      oauthButtons.forEach((btn) => {
        if (!status[btn.dataset.provider]) {
          btn.style.opacity = '0.45';
          btn.style.pointerEvents = 'none';
          btn.title = `${btn.dataset.provider} sign-in isn't configured on this server yet.`;
          const hint = document.getElementById('oauth-hint');
          if (hint) {
            hint.style.display = 'block';
            hint.textContent = 'Some sign-in options are disabled until the server owner configures OAuth credentials.';
          }
        }
      });
    })
    .catch(() => {
      /* if we can't even reach the API, the buttons will fail the same way the rest of the page does */
    });
}

async function completeLogin(tokens) {
  setTokens(tokens);
  try {
    const user = await apiFetch('/auth/me');
    setUser(user);
  } catch {
    /* non-fatal — dashboard will still work, just without a display name yet */
  }
  window.location.href = 'dashboard.html';
}

// -- login form --------------------------------------------------------
const loginForm = document.getElementById('login-form');
if (loginForm) {
  const formError = document.getElementById('login-form-error');
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    setFormError(formError, '');
    const emailField = document.getElementById('login-email-field');
    const passField = document.getElementById('login-password-field');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    setError(emailField, isValidEmail(email) ? '' : 'Enter a valid email address.');
    setError(passField, password.length > 0 ? '' : 'Enter your password.');
    if (!isValidEmail(email) || !password) return;

    withLoading(loginForm.querySelector('.auth-submit'), async () => {
      try {
        const tokens = await apiFetch('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        await completeLogin(tokens);
      } catch (err) {
        setFormError(formError, err instanceof ApiError ? err.detail : 'Something went wrong. Try again.');
      }
    });
  });
}

// -- signup form -------------------------------------------------------
const signupForm = document.getElementById('signup-form');
if (signupForm) {
  const formError = document.getElementById('signup-form-error');
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    setFormError(formError, '');
    const nameField = document.getElementById('signup-name-field');
    const emailField = document.getElementById('signup-email-field');
    const passField = document.getElementById('signup-password-field');
    const termsField = document.getElementById('signup-terms-field');

    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const terms = document.getElementById('signup-terms').checked;

    setError(nameField, name.length > 1 ? '' : 'Enter your full name.');
    setError(emailField, isValidEmail(email) ? '' : 'Enter a valid email address.');
    setError(passField, password.length >= 8 ? '' : 'Use at least 8 characters.');
    setError(termsField, terms ? '' : 'You need to accept the terms to continue.');

    if (name.length <= 1 || !isValidEmail(email) || password.length < 8 || !terms) return;

    withLoading(signupForm.querySelector('.auth-submit'), async () => {
      try {
        const tokens = await apiFetch('/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ name, email, password }),
        });
        await completeLogin(tokens);
      } catch (err) {
        setFormError(formError, err instanceof ApiError ? err.detail : 'Something went wrong. Try again.');
      }
    });
  });
}

// -- forgot password: real API call ---------------------------------------
const forgotForm = document.getElementById('forgot-form');
if (forgotForm) {
  const formError = document.getElementById('forgot-form-error');
  forgotForm.addEventListener('submit', (e) => {
    e.preventDefault();
    setFormError(formError, '');
    const emailField = document.getElementById('forgot-email-field');
    const email = document.getElementById('forgot-email').value.trim();
    setError(emailField, isValidEmail(email) ? '' : 'Enter a valid email address.');
    if (!isValidEmail(email)) return;

    withLoading(forgotForm.querySelector('.auth-submit'), async () => {
      try {
        const res = await apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
        document.getElementById('forgot-sent-email').textContent = email;
        // Dev mode only: the backend hands back the reset link directly since
        // no email provider is configured yet (see backend/README.md).
        if (res && res.dev_reset_link) {
          document.getElementById('forgot-success-message').innerHTML =
            `No email service is configured yet, so here's your reset link directly (dev mode only): ` +
            `<a href="${res.dev_reset_link}" style="color:var(--cyan);">${res.dev_reset_link}</a>`;
        }
        document.getElementById('forgot-request-state').style.display = 'none';
        document.getElementById('forgot-success-state').style.display = 'block';
      } catch (err) {
        setFormError(formError, err instanceof ApiError ? err.detail : 'Something went wrong. Try again.');
      }
    });
  });
}

// -- reset password: real API call, triggered by ?token= in the URL -------
const resetForm = document.getElementById('reset-form');
if (resetForm) {
  const resetToken = new URLSearchParams(window.location.search).get('token');
  if (resetToken) {
    document.getElementById('forgot-request-state').style.display = 'none';
    document.getElementById('reset-form-state').style.display = 'block';
  }

  const formError = document.getElementById('reset-form-error');
  resetForm.addEventListener('submit', (e) => {
    e.preventDefault();
    setFormError(formError, '');
    const passField = document.getElementById('reset-password-field');
    const newPassword = document.getElementById('reset-password').value;
    setError(passField, newPassword.length >= 8 ? '' : 'Use at least 8 characters.');
    if (newPassword.length < 8) return;

    withLoading(resetForm.querySelector('.auth-submit'), async () => {
      try {
        await apiFetch('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token: resetToken, new_password: newPassword }),
        });
        document.getElementById('reset-form-state').style.display = 'none';
        document.getElementById('reset-success-state').style.display = 'block';
      } catch (err) {
        setFormError(formError, err instanceof ApiError ? err.detail : 'That reset link is invalid or expired — request a new one.');
      }
    });
  });
}

})();
