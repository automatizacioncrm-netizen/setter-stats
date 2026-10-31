import { useQuery } from "@tanstack/react-query";
import { ReportCard } from "@/components/reports/ReportCard";

export function ReportsPage() {
  const status = useQuery({
    queryKey: ["vsl-quality-status"],
    queryFn: async () => {
      const r = await fetch("/api/reports/vsl-calidad-status");
      if (!r.ok) return false;
      return (await r.json()).available === true;
    },
    retry: false,
    refetchOnWindowFocus: false,
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
            title="VSL + OEI + DATA ANTIGUA"
            description="3 embudos · Seguimiento de agenda y desempeño por Setter"
            available
            to="/reports/vsl-closers"
          />
          <ReportCard
            title="VSL | CITAS Y CALENDARIOS"
            description="Seguimiento de agendamientos y sesiones efectivas por closer"
            available
            to="/reports/vsl-citas"
          />
          <ReportCard
            title="VSL | CALIDAD DE LEADS Y ENCUESTAS"
            description="Análisis de calidad de leads y encuestas de tráfico pagado"
            available={status.data === true}
            pendingLabel="Por verificar"
            accessible
            to="/reports/vsl-calidad"
          />
        </div>
      </div>
    </div>
  );
}
