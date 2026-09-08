export type ReconciliationResult = {
  ok: boolean;
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
