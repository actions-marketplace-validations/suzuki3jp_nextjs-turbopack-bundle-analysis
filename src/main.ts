import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import * as path from 'path';
import { loadAnalysis } from './analyze';
import { compare } from './compare';
import { formatComment, upsertComment } from './comment';
import type { ActionInputs } from './types';

function parseInputs(): ActionInputs {
  const budget = core.getInput('budget');
  const budgetPercentIncreaseRed = core.getInput('budget-percent-increase-red');
  const minimumChangeThreshold = core.getInput('minimum-change-threshold');

  return {
    workingDirectory: core.getInput('working-directory') || '.',
    buildOutputDirectory: core.getInput('build-output-directory') || '.next',
    buildCommand: core.getInput('build-command') || 'npx next experimental-analyze',
    budget: budget ? parseInt(budget, 10) : undefined,
    budgetPercentIncreaseRed: budgetPercentIncreaseRed ? parseInt(budgetPercentIncreaseRed, 10) : 20,
    minimumChangeThreshold: minimumChangeThreshold ? parseInt(minimumChangeThreshold, 10) : 0,
    skipCommentIfEmpty: core.getInput('skip-comment-if-empty') === 'true',
  };
}

async function run(): Promise<void> {
  const context = github.context;
  const pr = context.payload.pull_request;

  if (!pr) {
    core.warning('Not a PR event. Skipping bundle analysis.');
    return;
  }

  const inputs = parseInputs();
  const baseSha = pr.base.sha as string;
  const prSha = context.sha;
  const workspace = process.env.GITHUB_WORKSPACE;

  if (!workspace) {
    throw new Error('GITHUB_WORKSPACE is not set');
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      'GITHUB_TOKEN is not set. Make sure permissions.pull-requests: write is configured.'
    );
  }

  const baseTmp = path.join(workspace, '__bundle_base');
  const prTmp = path.join(workspace, '__bundle_pr');

  core.info(`Base SHA: ${baseSha}`);
  core.info(`PR SHA: ${prSha}`);
  core.info(`Working directory: ${inputs.workingDirectory}`);
  core.info(`Build command: ${inputs.buildCommand}`);

  try {
    // Analyze base branch
    core.startGroup('Analyzing base branch');
    await exec.exec('git', ['worktree', 'add', baseTmp, baseSha]);
    const baseWorkDir = path.join(baseTmp, inputs.workingDirectory);
    await exec.exec('npx', ['--yes', '@antfu/ni', 'nci'], { cwd: baseWorkDir });
    await exec.exec('sh', ['-c', inputs.buildCommand], { cwd: baseWorkDir });
    const baseAnalysis = loadAnalysis(
      path.join(baseWorkDir, inputs.buildOutputDirectory, 'analyze')
    );
    core.info(`Base analysis: ${baseAnalysis.routes.length} routes`);
    core.endGroup();

    // Analyze PR branch
    core.startGroup('Analyzing PR branch');
    await exec.exec('git', ['worktree', 'add', prTmp, prSha]);
    const prWorkDir = path.join(prTmp, inputs.workingDirectory);
    await exec.exec('npx', ['--yes', '@antfu/ni', 'nci'], { cwd: prWorkDir });
    await exec.exec('sh', ['-c', inputs.buildCommand], { cwd: prWorkDir });
    const prAnalysis = loadAnalysis(
      path.join(prWorkDir, inputs.buildOutputDirectory, 'analyze')
    );
    core.info(`PR analysis: ${prAnalysis.routes.length} routes`);
    core.endGroup();

    // Compare and comment
    const comparisons = compare(baseAnalysis, prAnalysis, inputs);
    const changed = comparisons.filter(c => c.status !== 'unchanged');

    core.info(`Changed routes: ${changed.length}`);

    if (inputs.skipCommentIfEmpty && changed.length === 0) {
      core.info('No changes detected. Skipping comment (skip-comment-if-empty: true).');
      return;
    }

    const body = formatComment(comparisons, inputs);
    const octokit = github.getOctokit(token);
    await upsertComment(octokit, context, body);

    core.info('Bundle analysis comment posted successfully.');
  } finally {
    await exec.exec('git', ['worktree', 'remove', baseTmp, '--force']).catch(() => {});
    await exec.exec('git', ['worktree', 'remove', prTmp, '--force']).catch(() => {});
  }
}

run().catch(err => {
  core.setFailed(`Action failed: ${err.message}`);
});
