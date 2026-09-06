import { createFileRoute } from "@tanstack/react-router";
import { ReportsPage } from "@/pages/ReportsPage";

export const Route = createFileRoute("/reports/")({
  head: () => ({
    meta: [
      { title: "Reportes comerciales — VSL | CLOSERS" },
      {
        name: "description",
        content: "Selector de reportes comerciales para seguimiento de agenda y desempeño por Setter.",
      },
      { property: "og:title", content: "Reportes comerciales" },
      {
        property: "og:description",
        content: "Selecciona el reporte comercial que deseas visualizar.",
      },
    ],
  }),
  component: ReportsPage,
});
