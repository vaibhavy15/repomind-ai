/* ==========================================================================
   RepoMind AI — Analytics Interactions
   Stats and chart data are mocked. Swap for GET /api/repos/:id/analytics
   once repo_parser.py actually computes these numbers.
   ========================================================================== */

const params = new URLSearchParams(window.location.search);
const repoName = params.get('repo') || 'payments-service';
document.getElementById('repo-crumb').textContent = repoName;
document.getElementById('sidebar-repo-name').textContent = repoName;

// -- tabs -----------------------------------------------------------------
document.querySelectorAll('.analytics-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.analytics-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.panel).classList.add('active');
  });
});

// -- charts -----------------------------------------------------------
Chart.defaults.color = '#767c9e';
Chart.defaults.font.family = "'Inter', sans-serif";

new Chart(document.getElementById('complexity-chart'), {
  type: 'bar',
  data: {
    labels: ['auth', 'api', 'db', 'services', 'chat', 'embeddings'],
    datasets: [{
      label: 'Cyclomatic complexity',
      data: [3.8, 5.1, 2.9, 6.4, 4.2, 3.1],
      backgroundColor: 'rgba(77,127,255,0.55)',
      borderRadius: 6,
      barThickness: 28,
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

new Chart(document.getElementById('language-chart'), {
  type: 'doughnut',
  data: {
    labels: ['Python', 'TypeScript', 'SQL', 'YAML'],
    datasets: [{
      data: [58, 30, 8, 4],
      backgroundColor: ['#4d7fff', '#4deaff', '#a855f7', '#454a6b'],
      borderColor: '#05060d',
      borderWidth: 3,
    }],
  },
  options: {
    animation: { duration: 1100, easing: 'easeOutQuart' },
    cutout: '68%',
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14, font: { size: 11 } } } },
  },
});

// -- animated stat count-up -------------------------------------------
document.querySelectorAll('[data-count]').forEach((el) => {
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
});
