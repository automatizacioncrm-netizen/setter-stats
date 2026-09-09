import { ReportCard } from "@/components/reports/ReportCard";

export function ReportsPage() {
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
            title="VSL | CLOSERS"
            description="Seguimiento de agenda y desempeño por Setter"
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
            title="LANZAMIENTO PAGADO OEI"
            description="Reporte en construcción"
            available={false}
          />
        </div>
      </div>
    </div>
  );
}
