export interface RouteAnalysis {
  route: string;
  size: number; // gzip bytes
  rawSize: number; // raw bytes
}

export interface BundleAnalysis {
  routes: RouteAnalysis[];
}

export interface RouteComparison {
  route: string;
  baseSize: number | null; // null = new route
  prSize: number | null; // null = removed route
  diff: number;
  diffPercent: number;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
}

export interface ActionInputs {
  workingDirectory: string;
  buildOutputDirectory: string;
  buildCommand: string;
  budget?: number;
  budgetPercentIncreaseRed: number;
  minimumChangeThreshold: number;
  skipCommentIfEmpty: boolean;
}
