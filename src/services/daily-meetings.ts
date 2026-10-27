import type { DailyMeetingsFilters, DailyMeetingsReport } from "../types/daily-meetings";
import { readResponse } from "./reports";
export async function getDailyMeetingsReport(range: DailyMeetingsFilters, signal?: AbortSignal) {
  const params = new URLSearchParams({
    pipeline: range.pipeline,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  });
  return readResponse<DailyMeetingsReport>(
    await fetch(`/api/reports/daily-meetings?${params}`, {
      cache: "no-store",
      ...(signal ? { signal } : {}),
    }),
  );
}
