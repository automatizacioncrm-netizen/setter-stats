export const RECONCILIATION_PIPELINES = {
  all: "all",
  vsl: "vsl",
  oei: "oei",
  lig: "lig",
  organico: "organico",
  gira: "gira",
} as const;
export type ReconciliationPipeline = keyof typeof RECONCILIATION_PIPELINES;

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
