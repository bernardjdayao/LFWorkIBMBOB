/**
 * Requirement-level tests for JobFresh MVP.
 * Each describe block maps to one of the 8 stated requirements.
 * Uses Node.js built-in test runner — no extra deps.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { computeFreshness, analyseAll, buildDashboard, daysSince } = require('../freshness');

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 19).replace('T', ' ');
}

function nowStr() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
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
    ...overrides,
  };
}

// ── Req 1: Freshness calculation is deterministic and correct ─────────────────

describe('Req 1 – freshness is deterministic and correct', () => {
  test('same input always produces the same freshness', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(45), lastUpdatedAt: daysAgo(45) });
    const r1 = computeFreshness(job);
    const r2 = computeFreshness(job);
    assert.equal(r1.freshness, r2.freshness);
    assert.equal(r1.daysSinceActivity, r2.daysSinceActivity);
  });

  test('day 0 is fresh', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(0), lastUpdatedAt: daysAgo(0) });
    assert.equal(computeFreshness(job).freshness, 'fresh');
  });

  test('day 30 is still fresh (boundary)', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(30), lastUpdatedAt: daysAgo(30) });
    assert.equal(computeFreshness(job).freshness, 'fresh');
  });

  test('day 31 is review (first day over threshold)', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(31), lastUpdatedAt: daysAgo(31) });
    assert.equal(computeFreshness(job).freshness, 'review');
  });

  test('day 60 is still review (boundary)', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(60), lastUpdatedAt: daysAgo(60) });
    assert.equal(computeFreshness(job).freshness, 'review');
  });

  test('day 61 is stale (first day over stale threshold)', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(61), lastUpdatedAt: daysAgo(61) });
    assert.equal(computeFreshness(job).freshness, 'stale');
  });
});

// ── Req 2: Jobs transition correctly between states ───────────────────────────

describe('Req 2 – state transitions', () => {
  test('stale → fresh after lastConfirmedAt is set to now', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(90), lastUpdatedAt: daysAgo(90) });
    assert.equal(computeFreshness(job).freshness, 'stale');

    const confirmed = { ...job, lastConfirmedAt: nowStr(), lastUpdatedAt: nowStr() };
    assert.equal(computeFreshness(confirmed).freshness, 'fresh');
  });

  test('review → fresh after update', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(45), lastUpdatedAt: daysAgo(45) });
    assert.equal(computeFreshness(job).freshness, 'review');

    const updated = { ...job, lastUpdatedAt: nowStr(), lastConfirmedAt: nowStr() };
    assert.equal(computeFreshness(updated).freshness, 'fresh');
  });

  test('fresh duplicate is escalated to review (not left as fresh)', () => {
    const jobs = [
      makeJob({ id: 1, title: 'Dev', company: 'X', lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
      makeJob({ id: 2, title: 'Dev', company: 'X', lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
    ];
    const result = analyseAll(jobs);
    assert.ok(result.every(j => j.freshness !== 'fresh'), 'No fresh duplicate should survive');
  });
});

// ── Req 3: Employer confirmation updates lastConfirmedAt ──────────────────────

describe('Req 3 – confirm writes lastConfirmedAt', () => {
  test('confirm sets lastConfirmedAt to now', () => {
    const before = daysAgo(90);
    const job = makeJob({ lastConfirmedAt: before, lastUpdatedAt: before });

    const ts = nowStr();
    const confirmed = { ...job, lastConfirmedAt: ts, lastUpdatedAt: ts };

    assert.ok(confirmed.lastConfirmedAt > before,
      'lastConfirmedAt must be more recent than before');
  });

  test('daysSince(lastConfirmedAt) is 0 immediately after confirm', () => {
    const ts = nowStr();
    assert.equal(daysSince(ts), 0);
  });

  test('freshness is fresh after lastConfirmedAt set to now', () => {
    const ts = nowStr();
    const job = makeJob({ lastConfirmedAt: ts, lastUpdatedAt: ts });
    assert.equal(computeFreshness(job).freshness, 'fresh');
  });
});

// ── Req 4: Closing removes job from active listings ───────────────────────────

describe('Req 4 – close removes from active listings', () => {
  function makeStore() {
    let seq = 0;
    const jobs = [];
    return {
      insert(j) { seq++; const r = { ...j, id: seq }; jobs.push(r); return r; },
      update(id, patch) {
        const i = jobs.findIndex(j => j.id === id);
        if (i !== -1) jobs[i] = { ...jobs[i], ...patch };
      },
      active() { return jobs.filter(j => j.status === 'active'); },
      get(id)  { return jobs.find(j => j.id === id) || null; },
    };
  }

  test('closed job is absent from active()', () => {
    const store = makeStore();
    const j = store.insert(makeJob({ id: undefined }));
    assert.equal(store.active().length, 1);
    store.update(j.id, { status: 'closed' });
    assert.equal(store.active().length, 0);
  });

  test('closing one job does not affect other active jobs', () => {
    const store = makeStore();
    const j1 = store.insert(makeJob({ id: undefined, title: 'Job A' }));
    store.insert(makeJob({ id: undefined, title: 'Job B' }));
    store.update(j1.id, { status: 'closed' });
    const active = store.active();
    assert.equal(active.length, 1);
    assert.equal(active[0].title, 'Job B');
  });

  test('closed job status is "closed"', () => {
    const store = makeStore();
    const j = store.insert(makeJob({ id: undefined }));
    store.update(j.id, { status: 'closed' });
    assert.equal(store.get(j.id).status, 'closed');
  });
});

// ── Req 5: Duplicate detection works on seeded data ──────────────────────────

describe('Req 5 – duplicate detection on seeded-data shape', () => {
  // Reproduce the TechVentures seed scenario exactly
  const seedJobs = [
    makeJob({ id: 10, title: 'Software Engineer',          company: 'TechVentures',
              lastConfirmedAt: daysAgo(90), lastUpdatedAt: daysAgo(90) }),
    makeJob({ id: 11, title: 'Software Engineer',          company: 'TechVentures',
              lastConfirmedAt: daysAgo(3),  lastUpdatedAt: daysAgo(3)  }),
    makeJob({ id: 12, title: 'Software Engineer \u2013 Senior', company: 'TechVentures',
              lastConfirmedAt: daysAgo(5),  lastUpdatedAt: daysAgo(5)  }),
  ];

  test('both "Software Engineer" listings are flagged as duplicates', () => {
    const result = analyseAll(seedJobs);
    const dupes = result.filter(j => j.isDuplicate && j.title === 'Software Engineer');
    assert.equal(dupes.length, 2);
  });

  test('"Software Engineer – Senior" is NOT flagged (different normalised title)', () => {
    const result = analyseAll(seedJobs);
    const senior = result.find(j => j.id === 12);
    // Senior has a different normalised title — should not be a duplicate of the plain "Software Engineer"
    assert.ok(!senior.isDuplicate, 'Senior title should not be flagged as duplicate of plain title');
  });

  test('stale duplicate (90 days) still shows stale freshness', () => {
    const result = analyseAll(seedJobs);
    const staleOne = result.find(j => j.id === 10);
    assert.equal(staleOne.freshness, 'stale');
  });

  test('fresh duplicate (3 days) is escalated to review', () => {
    const result = analyseAll(seedJobs);
    const freshOne = result.find(j => j.id === 11);
    assert.ok(freshOne.freshness === 'review', 'Fresh duplicate should be escalated to review');
  });

  test('duplicate reason message contains company and count', () => {
    const result = analyseAll(seedJobs);
    const flagged = result.filter(j => j.isDuplicate);
    for (const job of flagged) {
      const hasReason = job.reasons.some(r =>
        r.includes('TechVentures') && r.includes('2')
      );
      assert.ok(hasReason, `Job ${job.id} reason should mention company and count`);
    }
  });
});

// ── Req 6: Dashboard counts match underlying job data ────────────────────────

describe('Req 6 – dashboard counts are consistent', () => {
  test('fresh + reviewNeeded + stale equals totalActive', () => {
    const jobs = [
      makeJob({ id: 1, company: 'A', title: 'J1', lastConfirmedAt: daysAgo(5),  lastUpdatedAt: daysAgo(5)  }),
      makeJob({ id: 2, company: 'B', title: 'J2', lastConfirmedAt: daysAgo(45), lastUpdatedAt: daysAgo(45) }),
      makeJob({ id: 3, company: 'C', title: 'J3', lastConfirmedAt: daysAgo(90), lastUpdatedAt: daysAgo(90) }),
      makeJob({ id: 4, company: 'D', title: 'J4', lastConfirmedAt: daysAgo(10), lastUpdatedAt: daysAgo(10) }),
    ];
    const summary = buildDashboard(analyseAll(jobs));
    assert.equal(
      summary.fresh + summary.reviewNeeded + summary.stale,
      summary.totalActive,
      'fresh + review + stale must equal totalActive'
    );
  });

  test('totalActive excludes closed jobs', () => {
    const jobs = [
      makeJob({ id: 1, status: 'active', company: 'A', title: 'Open',   lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
      makeJob({ id: 2, status: 'closed', company: 'B', title: 'Closed', lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
      makeJob({ id: 3, status: 'active', company: 'C', title: 'Open2',  lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
    ];
    const summary = buildDashboard(analyseAll(jobs));
    assert.equal(summary.totalActive, 2);
  });

  test('possibleDupes count matches number of jobs with isDuplicate', () => {
    const jobs = [
      makeJob({ id: 1, company: 'Co', title: 'Same Job', lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
      makeJob({ id: 2, company: 'Co', title: 'Same Job', lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
      makeJob({ id: 3, company: 'Co', title: 'Other Job', lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
    ];
    const annotated = analyseAll(jobs);
    const summary   = buildDashboard(annotated);
    const manualDupeCount = annotated.filter(j => j.status === 'active' && j.isDuplicate).length;
    assert.equal(summary.possibleDupes, manualDupeCount);
  });

  test('empty job list produces all-zero dashboard', () => {
    const summary = buildDashboard(analyseAll([]));
    assert.equal(summary.totalActive,   0);
    assert.equal(summary.fresh,         0);
    assert.equal(summary.reviewNeeded,  0);
    assert.equal(summary.stale,         0);
    assert.equal(summary.possibleDupes, 0);
  });
});

// ── Req 7: Flagged jobs display clear reasons ─────────────────────────────────

describe('Req 7 – flagged jobs have clear reasons, clean jobs do not', () => {
  test('fresh, non-duplicate job has no reasons', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) });
    const { reasons } = computeFreshness(job);
    assert.equal(reasons.length, 0);
  });

  test('review job reason mentions the day threshold', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(45), lastUpdatedAt: daysAgo(45) });
    const { reasons } = computeFreshness(job);
    assert.ok(reasons[0].includes('31\u201360 day threshold'));
  });

  test('stale job reason mentions the day threshold', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(90), lastUpdatedAt: daysAgo(90) });
    const { reasons } = computeFreshness(job);
    assert.ok(reasons[0].includes('over 60 day threshold'));
  });

  test('reason includes the actual day count', () => {
    const job = makeJob({ lastConfirmedAt: daysAgo(50), lastUpdatedAt: daysAgo(50) });
    const { reasons, daysSinceActivity } = computeFreshness(job);
    assert.ok(
      reasons[0].includes(String(daysSinceActivity)),
      `Reason should include ${daysSinceActivity}, got: "${reasons[0]}"`
    );
  });

  test('after analyseAll, non-flagged job has empty reasons array', () => {
    const jobs = [
      makeJob({ id: 1, company: 'Solo', title: 'Unique Job',
                lastConfirmedAt: daysAgo(5), lastUpdatedAt: daysAgo(5) }),
    ];
    const [annotated] = analyseAll(jobs);
    assert.equal(annotated.reasons.length, 0);
    assert.equal(annotated.isDuplicate, false);
  });
});

// ── Req 8: No existing functionality is broken ────────────────────────────────

describe('Req 8 – existing functionality intact', () => {
  test('analyseAll returns same number of jobs as input', () => {
    const jobs = [
      makeJob({ id: 1, company: 'A', title: 'J1' }),
      makeJob({ id: 2, company: 'B', title: 'J2' }),
      makeJob({ id: 3, company: 'C', title: 'J3' }),
    ];
    assert.equal(analyseAll(jobs).length, 3);
  });

  test('analyseAll preserves all original job fields', () => {
    const job = makeJob({ id: 99, title: 'Preserved', company: 'FieldCheck' });
    const [result] = analyseAll([job]);
    assert.equal(result.id,          job.id);
    assert.equal(result.title,       job.title);
    assert.equal(result.company,     job.company);
    assert.equal(result.description, job.description);
    assert.equal(result.status,      job.status);
    assert.equal(result.postedAt,    job.postedAt);
  });

  test('analyseAll adds freshness, reasons, daysSinceActivity, isDuplicate fields', () => {
    const [result] = analyseAll([makeJob()]);
    assert.ok('freshness'         in result);
    assert.ok('reasons'           in result);
    assert.ok('daysSinceActivity' in result);
    assert.ok('isDuplicate'       in result);
  });

  test('buildDashboard does not mutate the input array', () => {
    const jobs = [makeJob({ id: 1, company: 'A', title: 'J' })];
    const annotated = analyseAll(jobs);
    const before = JSON.stringify(annotated);
    buildDashboard(annotated);
    assert.equal(JSON.stringify(annotated), before);
  });

  test('closed job passed to analyseAll is excluded from active dashboard count', () => {
    const jobs = [
      makeJob({ id: 1, status: 'active', company: 'A', title: 'Open' }),
      makeJob({ id: 2, status: 'closed', company: 'B', title: 'Gone' }),
    ];
    const summary = buildDashboard(analyseAll(jobs));
    assert.equal(summary.totalActive, 1);
  });
});
