(function () {
  // Guards against this script executing twice on the same page (e.g. a
  // duplicate <script> tag, a dev-server double-injection, or caching
  // quirks) — without this, a second run would crash on redeclaring the
  // top-level const/class bindings below.
  if (window.__repomind_loaded_api) return;
  window.__repomind_loaded_api = true;

/* ==========================================================================
   RepoMind AI — API Client
   Loaded on every logged-in page before the page-specific script. Set
   window.REPOMIND_API_BASE before this script if the backend isn't on
   http://localhost:8000 (e.g. in index.html: <script>window.REPOMIND_API_BASE = '...'</script>).
   ========================================================================== */

const API_BASE =
  window.REPOMIND_API_BASE ||
  (window.location.hostname === "localhost"
    ? "http://localhost:8000/api"
    : "https://repomind-ai-1-ebwn.onrender.com/api");
const TOKENS_KEY = 'repomind_tokens';
const USER_KEY = 'repomind_user';

function getTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) || 'null');
  } catch {
    return null;
  }
}

function setTokens(tokens) {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

function clearSession() {
  localStorage.removeItem(TOKENS_KEY);
  localStorage.removeItem(USER_KEY);
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

async function refreshAccessToken() {
  const tokens = getTokens();
  if (!tokens?.refresh_token) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refresh_token }),
    });
    if (!res.ok) return null;
    const fresh = await res.json();
    setTokens(fresh);
    return fresh;
  } catch {
    return null;
  }
}

/**
 * Authenticated fetch. Adds the bearer token, retries once via refresh on a
 * 401, and redirects to login if the session can't be recovered. Returns the
 * parsed JSON body; throws an ApiError (with .status and .detail) on failure.
 */
async function apiFetch(path, options = {}) {
  const tokens = getTokens();
  const isForm = options.body instanceof FormData;
  const headers = new Headers(options.headers || {});
  if (!isForm && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (tokens?.access_token) headers.set('Authorization', `Bearer ${tokens.access_token}`);

  const doFetch = () => fetch(`${API_BASE}${path}`, { ...options, headers });

  let res;
  try {
    res = await doFetch();
  } catch (err) {
    throw new ApiError(0, 'Could not reach the RepoMind API — is the backend running?');
  }

  if (res.status === 401 && tokens?.refresh_token) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      headers.set('Authorization', `Bearer ${fresh.access_token}`);
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } else {
      clearSession();
      window.location.href = 'login.html';
      throw new ApiError(401, 'Session expired');
    }
  }

  if (res.status === 204) return null;

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* no JSON body */
  }

  if (!res.ok) {
    const detail = (body && (body.detail || body.message)) || `Request failed (${res.status})`;
    throw new ApiError(res.status, typeof detail === 'string' ? detail : JSON.stringify(detail));
  }

  return body;
}

class ApiError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

function requireAuth() {
  if (!getTokens()?.access_token) {
    window.location.href = 'login.html';
  }
}

function fillUserChrome() {
  const user = getUser();
  if (!user) return;
  document.querySelectorAll('.sidebar-user-name').forEach((el) => (el.textContent = user.name));
  document.querySelectorAll('.sidebar-user-plan').forEach((el) => (el.textContent = `${user.plan || 'solo'} plan`));
}

window.RepoMindAPI = {
  API_BASE,
  ApiError,
  apiFetch,
  getTokens,
  setTokens,
  clearSession,
  getUser,
  setUser,
  requireAuth,
  fillUserChrome,
};

})();
