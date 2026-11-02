import { normalizeSurveyMonth } from "./survey-month";
import { rangePeriod } from "./vsl-date-range";
export function surveyPeriodKey(value: unknown): string {
  const range = rangePeriod(value);
  return range ? `${range.startDate} / ${range.endDate}` : normalizeSurveyMonth(value);
}
export function validSurveyPeriod(value: unknown): boolean {
  return !!rangePeriod(value) || /^\d{4}-(0[1-9]|1[0-2])$/.test(normalizeSurveyMonth(value));
}
