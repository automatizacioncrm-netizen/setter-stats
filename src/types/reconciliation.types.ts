export type ReconciliationResult = {
  ok: boolean;
  success?: boolean;
  completed?: boolean;
  stage?: string | null;
  nextAction?: string | null;
  resultado?: unknown;
  reviewed: number;
  newRecords: number;
  modified: number;
  unchanged: number;
  inserted: number;
  updated: number;
  errors: number;
  durationSeconds: number;
  timestamp: string;
};
