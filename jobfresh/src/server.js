const express = require('express');
const path = require('path');
const db = require('./db');
const { analyseAll, buildDashboard } = require('./freshness');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Helpers ───────────────────────────────────────────────────────────────────

function allActiveJobs() {
  return db.all(j => j.status === 'active')
           .sort((a, b) => b.postedAt.localeCompare(a.postedAt));
}

function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// ── API routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/dashboard
 * Returns summary counts for the admin dashboard.
 */
app.get('/api/dashboard', (req, res) => {
  const active    = allActiveJobs();
  const annotated = analyseAll(active);
  // Merge annotated active jobs with raw closed jobs so buildDashboard sees all
  const closed    = db.all(j => j.status === 'closed');
  const summary   = buildDashboard([...annotated, ...closed]);
  res.json(summary);
});

/**
 * GET /api/jobs
 * Returns jobs annotated with freshness.
 * Query param: ?status=active|closed  (optional filter)
 */
app.get('/api/jobs', (req, res) => {
  const { status } = req.query;
  let rows;
  if (status === 'active') {
    rows = allActiveJobs();
  } else if (status === 'closed') {
    rows = db.all(j => j.status === 'closed')
             .sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  } else {
    rows = db.all().sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  }

  const activeRows  = rows.filter(j => j.status === 'active');
  const closedRows  = rows.filter(j => j.status === 'closed');
  const annotated   = analyseAll(activeRows);

  res.json([...annotated, ...closedRows]);
});

/**
 * GET /api/review-queue
 * Returns active jobs needing attention: review, stale, or duplicate.
 */
app.get('/api/review-queue', (req, res) => {
  const active    = allActiveJobs();
  const annotated = analyseAll(active);
  const flagged   = annotated.filter(j =>
    j.freshness === 'review' || j.freshness === 'stale' || j.isDuplicate
  );
  res.json(flagged);
});

/**
 * POST /api/jobs/:id/confirm
 * Employer confirms still hiring — updates lastConfirmedAt, recalculates freshness.
 */
app.post('/api/jobs/:id/confirm', (req, res) => {
  const id  = parseInt(req.params.id, 10);
  const job = db.get(j => j.id === id);
  if (!job)               return res.status(404).json({ error: 'Job not found.' });
  if (job.status !== 'active') return res.status(400).json({ error: 'Job is not active.' });

  const ts = now();
  db.update(j => j.id === id, { lastConfirmedAt: ts, lastUpdatedAt: ts });

  const updated  = db.get(j => j.id === id);
  const active   = allActiveJobs();
  const annotated = analyseAll(active);
  const result   = annotated.find(j => j.id === id);
  res.json(result);
});

/**
 * PATCH /api/jobs/:id
 * Employer updates posting (title, description). Bumps lastUpdatedAt + lastConfirmedAt.
 */
app.patch('/api/jobs/:id', (req, res) => {
  const id  = parseInt(req.params.id, 10);
  const job = db.get(j => j.id === id);
  if (!job)               return res.status(404).json({ error: 'Job not found.' });
  if (job.status !== 'active') return res.status(400).json({ error: 'Job is not active.' });

  const { title, description } = req.body;
  const ts = now();
  const patch = { lastUpdatedAt: ts, lastConfirmedAt: ts };
  if (title)       patch.title       = title;
  if (description) patch.description = description;

  db.update(j => j.id === id, patch);

  const active    = allActiveJobs();
  const annotated = analyseAll(active);
  const result    = annotated.find(j => j.id === id);
  res.json(result);
});

/**
 * POST /api/jobs/:id/close
 * Employer closes the position.
 */
app.post('/api/jobs/:id/close', (req, res) => {
  const id  = parseInt(req.params.id, 10);
  const job = db.get(j => j.id === id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });

  db.update(j => j.id === id, { status: 'closed', closedAt: now() });
  const updated = db.get(j => j.id === id);
  res.json(updated);
});

/**
 * GET /api/jobs/:id
 * Returns a single job annotated with freshness.
 */
app.get('/api/jobs/:id', (req, res) => {
  const id  = parseInt(req.params.id, 10);
  const job = db.get(j => j.id === id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });

  if (job.status === 'active') {
    const active    = allActiveJobs();
    const annotated = analyseAll(active);
    const result    = annotated.find(j => j.id === id);
    return res.json(result);
  }
  res.json(job);
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  // Auto-seed on first run if store is empty
  if (db.count() === 0) {
    require('./seed');
  }

  app.listen(PORT, () => {
    console.log(`\n🚀  JobFresh running at http://localhost:${PORT}\n`);
  });
}

module.exports = app;
