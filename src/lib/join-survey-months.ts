import { surveyPeriodKey } from "./vsl-period";
import { surveyAgendaStates, type QualityReport } from "./vsl-quality";
export function joinSurveyMonths(
  summary: QualityReport["surveys"],
  status: QualityReport["surveyStatus"],
) {
  const summaries = new Map(summary.rows.map((row) => [surveyPeriodKey(row[0]), row]));
  const states = new Map<string, Map<string, (typeof status.rows)[number]>>();
  for (const row of status.rows) {
    const month = surveyPeriodKey(row[0]);
    const group = states.get(month) ?? new Map();
    group.set(String(row[1]), row);
    states.set(month, group);
  }
  return [...new Set([...summaries.keys(), ...states.keys()])]
    .sort((a, b) => b.localeCompare(a))
    .map((month) => ({
      month,
      kpis: summaries.get(month),
      rows: surveyAgendaStates.map((state) => ({ state, values: states.get(month)?.get(state) })),
    }));
}
