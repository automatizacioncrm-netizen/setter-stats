import { createFileRoute } from "@tanstack/react-router";
import { VslClosersDashboard } from "@/pages/VslClosersDashboard";

export const Route = createFileRoute("/reports/vsl-closers")({
  head: () => ({
    meta: [
      { title: "Reporte comercial VSL | CLOSERS" },
      {
        name: "description",
        content: "KPIs, tabla dinámica por Setter y composición de estados de agenda de la secuencia VSL | CLOSERS.",
      },
      { property: "og:title", content: "Reporte comercial VSL | CLOSERS" },
      {
        property: "og:description",
        content: "Seguimiento de agenda y desempeño por Setter.",
      },
    ],
  }),
  component: VslClosersDashboard,
});
