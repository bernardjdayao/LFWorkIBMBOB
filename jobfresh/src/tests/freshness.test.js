/**
 * Tests for the freshness analysis engine.
 * Uses Node.js built-in test runner (node --test), no extra deps.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { computeFreshness, analyseAll, buildDashboard, daysSince, normaliseTitle } = require('../freshness');

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 19).replace('T', ' ');
}

function makeJob(overrides = {}) {
  return {
    id: 1,
    title: 'Software Engineer',
    company: 'Acme Corp',
    description: 'Test job.',
    postedAt:        daysAgo(30),
    lastUpdatedAt:   daysAgo(5),
    lastConfirmedAt: daysAgo(5),
    status: 'active',
    ...overrides,
  };
}

// ── daysSince ─────────────────────────────────────────────────────────────────

describe('daysSince', () => {
  test('returns 0 for now', () => {
    const d = daysSince(new Date().toISOString());
    assert.ok(d === 0, `Expected 0, got ${d}`);
  });

  test('returns correct day count', () => {
    const d = daysSince(daysAgo(15));
    assert.ok(d >= 14 && d <= 16, `Expected ~15, got ${d}`);
  });
});

// ── normaliseTitle ────────────────────────────────────────────────────────────

describe('normaliseTitle', () => {
  test('lowercases and strips punctuation', () => {
    const result = normaliseTitle('Software Engineer – Senior!');
    assert.ok(result === 'software engineer  senior' || result === 'software engineer senior',
      `Unexpected: ${result}`);
  });

  test('collapses whitespace', () => {
    assert.equal(normaliseTitle('  Data   Analyst  '), 'data analyst');
  });
});

// ── computeFreshness ──────────────────────────────────────────────────────────

describe('computeFreshness', () => {
  test('fresh when confirmed within 30 days', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(10), lastUpdatedAt: daysAgo(10) });
    const { freshness } = computeFreshness(job);
    assert.equal(freshness, 'fresh');
  });

  test('fresh at exactly 30 days', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(30), lastUpdatedAt: daysAgo(30) });
    const { freshness } = computeFreshness(job);
    assert.equal(freshness, 'fresh');
  });

  test('review when 31–60 days', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(45), lastUpdatedAt: daysAgo(45) });
    const { freshness, reasons } = computeFreshness(job);
    assert.equal(freshness, 'review');
    assert.ok(reasons.length > 0);
    assert.ok(reasons[0].includes('31–60 day threshold'));
  });

  test('stale when over 60 days', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(90), lastUpdatedAt: daysAgo(90) });
    const { freshness, reasons } = computeFreshness(job);
    assert.equal(freshness, 'stale');
    assert.ok(reasons[0].includes('over 60 day threshold'));
  });

  test('uses most recent of lastUpdatedAt and lastConfirmedAt', () => {
    // lastUpdatedAt is recent — should be fresh despite old confirmation
    const job = makeJob({ lastUpdatedAt: daysAgo(5), lastConfirmedAt: daysAgo(80) });
    const { freshness } = computeFreshness(job);
    assert.equal(freshness, 'fresh');
  });

  test('uses lastConfirmedAt when it is more recent', () => {
    const job = makeJob({ lastUpdatedAt: daysAgo(80), lastConfirmedAt: daysAgo(10) });
    const { freshness } = computeFreshness(job);
    assert.equal(freshness, 'fresh');
  });

  test('reason includes day count', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(70), lastUpdatedAt: daysAgo(70) });
    const { reasons } = computeFreshness(job);
    // Allow for ±1 day boundary
    assert.ok(
      reasons[0].includes('70') || reasons[0].includes('69') || reasons[0].includes('71'),
      `Expected day count in reason, got: ${reasons[0]}`
    );
  });
});

// ── analyseAll: duplicate detection ──────────────────────────────────────────

describe('analyseAll – duplicate detection', () => {
  test('flags jobs with same company and same normalised title', () => {
    const jobs = [
      makeJob({ id: 1, company: 'TechCo', title: 'Software Engineer', lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
      makeJob({ id: 2, company: 'TechCo', title: 'Software Engineer', lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
    ];
    const result = analyseAll(jobs);
    assert.ok(result[0].isDuplicate, 'First should be flagged as duplicate');
    assert.ok(result[1].isDuplicate, 'Second should be flagged as duplicate');
  });

  test('does not flag different companies with same title', () => {
    const jobs = [
      makeJob({ id: 1, company: 'CompanyA', title: 'Software Engineer', lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
      makeJob({ id: 2, company: 'CompanyB', title: 'Software Engineer', lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
    ];
    const result = analyseAll(jobs);
    assert.ok(!result[0].isDuplicate);
    assert.ok(!result[1].isDuplicate);
  });

  test('does not flag unique titles within same company', () => {
    const jobs = [
      makeJob({ id: 1, company: 'TechCo', title: 'Backend Engineer',   lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
      makeJob({ id: 2, company: 'TechCo', title: 'Frontend Developer', lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
    ];
    const result = analyseAll(jobs);
    assert.ok(!result[0].isDuplicate);
    assert.ok(!result[1].isDuplicate);
  });

  test('escalates fresh duplicate to review', () => {
    const jobs = [
      makeJob({ id: 1, company: 'TechCo', title: 'QA Engineer', lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
      makeJob({ id: 2, company: 'TechCo', title: 'QA Engineer', lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
    ];
    const result = analyseAll(jobs);
    for (const job of result) {
      assert.ok(job.freshness !== 'fresh', 'Duplicate should not stay fresh');
    }
  });

  test('duplicate reason includes job title', () => {
    const jobs = [
      makeJob({ id: 1, company: 'TechCo', title: 'QA Engineer', lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
      makeJob({ id: 2, company: 'TechCo', title: 'QA Engineer', lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
    ];
    const result = analyseAll(jobs);
    assert.ok(result[0].reasons.some(r => r.includes('QA Engineer')));
  });
});

// ── buildDashboard ────────────────────────────────────────────────────────────

describe('buildDashboard', () => {
  test('counts correctly', () => {
    const jobs = [
      makeJob({ id: 1, title: 'Engineer A',  company: 'CorpA', lastConfirmedAt: daysAgo(5),  lastUpdatedAt: daysAgo(5)  }),  // fresh
      makeJob({ id: 2, title: 'Engineer B',  company: 'CorpB', lastConfirmedAt: daysAgo(45), lastUpdatedAt: daysAgo(45) }),  // review
      makeJob({ id: 3, title: 'Engineer C',  company: 'CorpC', lastConfirmedAt: daysAgo(90), lastUpdatedAt: daysAgo(90) }),  // stale
    ];
    const annotated = analyseAll(jobs);
    const summary   = buildDashboard(annotated);
    assert.equal(summary.totalActive,  3);
    assert.equal(summary.fresh,        1);
    assert.equal(summary.reviewNeeded, 1);
    assert.equal(summary.stale,        1);
  });

  test('excludes closed jobs from active counts', () => {
    const jobs = [
      makeJob({ id: 1, status: 'active', lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
      makeJob({ id: 2, status: 'closed', lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
    ];
    const annotated = analyseAll(jobs);
    const summary   = buildDashboard(annotated);
    assert.equal(summary.totalActive, 1);
  });
});
