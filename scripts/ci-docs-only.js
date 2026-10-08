'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

function isDocsOnly(paths) {
  return paths.length > 0 && paths.every(p =>
    /^(README|AGENTS|AUTHORS|SECURITY)\.md$/.test(p) ||
    /^docs\/(?:[^/]+\/)*[^/]+\.md$/.test(p));
}

// Only an actual successful deployment is a baseline. A successful docs-only
// workflow has skipped jobs and must never hide an unverified application push.
async function deployedHead(api) {
  const runs = await api('/actions/workflows/deploy-pages.yml/runs?branch=main&status=success&per_page=20');
  for (const run of runs.workflow_runs) {
    const jobs = await api('/actions/runs/' + run.id + '/jobs?per_page=100');
    if (jobs.jobs.some(job => job.name === 'deploy' && job.conclusion === 'success')) {
      return run.head_sha;
    }
  }
  return null;
}

async function classify({ eventName, head, api, git }) {
  if (eventName !== 'push') return { full: true, reason: 'Manual or non-push event' };
  try {
    const base = await deployedHead(api);
    if (!base || !/^[a-f0-9]{40}$/.test(base) || !/^[a-f0-9]{40}$/.test(head)) {
      return { full: true, reason: 'No usable successful deployment baseline' };
    }
    git(['merge-base', '--is-ancestor', base, head]);
    // No rename detection: both sides of a rename must qualify as documentation.
    const paths = git(['diff', '--no-renames', '--name-only', '-z', base, head])
      .split('\0').filter(Boolean);
    if (!isDocsOnly(paths)) return { full: true, reason: 'Application, unknown, mixed, or empty change set' };
    git(['diff', '--check', base, head]);
    return { full: false, reason: 'Only allowlisted Markdown differs from deployed ' + base };
  } catch (error) {
    return { full: true, reason: 'Baseline lookup or diff could not be verified; full gate required' };
  }
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Invalid repository');
  const api = async route => {
    const response = await fetch('https://api.github.com/repos/' + repository + route, {
      headers: { Authorization: 'Bearer ' + process.env.GH_TOKEN, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('GitHub API lookup failed');
    return response.json();
  };
  const result = await classify({
    eventName: process.env.GITHUB_EVENT_NAME, head: process.env.GITHUB_SHA, api,
    git: args => execFileSync('git', args, { encoding: 'utf8', timeout: 10000 })
  });
  fs.appendFileSync(process.env.GITHUB_OUTPUT, 'full=' + result.full + '\n');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    'CI routing: ' + (result.full ? 'full verification and deployment' : 'documentation only; deployment unchanged') + '\n\n' + result.reason + '\n');
  console.log(result.reason);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { isDocsOnly, deployedHead, classify };
