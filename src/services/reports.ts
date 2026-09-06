import {
  MOCK_SETTERS,
  MOCK_UPDATED_AT,
  MOCK_VSL_CLOSERS_RECORDS,
} from "@/data/mockVslClosers";
import type {
  EstadoAgenda,
  RawRecord,
  ReportFilters,
  ReportKpis,
  SetterRow,
  VslClosersReport,
} from "@/types/reports";

const REPORT_NAME = "VSL | CLOSERS";

function emptyRow(setter: string): SetterRow {
  return {
    setter,
    agendadoCRM: 0,
    asistio: 0,
    cancelado: 0,
    noShow: 0,
    pendienteAgenda: 0,
    reagendado: 0,
    total: 0,
  };
}

const ESTADO_KEY: Record<EstadoAgenda, keyof Omit<SetterRow, "setter" | "total">> = {
  "Agendado CRM": "agendadoCRM",
  Asistió: "asistio",
  Cancelado: "cancelado",
  "No show": "noShow",
  "Pendiente de agenda": "pendienteAgenda",
  Reagendado: "reagendado",
};

function applyFilters(records: RawRecord[], filters: ReportFilters) {
  return records.filter((r) => {
    if (filters.dateFrom && r.fechaReunion < filters.dateFrom) return false;
    if (filters.dateTo && r.fechaReunion > filters.dateTo) return false;
    if (filters.setter && r.setter !== filters.setter) return false;
    if (filters.estadoAgenda && r.estadoAgenda !== filters.estadoAgenda) return false;
    return true;
  });
}

function buildReport(records: RawRecord[], filters: ReportFilters): VslClosersReport {
  const map = new Map<string, SetterRow>();

  for (const record of records) {
    const row = map.get(record.setter) ?? emptyRow(record.setter);
    row[ESTADO_KEY[record.estadoAgenda]] += 1;
    row.total += 1;
    map.set(record.setter, row);
  }

  const setters = Array.from(map.values()).sort((a, b) => a.setter.localeCompare(b.setter));

  const kpis: ReportKpis = setters.reduce<ReportKpis>(
    (acc, row) => ({
      total: acc.total + row.total,
      agendadoCRM: acc.agendadoCRM + row.agendadoCRM,
      asistio: acc.asistio + row.asistio,
      cancelado: acc.cancelado + row.cancelado,
      noShow: acc.noShow + row.noShow,
      pendienteAgenda: acc.pendienteAgenda + row.pendienteAgenda,
      reagendado: acc.reagendado + row.reagendado,
      tasaAsistencia: 0,
      tasaNoShow: 0,
    }),
    {
      total: 0,
      agendadoCRM: 0,
      asistio: 0,
      cancelado: 0,
      noShow: 0,
      pendienteAgenda: 0,
      reagendado: 0,
      tasaAsistencia: 0,
      tasaNoShow: 0,
    },
  );

  kpis.tasaAsistencia = kpis.total ? Number(((kpis.asistio / kpis.total) * 100).toFixed(2)) : 0;
  kpis.tasaNoShow = kpis.total ? Number(((kpis.noShow / kpis.total) * 100).toFixed(2)) : 0;

  return {
    report: REPORT_NAME,
    updatedAt: MOCK_UPDATED_AT,
    filters: {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      setter: filters.setter,
      estadoAgenda: filters.estadoAgenda,
    },
    kpis,
    setters,
    availableSetters: MOCK_SETTERS,
  };
}

/**
 * Obtiene el reporte VSL | CLOSERS.
 * TODO: reemplazar el bloque mock por un fetch al endpoint real.
 */
export async function getVslClosersReport(filters: ReportFilters): Promise<VslClosersReport> {
  await new Promise((resolve) => setTimeout(resolve, 350));
  const filtered = applyFilters(MOCK_VSL_CLOSERS_RECORDS, filters);
  return buildReport(filtered, filters);
}

/**
 * Dispara la reconciliación con GoHighLevel (Apps Script).
 * Cuando exista el endpoint real, se hará el POST aquí.
 */
export async function triggerVslReconciliation(): Promise<{ ok: boolean; message: string }> {
  const endpoint = "";
  if (!endpoint) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return { ok: true, message: "Datos actualizados correctamente" };
  }
  const response = await fetch(endpoint, { method: "POST" });
  if (!response.ok) throw new Error("No se pudo ejecutar la sincronización");
  return { ok: true, message: "Datos actualizados correctamente" };
}
