const fs = require('fs');
const { Octokit } = require('@octokit/rest');

const token = process.env.GITHUB_TOKEN;
const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const octokit = new Octokit({ auth: token });

(async function main() {
  const prNumber = event.pull_request?.number
    || (event.issue?.pull_request?.url ? Number(new URL(event.issue.pull_request.url).pathname.split('/').pop()) : null);
  if (!prNumber) return;

  const comments = (await octokit.pulls.listReviewComments({ owner, repo, pull_number: prNumber, per_page: 50 })).data || [];
  const targets = comments.filter(c => /rename|typo|import|export|type|null check|edge case/i.test(c.body || ''));
  console.log('AI-micro-fixes: found ' + targets.length + ' potentially fixable comments.');
  // Implement your provider call for tiny unified diffs if you enable AI.
})();
