/* ==========================================================================
   RepoMind AI — Auth Interactions
   Client-side only for now: validates input shape and simulates the request.
   Swap the mockSubmit() calls for real POST /api/auth/* calls once the
   FastAPI backend is wired up.
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

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// -- password strength (signup only) ---------------------------------------
const passwordInput = document.getElementById('password');
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

// -- login form --------------------------------------------------------
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const emailField = document.getElementById('login-email-field');
    const passField = document.getElementById('login-password-field');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    setError(emailField, isValidEmail(email) ? '' : 'Enter a valid email address.');
    setError(passField, password.length > 0 ? '' : 'Enter your password.');
    if (!isValidEmail(email) || !password) return;

    mockSubmit(loginForm.querySelector('.auth-submit'), () => {
      window.location.href = 'dashboard.html';
    });
  });
}

// -- signup form -------------------------------------------------------
const signupForm = document.getElementById('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
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

    mockSubmit(signupForm.querySelector('.auth-submit'), () => {
      window.location.href = 'dashboard.html';
    });
  });
}

// -- forgot password form -----------------------------------------------
const forgotForm = document.getElementById('forgot-form');
if (forgotForm) {
  forgotForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const emailField = document.getElementById('forgot-email-field');
    const email = document.getElementById('forgot-email').value.trim();
    setError(emailField, isValidEmail(email) ? '' : 'Enter a valid email address.');
    if (!isValidEmail(email)) return;

    mockSubmit(forgotForm.querySelector('.auth-submit'), () => {
      document.getElementById('forgot-sent-email').textContent = email;
      document.getElementById('forgot-request-state').style.display = 'none';
      document.getElementById('forgot-success-state').style.display = 'block';
    });
  });
}
