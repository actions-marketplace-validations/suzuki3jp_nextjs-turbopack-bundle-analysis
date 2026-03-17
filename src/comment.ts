import * as core from '@actions/core';
import type { RouteComparison, ActionInputs } from './types';
import { formatBytes, getStatusEmoji } from './utils';

const COMMENT_MARKER = '<!-- nextjs-turbopack-bundle-analysis -->';

export function formatComment(
  comparisons: RouteComparison[],
  inputs: Pick<ActionInputs, 'budget' | 'budgetPercentIncreaseRed'>
): string {
  const changed = comparisons.filter(c => c.status !== 'unchanged');

  const rows = changed.map(c => {
    const emoji = getStatusEmoji(c, inputs);
    const route = c.route;
    const baseSize = c.baseSize !== null ? formatBytes(c.baseSize) : '—';
    const budgetWarning =
      inputs.budget !== undefined && c.prSize !== null && c.prSize > inputs.budget ? ' ⚠️' : '';
    const prSize = c.prSize !== null ? `${formatBytes(c.prSize)}${budgetWarning}` : '—';
    const diffStr =
      c.status === 'added'
        ? `+${formatBytes(c.diff)}`
        : c.status === 'removed'
          ? '—'
          : c.diff > 0
            ? `+${formatBytes(c.diff)}`
            : formatBytes(c.diff);
    const percentStr =
      c.status === 'added'
        ? 'new'
        : c.status === 'removed'
          ? 'removed'
          : `${c.diffPercent > 0 ? '+' : ''}${c.diffPercent.toFixed(2)}%`;

    return `| ${emoji} ${route} | ${baseSize} | ${prSize} | ${diffStr} | ${percentStr} |`;
  });

  const table =
    rows.length > 0
      ? [
          '| Route | Base (gzip) | PR (gzip) | +/- | % |',
          '|-------|-------------|-----------|-----|---|',
          ...rows,
        ].join('\n')
      : '_No route changes detected._';

  return [
    COMMENT_MARKER,
    '## Next.js Turbopack Bundle Analysis',
    '',
    table,
  ].join('\n');
}

export async function upsertComment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  body: string
): Promise<void> {
  const { owner, repo } = context.repo;
  const prNumber = context.payload.pull_request?.number;

  if (!prNumber) {
    core.warning('Could not determine PR number. Skipping comment.');
    return;
  }

  // Search for existing comment
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existing = comments.find(
    (c: { body?: string }) => c.body && c.body.includes(COMMENT_MARKER)
  );

  if (existing) {
    core.info(`Updating existing comment #${existing.id}`);
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
  } else {
    core.info('Creating new comment');
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
  }
}
