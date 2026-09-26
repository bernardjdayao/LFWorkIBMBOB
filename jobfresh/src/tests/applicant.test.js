/**
 * Tests for the applicantStatus helper.
 * Covers the three states shown to job seekers on the public job board.
 * Uses Node.js built-in test runner — no extra deps.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { applicantStatus } = require('../freshness');

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 19).replace('T', ' ');
}

function makeJob(overrides = {}) {
  return {
    id: 1,
    title: 'Test Job',
    company: 'Test Corp',
    description: 'Desc.',
    postedAt:        daysAgo(20),
    lastUpdatedAt:   daysAgo(5),
    lastConfirmedAt: daysAgo(5),
    status: 'active',
    freshness: 'fresh',
    ...overrides,
  };
}

describe('applicantStatus – state assignment', () => {
  test('returns fresh state within 30 days', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(10), lastUpdatedAt: daysAgo(10) });
    assert.equal(applicantStatus(job).state, 'fresh');
  });

  test('returns review state at 31–60 days', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(45), lastUpdatedAt: daysAgo(45) });
    assert.equal(applicantStatus(job).state, 'review');
  });

  test('returns stale state over 60 days', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(90), lastUpdatedAt: daysAgo(90) });
    assert.equal(applicantStatus(job).state, 'stale');
  });

  test('uses most recent of lastConfirmedAt and lastUpdatedAt', () => {
    // lastUpdatedAt recent, lastConfirmedAt old → should be fresh
    const job = makeJob({ lastUpdatedAt: daysAgo(5), lastConfirmedAt: daysAgo(90) });
    assert.equal(applicantStatus(job).state, 'fresh');
  });
});

describe('applicantStatus – headline copy', () => {
  test('fresh headline is "Recently confirmed by employer"', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) });
    assert.equal(applicantStatus(job).headline, 'Recently confirmed by employer');
  });

  test('review headline is "Confirmation needed"', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(45), lastUpdatedAt: daysAgo(45) });
    assert.equal(applicantStatus(job).headline, 'Confirmation needed');
  });

  test('stale headline is "Potentially stale"', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(90), lastUpdatedAt: daysAgo(90) });
    assert.equal(applicantStatus(job).headline, 'Potentially stale');
  });
});

describe('applicantStatus – detail copy constraints', () => {
  test('does not mention ghost job or fraud in any state', () => {
    for (const days of [5, 45, 90]) {
      const job = makeJob({ lastConfirmedAt: daysAgo(days), lastUpdatedAt: daysAgo(days) });
      const { headline, detail } = applicantStatus(job);
      const combined = (headline + ' ' + detail).toLowerCase();
      assert.ok(!combined.includes('ghost'),   `Should not mention "ghost" (${days}d)`);
      assert.ok(!combined.includes('fraud'),   `Should not mention "fraud" (${days}d)`);
      assert.ok(!combined.includes('fake'),    `Should not mention "fake" (${days}d)`);
      assert.ok(!combined.includes('scam'),    `Should not mention "scam" (${days}d)`);
      assert.ok(!combined.includes('inactive'),`Should not mention "inactive" (${days}d)`);
    }
  });

  test('stale detail mentions "not been recently confirmed or updated"', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(90), lastUpdatedAt: daysAgo(90) });
    assert.ok(applicantStatus(job).detail.includes('not been recently confirmed or updated'));
  });

  test('review detail mentions employer not confirming', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(45), lastUpdatedAt: daysAgo(45) });
    assert.ok(applicantStatus(job).detail.includes('employer has not recently confirmed'));
  });

  test('fresh detail includes a relative time reference', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) });
    const { detail } = applicantStatus(job);
    // Should contain either "today", "1 day ago", or "X days ago"
    assert.ok(
      detail.includes('day') || detail.includes('today'),
      `Fresh detail should reference time: "${detail}"`
    );
  });
});
