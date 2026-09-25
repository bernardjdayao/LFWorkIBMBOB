/**
 * Lightweight JSON file store — no native dependencies.
 * Mimics a simple synchronous DB interface used by the rest of the app.
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE  = path.join(DATA_DIR, 'jobs.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Load / Save ───────────────────────────────────────────────────────────────

function load() {
  if (!fs.existsSync(DB_FILE)) return { jobs: [], seq: 0 };
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { jobs: [], seq: 0 };
  }
}

function save(state) {
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// ── Public API (synchronous, mirrors common SQLite patterns) ──────────────────

const db = {
  /** Return all jobs matching a filter function (optional). */
  all(filter) {
    const { jobs } = load();
    return filter ? jobs.filter(filter) : jobs;
  },

  /** Return first job matching filter. */
  get(filter) {
    const { jobs } = load();
    return jobs.find(filter) || null;
  },

  /** Insert a new job. Returns the inserted job with its id. */
  insert(job) {
    const state = load();
    state.seq = (state.seq || 0) + 1;
    const newJob = { ...job, id: state.seq };
    state.jobs.push(newJob);
    save(state);
    return newJob;
  },

  /** Update jobs matching filter with the provided patch object. */
  update(filter, patch) {
    const state = load();
    state.jobs = state.jobs.map(j => filter(j) ? { ...j, ...patch } : j);
    save(state);
  },

  /** Delete all jobs (for seeding). */
  clear() {
    save({ jobs: [], seq: 0 });
  },

  /** Count all jobs. */
  count() {
    return load().jobs.length;
  },
};

module.exports = db;
