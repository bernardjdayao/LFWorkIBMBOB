/**
 * Freshness analysis engine.
 * All rules are deterministic and date/duplicate-based — no opaque scores.
 */

const FRESH_DAYS      = 30;
const REVIEW_DAYS     = 60;

/**
 * Calculate days elapsed since a date string (ISO 8601 or SQLite datetime).
 */
function daysSince(dateStr) {
  const then = new Date(dateStr);
  const now  = new Date();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

/**
 * Normalise a job title for duplicate detection:
 * lowercase, strip punctuation, collapse whitespace.
 */
function normaliseTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Determine freshness status for a single job.
 * Returns { freshness, reasons }
 *
 * freshness: 'fresh' | 'review' | 'stale'
 * reasons:   string[]  — human-readable explanations
 */
function computeFreshness(job) {
  const reasons = [];

  // Use the most recent of lastUpdatedAt and lastConfirmedAt
  const refDate = job.lastConfirmedAt > job.lastUpdatedAt
    ? job.lastConfirmedAt
    : job.lastUpdatedAt;

  const days = daysSince(refDate);

  let freshness;
  if (days <= FRESH_DAYS) {
    freshness = 'fresh';
  } else if (days <= REVIEW_DAYS) {
    freshness = 'review';
    reasons.push(`No employer confirmation or update in ${days} days (31–60 day threshold).`);
  } else {
    freshness = 'stale';
    reasons.push(`No employer confirmation or update in ${days} days (over 60 day threshold).`);
  }

  return { freshness, reasons, daysSinceActivity: days };
}

/**
 * Given an array of all active jobs, annotate each with freshness and
 * duplicate flags.
 *
 * Returns the same array with added fields:
 *   freshness, reasons, daysSinceActivity, isDuplicate
 */
function analyseAll(jobs) {
  // First pass: compute freshness
  const annotated = jobs.map(job => ({
    ...job,
    ...computeFreshness(job),
    isDuplicate: false,
  }));

  // Second pass: duplicate/repost detection
  // Group by company; flag if normalised title appears more than once.
  const byCompany = {};
  for (const job of annotated) {
    const key = job.company.toLowerCase().trim();
    if (!byCompany[key]) byCompany[key] = [];
    byCompany[key].push(job);
  }

  for (const companyJobs of Object.values(byCompany)) {
    const titleCounts = {};
    for (const job of companyJobs) {
      const norm = normaliseTitle(job.title);
      titleCounts[norm] = (titleCounts[norm] || 0) + 1;
    }
    for (const job of companyJobs) {
      const norm = normaliseTitle(job.title);
      if (titleCounts[norm] > 1) {
        job.isDuplicate = true;
        const msg = `Possible duplicate: "${job.title}" appears ${titleCounts[norm]} times for ${job.company}.`;
        if (!job.reasons.includes(msg)) {
          job.reasons.push(msg);
        }
        // Escalate freshness to at least 'review' if currently 'fresh'
        if (job.freshness === 'fresh') {
          job.freshness = 'review';
        }
      }
    }
  }

  return annotated;
}

/**
 * Build dashboard summary counts from annotated jobs.
 */
function buildDashboard(annotatedJobs) {
  const active    = annotatedJobs.filter(j => j.status === 'active');
  const fresh     = active.filter(j => j.freshness === 'fresh'  && !j.isDuplicate);
  const review    = active.filter(j => j.freshness === 'review');
  const stale     = active.filter(j => j.freshness === 'stale');
  const duplicate = active.filter(j => j.isDuplicate);

  return {
    totalActive:    active.length,
    fresh:          fresh.length,
    reviewNeeded:   review.length,
    stale:          stale.length,
    possibleDupes:  duplicate.length,
  };
}

module.exports = { computeFreshness, analyseAll, buildDashboard, daysSince, normaliseTitle };
