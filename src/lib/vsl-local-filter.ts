import {
  type DetailQuery,
  type LeadType,
  type ReportKpis,
  type SetterRow,
  type VslClosersReport,
} from "@/types/reports";

const validStatuses = new Set([
  "Agendado CRM",
  "Confirmado",
  "Asistió",
  "Cancelado",
  "No show",
  "No asistió",
  "Pendiente de agenda",
  "Reagendado",
]);

export function filtrarPorTipoVsl<T extends { vslCategoria?: string }>(
  data: T[],
  tipo: LeadType,
): T[] {
  return tipo === "all"
    ? data
    : data.filter((registro) => (registro.vslCategoria || "organic") === tipo);
}

export function filtrarReporteVsl(
  report: VslClosersReport,
  tipo: LeadType,
  detail: DetailQuery,
  search = "",
): VslClosersReport {
  if (tipo === "all" || report.filters.pipeline !== "vsl" || !report.rawRecords) return report;

  const records = filtrarPorTipoVsl(report.rawRecords, tipo);
  const count = (status: string) => records.filter((row) => row.estadoAgenda === status).length;
  const total = records.filter((row) => validStatuses.has(row.estadoAgenda)).length;
  const asistio = count("Asistió");
  const noShow = count("No show") + count("No asistió");
  const kpis: ReportKpis = {
    totalLeads: records.length,
    conEstadoAgenda: total,
    total,
    agendadoCRM: count("Agendado CRM"),
    confirmado: count("Confirmado"),
    asistio,
    cancelado: count("Cancelado"),
    noShow,
    pendienteAgenda: count("Pendiente de agenda"),
    reagendado: count("Reagendado"),
    tasaAsistencia: total ? Number(((asistio / total) * 100).toFixed(2)) : 0,
    tasaNoShow: total ? Number(((noShow / total) * 100).toFixed(2)) : 0,
  };
  const setterMap = new Map<string, SetterRow>();
  for (const row of records) {
    const name = row.setterAsignado || "Sin setter";
    let item = setterMap.get(name);
    if (!item) {
      item = {
        setter: name,
        total: 0,
        agendadoCRM: 0,
        confirmado: 0,
        asistio: 0,
        cancelado: 0,
        noShow: 0,
        pendienteAgenda: 0,
        reagendado: 0,
      };
      setterMap.set(name, item);
    }
    if (!validStatuses.has(row.estadoAgenda)) continue;
    item.total++;
    const key =
      row.estadoAgenda === "No show" || row.estadoAgenda === "No asistió"
        ? "noShow"
        : row.estadoAgenda === "Agendado CRM"
          ? "agendadoCRM"
          : row.estadoAgenda === "Confirmado"
            ? "confirmado"
            : row.estadoAgenda === "Asistió"
              ? "asistio"
              : row.estadoAgenda === "Cancelado"
                ? "cancelado"
                : row.estadoAgenda === "Reagendado"
                  ? "reagendado"
                  : "pendienteAgenda";
    item[key] = (item[key] ?? 0) + 1;
  }

  const categoriesByName = new Map(
    report.rawRecords.map((row) => [row.nombreContacto, row.vslCategoria || "organic"]),
  );
  const salesRows = report.sales.rows.filter(
    (row) =>
      (row.vslCategoria ||
        (row.vslOrigen ? "paid" : categoriesByName.get(row.nombreContacto) || "organic")) === tipo,
  );
  const byStage = report.sales.byStage.map((stage) => ({
    ...stage,
    count: salesRows.filter((row) => row.fase === stage.stage).length,
  }));
  const currencies = new Map<
    string,
    { currency: string; salesValue: number; cashCollected: number; collectedRate: number }
  >();
  for (const row of salesRows) {
    const key = row.moneda || "";
    const value = currencies.get(key) ?? {
      currency: key,
      salesValue: 0,
      cashCollected: 0,
      collectedRate: 0,
    };
    value.salesValue += row.montoTotalAcordado;
    value.cashCollected += row.montoUltimoPago;
    currencies.set(key, value);
  }
  const salesValueByCurrency = [...currencies.values()].map((value) => ({
    ...value,
    collectedRate: value.salesValue ? (value.cashCollected / value.salesValue) * 100 : 0,
  }));
  const products = new Map<
    string,
    {
      producto: string;
      cantidad: number;
      moneda: string;
      ticket: number;
      valorVenta: number;
      cashRecaudado: number;
      porcentajeRecaudado: number;
    }
  >();
  for (const row of salesRows) {
    const key = `${row.productoEvento}\0${row.moneda}`;
    const item = products.get(key) ?? {
      producto: row.productoEvento,
      cantidad: 0,
      moneda: row.moneda,
      ticket: 0,
      valorVenta: 0,
      cashRecaudado: 0,
      porcentajeRecaudado: 0,
    };
    item.cantidad++;
    item.valorVenta += row.montoTotalAcordado;
    item.cashRecaudado += row.montoUltimoPago;
    products.set(key, item);
  }
  const productSummary = [...products.values()].map((item) => ({
    ...item,
    ticket: item.cantidad ? item.valorVenta / item.cantidad : 0,
    porcentajeRecaudado: item.valorVenta ? (item.cashRecaudado / item.valorVenta) * 100 : 0,
  }));
  const needle = search.trim().toLowerCase();
  const matchingDetail = records.filter((row) =>
    [row.nombreContacto, row.telefono, row.correo].join(" ").toLowerCase().includes(needle),
  );
  const orderedDetail = [...matchingDetail].sort(
    (a, b) =>
      String(a[detail.sort] ?? "").localeCompare(String(b[detail.sort] ?? ""), "es", {
        numeric: true,
      }) * (detail.direction === "asc" ? 1 : -1),
  );
  const visibleDetail = detail.includeDetail
    ? orderedDetail.slice((detail.page - 1) * detail.pageSize, detail.page * detail.pageSize)
    : [];
  return {
    ...report,
    kpis,
    leadTypeKpis: {
      totalLeads: records.length,
      attended: asistio,
      attendanceRate: records.length ? Number(((asistio / records.length) * 100).toFixed(2)) : 0,
    },
    setters: [...setterMap.values()].sort((a, b) => b.total - a.total),
    pipelineSummary: {
      ...report.pipelineSummary,
      vsl: { totalLeads: records.length, conCitaCalendar: total, estados: { asistio } },
    },
    unknownStatusCount: records.length - total,
    sales: {
      ...report.sales,
      total: salesRows.length,
      rows: salesRows,
      byStage,
      salesValueByCurrency,
      cashByCurrency: salesValueByCurrency.map((value) => ({
        currency: value.currency,
        amount: value.cashCollected,
      })),
      productSummary,
    },
    detail: visibleDetail,
    detailTotal: matchingDetail.length,
    detailPage: detail.page,
  };
}
