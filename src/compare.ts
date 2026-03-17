import type { BundleAnalysis, RouteComparison, ActionInputs } from './types';

export function compare(
  base: BundleAnalysis,
  pr: BundleAnalysis,
  opts: Pick<ActionInputs, 'minimumChangeThreshold'>
): RouteComparison[] {
  const results: RouteComparison[] = [];

  const baseMap = new Map(base.routes.map(r => [r.route, r]));
  const prMap = new Map(pr.routes.map(r => [r.route, r]));

  const allRoutes = new Set([...baseMap.keys(), ...prMap.keys()]);

  for (const route of allRoutes) {
    const baseRoute = baseMap.get(route);
    const prRoute = prMap.get(route);

    if (!baseRoute && prRoute) {
      // New route
      results.push({
        route,
        baseSize: null,
        prSize: prRoute.size,
        diff: prRoute.size,
        diffPercent: 100,
        status: 'added',
      });
    } else if (baseRoute && !prRoute) {
      // Removed route
      results.push({
        route,
        baseSize: baseRoute.size,
        prSize: null,
        diff: -baseRoute.size,
        diffPercent: -100,
        status: 'removed',
      });
    } else if (baseRoute && prRoute) {
      const diff = prRoute.size - baseRoute.size;
      const diffPercent = baseRoute.size === 0 ? 0 : (diff / baseRoute.size) * 100;
      const absDiff = Math.abs(diff);

      const status =
        absDiff < opts.minimumChangeThreshold || diff === 0 ? 'unchanged' : 'changed';

      results.push({
        route,
        baseSize: baseRoute.size,
        prSize: prRoute.size,
        diff,
        diffPercent,
        status,
      });
    }
  }

  // Sort: changed/added/removed first, then by route name
  results.sort((a, b) => {
    const order = { removed: 0, added: 1, changed: 2, unchanged: 3 };
    const orderDiff = order[a.status] - order[b.status];
    if (orderDiff !== 0) return orderDiff;
    return a.route.localeCompare(b.route);
  });

  return results;
}
