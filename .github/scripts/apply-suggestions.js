const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/rest');

const token = process.env.GITHUB_TOKEN;
const eventPath = process.env.GITHUB_EVENT_PATH;
const repoFull = process.env.GITHUB_REPOSITORY;
if (!token || !eventPath || !repoFull) process.exit(0);

const [owner, repo] = repoFull.split('/');
const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
const octokit = new Octokit({ auth: token });

function extractSuggestion(body = '') {
  const m = body.match(/```suggestion\s*\n([\s\S]*?)```/);
  return m ? m[1] : null;
}

function applyLineReplace(absFilePath, startLine, endLine, newText) {
  const lines = fs.readFileSync(absFilePath, 'utf8').split('\n');
  const start = Math.max(1, Number(startLine || 1));
  const end = Math.max(start, Number(endLine || start));
  if (start > lines.length) return false;
  const endClamped = Math.min(end, lines.length);
  const before = lines.slice(0, start - 1);
  const after = lines.slice(endClamped);
  const insert = newText.replace(/\n$/, '').split('\n');
  fs.writeFileSync(absFilePath, [...before, ...insert, ...after].join('\n'), 'utf8');
  return true;
}

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

async function listReviewCommentsForThisSubmission(e, pr) {
  if (e.review?.id && pr?.number) {
    const all = await octokit.request(
      'GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/comments',
      { owner, repo, pull_number: pr.number, review_id: e.review.id, per_page: 100 }
    );
    return all.data || [];
  }
  return [];
}

(async function main() {
  const pr = await getPrFromEvent(event);
  if (!pr) return;

  let reviewComments = [];
  if (event.action === 'submitted' && (event.review?.state || '').toLowerCase() === 'changes_requested') {
    reviewComments = await listReviewCommentsForThisSubmission(event, pr);
  } else if (event.action === 'created' && event.comment && /@pr-auto-fixer\s+retry/i.test(event.comment.body || '')) {
    const res = await octokit.pulls.listReviewComments({ owner, repo, pull_number: pr.number, per_page: 50 });
    reviewComments = res.data || [];
  }

  const workspace = process.cwd();
  const applied = [];
  for (const c of reviewComments) {
    const suggestion = extractSuggestion(c.body || '');
    if (!suggestion) continue;
    if (!c.path || !c.line) continue;
    const startLine = c.start_line || c.line;
    const endLine = c.line;
    const filePath = path.join(workspace, c.path);
    if (!fs.existsSync(filePath)) continue;
    const ok = applyLineReplace(filePath, startLine, endLine, suggestion);
    if (ok) applied.push({ comment_id: c.id, path: c.path, startLine, endLine });
  }
  if (!fs.existsSync('.github/scripts')) fs.mkdirSync('.github/scripts', { recursive: true });
  fs.writeFileSync('.github/scripts/_applied.json', JSON.stringify(applied, null, 2), 'utf8');
})();
