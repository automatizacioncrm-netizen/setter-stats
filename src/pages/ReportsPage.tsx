import { useQuery } from "@tanstack/react-query";
import { consultantsQueryKey, fetchConsultants } from "@/lib/consultants-query";
import { ReportCard } from "@/components/reports/ReportCard";

export function ReportsPage() {
  const consultants = useQuery({
    queryKey: consultantsQueryKey,
    queryFn: fetchConsultants,
    enabled: false,
    retry: false,
    gcTime: 1800000,
  });
  return (
    <div className="min-h-screen w-full bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <header>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            REPORTES COMERCIALES
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Selecciona el reporte que deseas visualizar
          </p>
        </header>

        <div className="mt-6 space-y-3">
          <ReportCard
            title="Embudo VSL (Closer | Setter | Ventas)"
            description="3 embudos · Seguimiento de agenda y desempeño por Setter"
            available
            to="/reports/vsl-closers"
          />
          <ReportCard
            title="Reporte de Gerencia"
            description="Análisis de calidad de leads y encuestas de tráfico pagado"
            available
            accessible
            to="/reports/vsl-calidad"
          />
          <ReportCard
            title="Reporte Horas de Consultor | Sesiones Agendadas"
            description="Seguimiento de agendamientos y sesiones efectivas por consultor"
            available={!!consultants.data && !consultants.isError}
            error={consultants.isError ? consultants.error.message : undefined}
            pendingLabel="Por verificar"
            accessible
            to="/reports/vsl-citas"
          />
        </div>
      </div>
    </div>
  );
}
