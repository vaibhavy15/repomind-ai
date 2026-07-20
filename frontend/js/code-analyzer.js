(function () {
  if (window.__repomind_loaded_code_analyzer) return;
  window.__repomind_loaded_code_analyzer = true;

/* ==========================================================================
   RepoMind AI — Code Analyzer
   Real data from GET /repos/:id/code-analysis — quality score, complexity,
   bugs, security issues, performance suggestions, and recommendations
   synthesized from those same findings (see quality_service.py).
   ========================================================================== */

const { apiFetch, ApiError } = window.RepoMindAPI;
const params = new URLSearchParams(window.location.search);
const repoId = params.get('repo');

const content = document.getElementById('analyzer-content');

if (!repoId) {
  window.renderNoRepoEmptyState(content, {
    title: 'No repository selected',
    message: 'The Code Analyzer needs a repository to inspect. Open this page from a repository on your dashboard, or pick one below.',
  });
} else {
  init();
}

async function init() {
  try {
    const repo = await apiFetch(`/repos/${repoId}`);
    document.getElementById('repo-crumb').textContent = repo.name;
    document.getElementById('sidebar-repo-name').textContent = repo.name;

    if (repo.status !== 'indexed') {
      content.innerHTML = `<div class="analyzer-loading">This repository is still ${escapeHtml(repo.status)} — analysis will run automatically once indexing finishes. Check back from the dashboard.</div>`;
      return;
    }

    const data = await apiFetch(`/repos/${repoId}/code-analysis`);
    render(data);
  } catch (err) {
    content.innerHTML = `<div class="analyzer-error">${err instanceof ApiError ? escapeHtml(err.detail) : 'Could not reach the API.'}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function findingRow(f) {
  return `
    <div class="finding-row glass">
      <span class="severity-badge severity-${f.severity}">${f.severity.charAt(0).toUpperCase() + f.severity.slice(1)}</span>
      <div>
        <div class="finding-title">${escapeHtml(f.title)}</div>
        <div class="finding-desc">${escapeHtml(f.description)}</div>
        <div class="finding-file">${escapeHtml(f.file_path)}${f.line ? ':' + f.line : ''}</div>
      </div>
    </div>`;
}

function emptyTab(message) {
  return `<div style="padding:16px 4px; font-size:13px; color:var(--ink-2);">${message}</div>`;
}

function render(data) {
  const score = data.quality_score;
  const circumference = 2 * Math.PI * 51; // r=51 in the SVG below
  const offset = circumference * (1 - score / 100);

  content.innerHTML = `
    <div class="score-hero glass">
      <div class="score-ring-wrap">
        <svg viewBox="0 0 120 120">
          <circle class="score-ring-bg" cx="60" cy="60" r="51"></circle>
          <circle class="score-ring-fg" cx="60" cy="60" r="51" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}"></circle>
        </svg>
        <div class="score-ring-label"><span class="num">${Math.round(score)}</span><span class="denom">/ 100</span></div>
      </div>
      <div class="score-hero-meta">
        <h2>Code Quality Score</h2>
        <p>Derived from real security findings, bug patterns, and performance issue density across ${data.file_count} indexed files — not a fixed or estimated number.</p>
      </div>
      <div class="mini-stat-row">
        <div class="mini-stat"><b>${data.complexity_score}</b><span>Complexity</span></div>
        <div class="mini-stat"><b>${data.security_score}</b><span>Security</span></div>
        <div class="mini-stat"><b>${data.duplicate_code_pct}%</b><span>Duplicate</span></div>
        <div class="mini-stat"><b>${data.function_count}</b><span>Functions</span></div>
        <div class="mini-stat"><b>${data.class_count}</b><span>Classes</span></div>
      </div>
    </div>

    <div class="recommend-card glass">
      <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>Recommendations</h3>
      <div class="recommend-list">
        ${data.recommendations.map((r) => `<div class="recommend-row"><span class="dot"></span><span>${escapeHtml(r)}</span></div>`).join('')}
      </div>
    </div>

    <div class="tab-row glass">
      <button class="analytics-tab active" data-panel="panel-bugs">Potential Bugs</button>
      <button class="analytics-tab" data-panel="panel-security">Security Issues</button>
      <button class="analytics-tab" data-panel="panel-perf">Performance Suggestions</button>
    </div>

    <div class="tab-panel active" id="panel-bugs">
      <div class="finding-list">${data.bugs.length ? data.bugs.map(findingRow).join('') : emptyTab('No common bug patterns (bare except, mutable defaults, unreachable code, == None) detected.')}</div>
    </div>
    <div class="tab-panel" id="panel-security">
      <div class="finding-list">${data.security_issues.length ? data.security_issues.map(findingRow).join('') : emptyTab('No security findings from the current rule set.')}</div>
    </div>
    <div class="tab-panel" id="panel-perf">
      <div class="finding-list">${data.performance_suggestions.length ? data.performance_suggestions.map(findingRow).join('') : emptyTab('No performance issues flagged by the current checks.')}</div>
    </div>
  `;

  // animate the score ring in on the next frame so the CSS transition applies
  requestAnimationFrame(() => {
    content.querySelector('.score-ring-fg').style.strokeDashoffset = String(offset);
  });

  content.querySelectorAll('.analytics-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      content.querySelectorAll('.analytics-tab').forEach((t) => t.classList.remove('active'));
      content.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.panel).classList.add('active');
    });
  });
}

})();
