const fs = require('fs');
const { Octokit } = require('@octokit/rest');

const token = process.env.GITHUB_TOKEN;
const eventPath = process.env.GITHUB_EVENT_PATH;
const repoFull = process.env.GITHUB_REPOSITORY;
if (!token || !eventPath || !repoFull) process.exit(0);

const [owner, repo] = repoFull.split('/');
const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
const octokit = new Octokit({ auth: token });

async function getPrFromEvent(e) {
  if (e.pull_request) return e.pull_request;
  if (e.issue?.pull_request?.url) {
    const url = new URL(e.issue.pull_request.url);
    const num = Number(url.pathname.split('/').pop());
    const res = await octokit.pulls.get({ owner, repo, pull_number: num });
    return res.data;
  }
  return null;
}

(async function main() {
  const pr = await getPrFromEvent(event);
  if (!pr) return;

  let applied = [];
  try { applied = JSON.parse(fs.readFileSync('.github/scripts/_applied.json', 'utf8')); } catch {}

  for (const item of applied) {
    try {
      await octokit.pulls.createReplyForReviewComment({
        owner,
        repo,
        comment_id: item.comment_id,
        body: '✅ Applied your suggestion on ' + item.path + ' (lines ' + item.startLine + '–' + item.endLine + ').'
      });
    } catch (e) {}
  }

  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: pr.number,
    body: [
      '✅ **PR Auto-Fixer** ran:',
      '- Applied GitHub `suggestion` blocks where possible',
      '- Ran Prettier / ESLint / Stylelint fixes (best-effort)',
      '- Type-checked (non-blocking)',
      '',
      'Comment `@pr-auto-fixer retry` if you want me to run again.'
    ].join('\n')
  });

  const reviews = await octokit.pulls.listReviews({ owner, repo, pull_number: pr.number });
  const requestedFrom = [...new Set((reviews.data || [])
    .filter(r => (r.state || '').toLowerCase() === 'changes_requested')
    .map(r => r.user?.login)
    .filter(Boolean))];
  if (requestedFrom.length) {
    try {
      await octokit.pulls.requestReviewers({ owner, repo, pull_number: pr.number, reviewers: requestedFrom.slice(0, 3) });
    } catch (e) {}
  }
})();
