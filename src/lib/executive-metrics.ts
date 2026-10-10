import type { AppointmentDetailRow, SaleRow, SalesReport } from "../types/reports";

export const ratio = (part: number, total: number): number | null =>
  total > 0 ? (part / total) * 100 : null;

const key = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

export function isOpaquePersonId(value: string) {
  return (
    /^[a-zA-Z0-9_-]{20,}$/.test(value.trim()) || /^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(value.trim())
  );
}

export function setterDisplayName(value: string) {
  return !value.trim() ||
    isOpaquePersonId(value) ||
    ["sin setter", "sin setter asignado", "agendado automatico", "__sin_setter__"].includes(
      key(value),
    )
    ? "Sin setter identificado"
    : value.trim();
}

export function appointmentMetrics(
  rows: readonly AppointmentDetailRow[],
  expectedTotal: number,
  expectedAttended: number,
) {
  const unique = new Map<string, AppointmentDetailRow>();
  let valid = true;
  let missingIds = 0;
  const conflictingIds = new Set<string>();
  for (const row of rows) {
    if (!row.appointmentId?.trim()) {
      valid = false;
      missingIds++;
      continue;
    }
    const previous = unique.get(row.appointmentId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) {
      valid = false;
      conflictingIds.add(row.appointmentId);
    }
    unique.set(row.appointmentId, row);
  }
  const setters = new Map<string, { name: string; total: number; attended: number }>();
  const closers = new Map<string, { name: string; attended: number }>();
  let attended = 0;
  for (const row of unique.values()) {
    const setter = setterDisplayName(
      row.setterEfectivo ||
        row.creadoPorCitaNormalizado ||
        row.creadoPorCita ||
        row.setterOpportunity ||
        row.setterAsignado ||
        "",
    );
    const group = setters.get(setter) ?? { name: setter, total: 0, attended: 0 };
    group.total++;
    const isAttended = key(row.estado || "") === "asistio";
    const rawCloser = row.closerCita || row.closer || "";
    const closer =
      setterDisplayName(rawCloser) === "Sin setter identificado"
        ? "Closer de cita no identificado"
        : rawCloser;
    const closerGroup = closers.get(closer) ?? { name: closer, attended: 0 };
    if (isAttended) {
      group.attended++;
      attended++;
      closerGroup.attended++;
    }
    closers.set(closer, closerGroup);
    setters.set(setter, group);
  }
  return {
    complete:
      valid &&
      ((unique.size === expectedTotal && attended === expectedAttended) ||
        (rows.length === expectedTotal &&
          rows.filter((row) => key(row.estado || "") === "asistio").length === expectedAttended)),
    rawTotal: rows.length,
    uniqueTotal: unique.size,
    duplicates: rows.length - unique.size - missingIds,
    missingIds,
    conflictingIds: conflictingIds.size,
    setters: [...setters.values()].map((row) => ({ ...row, rate: ratio(row.attended, row.total) })),
    closers: [...closers.values()],
  };
}

export function recognizedCurrency(value?: string): string | null {
  const code = value?.trim().toUpperCase();
  // The source currently uses PEN and USD. Other values need explicit validation.
  return code === "PEN" || code === "USD" ? code : null;
}

export function referencePrice(product: string): number | null {
  const name = key(product);
  if (["cm", "circulo millonario", "circulo millonario (cm)"].includes(name)) return 10558.7;
  if (["em", "equipo millonario", "equipo millonario (em)"].includes(name)) return 1497;
  return null;
}

export interface FinancialGroup {
  pipeline: string;
  product: string;
  currency: string | null;
  currencySource: string;
  sales: number;
  price: number;
  quota: number;
  missingPrice: number;
  missingQuota: number;
  excess: number;
  zeroPrice: number;
  reference: number | null;
  rate: number | null;
}

const amountPresent = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Use the complete sales collection, never paginated leads/detail or legacy money fields. */
export function financialSummary(sales: SalesReport) {
  const rows: SaleRow[] = [];
  const identified = new Map<string, SaleRow>();
  let conflictingIds = false;
  for (const row of sales.rows) {
    const id = row.opportunityId?.trim();
    if (!id) {
      rows.push(row);
      continue;
    }
    const previous = identified.get(id);
    if (previous) {
      const signature = (r: SaleRow) =>
        JSON.stringify([
          r.pipeline,
          r.productoEvento,
          r.monedaPrecioAcordado,
          r.precioAcordadoProducto,
          r.montoCuota1,
        ]);
      if (signature(previous) !== signature(row)) conflictingIds = true;
    } else {
      identified.set(id, row);
      rows.push(row);
    }
  }
  const complete = rows.length === sales.total && !conflictingIds;
  const idsVerified = rows.every((row) => Boolean(row.opportunityId?.trim()));
  if (!complete) return { complete, idsVerified, groups: [] as FinancialGroup[] };
  const groups = new Map<string, FinancialGroup>();
  for (const row of rows) {
    const pipeline = row.pipeline.trim() || "Sin embudo";
    const product = row.productoEvento.trim() || "Sin producto";
    const currencySource = row.monedaPrecioAcordado?.trim().toUpperCase() || "";
    const currency = recognizedCurrency(currencySource);
    // Keep unrecognized codes separate too: no implicit currency conversion.
    const id = JSON.stringify([pipeline, product, currencySource]);
    const group = groups.get(id) ?? {
      pipeline,
      product,
      currency,
      currencySource,
      sales: 0,
      price: 0,
      quota: 0,
      missingPrice: 0,
      missingQuota: 0,
      excess: 0,
      zeroPrice: 0,
      reference: referencePrice(product),
      rate: null,
    };
    group.sales++;
    const price = row.precioAcordadoProducto;
    const quota = row.montoCuota1;
    if (amountPresent(price)) {
      group.price += price;
      if (price === 0) group.zeroPrice++;
    } else group.missingPrice++;
    if (amountPresent(quota)) group.quota += quota;
    else group.missingQuota++;
    if (amountPresent(price) && amountPresent(quota) && quota > price) group.excess++;
    groups.set(id, group);
  }
  return {
    complete,
    idsVerified,
    groups: [...groups.values()].map((group) => ({
      ...group,
      rate:
        group.currency && !group.missingPrice && !group.missingQuota
          ? ratio(group.quota, group.price)
          : null,
    })),
  };
}

export const formatNumber = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function financialAmount(value: number, currency?: string | null) {
  return `${currency || "Sin moneda"} ${formatNumber(value)}`;
}
