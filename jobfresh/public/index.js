// ── State ──────────────────────────────────────────────────────────────────────
let allJobsCache = [];

// ── Utilities ──────────────────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function freshnessLabel(job) {
  if (job.status === 'closed') return `<span class="badge badge-closed">Closed</span>`;
  if (!job.freshness) return '';
  const map = {
    fresh:  '<span class="badge badge-fresh">Recently confirmed</span>',
    review: '<span class="badge badge-review">Confirmation needed</span>',
    stale:  '<span class="badge badge-stale">Potentially stale</span>',
  };
  let html = map[job.freshness] || '';
  if (job.isDuplicate) html += ' <span class="badge badge-dupe">Possible duplicate</span>';
  return html;
}

function actionButtons(job) {
  if (job.status === 'closed') return '<em style="color:var(--muted);font-size:12px;">Position closed</em>';
  return `<div class="action-group">
    <button class="action-btn ab-confirm" data-tip="Still hiring" onclick="confirmJob(${job.id})" aria-label="Still hiring">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 8.5L6.5 13L14 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <button class="action-btn ab-update" data-tip="Update posting" onclick="openUpdate(${job.id})" aria-label="Update posting">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11.5 2.5L13.5 4.5L5.5 12.5H3.5V10.5L11.5 2.5Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <button class="action-btn ab-close" data-tip="Close position" onclick="closeJob(${job.id})" aria-label="Close position">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3L13 13M13 3L3 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
    </button>
  </div>`;
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ── API calls ──────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Load Dashboard ─────────────────────────────────────────────────────────────
async function loadDashboard() {
  const [summary, jobs] = await Promise.all([
    api('GET', '/api/dashboard'),
    api('GET', '/api/jobs?status=active'),
  ]);

  allJobsCache = jobs;

  document.getElementById('c-total').textContent  = summary.totalActive;
  document.getElementById('c-fresh').textContent  = summary.fresh;
  document.getElementById('c-review').textContent = summary.reviewNeeded;
  document.getElementById('c-stale').textContent  = summary.stale;
  document.getElementById('c-dupe').textContent   = summary.possibleDupes;
  document.getElementById('c-closed').textContent = summary.totalClosed ?? 0;

  const feed = document.getElementById('dashboard-body');
  if (!jobs.length) {
    feed.innerHTML = '<p class="empty">No active listings.</p>';
  } else {
    feed.innerHTML = jobs.map(job => {
      const daysText = job.daysSinceActivity != null
        ? `${job.daysSinceActivity}d ago`
        : '';
      const reasonsHtml = job.reasons && job.reasons.length
        ? `<ul class="job-card-reasons">${job.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>`
        : '';
      const applicantsHtml = job.applicantsNeeded
        ? `<span class="job-card-applicants">${job.applicantsNeeded} needed</span>`
        : '';
      const flagsHtml = freshnessLabel(job)
        ? `<div class="job-card-flags">${freshnessLabel(job)}${applicantsHtml ? ' ' + applicantsHtml : ''}</div>`
        : (applicantsHtml ? `<div class="job-card-flags">${applicantsHtml}</div>` : '');

      return `
      <div class="job-card">
        <div class="job-card-top">
          <div class="job-card-title">${esc(job.title)}</div>
          <div class="job-card-icons">
            <div class="action-group">
              <button class="action-btn ab-confirm" data-tip="Still hiring" onclick="confirmJob(${job.id})" aria-label="Still hiring">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 8.5L6.5 13L14 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button class="action-btn ab-update" data-tip="Edit posting" onclick="openUpdate(${job.id})" aria-label="Edit posting">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11.5 2.5L13.5 4.5L5.5 12.5H3.5V10.5L11.5 2.5Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button class="action-btn ab-close" data-tip="Close position" onclick="closeJob(${job.id})" aria-label="Close position">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3L13 13M13 3L3 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </button>
            </div>
          </div>
        </div>
        <div class="job-card-meta">
          ${job.company ? `<span class="job-card-company">${esc(job.company)}</span>` : ''}
          ${daysText ? `<span class="job-card-dot">•</span><span class="job-card-days">${daysText}</span>` : ''}
        </div>
        <div class="job-card-desc">${esc(job.description || '')}</div>
        ${flagsHtml}
        ${reasonsHtml}
      </div>`;
    }).join('');
  }
}

// ── Load Review Queue ──────────────────────────────────────────────────────────
async function loadReviewQueue() {
  const jobs = await api('GET', '/api/review-queue');
  const tbody = document.getElementById('review-body');
  if (!jobs.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">All clear — no listings need review right now.</td></tr>';
    return;
  }
  tbody.innerHTML = jobs.map(job => `
    <tr>
      <td class="td-title">${esc(job.title)}</td>
      <td class="td-company">${esc(job.company)}</td>
      <td>${freshnessLabel(job)}</td>
      <td>
        <ul class="reasons">
          ${(job.reasons || []).map(r => `<li>${esc(r)}</li>`).join('')}
        </ul>
      </td>
      <td>${actionButtons(job)}</td>
    </tr>
  `).join('');
}

// ── Load All Jobs ──────────────────────────────────────────────────────────────
async function loadAllJobs() {
  const jobs = await api('GET', '/api/jobs?status=active');
  const tbody = document.getElementById('alljobs-body');
  if (!jobs.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No active listings.</td></tr>';
    return;
  }
  tbody.innerHTML = jobs.map(job => `
    <tr>
      <td class="td-title">${esc(job.title)}</td>
      <td class="td-company">${esc(job.company)}</td>
      <td class="td-days">${fmtDate(job.postedAt)}</td>
      <td class="td-days">${fmtDate(job.lastConfirmedAt)}</td>
      <td>${freshnessLabel(job)}</td>
      <td>${actionButtons(job)}</td>
    </tr>
  `).join('');
}

// ── Employer actions ───────────────────────────────────────────────────────────
async function confirmJob(id) {
  try {
    await api('POST', `/api/jobs/${id}/confirm`);
    toast('Confirmed as still hiring — freshness updated.');
    await refreshCurrentView();
  } catch(e) { toast('Error: ' + e.message); }
}

async function closeJob(id) {
  if (!confirm('Close this position? It will be removed from active listings.')) return;
  try {
    await api('POST', `/api/jobs/${id}/close`);
    toast('Position closed and removed from active listings.');
    await Promise.all([refreshCurrentView(), syncClosedState()]);
  } catch(e) { toast('Error: ' + e.message); }
}

function openUpdate(id) {
  const job = allJobsCache.find(j => j.id === id);
  if (!job) return;
  document.getElementById('modal-job-id').value = id;
  document.getElementById('modal-title').value  = job.title;
  document.getElementById('modal-desc').value   = job.description;
  document.getElementById('update-modal').classList.add('open');
}

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('update-modal').classList.remove('open');
});

document.getElementById('modal-save').addEventListener('click', async () => {
  const id    = document.getElementById('modal-job-id').value;
  const title = document.getElementById('modal-title').value.trim();
  const desc  = document.getElementById('modal-desc').value.trim();
  if (!title) { alert('Title is required.'); return; }
  try {
    await api('PATCH', `/api/jobs/${id}`, { title, description: desc });
    document.getElementById('update-modal').classList.remove('open');
    toast('Posting updated — freshness recalculated.');
    await refreshCurrentView();
  } catch(e) { toast('Error: ' + e.message); }
});

// ── Tabs ───────────────────────────────────────────────────────────────────────
let currentView = 'dashboard';

// ── Load Closed Jobs ───────────────────────────────────────────────────────────
async function loadClosedJobs() {
  const jobs  = await api('GET', '/api/jobs?status=closed');
  const tbody = document.getElementById('closed-body');
  if (!jobs.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No closed listings yet.</td></tr>';
    return;
  }
  tbody.innerHTML = jobs.map(job => `
    <tr>
      <td class="td-title">${esc(job.title)}</td>
      <td class="td-company">${esc(job.company)}</td>
      <td class="td-days">${fmtDate(job.postedAt)}</td>
      <td class="td-days">${job.closedAt ? fmtDate(job.closedAt) : '—'}</td>
    </tr>
  `).join('');
}

// Always keep the closed card count and closed tab in sync,
// regardless of which tab triggered the action.
async function syncClosedState() {
  const summary = await api('GET', '/api/dashboard');
  document.getElementById('c-closed').textContent = summary.totalClosed ?? 0;
  document.getElementById('c-total').textContent  = summary.totalActive;
  document.getElementById('c-fresh').textContent  = summary.fresh;
  document.getElementById('c-review').textContent = summary.reviewNeeded;
  document.getElementById('c-stale').textContent  = summary.stale;
  document.getElementById('c-dupe').textContent   = summary.possibleDupes;

  if (currentView === 'closed') await loadClosedJobs();
}

async function refreshCurrentView() {
  if (currentView === 'dashboard') await loadDashboard();
  else if (currentView === 'review') await loadReviewQueue();
  else if (currentView === 'alljobs') await loadAllJobs();
  else if (currentView === 'closed') await loadClosedJobs();
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', async () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    tab.classList.add('active');
    currentView = tab.dataset.view;
    document.getElementById('view-' + currentView).classList.add('active');
    await refreshCurrentView();
  });
});

// ── HTML escape ────────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Theme toggle ───────────────────────────────────────────────────────────────
(function () {
  const html    = document.documentElement;
  const toggle  = document.getElementById('theme-toggle');
  const STORAGE = 'jf-theme';

  function applyTheme(dark) {
    html.setAttribute('data-theme', dark ? 'dark' : 'light');
    toggle.checked = dark;
  }

  // Restore saved preference, default to dark
  const saved = localStorage.getItem(STORAGE);
  applyTheme(saved === null ? true : saved === 'dark');

  toggle.addEventListener('change', () => {
    const dark = toggle.checked;
    localStorage.setItem(STORAGE, dark ? 'dark' : 'light');
    applyTheme(dark);
  });
})();

// ── Init ───────────────────────────────────────────────────────────────────────
loadDashboard();
