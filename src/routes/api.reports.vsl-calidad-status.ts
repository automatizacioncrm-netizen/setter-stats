import { createFileRoute } from "@tanstack/react-router";
import { qualityStatus } from "@/server/api/vsl-quality.api.server";
export const Route = createFileRoute("/api/reports/vsl-calidad-status")({
  server: { handlers: { GET: () => qualityStatus() } },
});
