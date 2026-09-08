import type { ReportKpis } from "../../types/reports";

type AgendaCounts = Pick<
  ReportKpis,
  "agendadoCRM" | "asistio" | "cancelado" | "noShow" | "pendienteAgenda" | "reagendado"
>;

export function mapVslKpis(counts: AgendaCounts, totalLeads: number): ReportKpis {
  const { agendadoCRM, asistio, cancelado, noShow, pendienteAgenda, reagendado } = counts;
  const conEstadoAgenda = agendadoCRM + asistio + cancelado + noShow + pendienteAgenda + reagendado;
  return {
    agendadoCRM,
    asistio,
    cancelado,
    noShow,
    pendienteAgenda,
    reagendado,
    totalLeads,
    conEstadoAgenda,
    total: conEstadoAgenda,
    tasaAsistencia: conEstadoAgenda ? +((asistio / conEstadoAgenda) * 100).toFixed(2) : 0,
    tasaNoShow: conEstadoAgenda ? +((noShow / conEstadoAgenda) * 100).toFixed(2) : 0,
  };
}
