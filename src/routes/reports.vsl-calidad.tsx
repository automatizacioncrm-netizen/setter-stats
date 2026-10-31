import { createFileRoute } from "@tanstack/react-router";
import { VslQualityReport } from "@/components/reports/VslQualityReport";
export const Route = createFileRoute("/reports/vsl-calidad")({
  head: () => ({ meta: [{ title: "VSL | CALIDAD DE LEADS Y ENCUESTAS" }] }),
  component: VslQualityReport,
});
