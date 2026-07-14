(function () {
  // Guards against this script executing twice on the same page (e.g. a
  // duplicate <script> tag, a dev-server double-injection, or caching
  // quirks) — without this, a second run would crash on redeclaring the
  // top-level const/class bindings below.
  if (window.__repomind_loaded_analytics) return;
  window.__repomind_loaded_analytics = true;

/* ==========================================================================
   RepoMind AI — Analytics Interactions
   Stat tiles and the two charts come from the real GET /repos/:id/analytics
   call. Security findings, the API table, and performance issues stay as
   labeled illustrative content — the backend doesn't run a real scanner yet
   (see backend/app/api/routes/analytics.py).
   ========================================================================== */

const { apiFetch, ApiError } = window.RepoMindAPI;

const params = new URLSearchParams(window.location.search);
const repoId = params.get('repo');

Chart.defaults.color = '#8c8370';
Chart.defaults.font.family = "'Inter', sans-serif";

// -- tabs -----------------------------------------------------------------
document.querySelectorAll('.analytics-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.analytics-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.panel).classList.add('active');
  });
});

// -- animated stat count-up -------------------------------------------
function animateCount(el) {
  const target = Number(el.dataset.count);
  const suffix = el.dataset.suffix || '';
  const duration = 1000;
  const start = performance.now();
  function tick(t) {
    const p = Math.min(1, (t - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

if (!repoId) {
  document.getElementById('repo-crumb').textContent = 'no repository selected';
} else {
  init();
}

async function init() {
  try {
    const repo = await apiFetch(`/repos/${repoId}`);
    document.getElementById('repo-crumb').textContent = repo.name;
    document.getElementById('sidebar-repo-name').textContent = repo.name;

    const analytics = await apiFetch(`/repos/${repoId}/analytics`);
    const languages = analytics.languages || {};
    const languageEntries = Object.entries(languages).sort((a, b) => b[1] - a[1]);

    setStat('stat-files', analytics.file_count);
    setStat('stat-languages', languageEntries.length);
    setStat('stat-functions', analytics.function_count);
    setStat('stat-classes', analytics.class_count);
    setStat('stat-complexity', analytics.complexity_score);
    setStat('stat-security', analytics.security_score);
    setStat('stat-duplicate', analytics.duplicate_code_pct);

    renderShapeChart(analytics.function_count, analytics.class_count);
    renderLanguageChart(languageEntries);

    loadSecurityFindings();
    loadApiEndpoints();
    loadPerformanceIssues();
  } catch (err) {
    document.querySelector('.stat-grid').insertAdjacentHTML(
      'beforebegin',
      `<p style="color:#ff7a90; font-size:13px; margin-bottom:16px;">${err instanceof ApiError ? err.detail : 'Could not reach the API.'}</p>`
    );
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function loadSecurityFindings() {
  const list = document.getElementById('security-list');
  try {
    const findings = await apiFetch(`/repos/${repoId}/security`);
    if (!findings.length) {
      list.innerHTML = '<div style="padding:16px 4px; font-size:13px; color:var(--ink-2);">No findings from the current rule set — that\u2019s a good sign, not a guarantee.</div>';
      return;
    }
    list.innerHTML = findings
      .map(
        (f) => `
      <div class="finding-row glass">
        <span class="severity-badge severity-${f.severity}">${f.severity.charAt(0).toUpperCase() + f.severity.slice(1)}</span>
        <div>
          <div class="finding-title">${escapeHtml(f.title)}</div>
          <div class="finding-desc">${escapeHtml(f.description)}</div>
          <div class="finding-file">${escapeHtml(f.file_path)}${f.line ? ':' + f.line : ''}</div>
        </div>
      </div>`
      )
      .join('');
  } catch (err) {
    list.innerHTML = `<div style="padding:16px 4px; font-size:13px; color:#ff7a90;">${err instanceof ApiError ? err.detail : 'Could not load security findings.'}</div>`;
  }
}

async function loadApiEndpoints() {
  const body = document.getElementById('api-endpoints-body');
  try {
    const endpoints = await apiFetch(`/repos/${repoId}/api-endpoints`);
    if (!endpoints.length) {
      body.innerHTML = '<tr><td colspan="4" style="padding:16px 14px; color:var(--ink-2);">No FastAPI/Flask-style route decorators detected in this repo.</td></tr>';
      return;
    }
    body.innerHTML = endpoints
      .map(
        (ep) => `
      <tr>
        <td><span class="method-badge method-${ep.method.toLowerCase()}">${ep.method}</span></td>
        <td class="endpoint-path">${escapeHtml(ep.path)}</td>
        <td class="endpoint-auth">${ep.requires_auth ? 'Protected' : 'None detected'}</td>
        <td class="endpoint-auth">${escapeHtml(ep.file_path)}:${ep.line}</td>
      </tr>`
      )
      .join('');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="4" style="padding:16px 14px; color:#ff7a90;">${err instanceof ApiError ? err.detail : 'Could not load API endpoints.'}</td></tr>`;
  }
}

async function loadPerformanceIssues() {
  const list = document.getElementById('performance-list');
  try {
    const issues = await apiFetch(`/repos/${repoId}/performance`);
    if (!issues.length) {
      list.innerHTML = '<div style="padding:16px 4px; font-size:13px; color:var(--ink-2);">No performance issues flagged by the current checks.</div>';
      return;
    }
    list.innerHTML = issues
      .map(
        (issue) => `
      <div class="perf-row glass">
        <div><div class="finding-title">${escapeHtml(issue.title)}</div><div class="perf-issue">${escapeHtml(issue.description)}</div></div>
        <div class="perf-metric">${escapeHtml(issue.file_path)}${issue.line ? ':' + issue.line : ''}</div>
      </div>`
      )
      .join('');
  } catch (err) {
    list.innerHTML = `<div style="padding:16px 4px; font-size:13px; color:#ff7a90;">${err instanceof ApiError ? err.detail : 'Could not load performance issues.'}</div>`;
  }
}

function setStat(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.dataset.count = value ?? 0;
  animateCount(el);
}

function renderShapeChart(functionCount, classCount) {
  new Chart(document.getElementById('complexity-chart'), {
    type: 'bar',
    data: {
      labels: ['Functions', 'Classes'],
      datasets: [{
        data: [functionCount, classCount],
        backgroundColor: ['rgba(230,180,80,0.55)', 'rgba(209,86,124,0.55)'],
        borderRadius: 6,
        barThickness: 48,
      }],
    },
    options: {
      animation: { duration: 1100, easing: 'easeOutQuart' },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: 'rgba(255,255,255,0.06)' }, beginAtZero: true },
      },
    },
  });
}

function renderLanguageChart(languageEntries) {
  const palette = ['#e6b450', '#3ecfb2', '#d1567c', '#4f483a', '#d98a3d', '#ff7a90'];
  new Chart(document.getElementById('language-chart'), {
    type: 'doughnut',
    data: {
      labels: languageEntries.length ? languageEntries.map(([lang]) => lang) : ['No data'],
      datasets: [{
        data: languageEntries.length ? languageEntries.map(([, count]) => count) : [1],
        backgroundColor: languageEntries.length ? palette : ['#4f483a'],
        borderColor: '#0b0906',
        borderWidth: 3,
      }],
    },
    options: {
      animation: { duration: 1100, easing: 'easeOutQuart' },
      cutout: '68%',
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14, font: { size: 11 } } } },
    },
  });
}

})();
