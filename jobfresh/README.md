# JobFresh

A job board freshness system that flags listings requiring employer or admin review, based on transparent, date-driven signals.

## Problem

Job boards often keep listings visible long after employers have stopped actively hiring. Job seekers waste time applying to positions that may no longer be open, and job boards accumulate listings that no longer reflect real hiring activity. There is no reliable, honest way to surface this — labelling a job as inactive or fraudulent without evidence is inaccurate and unfair to employers.

## Solution

JobFresh introduces a freshness layer on top of a standard job board. Every active listing is evaluated against a simple set of deterministic rules using only stored dates and posting history. No opaque scoring, no AI, no guesswork. When a listing hasn't been confirmed or updated in a while, it is flagged for review with a plain-language explanation of why. Employers can respond directly — confirming they are still hiring, updating the posting, or closing the position.

Flags are signals, not accusations. The system never labels a job as a ghost job or suggests fraud.

## Freshness Rules

| Status | Condition |
|---|---|
| **Recently Confirmed** | Confirmed or updated within the last 30 days |
| **Confirmation Needed** | No confirmation or update for 31–60 days |
| **Potentially Stale** | No confirmation or update for more than 60 days |
| **Possible Duplicate** | Same company has multiple listings with the same or very similar title |

## Features

- **Admin dashboard** — summary counts of fresh, review-needed, potentially stale, and duplicate listings
- **Review queue** — flagged jobs with a clear reason for each flag
- **Employer actions** — confirm still hiring, update the posting, or close the position
- **Auto-seed** — realistic sample data loaded on first run so the dashboard is immediately demonstrable

## Getting Started

Requires Node.js 18 or later.

```bash
cd jobfresh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

To re-seed the database with fresh sample data:

```bash
npm run seed
```

## Running Tests

```bash
npm test
```

60 tests across three files covering freshness rules, employer actions, and all eight product requirements.

## Project Structure

```
jobfresh/
├── src/
│   ├── server.js       # Express API and static file server
│   ├── db.js           # JSON file store (no native dependencies)
│   ├── freshness.js    # Freshness analysis engine
│   ├── seed.js         # Sample data
│   └── tests/
│       ├── freshness.test.js     # Unit tests for freshness rules
│       ├── actions.test.js       # Tests for employer actions
│       └── requirements.test.js  # Requirement-level coverage
├── public/
│   └── index.html      # Admin dashboard UI
├── data/
│   └── jobs.json       # Persistent store (created on first run)
└── package.json
```

## Stack

- **Backend** — Node.js, Express
- **Storage** — JSON file (no database installation required)
- **Frontend** — Vanilla HTML/CSS/JS, no build step
- **Tests** — Node.js built-in test runner (`node --test`)
