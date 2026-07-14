/* ==========================================================================
   RepoMind AI — Profile Page
   Name/email/plan/member-since, usage counters, and the activity feed are
   all real — GET /auth/me, GET /auth/me/usage, GET /auth/me/activity.
   ========================================================================== */

const { apiFetch } = window.RepoMindAPI || {};

const EVENT_ICONS = {
  question_asked: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  repo_connected: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  security_scan_viewed: '<path d="M12 2 4 6v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6z"/>',
  account_created: '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>',
};
const DEFAULT_ICON = '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>';

function timeAgo(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function init() {
  if (!apiFetch) return;

  try {
    const user = await apiFetch('/auth/me');
    window.RepoMindAPI.setUser(user);
    window.RepoMindAPI.fillUserChrome();
    document.getElementById('profile-name').textContent = user.name;
    document.getElementById('profile-email').textContent = user.email;
    document.getElementById('profile-plan-badge').textContent = `${user.plan} plan`;
    const memberSince = new Date(user.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    document.getElementById('profile-member-since').textContent = `Member since ${memberSince}`;
  } catch {
    /* keep placeholders if this fails */
  }

  try {
    const usage = await apiFetch('/auth/me/usage');
    document.getElementById('usage-repos').textContent = usage.repositories;
    document.getElementById('usage-questions').textContent = usage.questions_asked;
    document.getElementById('usage-files').textContent = usage.files_indexed;
    document.getElementById('usage-scans').textContent = usage.security_scans_run;
  } catch {
    document.querySelectorAll('.profile-usage .stat-tile-value').forEach((el) => (el.textContent = '—'));
  }

  const list = document.getElementById('activity-list');
  try {
    const events = await apiFetch('/auth/me/activity');
    if (!events.length) {
      list.innerHTML = '<div style="padding:12px 4px; font-size:13px; color:var(--ink-3);">No activity yet — connect a repository to get started.</div>';
      return;
    }
    list.innerHTML = events
      .map(
        (ev) => `
      <div class="activity-row">
        <div class="activity-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${EVENT_ICONS[ev.type] || DEFAULT_ICON}</svg></div>
        <div class="activity-text">${escapeHtml(ev.message)}</div>
        <div class="activity-time">${timeAgo(ev.created_at)}</div>
      </div>`
      )
      .join('');
  } catch {
    list.innerHTML = '<div style="padding:12px 4px; font-size:13px; color:#ff7a90;">Could not load recent activity.</div>';
  }
}

init();
