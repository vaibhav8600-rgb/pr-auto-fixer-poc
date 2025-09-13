# PR Auto-Fixer — POC

This repo demonstrates an end-to-end workflow that auto-applies GitHub review `suggestion` blocks, runs formatters/linters, commits, replies, and re-requests review.

## How it works
1. A reviewer submits a **Changes requested** review with an inline suggestion.
2. The **PR Auto-Fixer** GitHub Action applies the suggestion + runs Prettier/ESLint/Stylelint + type check.
3. If changes were made, it commits/pushes, replies to the comment, and re-requests review.

Trigger a retry any time by commenting: `@pr-auto-fixer retry` on the PR.
