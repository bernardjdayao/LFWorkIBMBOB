/**
 * Tests for employer actions (confirm, update, close).
 * Uses Node.js built-in test runner — no extra deps.
 * Uses an in-memory object store so tests are fully isolated.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { analyseAll } = require('../freshness');

// ── In-memory store helpers ───────────────────────────────────────────────────

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 19).replace('T', ' ');
}

function nowStr() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function makeStore() {
  let seq = 0;
  const jobs = [];
  return {
    insert(job) {
      seq += 1;
      const j = { ...job, id: seq };
      jobs.push(j);
      return j;
    },
    get(id) {
      return jobs.find(j => j.id === id) || null;
    },
    update(id, patch) {
      const idx = jobs.findIndex(j => j.id === id);
      if (idx !== -1) jobs[idx] = { ...jobs[idx], ...patch };
    },
    active() {
      return jobs.filter(j => j.status === 'active');
    },
    all() { return jobs; },
  };
}

// ── Confirm action ────────────────────────────────────────────────────────────

describe('confirm action', () => {
  test('sets freshness to fresh after confirmation', () => {
    const store = makeStore();
    const job = store.insert({
      title: 'Stale Job', company: 'OldCorp', description: 'Old.',
      postedAt: daysAgo(90), lastUpdatedAt: daysAgo(90), lastConfirmedAt: daysAgo(90),
      status: 'active',
    });

    // Simulate confirm
    const ts = nowStr();
    store.update(job.id, { lastConfirmedAt: ts, lastUpdatedAt: ts });

    const updated = store.get(job.id);
    const [annotated] = analyseAll([updated]);
    assert.equal(annotated.freshness, 'fresh');
  });

  test('confirm on a stale job removes it from review queue', () => {
    const store = makeStore();
    const job = store.insert({
      title: 'Old Posting', company: 'Biz', description: 'Desc.',
      postedAt: daysAgo(100), lastUpdatedAt: daysAgo(70), lastConfirmedAt: daysAgo(70),
      status: 'active',
    });

    // Before confirm: should be flagged
    const [before] = analyseAll([store.get(job.id)]);
    assert.ok(before.freshness === 'stale' || before.freshness === 'review');

    // After confirm
    const ts = nowStr();
    store.update(job.id, { lastConfirmedAt: ts, lastUpdatedAt: ts });
    const [after] = analyseAll([store.get(job.id)]);
    assert.equal(after.freshness, 'fresh');
  });
});

// ── Update action ─────────────────────────────────────────────────────────────

describe('update posting action', () => {
  test('bumps lastUpdatedAt and recalculates to fresh', () => {
    const store = makeStore();
    const job = store.insert({
      title: 'Update Test', company: 'TestCorp', description: 'Original.',
      postedAt: daysAgo(80), lastUpdatedAt: daysAgo(80), lastConfirmedAt: daysAgo(80),
      status: 'active',
    });

    const before = store.get(job.id).lastUpdatedAt;
    const ts = nowStr();
    store.update(job.id, { description: 'Updated.', lastUpdatedAt: ts, lastConfirmedAt: ts });

    const updated = store.get(job.id);
    assert.ok(updated.lastUpdatedAt > before, 'lastUpdatedAt should increase');

    const [annotated] = analyseAll([updated]);
    assert.equal(annotated.freshness, 'fresh');
  });
});

// ── Close action ──────────────────────────────────────────────────────────────

describe('close action', () => {
  test('sets status to closed', () => {
    const store = makeStore();
    const job = store.insert({
      title: 'Active Job', company: 'NewCorp', description: 'New.',
      postedAt: daysAgo(10), lastUpdatedAt: daysAgo(5), lastConfirmedAt: daysAgo(5),
      status: 'active',
    });

    store.update(job.id, { status: 'closed' });
    assert.equal(store.get(job.id).status, 'closed');
  });

  test('closed job does not appear in active listing', () => {
    const store = makeStore();
    const j1 = store.insert({
      title: 'Job A', company: 'Corp', description: 'Desc.',
      postedAt: daysAgo(5), lastUpdatedAt: daysAgo(5), lastConfirmedAt: daysAgo(5),
      status: 'active',
    });
    store.insert({
      title: 'Job B', company: 'Corp', description: 'Desc.',
      postedAt: daysAgo(5), lastUpdatedAt: daysAgo(5), lastConfirmedAt: daysAgo(5),
      status: 'active',
    });

    store.update(j1.id, { status: 'closed' });
    const active = store.active();
    assert.equal(active.length, 1);
    assert.equal(active[0].title, 'Job B');
  });
});

// ── Duplicate detection ───────────────────────────────────────────────────────

describe('duplicate detection', () => {
  test('both postings flagged when same company + same title', () => {
    const store = makeStore();
    store.insert({ title: 'DevOps Engineer', company: 'DupeCorp', description: 'First.',
      postedAt: daysAgo(50), lastUpdatedAt: daysAgo(50), lastConfirmedAt: daysAgo(50), status: 'active' });
    store.insert({ title: 'DevOps Engineer', company: 'DupeCorp', description: 'Second.',
      postedAt: daysAgo(5),  lastUpdatedAt: daysAgo(5),  lastConfirmedAt: daysAgo(5),  status: 'active' });

    const annotated = analyseAll(store.active());
    const dupes = annotated.filter(j => j.isDuplicate);
    assert.equal(dupes.length, 2);
  });

  test('each duplicate has a reason message', () => {
    const store = makeStore();
    store.insert({ title: 'QA Lead', company: 'Q-Corp', description: 'v1.',
      postedAt: daysAgo(40), lastUpdatedAt: daysAgo(40), lastConfirmedAt: daysAgo(40), status: 'active' });
    store.insert({ title: 'QA Lead', company: 'Q-Corp', description: 'v2.',
      postedAt: daysAgo(3),  lastUpdatedAt: daysAgo(3),  lastConfirmedAt: daysAgo(3),  status: 'active' });

    const annotated = analyseAll(store.active());
    for (const job of annotated) {
      assert.ok(job.reasons.length > 0, `Job ${job.id} should have reasons`);
    }
  });

  test('fresh duplicate is escalated to review', () => {
    const store = makeStore();
    store.insert({ title: 'PM Role', company: 'BizCo', description: 'A.',
      postedAt: daysAgo(5), lastUpdatedAt: daysAgo(5), lastConfirmedAt: daysAgo(5), status: 'active' });
    store.insert({ title: 'PM Role', company: 'BizCo', description: 'B.',
      postedAt: daysAgo(3), lastUpdatedAt: daysAgo(3), lastConfirmedAt: daysAgo(3), status: 'active' });

    const annotated = analyseAll(store.active());
    for (const job of annotated) {
      assert.ok(job.freshness !== 'fresh', 'Fresh duplicate should be escalated');
    }
  });
});
