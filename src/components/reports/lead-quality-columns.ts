const hiddenHeaders = new Set([
  "TOTAL DE AGENDAMIENTOS",
  "ASISTENCIA A CITAS",
  "% ASISTENCIA A CITAS",
  "TOTAL DE SETEOS",
  "NO ASISTIERON",
  "CITAS CON MATCH",
  "CITAS SIN MATCH",
]);

export function isVisibleLeadQualityColumn(header: string) {
  return !hiddenHeaders.has(header.trim().replace(/\s+/g, " ").toUpperCase());
}
