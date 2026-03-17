import type { RouteComparison, ActionInputs } from './types';

/**
 * Formats bytes into a human-readable string (e.g., "1.23 kB", "456 B")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const abs = Math.abs(bytes);
  if (abs >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (abs >= 1024) {
    return `${(bytes / 1024).toFixed(2)} kB`;
  }
  return `${bytes} B`;
}

/**
 * Returns the status emoji for a route comparison
 */
export function getStatusEmoji(
  comparison: RouteComparison,
  inputs: Pick<ActionInputs, 'budgetPercentIncreaseRed'>
): string {
  if (comparison.status === 'added') return '✨';
  if (comparison.status === 'removed') return '🗑️';
  if (comparison.diffPercent >= inputs.budgetPercentIncreaseRed) return '🔴';
  if (comparison.diffPercent > 0) return '🟡';
  if (comparison.diffPercent <= -1) return '🟢';
  return '⚪';
}
