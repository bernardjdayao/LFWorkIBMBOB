/**
 * Seed the database with realistic sample job postings for demonstration.
 * Run with: node src/seed.js
 */

const db = require('./db');

// Wipe existing data to allow re-seeding
db.clear();

const now    = new Date();
const daysAgo = n => new Date(now - n * 86400000).toISOString().slice(0, 19).replace('T', ' ');

const seeds = [
  // === FRESH jobs (confirmed within 30 days) ===
  {
    title: 'Senior Software Engineer',
    company: 'Acme Corp',
    description: 'Build scalable backend services using Node.js and PostgreSQL.',
    postedAt:        daysAgo(45),
    lastUpdatedAt:   daysAgo(10),
    lastConfirmedAt: daysAgo(10),
    status: 'active',
  },
  {
    title: 'Product Designer',
    company: 'BlueSky Labs',
    description: 'Design user-centred interfaces for our SaaS platform.',
    postedAt:        daysAgo(20),
    lastUpdatedAt:   daysAgo(5),
    lastConfirmedAt: daysAgo(5),
    status: 'active',
  },
  {
    title: 'Data Analyst',
    company: 'QuantMetrics',
    description: 'Analyse large datasets and produce executive dashboards.',
    postedAt:        daysAgo(15),
    lastUpdatedAt:   daysAgo(15),
    lastConfirmedAt: daysAgo(2),
    status: 'active',
  },

  // === REVIEW NEEDED jobs (31–60 days since confirmation/update) ===
  {
    title: 'Marketing Manager',
    company: 'Acme Corp',
    description: 'Lead digital marketing campaigns and SEO strategy.',
    postedAt:        daysAgo(70),
    lastUpdatedAt:   daysAgo(45),
    lastConfirmedAt: daysAgo(45),
    status: 'active',
  },
  {
    title: 'DevOps Engineer',
    company: 'CloudNine Systems',
    description: 'Manage CI/CD pipelines and Kubernetes clusters.',
    postedAt:        daysAgo(60),
    lastUpdatedAt:   daysAgo(55),
    lastConfirmedAt: daysAgo(55),
    status: 'active',
  },
  {
    title: 'Frontend Developer',
    company: 'PixelPerfect Studios',
    description: 'Create responsive React applications with accessibility in mind.',
    postedAt:        daysAgo(50),
    lastUpdatedAt:   daysAgo(40),
    lastConfirmedAt: daysAgo(40),
    status: 'active',
  },

  // === STALE jobs (over 60 days since confirmation/update) ===
  {
    title: 'Sales Representative',
    company: 'GlobalTrade Inc.',
    description: 'Drive B2B sales for enterprise software solutions.',
    postedAt:        daysAgo(120),
    lastUpdatedAt:   daysAgo(90),
    lastConfirmedAt: daysAgo(90),
    status: 'active',
  },
  {
    title: 'HR Generalist',
    company: 'PeopleFirst Group',
    description: 'Manage onboarding, payroll support, and employee relations.',
    postedAt:        daysAgo(100),
    lastUpdatedAt:   daysAgo(80),
    lastConfirmedAt: daysAgo(80),
    status: 'active',
  },
  {
    title: 'Content Writer',
    company: 'InkWell Media',
    description: 'Produce long-form articles, blog posts, and copy.',
    postedAt:        daysAgo(150),
    lastUpdatedAt:   daysAgo(120),
    lastConfirmedAt: daysAgo(120),
    status: 'active',
  },

  // === DUPLICATE / REPOST examples (same company, same title) ===
  {
    title: 'Software Engineer',
    company: 'TechVentures',
    description: 'Full-stack development with React and Node.js — January cohort.',
    postedAt:        daysAgo(90),
    lastUpdatedAt:   daysAgo(90),
    lastConfirmedAt: daysAgo(90),
    status: 'active',
  },
  {
    title: 'Software Engineer',
    company: 'TechVentures',
    description: 'Full-stack development with React and Node.js — March cohort.',
    postedAt:        daysAgo(20),
    lastUpdatedAt:   daysAgo(3),
    lastConfirmedAt: daysAgo(3),
    status: 'active',
  },
  {
    title: 'Software Engineer – Senior',
    company: 'TechVentures',
    description: 'Senior full-stack engineer role, team lead responsibilities.',
    postedAt:        daysAgo(25),
    lastUpdatedAt:   daysAgo(5),
    lastConfirmedAt: daysAgo(5),
    status: 'active',
  },

  // === CLOSED job (should not appear in active listings) ===
  {
    title: 'UX Researcher',
    company: 'BlueSky Labs',
    description: 'This position has been filled.',
    postedAt:        daysAgo(60),
    lastUpdatedAt:   daysAgo(30),
    lastConfirmedAt: daysAgo(30),
    closedAt:        daysAgo(30),
    status: 'closed',
  },
];

seeds.forEach(job => db.insert(job));

console.log(`✅  Seeded ${seeds.length} jobs into the database.`);
